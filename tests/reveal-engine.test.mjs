import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createServer } from "vite";

// Real DOM, production CSS, IntersectionObserver, Anime.js and dynamic imports.
// The Vite hook below controls module evaluation, not the engine or its builders.
async function runInBrowser(scenario) {
  const nativeTimeout = window.setTimeout.bind(window);
  Object.assign(window, { __testTimeout: nativeTimeout });
  const sleep = (ms) => new Promise((resolve) => nativeTimeout(resolve, ms));
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  check(
    matchMedia("(prefers-reduced-motion: reduce)").matches === (scenario === "reduced"),
    "motion preference must match the scenario rather than the browser default"
  );
  const until = async (predicate, message, timeout = 2000) => {
    const deadline = performance.now() + timeout;
    while (!predicate() && performance.now() < deadline) {
      await sleep(20);
    }
    check(predicate(), message);
  };
  let release;
  let reject;
  window.__poolGate = new Promise((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  // Attach a rejection handler before the deliberately failing import starts.
  window.__poolGate.catch(() => {});
  window.__poolLoads = [];
  if (scenario === "gated") release();
  const { initReveal } = await import("/src/scripts/reveal/engine.ts");
  const { EFFECTS, preloadEffects } = await import("/src/scripts/reveal/effects.ts");
  const { forceEffect } = await import("/src/scripts/reveal/randomizer.ts");
  const observers = [];
  const NativeIO = window.IntersectionObserver;
  window.IntersectionObserver = class extends NativeIO {
    constructor(...args) {
      super(...args);
      this.targets = new Set();
      this.disconnects = 0;
      observers.push(this);
    }
    observe(target) {
      this.targets.add(target);
      super.observe(target);
    }
    unobserve(target) {
      this.targets.delete(target);
      super.unobserve(target);
    }
    disconnect() {
      this.disconnects++;
      this.targets.clear();
      super.disconnect();
    }
  };
  const timers = new Set();
  const nativeClear = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    const id = nativeTimeout(() => {
      timers.delete(id);
      callback(...args);
    }, delay);
    timers.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    timers.delete(id);
    nativeClear(id);
  };
  const name = "text-wave-chars";
  forceEffect("text", name);
  const panel = document.createElement("section");
  panel.dataset.planetPanel = "overview";
  panel.className = "is-visible";
  panel.style.cssText = "width:600px;height:300px;overflow:auto";
  panel.innerHTML = '<p id="copy" data-reveal="@text">A signal travels through the stars</p>';
  document.body.append(panel);
  const el = panel.firstElementChild;
  const link = el;
  const original = el.innerHTML;
  const done = () => el.hasAttribute("data-reveal-done");
  const revealed = () => el.classList.contains("is-revealed");
  const visible = () => {
    check(getComputedStyle(el).opacity === "1", "settled host must have computed opacity 1");
    check(getComputedStyle(el).visibility === "visible", "settled host must be visible");
    for (const node of el.querySelectorAll("*")) {
      check(
        getComputedStyle(node).opacity === "1",
        "settled descendants must not stay transparent"
      );
    }
  };
  if (scenario === "gated") panel.dataset.revealGate = "entered";
  if (scenario === "warm-focus" || scenario === "cleanup-running") {
    release();
    await preloadEffects([name]);
  }
  if (scenario === "focus-pending") {
    // Focus is tested before native IO has a chance to deliver this host.
    panel.style.height = "30px";
    el.style.marginTop = "800px";
  }
  if (scenario === "reduced") {
    check(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
      "browser must actually emulate reduced motion"
    );
    panel.classList.remove("is-visible");
    panel.dataset.revealGate = "entered";
    const outside = document.createElement("p");
    outside.dataset.reveal = "@text";
    outside.textContent = "Content outside an active panel";
    document.body.append(outside);
  }
  const cleanup = initReveal(document, { loadSeed: 42 });
  // Planning must see splittable text; focusability is added afterwards so the
  // focus tests exercise this same real character effect rather than fade.
  if (scenario.includes("focus") || scenario === "cleanup-running") el.tabIndex = 0;
  try {
    if (scenario === "gated") {
      await until(() => {
        check(
          !revealed() && !done() && el.innerHTML === original && !el.hasAttribute("style"),
          "prewarming must never invoke the builder or reveal a closed gate"
        );
        return typeof EFFECTS[name] === "function";
      }, "gated visible panel must warm its selected builder before the gate opens");
      check(!revealed() && !done(), "closed gate must not reveal content");
      check(
        el.innerHTML === original && !el.hasAttribute("style"),
        "closed gate must not build a timeline"
      );
      panel.classList.add("entered");
      await until(revealed, "opening the gate must deliver the real intersection");
      check(!done(), "warm gated entry must run a real timeline, not cold-settle");
      await until(done, "warm gated timeline must finish", 4000);
      visible();
    } else if (scenario === "reduced") {
      check(
        done() && revealed(),
        "reduced motion must synchronously show even inactive gated content"
      );
      check(
        [...document.querySelectorAll("[data-reveal]")].every(
          (node) => node.hasAttribute("data-reveal-done") && getComputedStyle(node).opacity === "1"
        ),
        "reduced motion must show every reveal host, including content outside panels"
      );
      visible();
      check(
        window.__poolLoads.length === 0 && observers.length === 0,
        "reduced motion must not load effects or observe hosts"
      );
    } else if (scenario === "warm-focus" || scenario === "cleanup-running") {
      await until(revealed, "warm entry must reach the real intersection observer");
      check(!done(), "warm fixture must exercise a running timeline, not the no-effect fallback");
      check(timers.size > 0, "running timeline must arm its safety backstop");
      if (scenario === "warm-focus") {
        link.focus();
        check(
          document.activeElement === link && done(),
          "keyboard focus must settle a running timeline in the same task"
        );
        visible();
        const settled = el.outerHTML;
        await sleep(1200);
        check(el.outerHTML === settled, "finished timeline must not write after keyboard focus");
      } else {
        panel.classList.remove("is-visible");
        await sleep(0);
        const disconnects = observers.map((io) => io.disconnects);
        cleanup();
        check(timers.size === 0, "cleanup must cancel both the reset timer and timeline backstop");
        check(
          observers.every((io) => io.targets.size === 0),
          "cleanup must disconnect native intersection observers"
        );
        check(
          observers.every((io, i) => io.disconnects > disconnects[i]),
          "cleanup must explicitly disconnect each observer"
        );
        const settled = el.outerHTML;
        panel.classList.add("is-visible");
        link.focus();
        el.dispatchEvent(new Event("reveal:settle", { bubbles: true }));
        await sleep(1600);
        check(
          el.outerHTML === settled,
          "cleanup must remove mutation, focus and settle handlers and cancel clock writes"
        );
      }
    } else {
      if (scenario === "focus-pending") {
        check(!revealed(), "focus fixture must begin unobserved/offscreen");
        link.focus();
        check(
          document.activeElement === link && done() && revealed(),
          "keyboard focus must synchronously settle a cold host"
        );
      } else {
        await until(done, "cold or delayed import must immediately settle visible content");
      }
      check(
        typeof EFFECTS[name] !== "function",
        "fixture must hit a genuinely cold builder, not a seeded warm effect"
      );
      visible();
      const plan = window.__reveal.plan("overview");
      check(
        plan?.byId.get("copy")?.played === name,
        "fixture must plan the pinned typed effect, not an unrelated fallback"
      );
      await until(
        () => window.__poolLoads.includes("gen3-text.ts"),
        "activation must start the selected lazy pool import"
      );
      if (scenario === "leave-reset") {
        panel.classList.remove("is-visible");
        await until(() => !revealed(), "leaving must reset after the real entry grace window");
        check(!done(), "reset must clear settled state for the next entry");
      }
      if (scenario === "cleanup-pending") {
        panel.classList.remove("is-visible");
        await sleep(0);
        cleanup();
        check(timers.size === 0, "cleanup must cancel pending reset timers");
        check(
          observers.every((io) => io.targets.size === 0),
          "cleanup must disconnect observers while imports are pending"
        );
      }
      const settled = el.outerHTML;
      const mutations = [];
      const watcher = new MutationObserver((records) => mutations.push(...records));
      watcher.observe(el, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true
      });
      if (scenario === "failed") reject(new Error("intentional test pool import failure"));
      else release();
      await preloadEffects([name]);
      if (scenario !== "failed")
        check(typeof EFFECTS[name] === "function", "released real pool must finish loading");
      else check(!EFFECTS[name], "failed pool must not register a builder");
      await sleep(1200);
      watcher.disconnect();
      check(
        el.outerHTML === settled && mutations.length === 0,
        "import completion/failure must never replay or mutate a settled, focused, reset or cleaned-up host"
      );
      if (scenario !== "leave-reset") visible();
    }
    return { scenario, failures: [] };
  } finally {
    cleanup();
  }
}

