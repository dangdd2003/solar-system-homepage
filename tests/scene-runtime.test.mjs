import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  appType: "custom"
});
after(() => server.close());

const [
  bodiesMod,
  cameraPathMod,
  cameraMotionMod,
  orbitMathMod,
  ellipseMod,
  planetHaloMod,
  sunHaloMod,
  sceneBuilderMod
] = await Promise.all([
  server.ssrLoadModule("/src/scene/bodies.ts"),
  server.ssrLoadModule("/src/scene/camera-path.ts"),
  server.ssrLoadModule("/src/scene/camera-motion.ts"),
  server.ssrLoadModule("/src/scene/orbit-math.ts"),
  server.ssrLoadModule("/src/scene/ellipse.ts"),
  server.ssrLoadModule("/src/scene/planet-halo.ts"),
  server.ssrLoadModule("/src/scene/sun-halo.ts"),
  server.ssrLoadModule("/src/scene/scene-builder.ts")
]);

const { BODIES, MOON, getBody, isBodyId } = bodiesMod;
const { cameraTargetFor, cameraTargetForInto } = cameraPathMod;
const { VelocityTracker, coast, coastInto } = cameraMotionMod;
const {
  MAX_PAN_DISTANCE,
  PITCH_LIMIT,
  applyOrbitDrag,
  applyOrbitDragInto,
  clampPanTarget,
  clampPanTargetInto,
  panDelta,
  panDeltaInto
} = orbitMathMod;
const { ellipsePosition, ellipsePositionInto, ellipsePositionPrecomputedInto } = ellipseMod;
const { planetHaloMetrics } = planetHaloMod;
const { haloReachesViewport, sunHaloMetrics } = sunHaloMod;
const { starfieldPointStyle } = sceneBuilderMod;

test("getBody and isBodyId provide O(1) lookup for all BODIES and MOON", () => {
  for (const body of BODIES) {
    assert.equal(isBodyId(body.id), true);
    assert.equal(getBody(body.id), body);
  }
  assert.equal(isBodyId("moon"), true);
  assert.equal(getBody("moon"), MOON);

  for (const invalid of ["pluto", "", "sun2", "toString"]) {
    assert.equal(isBodyId(invalid), false);
    assert.throws(() => getBody(invalid), /Unknown body id/);
  }
});

test("cameraTargetForInto matches cameraTargetFor with and without y", () => {
  const earth = getBody("earth");
  const out = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } };

  for (const pos of [
    { x: 12.5, z: -8.25 },
    { x: -3.1, y: 1.75, z: 9.4 }
  ]) {
    const expected = cameraTargetFor(earth, pos);
    const actual = cameraTargetForInto(earth, pos, out);
    assert.equal(actual, out);
    assert.deepEqual(actual, expected);
  }
});

test("panDeltaInto, clampPanTargetInto, applyOrbitDragInto, and coastInto match pure variants", () => {
  const right = { x: 0.8, y: 0, z: -0.6 };
  const up = { x: 0.24, y: 0.92, z: 0.32 };
  const outVec = { x: 0, y: 0, z: 0 };

  assert.equal(panDeltaInto(42, -17, right, up, 25, outVec), outVec);
  assert.deepEqual(outVec, panDelta(42, -17, right, up, 25));

  // Within MAX_PAN_DISTANCE
  const near = { x: 10, y: -20, z: 30 };
  assert.deepEqual(clampPanTargetInto(near, outVec), clampPanTarget(near));

  // Beyond MAX_PAN_DISTANCE, including aliasing target === out
  const far = { x: MAX_PAN_DISTANCE * 2, y: MAX_PAN_DISTANCE, z: -MAX_PAN_DISTANCE };
  const expectedFar = clampPanTarget(far);
  const aliasedFar = { ...far };
  assert.equal(clampPanTargetInto(aliasedFar, aliasedFar), aliasedFar);
  assert.deepEqual(aliasedFar, expectedFar);

  // applyOrbitDragInto including pitch clamping and aliasing s === out
  const sph = { radius: 14, yaw: 1.2, pitch: PITCH_LIMIT - 0.01 };
  const expectedSph = applyOrbitDrag(sph, 35, 100);
  const aliasedSph = { ...sph };
  assert.equal(applyOrbitDragInto(aliasedSph, 35, 100, aliasedSph), aliasedSph);
  assert.deepEqual(aliasedSph, expectedSph);

  // coastInto
  const outCoast = { distance: 0, velocity: 0 };
  assert.equal(coastInto(1200, 0.3, 1 / 60, outCoast), outCoast);
  assert.deepEqual(outCoast, coast(1200, 0.3, 1 / 60));
});

