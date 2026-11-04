import type { Vec3 } from "./camera-path";
import { clamp } from "../utils/math";

/**
 * Finite-Sun eclipse shading. The Sun is modelled as a disc, not a point: from
 * a receiver's viewpoint, both the Sun and a caster project as circles on the
 * sky, and the eclipse factor is driven by how much those two discs overlap.
 * This one formula produces every real eclipse regime — umbra (caster covers
 * the whole Sun), penumbra (partial overlap), and antumbra/annular (caster
 * too small/far to cover the Sun even head-on) — as one continuous "covered
 * fraction" rather than a binary in/out-of-shadow test.
 *
 * Pure geometry (positions + radii, no THREE types) so it unit-tests with
 * hand-built vectors, matching orbit-math.ts / orbital-plane.ts. The render
 * loop turns the returned factor into a material dim.
 */
export interface ShadowBody {
  pos: Vec3;
  radius: number;
}

/** Deepest an eclipse dims a body — never fully black, so it stays readable. */
export const SHADOW_MIN = 0.15;

/**
 * Intersection area of two circles with radii `r1`, `r2` whose centres are
 * `d` apart. Pure 2D geometry — used here on *angular* radii (circles on the
 * receiver's sky), but the formula itself doesn't care what the radii mean.
 */
export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0; // disjoint: no overlap
  if (d <= Math.abs(r1 - r2)) {
    // One disc fully contains the other.
    const min = Math.min(r1, r2);
    return Math.PI * min * min;
  }
  // Partial overlap: standard circular-segment ("lens") area formula.
  const r1sq = r1 * r1;
  const r2sq = r2 * r2;
  const alpha = Math.acos(clamp((d * d + r1sq - r2sq) / (2 * d * r1), -1, 1));
  const beta = Math.acos(clamp((d * d + r2sq - r1sq) / (2 * d * r2), -1, 1));
  const term = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);
  return r1sq * alpha + r2sq * beta - 0.5 * Math.sqrt(Math.max(0, term));
}

/**
 * Fraction of the Sun's disc hidden from `receiver`'s viewpoint by `caster`,
 * in `[0,1]`. Projects both the Sun (radius `sunRadius`, centred at `sunPos`)
 * and the caster onto the receiver's sky as angular discs, then divides their
 * overlap area by the Sun disc's area. `1` = caster fully covers the Sun
 * (total eclipse); a caster whose angular radius is smaller than the Sun's
 * can never reach `1` even centred exactly on the Sun (annular case).
 */
export function coveredFraction(
  receiver: ShadowBody,
  caster: ShadowBody,
  sunPos: Vec3,
  sunRadius: number
): number {
  const toSun = sub(sunPos, receiver.pos);
  const toCaster = sub(caster.pos, receiver.pos);
  const distToSun = length(toSun);
  const distToCaster = length(toCaster);
  if (distToSun === 0 || distToCaster === 0) return 0;

  const sunAng = Math.asin(clamp(sunRadius / distToSun, -1, 1));
  const casterAng = Math.asin(clamp(caster.radius / distToCaster, -1, 1));
  const angSep = Math.acos(clamp(dot(toSun, toCaster) / (distToSun * distToCaster), -1, 1));

  const overlap = circleOverlapArea(sunAng, casterAng, angSep);
  const sunDiscArea = Math.PI * sunAng * sunAng;
  if (sunDiscArea === 0) return 0;
  return clamp(overlap / sunDiscArea, 0, 1);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}
