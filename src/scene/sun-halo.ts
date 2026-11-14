import type { Vec3 } from "./camera-path";

/**
 * Pure zoom maths for the Sun's halo: the light the Sun scatters into the sky just beyond its limb.
 *
 * The halo is drawn by a shader (see sun.ts) that only needs three numbers per frame: the world
 * radius it hugs, its world width, and its peak brightness at the limb. Those numbers depend on how
 * far the camera is and how tall the viewport is, so they are derived here, with no WebGL, so the
 * whole zoom curve can be unit-tested directly.
 *
 * Two rules keep the halo looking right at every zoom:
 *  - Width is measured in screen pixels and then converted to world units at the Sun's distance.
 *    The halo therefore keeps a steady on-screen width as the camera moves, with a floor so it is
 *    never a hairline when the Sun is moderately small, and a cap so it never becomes a fog when the
 *    Sun fills the view. The floor fades out as the disc shrinks, so a tiny distant Sun keeps a glow
 *    in proportion to its disc instead of a bright ring several times wider than the Sun.
 *  - Brightness rises with distance and dims only as the disc gets very large. Close up, the disc
 *    itself is already bright, so a strong halo would only clip to white.
 *
 * All angles come from the camera's vertical field of view, in degrees, like three.js.
 */

/** The halo never gets thinner than this many CSS px while the disc is at least HALO_FLOOR_FULL_DISC_PX. */
export const HALO_WIDTH_FLOOR_PX = 18;
/** Disc radius (CSS px) at which the width floor is fully in force. Below it the floor shrinks with the disc. */
export const HALO_FLOOR_FULL_DISC_PX = 30;
/** The halo never gets wider than this fraction of the viewport height. */
export const HALO_WIDTH_CAP_FRACTION = 0.22;
/** Between floor and cap, the halo is this fraction of the disc's own on-screen radius. */
export const HALO_WIDTH_DISC_FRACTION = 0.5;

/** Peak gain (brightness right at the limb) at the framing distance. */
export const HALO_GAIN_NEAR = 0.5;
/** Peak gain far away. Kept under 1 so the summed halo never clips to white with no tone mapping. */
export const HALO_GAIN_FAR = 0.85;
/** Camera distance (world units) where the peak gain starts rising. The framing distance is 9. */
export const HALO_GAIN_NEAR_DISTANCE = 9;
/** Camera distance (world units) where the peak gain reaches HALO_GAIN_FAR. Inside the 180 max zoom. */
export const HALO_GAIN_FAR_DISTANCE = 120;
/** The disc fraction of the viewport height where the large-disc dimming starts. */
export const HALO_DIM_START_FRACTION = 0.35;
/** The disc fraction of the viewport height where the large-disc dimming is complete. */
export const HALO_DIM_END_FRACTION = 0.8;
/** Share of the peak gain removed once the disc is fully large. */
export const HALO_LARGE_DISC_DIM = 0.5;

/** The per-frame numbers the halo shader needs, all derived from the camera and the Sun. */
export interface SunHaloMetrics {
  /** On-screen radius of the photosphere's limb, in CSS px. */
  discPx: number;
  /** On-screen width of the halo beyond the limb, in CSS px. */
  widthPx: number;
  /** The same width in world units at the Sun's distance. */
  widthWorld: number;
  /** Brightness at the limb, 0..HALO_GAIN_FAR. Before the reveal and entrance scales it. */
  peakGain: number;
}

