import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import scenePreload from "../src/build/scene-preload.mjs";

const scene =
  '<html><head><title>Home</title></head><body><canvas id="solar-canvas"></canvas></body></html>';

async function withAuditOutput(file, run) {
  const previous = process.env.SCENE_BUNDLE_AUDIT;
  try {
    process.env.SCENE_BUNDLE_AUDIT = file;
    return await run();
  } finally {
    if (previous === undefined) delete process.env.SCENE_BUNDLE_AUDIT;
    else process.env.SCENE_BUNDLE_AUDIT = previous;
  }
}

async function buildFixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "scene-preload-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = pathToFileURL(`${root}/`);
  const integration = scenePreload();
  let plugin;
  integration.hooks["astro:config:setup"]({
    updateConfig(config) {
      [plugin] = config.vite.plugins;
    }
  });
  integration.hooks["astro:config:done"]({
    config: { base: "/", build: { assetsPrefix: "" }, ...options }
  });
  const bundle = {
    boot: {
      type: "chunk",
      fileName: "_astro/solar-system-boot.actual-hash.js",
      facadeModuleId: "C:/site/src/scripts/solar-system-boot.ts",
      code: 'export const scene = "☀";',
      modules: {}
    },
    unrelated: {
      type: "chunk",
      fileName: "_astro/other.js",
      facadeModuleId: "other.ts",
      code: "export const unrelated = true;",
      modules: {}
    }
  };
  const auditFile = join(root, "bundle-audit.json");
  await withAuditOutput(auditFile, async () => {
    await plugin.generateBundle.call({ environment: { name: "client" } }, {}, bundle);
  });
  assert.deepEqual(
    JSON.parse(await readFile(auditFile, "utf8")),
    Object.values(bundle).map((chunk) => ({
      fileName: chunk.fileName,
      bytes: Buffer.byteLength(chunk.code),
      modules: chunk.modules
    }))
  );
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "index.html"), scene);
  await writeFile(join(root, "nested", "index.html"), scene);
  await writeFile(join(root, "404.html"), "<html><head></head><body>No scene</body></html>");
  await integration.hooks["astro:build:generated"]({ dir });
  return { root, dir, integration };
}

test("fixtures preserve the caller's audit file and environment", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "scene-preload-caller-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outsideAudit = join(root, "caller-audit.json");
  const original = '{"caller":"keep this audit"}\n';
  await writeFile(outsideAudit, original);
  await withAuditOutput(outsideAudit, async () => {
    const first = await buildFixture(t);
    const second = await buildFixture(t);
    assert.notEqual(first.root, second.root);
    assert.equal(process.env.SCENE_BUNDLE_AUDIT, outsideAudit);
    assert.equal(await readFile(outsideAudit, "utf8"), original);
  });
});

test("audit isolation restores populated and absent caller environments after errors", async () => {
  const previous = process.env.SCENE_BUNDLE_AUDIT;
  try {
    for (const caller of [undefined, "caller-audit.json"]) {
      if (caller === undefined) delete process.env.SCENE_BUNDLE_AUDIT;
      else process.env.SCENE_BUNDLE_AUDIT = caller;
      const failure = new Error("audit write failed");
      await assert.rejects(
        withAuditOutput("fixture-audit.json", async () => {
          assert.equal(process.env.SCENE_BUNDLE_AUDIT, "fixture-audit.json");
          throw failure;
        }),
        (error) => error === failure
      );
      assert.equal(process.env.SCENE_BUNDLE_AUDIT, caller);
    }
  } finally {
    if (previous === undefined) delete process.env.SCENE_BUNDLE_AUDIT;
    else process.env.SCENE_BUNDLE_AUDIT = previous;
  }
});

test("preloads the actual emitted boot chunk in the head only on scene pages", async (t) => {
  const { root, dir, integration } = await buildFixture(t);
  const html = await readFile(join(root, "index.html"), "utf8");
  assert.match(
    html,
    /<title>Home<\/title><link rel="modulepreload" href="\/_astro\/solar-system-boot.actual-hash.js" crossorigin><\/head>/
  );
  assert.equal(html.replace(/<link[^>]+>/, ""), scene);
  assert.equal(await readFile(join(root, "nested", "index.html"), "utf8"), html);
  assert.doesNotMatch(await readFile(join(root, "404.html"), "utf8"), /modulepreload/);
  await integration.hooks["astro:build:generated"]({ dir });
  assert.equal(await readFile(join(root, "index.html"), "utf8"), html);
});

test("respects a deployment base", async (t) => {
  const { root } = await buildFixture(t, { base: "/portfolio/" });
  assert.match(
    await readFile(join(root, "index.html"), "utf8"),
    /href="\/portfolio\/_astro\/solar-system-boot.actual-hash.js"/
  );
});

test("supports Astro's omitted assetsPrefix default", async (t) => {
  const { root } = await buildFixture(t, { build: {} });
  assert.match(
    await readFile(join(root, "index.html"), "utf8"),
    /href="\/_astro\/solar-system-boot.actual-hash.js"/
  );
});

for (const assetsPrefix of [
  "https://cdn.example.com/static/",
  { js: "https://cdn.example.com/static", fallback: "https://fallback.example.com" }
]) {
  test(`respects assetsPrefix ${JSON.stringify(assetsPrefix)}`, async (t) => {
    const { root } = await buildFixture(t, { base: "/portfolio/", build: { assetsPrefix } });
    assert.match(
      await readFile(join(root, "index.html"), "utf8"),
      /href="https:\/\/cdn.example.com\/static\/_astro\/solar-system-boot.actual-hash.js"/
    );
  });
}
