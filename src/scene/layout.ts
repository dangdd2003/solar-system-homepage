import { BODIES, type BodyConfig, type BodyId } from "./bodies";

export interface LayoutOptions {
  /** Scene radius the outermost orbit should reach. */
  maxOrbitRadius: number;
  /** Extra clearance added on top of the two neighbours' sizes, in scene units. */
  gap: number;
  /**
   * Extra radial clearance to reserve around specific bodies (e.g. a planet
   * with a moon whose local orbit must not reach a neighbour). Keyed by BodyId;
   * the value is treated like additional radius on both sides of that body.
   */
  extraClearance?: Partial<Record<BodyId, number>> | undefined;
}

/**
 * Compute each planet's orbit radius from its real distance from the Sun,
 * linearly scaled so the outermost planet sits at `maxOrbitRadius`, then
 * pushed outward where needed so consecutive orbits never sit closer than
 * the sum of the two planets' radii plus `gap` (i.e. planets can't overlap).
 *
 * The Sun (distanceAu 0) is not included — it stays at the origin.
 */
export function computeOrbitRadii(
  bodies: readonly BodyConfig[],
  opts: LayoutOptions
): Map<BodyId, number> {
  const planets = bodies
    .filter((b) => b.facts.distanceAu > 0)
    .sort((a, b) => a.facts.distanceAu - b.facts.distanceAu);

  const result = new Map<BodyId, number>();
  const outermost = planets[planets.length - 1];
  if (outermost === undefined) return result;

  const maxAu = outermost.facts.distanceAu;
  const scale = opts.maxOrbitRadius / maxAu;

  const extra = opts.extraClearance ?? {};
  const clearanceOf = (id: BodyId): number => extra[id] ?? 0;

  // Seed the running "previous body" with the Sun so the innermost planet's
  // orbit clears the Sun's surface instead of being buried inside it.
  const sun = bodies.find((b) => b.facts.distanceAu === 0);
  let prevRadius = 0;
  let prevSize = sun ? sun.size : 0;
  let prevClearance = 0;
  for (const planet of planets) {
    const scaled = planet.facts.distanceAu * scale;
    const clearance = clearanceOf(planet.id);
    // Reserve both neighbours' sizes, the gap, and any extra clearance each of
    // them needs (e.g. the Moon's local orbit reach around Earth).
    const minRadius = prevRadius + prevSize + prevClearance + planet.size + clearance + opts.gap;
    const radius = Math.max(scaled, minRadius);
    result.set(planet.id, radius);
    prevRadius = radius;
    prevSize = planet.size;
    prevClearance = clearance;
  }

  return result;
}

/** Convenience: layout for the project's BODIES with sensible defaults. */
export function defaultOrbitRadii(
  maxOrbitRadius: number,
  earthMoonClearance = 0
): Map<BodyId, number> {
  return computeOrbitRadii(BODIES, {
    maxOrbitRadius,
    gap: 1.2,
    extraClearance: { earth: earthMoonClearance }
  });
}