/** Clamped Hermite ramp: 0 at or below `lo`, 1 at or above `hi`, smooth in between. */
export function smoothstep(lo: number, hi: number, x: number): number {
  if (hi === lo) return x >= hi ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** tan(fov / 2) for a vertical field of view in degrees. */
function halfFovTan(fovDeg: number): number {
  return Math.tan((fovDeg * Math.PI) / 360);
}

/**
 * World units per screen pixel at distance `d`, for a viewport `viewportH` CSS px tall.
 * Linear in `d`, inverse in the viewport height. The viewport is clamped to at least 1 px.
 */
export function worldPerPx(d: number, viewportH: number, fovDeg: number): number {
  return (2 * d * halfFovTan(fovDeg)) / Math.max(1, viewportH);
}

/**
 * On-screen radius of the photosphere's limb, in CSS px, at camera distance `d`.
 *
 * This is the exact perspective form: the limb sits at angle asin(R/d) from the camera, so its
 * projected radius is (H/2) * tan(asin(R/d)) / tan(fov/2), which simplifies to the expression
 * below. It is larger than the flat approximation R/d * (H/2) / tan(fov/2): about 7% at the
 * framing distance and about 2x at the closest zoom, where the disc fills most of the screen.
 * `d` is clamped just outside the surface so the square root stays real.
 */
export function discRadiusPx(R: number, d: number, viewportH: number, fovDeg: number): number {
  const dSafe = Math.max(d, R * 1.0001);
  const H = Math.max(1, viewportH);
  return ((H / 2) * R) / (Math.sqrt(dSafe * dSafe - R * R) * halfFovTan(fovDeg));
}

/**
 * On-screen width of the halo beyond the limb, in CSS px. It follows the disc radius, so the halo
 * grows with the Sun, but never above the cap. The floor applies only while the disc is large
 * enough to carry it: a small, distant disc gets a width proportional to itself, so its glow stays
 * a faint rim rather than a ring several times wider than the Sun. Non-decreasing in the disc.
 */
export function haloWidthPx(discPx: number, viewportH: number): number {
  const floorPx = HALO_WIDTH_FLOOR_PX * smoothstep(0, HALO_FLOOR_FULL_DISC_PX, discPx);
  return Math.min(
    HALO_WIDTH_CAP_FRACTION * viewportH,
    Math.max(floorPx, HALO_WIDTH_DISC_FRACTION * discPx)
  );
}

/**
 * Brightness right at the limb, from 0 to HALO_GAIN_FAR.
 *
 * It rises in log-distance from HALO_GAIN_NEAR to HALO_GAIN_FAR, so the halo gets a little more
 * luminous as the Sun shrinks on screen, which is what a real scattering veil does. Then it dims
 * by up to HALO_LARGE_DISC_DIM as the disc fills the viewport, so a close Sun is a bright disc
 * with a soft edge rather than a white blob.
 */
const LOG_GAIN_NEAR = Math.log(HALO_GAIN_NEAR_DISTANCE);
const LOG_GAIN_FAR = Math.log(HALO_GAIN_FAR_DISTANCE);

export function haloPeakGain(d: number, discPx: number, viewportH: number): number {
  const H = Math.max(1, viewportH);
  const far = smoothstep(LOG_GAIN_NEAR, LOG_GAIN_FAR, Math.log(Math.max(d, 1e-6)));
  const base = HALO_GAIN_NEAR + (HALO_GAIN_FAR - HALO_GAIN_NEAR) * far;
  const dim =
    HALO_LARGE_DISC_DIM *
    smoothstep(HALO_DIM_START_FRACTION * H, HALO_DIM_END_FRACTION * H, discPx);
  return base * (1 - dim);
}

/**
 * Everything the halo needs for one frame. `R` is the Sun's world radius (already scaled by its
 * entrance grow-in), `d` the camera's distance to the Sun's centre, `H` the viewport height in CSS px.
 * Writes into `out` when given, so the per-frame caller can reuse one object instead of allocating.
 */
export function sunHaloMetrics(
  R: number,
  d: number,
  viewportH: number,
  fovDeg: number,
  out: SunHaloMetrics = { discPx: 0, widthPx: 0, widthWorld: 0, peakGain: 0 }
): SunHaloMetrics {
  const H = Math.max(1, viewportH);
  const halfTan = halfFovTan(fovDeg);
  const dSafe = Math.max(d, R * 1.0001);
  out.discPx = ((H / 2) * R) / (Math.sqrt(dSafe * dSafe - R * R) * halfTan);
  out.widthPx = haloWidthPx(out.discPx, viewportH);
  out.widthWorld = out.widthPx * ((2 * d * halfTan) / H);
  out.peakGain = haloPeakGain(d, out.discPx, viewportH);
  return out;
}

/** Slack on the projected radii: a sphere seen off-axis outlines an ellipse, not a circle. */
const HALO_REACH_MARGIN = 1.25;

/**
 * Whether any part of the halo band can land on the screen. The band is the annulus between the
 * photosphere's limb (`innerRadiusWorld`, the Sun's radius) and the halo's outer edge
 * (`outerRadiusWorld`, the radius of the shell). Both project to circles of CSS px around the Sun's
 * centre. The viewport is a rectangle, so its distances from that centre form one interval, from the
 * nearest point to the farthest corner. The band can show exactly when that interval reaches into
 * the annulus.
 *
 * `rel` is the Sun's centre in camera space: x right, y up, z forward (depth along the view).
 * A Sun behind the camera is reported as visible, since the shader's own test keeps that case
 * correct. The check is padded by HALO_REACH_MARGIN, so it never hides a halo that is on screen.
 */
export function haloReachesViewport(
  rel: Vec3,
  innerRadiusWorld: number,
  outerRadiusWorld: number,
  fovDeg: number,
  viewportW: number,
  viewportH: number
): boolean {
  if (rel.z <= 0) return true;
  const H = Math.max(1, viewportH);
  const distance = Math.hypot(rel.x, rel.y, rel.z);
  const halfTan = halfFovTan(fovDeg);
  const focalPx = H / 2 / halfTan;
  const cx = viewportW / 2 + (rel.x / rel.z) * focalPx;
  const cy = H / 2 - (rel.y / rel.z) * focalPx;

  const dSafeInner = Math.max(distance, innerRadiusWorld * 1.0001);
  const innerPx =
    ((H / 2) * innerRadiusWorld) /
    (Math.sqrt(dSafeInner * dSafeInner - innerRadiusWorld * innerRadiusWorld) * halfTan) /
    HALO_REACH_MARGIN;
  const dSafeOuter = Math.max(distance, outerRadiusWorld * 1.0001);
  const outerPx =
    (((H / 2) * outerRadiusWorld) /
      (Math.sqrt(dSafeOuter * dSafeOuter - outerRadiusWorld * outerRadiusWorld) * halfTan)) *
    HALO_REACH_MARGIN;

  const nearX = Math.max(-cx, cx - viewportW, 0);
  const nearY = Math.max(-cy, cy - H, 0);
  const farX = Math.max(Math.abs(cx), Math.abs(cx - viewportW));
  const farY = Math.max(Math.abs(cy), Math.abs(cy - H));
  const nearSq = nearX * nearX + nearY * nearY;
  const farSq = farX * farX + farY * farY;
  return nearSq < outerPx * outerPx && farSq > innerPx * innerPx;
}