async function audit(scenario, reducedMotion = false) {
  const browser =
    process.env.REVEAL_BROWSER ||
    process.env.LOWFX_BROWSER ||
    [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe"
    ].find(existsSync);
  assert.ok(browser, "Set REVEAL_BROWSER to an installed Chromium executable");
  const temp = process.env.TEMP || tmpdir();
  const profile = await mkdtemp(
    path.join(
      existsSync(path.join(temp, "opencode")) ? path.join(temp, "opencode") : temp,
      "reveal-engine-browser-"
    )
  );
  const server = await createServer({
    configFile: false,
    cacheDir: path.join(profile, "vite-cache"),
    server: { port: 0 },
    appType: "custom",
    plugins: [
      {
        name: "reveal-test-pool-gate",
        enforce: "post",
        transform(code, id) {
          const file = id.replaceAll("\\", "/").split("?")[0];
          if (/\/reveal\/pools\/[^/]+\.ts$/.test(file) && !file.endsWith("/glass.ts")) {
            return `window.__poolLoads.push(${JSON.stringify(path.basename(file))}); await window.__poolGate;\n${code}`;
          }
        }
      }
    ]
  });
  server.middlewares.use("/reveal-engine-test", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<html class="js"><head><link rel="stylesheet" href="/src/styles/reveal.css"></head><body><script type="module">
      try { window.__auditResult = await (${runInBrowser.toString()})(${JSON.stringify(scenario)}); }
      catch (error) { window.__auditResult = {failures:[error.stack]}; }
    </script></body></html>`);
  });
  let child;
  let socket;
  try {
    await server.listen();
    const url = `http://localhost:${server.httpServer.address().port}/reveal-engine-test`;
    const endpoint = await new Promise((resolve, fail) => {
      child = spawn(
        browser,
        [
          "--headless",
          "--disable-gpu",
          "--no-first-run",
          "--window-size=1200,900",
          "--run-all-compositor-stages-before-draw",
          "--disable-background-timer-throttling",
          `--user-data-dir=${profile}`,
          "--remote-debugging-port=0",
          // Start with a controlled reduced-motion default so ordinary scenarios
          // also prove that their per-page no-preference override takes effect.
          "--force-prefers-reduced-motion=reduce",
          "about:blank"
        ],
        { timeout: 45000 }
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) resolve(match[1]);
      });
      child.on("error", fail);
      child.on("close", (code) => fail(new Error(`Browser exited ${code}: ${stderr}`)));
    });
    // Native WebSocket + CDP avoids dependencies and virtual-time/IO races.
    socket = new WebSocket(endpoint);
    await new Promise((resolve, fail) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", fail, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.fail(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    const command = (method, params = {}, sessionId) =>
      new Promise((resolve, fail) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          fail(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(id, { resolve, fail, timer });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    const { targetId } = await command("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    await command(
      "Emulation.setEmulatedMedia",
      {
        features: [
          { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }
        ]
      },
      sessionId
    );
    await command("Page.navigate", { url }, sessionId);
    const evaluation = await command(
      "Runtime.evaluate",
      {
        expression: `new Promise((resolve, reject) => { const deadline = Date.now() + 12000; const poll = () => { if (window.__auditResult) resolve(window.__auditResult); else if (Date.now() > deadline) reject(new Error('Browser fixture timed out')); else (window.__testTimeout || setTimeout)(poll, 25); }; poll(); })`,
        awaitPromise: true,
        returnByValue: true
      },
      sessionId
    );
    assert.ok(!evaluation.exceptionDetails, JSON.stringify(evaluation.exceptionDetails));
    const result = evaluation.result.value;
    assert.deepEqual(result.failures, [], `${scenario}: ${result.failures.join("\n")}`);
  } finally {
    socket?.close();
    if (child && child.exitCode === null) {
      const closed = new Promise((resolve) => child.once("close", resolve));
      child.kill();
      await closed;
    }
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

test(
  "visible gated panels prewarm without revealing, then run a warm timeline",
  { timeout: 60000 },
  () => audit("gated")
);
for (const [scenario, title] of [
  ["cold", "cold delayed imports settle visible content without a late replay"],
  ["failed", "failed imports leave visible content settled"],
  ["leave-reset", "late import completion cannot replay a departed and reset panel"],
  ["focus-pending", "keyboard focus settles cold content immediately without late replay"],
  ["warm-focus", "keyboard focus cancels a real running builder immediately"],
  ["cleanup-pending", "cleanup cancels observation and reset while imports are pending"],
  ["cleanup-running", "cleanup cancels running clocks, backstops, reset and event handlers"],
  ["reduced", "real reduced-motion preference shows inactive gated content synchronously"]
]) {
  test(title, { timeout: 60000 }, () => audit(scenario, scenario === "reduced"));
}