test("VelocityTracker ring buffer matches Array+shift semantics including >capacity bursts", () => {
  class ReferenceTracker {
    samples = [];
    lastT = 0;
    reset(t) {
      this.samples = [];
      this.lastT = t;
    }
    add(t, dx, dy) {
      this.samples.push({ t, dx, dy });
      this.lastT = t;
      const cutoff = t - VelocityTracker.WINDOW;
      let oldest = this.samples[0];
      while (oldest !== undefined && oldest.t < cutoff) {
        this.samples.shift();
        oldest = this.samples[0];
      }
    }
    velocity(t) {
      if (this.samples.length === 0 || t - this.lastT > VelocityTracker.STALE) {
        return { vx: 0, vy: 0 };
      }
      const cutoff = t - VelocityTracker.WINDOW;
      let dx = 0;
      let dy = 0;
      let first = t;
      for (const s of this.samples) {
        if (s.t < cutoff) continue;
        dx += s.dx;
        dy += s.dy;
        first = Math.min(first, s.t);
      }
      const span = Math.max(t - first, 1 / 60);
      return { vx: dx / span, vy: dy / span };
    }
  }

  const tracker = new VelocityTracker();
  const ref = new ReferenceTracker();

  tracker.reset(0);
  ref.reset(0);
  assert.deepEqual(tracker.velocity(0.01), ref.velocity(0.01));

  // Burst of 100 samples inside WINDOW = 0.1s (exceeds initial capacity 32 -> 64 -> 128)
  for (let i = 0; i < 100; i++) {
    const t = 1.0 + i * 0.0008;
    const dx = Math.sin(i) * 4;
    const dy = Math.cos(i) * 3;
    tracker.add(t, dx, dy);
    ref.add(t, dx, dy);
    assert.deepEqual(tracker.velocity(t + 0.01), ref.velocity(t + 0.01));
  }

  // Advance past WINDOW so old samples evict and wrap head around ring buffer
  for (let i = 0; i < 60; i++) {
    const t = 1.2 + i * 0.015;
    tracker.add(t, 2.5, -1.5);
    ref.add(t, 2.5, -1.5);
    assert.deepEqual(tracker.velocity(t + 0.005), ref.velocity(t + 0.005));
  }

  // Stale release returns zero
  assert.deepEqual(tracker.velocity(3.0), ref.velocity(3.0));
  assert.deepEqual(tracker.velocity(3.0), { vx: 0, vy: 0 });
});

test("ellipsePositionPrecomputedInto matches ellipsePositionInto and ellipsePosition", () => {
  const outA = { x: 0, z: 0 };
  const outB = { x: 0, z: 0 };
  for (const body of BODIES) {
    if (body.id === "sun") continue;
    const a = 5 + body.facts.distanceAu * 2;
    const e = body.facts.eccentricity;
    const b = a * Math.sqrt(1 - e * e);
    const c = a * e;
    for (const angle of [0, 0.7, Math.PI / 2, Math.PI, 4.9]) {
      const expected = ellipsePosition(a, e, angle);
      ellipsePositionInto(a, e, angle, outA);
      ellipsePositionPrecomputedInto(a, b, c, angle, outB);
      assert.deepEqual(outA, expected);
      assert.deepEqual(outB, expected);
    }
  }
});

test("planetHaloMetrics and sunHaloMetrics handle edge cases and reuse out objects", () => {
  assert.deepEqual(planetHaloMetrics(0, 10, 800, 55), {
    widthPx: 0,
    widthWorld: 0,
    visibility: 0,
    gainScale: 0
  });
  assert.deepEqual(planetHaloMetrics(1, 0.5, 800, 55), {
    widthPx: 0,
    widthWorld: 0,
    visibility: 0,
    gainScale: 0
  });

  const pOut = { widthPx: 0, widthWorld: 0, visibility: 0, gainScale: 0 };
  const pMetrics = planetHaloMetrics(0.95, 18, 900, 55, pOut);
  assert.equal(pMetrics, pOut);
  assert.ok(pMetrics.widthPx > 0 && pMetrics.widthWorld > 0);
  assert.ok(pMetrics.visibility > 0 && pMetrics.visibility <= 1);
  assert.ok(pMetrics.gainScale > 0 && pMetrics.gainScale <= 1);

  const sOut = { discPx: 0, widthPx: 0, widthWorld: 0, peakGain: 0 };
  const sMetrics = sunHaloMetrics(3.2, 24, 900, 55, sOut);
  assert.equal(sMetrics, sOut);
  assert.ok(sMetrics.discPx > 0 && sMetrics.widthPx > 0 && sMetrics.widthWorld > 0);
  assert.ok(sMetrics.peakGain > 0 && sMetrics.peakGain < 1);

  assert.equal(haloReachesViewport({ x: 0, y: 0, z: -5 }, 3.2, 4.5, 55, 1280, 720), true);
  assert.equal(haloReachesViewport({ x: 0, y: 0, z: 24 }, 3.2, 4.5, 55, 1280, 720), true);
  assert.equal(haloReachesViewport({ x: 500, y: 0, z: 24 }, 3.2, 4.5, 55, 1280, 720), false);
});

test("starfieldPointStyle snaps device pixels and clamps opacity", () => {
  for (const pr of [0, 0.5, 1, 1.5, 2, 3]) {
    const style = starfieldPointStyle(pr);
    assert.ok(style.size > 0);
    assert.ok(style.opacity > 0 && style.opacity <= 1);
  }
});
