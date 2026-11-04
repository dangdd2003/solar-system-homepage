/**
 * Elliptical orbit geometry with the Sun at one focus (Kepler's first law).
 *
 * We treat the computed orbit radius as the semi-major axis `a`. The ellipse is
 * drawn in the xz-plane, its centre offset from the origin (the Sun) by `a * e`
 * along -x, so the Sun sits at the focus rather than the centre.
 *
 *   semi-minor axis  b = a * sqrt(1 - e^2)
 *   centre offset    c = a * e   (distance from centre to focus)
 *
 * `angle` is the parametric angle around the ellipse centre (not a true
 * anomaly) — good enough for a smooth, correctly-shaped visual orbit.
 */

/**
 * Allocation-free variant of `ellipsePosition`: writes the point into `out` and
 * returns it. Same arithmetic, same order, so results are bit-identical.
 */
export function ellipsePositionInto(
  semiMajor: number,
  eccentricity: number,
  angle: number,
  out: { x: number; z: number }
): { x: number; z: number } {
  const a = semiMajor;
  const e = eccentricity;
  const b = a * Math.sqrt(1 - e * e);
  const c = a * e;
  // Centre shifted by -c so the focus (Sun) sits at the origin.
  out.x = Math.cos(angle) * a - c;
  out.z = Math.sin(angle) * b;
  return out;
}

export function ellipsePosition(
  semiMajor: number,
  eccentricity: number,
  angle: number
): { x: number; z: number } {
  return ellipsePositionInto(semiMajor, eccentricity, angle, { x: 0, z: 0 });
}
