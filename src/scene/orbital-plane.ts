import type { Vec3 } from "./camera-path";
import type { BodyConfig } from "./bodies";

/**
 * Real inclinations are small (0.77°–7°), so at true scale the non-coplanarity
 * is barely visible in a compressed overview. We exaggerate the tilt by this
 * factor for legibility while keeping the RELATIVE proportions real (Mercury
 * stays the most tilted, Uranus the least) and the ascending-node directions
 * exact — so the orbits visibly fan out onto different planes, as they truly do.
 */
export const INCLINATION_VISUAL_GAIN = 4;

/** Precomputed rotation terms for one orbital plane (trig done once, not per point). */
interface TiltTerms {
  readonly flat: boolean;
  readonly cosI: number;
  readonly sinI: number;
  readonly nx: number;
  readonly nz: number;
}

function tiltTermsFor(inclinationDeg: number, ascendingNodeDeg: number): TiltTerms {
  if (inclinationDeg === 0) {
    return { flat: true, cosI: 1, sinI: 0, nx: 0, nz: 0 };
  }
  const i = (inclinationDeg * Math.PI) / 180;
  const omega = (ascendingNodeDeg * Math.PI) / 180;
  return {
    flat: false,
    cosI: Math.cos(i),
    sinI: Math.sin(i),
    // Unit rotation axis: the ascending-node line, lying in the ecliptic plane.
    nx: Math.cos(omega),
    nz: Math.sin(omega)
  };
}

/** Allocation-free tilt: writes the tilted point into `out` and returns it. */
function applyTiltInto(inPlane: { x: number; z: number }, t: TiltTerms, out: Vec3): Vec3 {
  if (t.flat) {
    out.x = inPlane.x;
    out.y = 0;
    out.z = inPlane.z;
    return out;
  }
  const px = inPlane.x;
  const pz = inPlane.z;
  // Rodrigues: p_rot = p cosI + (n × p) sinI + n (n · p)(1 - cosI).
  // ny = 0 (axis is in the xz-plane), which simplifies the formula.
  const dot = t.nx * px + t.nz * pz; // n·p (ny = 0, py = 0)
  const crossY = t.nz * px - t.nx * pz;
  out.x = px * t.cosI + t.nx * dot * (1 - t.cosI);
  out.y = crossY * t.sinI;
  out.z = pz * t.cosI + t.nz * dot * (1 - t.cosI);
  return out;
}

function applyTilt(inPlane: { x: number; z: number }, t: TiltTerms): Vec3 {
  return applyTiltInto(inPlane, t, { x: 0, y: 0, z: 0 });
}

/** Per-body tilt terms, memoised. The entry is re-validated against the body's
 *  current angles, so a changed config can never reuse stale trig. */
const termsByBody = new WeakMap<BodyConfig, { inc: number; node: number; terms: TiltTerms }>();

/**
 * Tilt an in-plane orbit point into a specific body's real orbital plane,
 * applying the shared visual gain. Single source of truth so the orbit lines
 * (scene-builder) and the moving planets (orchestrator) always agree.
 */
export function orbitPointInto(
  body: BodyConfig,
  inPlane: { x: number; z: number },
  out: Vec3
): Vec3 {
  const inc = body.facts.inclinationDeg * INCLINATION_VISUAL_GAIN;
  const node = body.facts.ascendingNodeDeg;
  let cached = termsByBody.get(body);
  if (!cached || cached.inc !== inc || cached.node !== node) {
    cached = { inc, node, terms: tiltTermsFor(inc, node) };
    termsByBody.set(body, cached);
  }
  return applyTiltInto(inPlane, cached.terms, out);
}

/** Allocating wrapper around `orbitPointInto`; same values. */
export function orbitPointFor(body: BodyConfig, inPlane: { x: number; z: number }): Vec3 {
  return orbitPointInto(body, inPlane, { x: 0, y: 0, z: 0 });
}

/**
 * Real planetary orbits are NOT coplanar: each orbital plane is tilted relative
 * to the ecliptic (Earth's plane) by the planet's inclination, hinged along the
 * line where it crosses the ecliptic — the ascending node (longitude Ω).
 *
 * This takes an orbit point computed flat in the ecliptic (the xz-plane) and
 * tips it into the planet's real orbital plane. Points on the node line stay in
 * the ecliptic; points a quarter-orbit away lift by the full inclination. Pure
 * geometry, so it is unit-tested without a scene.
 *
 * Implementation: rotate the point about the node-line axis
 *   n = (cos Ω, 0, sin Ω)          (the ascending-node direction in the ecliptic)
 * by the inclination angle i, via Rodrigues' rotation formula. Rotation about an
 * axis through the origin preserves the distance from the Sun.
 */
export function tiltToOrbitalPlane(
  inPlane: { x: number; z: number },
  inclinationDeg: number,
  ascendingNodeDeg: number
): Vec3 {
  return applyTilt(inPlane, tiltTermsFor(inclinationDeg, ascendingNodeDeg));
}
