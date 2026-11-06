import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  appType: "custom"
});
after(() => server.close());
const effects = await server.ssrLoadModule("/src/scripts/reveal/effects.ts");

test("cold effects synchronously do nothing rather than hiding content", () => {
  assert.equal(effects.resolveEffect("hero-name-disk-tilt-settle")({}, {}), null);
});

test("loading a selected generation installs its original builders only", async () => {
  assert.equal(typeof effects.preloadEffects, "function");
  await Promise.all([
    effects.preloadEffects(["hero-name-disk-tilt-settle"]),
    effects.preloadEffects(["hero-name-disk-tilt-settle"])
  ]);
  const original = await server.ssrLoadModule("/src/scripts/reveal/pools/gen3-hero-name.ts");
  assert.equal(
    effects.resolveEffect("hero-name-disk-tilt-settle"),
    original.GEN3_HERO_NAME_EFFECTS["hero-name-disk-tilt-settle"]
  );
  assert.equal(effects.resolveEffect("word-rise")({}, {}), null);
});

test("a failed pool leaves a synchronous fallback and can retry on a later entry", async () => {
  let fail = true;
  const isolated = await createServer({
    configFile: false,
    server: { middlewareMode: true, ws: false },
    appType: "custom",
    customLogger: { ...server.config.logger, error() {} },
    plugins: [
      {
        name: "interrupt-effect-download",
        load(id) {
          if (fail && id.endsWith("/pools/gen3-line.ts")) {
            fail = false;
            throw new Error("Interrupted effect download");
          }
        }
      }
    ]
  });
  try {
    const registry = await isolated.ssrLoadModule("/src/scripts/reveal/effects.ts");
    assert.equal(typeof registry.preloadEffects, "function");
    const warn = console.warn;
    try {
      console.warn = () => {};
      await registry.preloadEffects(["line-fork-split"]);
    } finally {
      console.warn = warn;
    }
    assert.equal(registry.resolveEffect("line-fork-split")({}, {}), null);
    await registry.preloadEffects(["line-fork-split"]);
    const original = await isolated.ssrLoadModule("/src/scripts/reveal/pools/gen3-line.ts");
    assert.equal(
      registry.resolveEffect("line-fork-split"),
      original.GEN3_LINE_EFFECTS["line-fork-split"]
    );
  } finally {
    await isolated.close();
  }
});

test("every pool member loads from the matching role/generation", async () => {
  assert.equal(typeof effects.preloadEffects, "function");
  const { POOLS } = await server.ssrLoadModule("/src/scripts/reveal/pools.ts");
  for (const [type, entries] of Object.entries(POOLS)) {
    await effects.preloadEffects(entries.map(({ name }) => name));
    const registries = await Promise.all(
      ["", "gen2-", "gen3-"].map(async (prefix) => {
        const module = await server.ssrLoadModule(`/src/scripts/reveal/pools/${prefix}${type}.ts`);
        return Object.entries(module).find(([key]) => key.endsWith("_EFFECTS"))[1];
      })
    );
    const legacy = await server.ssrLoadModule("/src/scripts/reveal/legacy-effects.ts");
    const expected = Object.assign({}, legacy.LEGACY, ...registries);
    for (const { name } of entries) {
      assert.equal(effects.resolveEffect(name), expected[name], name);
    }
    assert.equal(effects.resolveEffect(`@${type}`), expected[entries[0].name]);
  }
});

test("aliases and unknown names keep the existing legacy fallback", async () => {
  assert.equal(typeof effects.preloadEffects, "function");
  await effects.preloadEffects(["pop", "flip-up", "contact-draw", "not-a-real-effect"]);
  assert.equal(effects.resolveEffect("pop"), effects.resolveEffect("twinkle"));
  assert.equal(effects.resolveEffect("flip-up"), effects.resolveEffect("orbit-in"));
  assert.equal(effects.resolveEffect("contact-draw"), effects.resolveEffect("draw"));
  const warnings = [];
  const warn = console.warn;
  try {
    console.warn = (message) => warnings.push(message);
    assert.equal(effects.resolveEffect("not-a-real-effect"), effects.resolveEffect("fade"));
    assert.equal(effects.resolveEffect("not-a-real-effect"), effects.resolveEffect("fade"));
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = warn;
  }
});
