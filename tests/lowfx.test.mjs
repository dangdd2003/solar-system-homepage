import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createServer } from "vite";

// Real DOM, splitText and Anime.js; no animation mocks or added dependencies.
// Set LOWFX_BROWSER to a Chromium executable on machines without Edge/Chrome.
async function runInBrowser(files) {
  const { revertAllSplits } = await import("/src/scripts/reveal/split.ts");
  const failures = [];
  let cases = 0;
  const rich = new Set();
  const baseline = new Map();
  const changed = new Set([
    "meteor-shower",
    "deep-space-signal",
    "redshift",
    "event-horizon",
    "heartbeat-pulsar",
    "solar-wind",
    "comet-trail",
    "light-speed",
    "warp"
  ]);
  const check = (ok, message) => {
    if (!ok) failures.push(message);
  };
  function fixture(empty) {
    const el = document.createElement("div");
    el.style.cssText = "width:320px;min-height:48px;color:rgb(255,255,255);font:16px sans-serif";
    el.innerHTML = empty
      ? '<a href="#">Unsplit fallback</a>'
      : '<span data-reveal-part="num">01</span><span data-reveal-split>Signal from distant stars</span>' +
        ["heart", "lens", "flare", "orbit", "rail"]
          .map((name) => `<span data-reveal-part="${name}">x</span>`)
          .join("") +
        '<ul><li data-reveal-part="star">One</li><li data-reveal-part="star">Two</li><li data-reveal-part="star">Three</li></ul>';
    document.body.append(el);
    return el;
  }
  for (const file of files) {
    const module = await import(file);
    for (const registry of Object.values(module)) {
      if (typeof registry !== "object") continue;
      for (const [name, builder] of Object.entries(registry)) {
        if (typeof builder !== "function") continue;
        for (const compact of [false, true])
          for (const lowFx of [false, true])
            for (const empty of [false, true]) {
              const label = `${name} compact=${compact} lowFx=${lowFx} fallback=${empty}`;
              const el = fixture(empty);
              let tl;
              try {
                tl = builder(el, {
                  delay: 37,
                  compact,
                  lowFx,
                  accentRgb: "120, 180, 255",
                  side: 1,
                  seed: 42,
                  count: 3,
                  index: 1,
                  vec: { x: 0.5, y: 0.5 }
                });
                check(tl.paused, `${label}: must be built paused for the capped clock`);
                const nodes = () => [el, ...el.querySelectorAll("*")];
                const snapshots = [];
                let reportedFilter = false;
                const sample = () => {
                  if (changed.has(name))
                    snapshots.push(
                      nodes().map((node) =>
                        Array.from(node.style)
                          .filter((key) => key !== "filter")
                          .map((key) => [key, node.style.getPropertyValue(key)])
                      )
                    );
                  for (const node of nodes()) {
                    const filter = node.style.filter;
                    if (/blur\(|drop-shadow\(/.test(filter)) {
                      if (lowFx && !reportedFilter) {
                        check(false, `${label}: forbidden filter ${filter}`);
                        reportedFilter = true;
                      } else if (!lowFx && !compact) rich.add(name);
                    }
                  }
                };
                sample(); // Includes synchronously applied .set() initial states.
                // seek(), not play(): production also externally drives paused timelines.
                for (let ms = 0; ms <= tl.duration + 32; ms += 32) {
                  tl.seek(ms);
                  sample();
                }
                tl.seek(tl.duration);
                sample();
                if (changed.has(name)) {
                  const key = `${name}/${compact}/${empty}`;
                  const motion = JSON.stringify({ duration: tl.duration, snapshots });
                  if (!lowFx) baseline.set(key, motion);
                  else
                    check(
                      motion === baseline.get(key),
                      `${label}: lowFx must preserve geometry, opacity and timing`
                    );
                }
                cases++;
              } catch (error) {
                failures.push(`${label}: ${error.stack}`);
              } finally {
                tl?.cancel();
                revertAllSplits();
                el.remove();
              }
            }
      }
    }
  }
  for (const name of [
    "meteor-shower",
    "deep-space-signal",
    "redshift",
    "event-horizon",
    "heartbeat-pulsar",
    "solar-wind",
    "comet-trail",
    "light-speed",
    "warp"
  ]) {
    check(
      rich.has(name),
      `${name}: regular desktop must retain its rich filter (and fixture must exercise it)`
    );
  }
  return { cases, failures: [...new Set(failures)] };
}

test(
  "all reveal builders omit blur/drop-shadow under lowFx in real browser timelines",
  { timeout: 120000 },
  async () => {
    const browser =
      process.env.LOWFX_BROWSER ||
      [
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Google/Chrome/Application/chrome.exe"
      ].find(existsSync);
    assert.ok(browser, "Set LOWFX_BROWSER to an installed Chromium executable");
    const files = (await readdir("src/scripts/reveal/pools"))
      .filter((file) => file.endsWith(".ts") && file !== "glass.ts")
      .map((file) => `/src/scripts/reveal/pools/${file}`);
    files.push("/src/scripts/reveal/legacy-effects.ts");
    const temp = process.env.TEMP || tmpdir();
    const profile = await mkdtemp(
      path.join(
        existsSync(path.join(temp, "opencode")) ? path.join(temp, "opencode") : temp,
        "lowfx-browser-"
      )
    );
    const server = await createServer({
      configFile: false,
      // Other tests/dev servers use different Vite configs; never share their optimizer cache.
      cacheDir: path.join(profile, "vite-cache"),
      server: { port: 0 },
      appType: "custom"
    });
    server.middlewares.use("/lowfx-test", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<html><body><script type="module">try { const result = await (${runInBrowser.toString()})(${JSON.stringify(files)}); document.body.innerHTML = '<pre id="result">' + JSON.stringify(result).replaceAll('&', '&amp;').replaceAll('<', '&lt;') + '</pre>'; } catch (error) { document.body.innerHTML = '<pre id="result">' + JSON.stringify({failures:[error.stack]}) + '</pre>'; }</script></body></html>`
      );
    });
    try {
      await server.listen();
      const url = `http://localhost:${server.httpServer.address().port}/lowfx-test`;
      const output = await new Promise((resolve, reject) => {
        const child = spawn(
          browser,
          [
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            `--user-data-dir=${profile}`,
            "--dump-dom",
            "--virtual-time-budget=60000",
            url
          ],
          { timeout: 90000 }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 ? resolve(stdout) : reject(new Error(`Browser exited ${code}: ${stderr}`))
        );
      });
      const match = output.match(/<pre id="result">([\s\S]*?)<\/pre>/);
      assert.ok(match, `Browser did not finish runtime audit: ${output.slice(-2000)}`);
      const result = JSON.parse(match[1].replaceAll("&lt;", "<").replaceAll("&amp;", "&"));
      assert.deepEqual(
        result.failures,
        [],
        `${result.cases} runtime cases\n${result.failures.join("\n")}`
      );
      assert.ok(result.cases > 1000, "Audit must exercise every generation, profile and fallback");
      console.log(`Audited ${result.cases} real browser timeline cases`);
    } finally {
      await server.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
);
