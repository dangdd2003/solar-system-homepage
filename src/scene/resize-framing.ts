import { type Vec3 } from "./camera-path";

/**
 * Seconds the overview camera takes to ease onto a new framing after a resize.
 * Short on purpose: a resize is a fast, direct action, so the camera should
 * land with the window rather than trail it.
 */
export const FRAMING_DURATION = 0.22;

/**
 * Decelerating cubic ease-out (the curve of cubic-bezier(0.33, 1, 0.68, 1)).
 * Starts at full speed and slows to rest, never overshoots.
 */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(Math.max(t, 0), 1);
  return 1 - u * u * u;
}

/**
 * Eased progress (0..1) of a framing ease that started at `start` (seconds) and
 * runs for `duration` seconds. Clamped at both ends; a zero duration is already done.
 */
export function framingProgress(
  elapsed: number,
  start: number,
  duration: number = FRAMING_DURATION
): number {
  if (duration <= 0) return 1;
  const raw = Math.min(Math.max((elapsed - start) / duration, 0), 1);
  return easeOutCubic(raw);
}

/**
 * Camera position `progress` (already eased, 0..1) of the way from `from` to `to`,
 * written into `out`. Pure so the framing curve can be unit-tested.
 */
export function framingPosition(
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  progress: number,
  out: Vec3
): Vec3 {
  const k = Math.min(Math.max(progress, 0), 1);
  out.x = from.x + (to.x - from.x) * k;
  out.y = from.y + (to.y - from.y) * k;
  out.z = from.z + (to.z - from.z) * k;
  return out;
}
