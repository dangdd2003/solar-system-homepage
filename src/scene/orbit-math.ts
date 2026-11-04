import type { Vec3 } from "./camera-path";

/**
 * The camera's position expressed as an offset from its look target, in
 * spherical coordinates:
 *   - radius: distance from the target
 *   - yaw:    rotation around the +y axis (0 = looking from +z)
 *   - pitch:  elevation above the xz-plane (+ raises the camera, - lowers it)
 * Pure data + pure transforms so the orbit/zoom math is unit-testable without
 * a camera or DOM. camera-rig.ts turns these into actual THREE camera moves.
 */
export interface Spherical {
  radius: number;
  yaw: number;
  pitch: number;
}

/** Keep the camera away from the exact poles, where yaw becomes degenerate. */
export const PITCH_LIMIT = Math.PI / 2 - 0.15;
/** Closest/farthest the camera may orbit from its look target (scene units). */
export const MIN_RADIUS = 2.5;
export const MAX_RADIUS = 180;
/**
 * Clearance kept between the camera and the surface of the body it is looking
 * at (scene units). MIN_RADIUS already clears every planet — the largest,
 * Jupiter (size 2.0), sits 0.5 below the 2.5 floor — so this margin only bites
 * on bodies bigger than the flat floor, i.e. the Sun (size 3.2). It picks up
 * the same 0.5-unit gap the planets get so zooming in stops just off the
 * surface instead of punching through it.
 */
export const SURFACE_MARGIN = 0.5;
/**
 * How far the look target may be panned from the origin (scene units). Bounds
 * the free pan so the user can always find their way back to the system — a
 * focus/overview command snaps the target home anyway, this just caps drifting.
 */
export const MAX_PAN_DISTANCE = 120;

/** Radians of rotation per pixel dragged. Tuned for a natural drag feel. */
const DRAG_TO_RADIANS = 0.005;
/** Wheel/pinch delta → fraction of radius change per unit. Multiplicative. */
const ZOOM_SENSITIVITY = 0.0015;
/**
 * World units the look target moves per pixel dragged, per unit of camera
 * radius. Scaling by radius keeps a pan feeling the same at any zoom: far out,
 * each pixel covers more world; up close, less.
 */
const PAN_PER_PIXEL_PER_RADIUS = 0.0018;

export function clampPitch(pitch: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/**
 * Smallest orbit radius allowed for a body of the given surface size.
 * Keeps a fixed margin off the surface. Ensures an absolute minimum clearance of 0.4.
 */
export function minRadiusForSize(size: number): number {
  const ABSOLUTE_MIN_CLEARANCE = 0.4;
  return Math.max(size + SURFACE_MARGIN, ABSOLUTE_MIN_CLEARANCE);
}

export function clampRadius(
  radius: number,
  minRadius = MIN_RADIUS,
  maxRadius = MAX_RADIUS
): number {
  return Math.max(minRadius, Math.min(maxRadius, radius));
}

/**
 * World-space delta to move the look target for a right-drag pan. `right` and
 * `up` are the camera's unit screen axes in world space; dragging right (+dx)
 * pushes the scene right, i.e. moves the target along `-right`, and dragging
 * down (+dy) moves it along `+up`, so content follows the cursor. Scaled by
 * `radius` so the pan feels even at any zoom. Pure: returns a new Vec3.
 */
export function panDelta(
  dxPixels: number,
  dyPixels: number,
  right: Vec3,
  up: Vec3,
  radius: number
): Vec3 {
  const kx = -dxPixels * PAN_PER_PIXEL_PER_RADIUS * radius;
  const ky = dyPixels * PAN_PER_PIXEL_PER_RADIUS * radius;
  return {
    x: right.x * kx + up.x * ky,
    y: right.y * kx + up.y * ky,
    z: right.z * kx + up.z * ky
  };
}

/**
 * Clamp a look-target position to within MAX_PAN_DISTANCE of the origin so the
 * scene can't be panned irretrievably far away. Pure: returns a new Vec3.
 */
export function clampPanTarget(target: Vec3): Vec3 {
  const dist = Math.hypot(target.x, target.y, target.z);
  if (dist <= MAX_PAN_DISTANCE) return { ...target };
  const s = MAX_PAN_DISTANCE / dist;
  return { x: target.x * s, y: target.y * s, z: target.z * s };
}

/** Spherical offset → cartesian offset from the target. */
export function sphericalToCartesian(s: Spherical): Vec3 {
  const cosPitch = Math.cos(s.pitch);
  return {
    x: s.radius * cosPitch * Math.sin(s.yaw),
    y: s.radius * Math.sin(s.pitch),
    z: s.radius * cosPitch * Math.cos(s.yaw)
  };
}

/** Cartesian offset from the target → spherical offset. */
export function cartesianToSpherical(v: Vec3): Spherical {
  const radius = Math.hypot(v.x, v.y, v.z);
  if (radius === 0) return { radius: 0, yaw: 0, pitch: 0 };
  return {
    radius,
    yaw: Math.atan2(v.x, v.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, v.y / radius)))
  };
}

/**
 * Apply a pointer drag (in pixels) to a spherical offset. Horizontal drag
 * rotates yaw; vertical drag tilts pitch (clamped away from the poles). Radius
 * is untouched. Pure: returns a new object.
 */
export function applyOrbitDrag(s: Spherical, dxPixels: number, dyPixels: number): Spherical {
  return {
    radius: s.radius,
    yaw: s.yaw - dxPixels * DRAG_TO_RADIANS,
    pitch: clampPitch(s.pitch + dyPixels * DRAG_TO_RADIANS)
  };
}

/**
 * Apply a zoom delta (wheel deltaY or inverted pinch delta) to a spherical
 * offset. Negative = zoom in (closer), positive = zoom out (farther). Scales
 * the radius multiplicatively so a notch feels the same at any distance, then
 * clamps to [minRadius, MAX_RADIUS]. `minRadius` defaults to the flat floor but
 * callers pass a larger value for big bodies (the Sun) so zooming in stops off
 * the surface. Yaw/pitch untouched. Pure: returns a new object.
 */
export function applyZoom(
  s: Spherical,
  delta: number,
  minRadius = MIN_RADIUS,
  maxRadius = MAX_RADIUS
): Spherical {
  const factor = Math.exp(delta * ZOOM_SENSITIVITY);
  return {
    radius: clampRadius(s.radius * factor, minRadius, maxRadius),
    yaw: s.yaw,
    pitch: s.pitch
  };
}
