export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "moon";

/** Real physical facts (from Wikipedia, "Solar System") shown to the visitor. */
export interface BodyFacts {
  readonly radiusKm: number;
  /** Mean distance from the Sun in astronomical units (0 for the Sun). */
  readonly distanceAu: number;
  /** Sidereal orbital period in Earth days (0 for the Sun). */
  readonly orbitalPeriodDays: number;
  /** Orbital eccentricity, 0 = circle (0 for the Sun). From Wikipedia. */
  readonly eccentricity: number;
  /**
   * Orbital inclination to the ecliptic, in degrees (Earth = 0 by definition).
   * NASA planetary fact sheet / J2000 mean elements. This is why the planets'
   * orbits are NOT coplanar — each orbital plane tips by this angle.
   */
  readonly inclinationDeg: number;
  /**
   * Longitude of the ascending node Ω, in degrees (J2000). The compass
   * direction of the hinge line where the tilted orbit crosses the ecliptic;
   * makes each plane tip in its own direction rather than all about one axis.
   */
  readonly ascendingNodeDeg: number;
  /**
   * Compressed axial spin speed relative to Earth (Earth = 1.0).
   * Negative values denote retrograde rotation (Venus, Uranus).
   */
  readonly spinSpeed: number;
}

export interface BodyConfig {
  readonly id: BodyId;
  readonly name: string;
  /** Portfolio section label for content-mapped bodies, else a short descriptor. */
  readonly label: string;
  readonly color: number;
  /** Radians per second. Compressed from real orbital periods (inner = faster). */
  readonly orbitSpeed: number;
  /** Scene units. Compressed from real radii; preserves real size ordering. */
  readonly size: number;
  readonly framingDistance: number;
  readonly facts: BodyFacts;
}

// Scene values (orbitSpeed/size) are derived from the real facts but compressed
// so the whole system is viewable at once. Orbit radii are computed at runtime
// from `facts.distanceAu` (see layout.ts). Real values live in `facts`.
export const BODIES: readonly BodyConfig[] = [
  {
    id: "sun",
    name: "Sun",
    label: "Central Star",
    color: 0xffcc33,
    orbitSpeed: 0,
    size: 3.2,
    framingDistance: 9,
    facts: {
      radiusKm: 696000,
      distanceAu: 0,
      orbitalPeriodDays: 0,
      eccentricity: 0,
      inclinationDeg: 0,
      ascendingNodeDeg: 0,
      spinSpeed: 0
    }
  },
  {
    id: "mercury",
    name: "Mercury",
    label: "Innermost planet",
    color: 0x9c9a94,
    orbitSpeed: 0.62,
    size: 0.5,
    framingDistance: 3.5,
    facts: {
      radiusKm: 2440,
      distanceAu: 0.39,
      orbitalPeriodDays: 87.969,
      eccentricity: 0.2056,
      inclinationDeg: 7.0,
      ascendingNodeDeg: 48.3,
      spinSpeed: 0.05
    }
  },
  {
    id: "venus",
    name: "Venus",
    label: "Second planet",
    color: 0xd9cfa8,
    orbitSpeed: 0.243,
    size: 0.9,
    framingDistance: 4,
    facts: {
      radiusKm: 6052,
      distanceAu: 0.72,
      orbitalPeriodDays: 224.701,
      eccentricity: 0.0068,
      inclinationDeg: 3.39,
      ascendingNodeDeg: 76.7,
      spinSpeed: -0.05
    }
  },
  {
    id: "earth",
    name: "Earth",
    label: "Third planet",
    color: 0x4a7bff,
    orbitSpeed: 0.15,
    size: 0.95,
    framingDistance: 5,
    facts: {
      radiusKm: 6371,
      distanceAu: 1.0,
      orbitalPeriodDays: 365.256,
      eccentricity: 0.0167,
      inclinationDeg: 0.0,
      ascendingNodeDeg: 0,
      spinSpeed: 1.0
    }
  },
  {
    id: "mars",
    name: "Mars",
    label: "Fourth planet",
    color: 0xd6543a,
    orbitSpeed: 0.0797,
    size: 0.6,
    framingDistance: 4,
    facts: {
      radiusKm: 3390,
      distanceAu: 1.52,
      orbitalPeriodDays: 686.98,
      eccentricity: 0.0934,
      inclinationDeg: 1.85,
      ascendingNodeDeg: 49.6,
      spinSpeed: 0.97
    }
  },
  {
    id: "jupiter",
    name: "Jupiter",
    label: "Largest planet",
    color: 0xd8a878,
    orbitSpeed: 0.0126,
    size: 2.0,
    framingDistance: 7,
    facts: {
      radiusKm: 69911,
      distanceAu: 5.2,
      orbitalPeriodDays: 4332.589,
      eccentricity: 0.0484,
      inclinationDeg: 1.31,
      ascendingNodeDeg: 100.6,
      spinSpeed: 2.4
    }
  },
  {
    id: "saturn",
    name: "Saturn",
    label: "Ringed planet",
    color: 0xd9c27a,
    orbitSpeed: 0.00509,
    size: 1.7,
    framingDistance: 6,
    facts: {
      radiusKm: 58232,
      distanceAu: 9.5,
      orbitalPeriodDays: 10759.22,
      eccentricity: 0.0541,
      inclinationDeg: 2.49,
      ascendingNodeDeg: 113.7,
      spinSpeed: 2.2
    }
  },
  {
    id: "uranus",
    name: "Uranus",
    label: "Ice giant",
    color: 0x9fe3e8,
    orbitSpeed: 0.00178,
    size: 1.2,
    framingDistance: 5,
    facts: {
      radiusKm: 25362,
      distanceAu: 19.2,
      orbitalPeriodDays: 30688.5,
      eccentricity: 0.0472,
      inclinationDeg: 0.77,
      ascendingNodeDeg: 74.2,
      spinSpeed: -1.4
    }
  },
  {
    id: "neptune",
    name: "Neptune",
    label: "Farthest planet",
    color: 0x3b5fd1,
    orbitSpeed: 0.00091,
    size: 1.15,
    framingDistance: 5,
    facts: {
      radiusKm: 24622,
      distanceAu: 30.0,
      orbitalPeriodDays: 60182,
      eccentricity: 0.0086,
      inclinationDeg: 1.77,
      ascendingNodeDeg: 131.7,
      spinSpeed: 1.5
    }
  }
];

/**
 * The Moon is a satellite of Earth, NOT a body orbiting the Sun, so it is
 * deliberately kept out of `BODIES` — every loop over BODIES (layout radii,
 * per-frame Sun-orbit, orbit lines, texture streaming) assumes a Sun-centred
 * orbit and would misplace it. Its scene geometry (orbit radius/speed/size) is
 * owned by scene-builder (MOON_ORBIT_RADIUS etc.); this config exists so the
 * Moon is a first-class focus target: pickable, framable, and fact-carded like
 * any planet. `distanceAu` is the Moon's distance from the Sun (≈ Earth's).
 */
export const MOON: BodyConfig = {
  id: "moon",
  name: "Moon",
  label: "Earth's satellite",
  color: 0xc8c8cc,
  // Scene motion is driven by scene-builder's MOON_ORBIT_* constants, not this.
  orbitSpeed: 0,
  size: 0.2565, // earth.size (0.95) * MOON_SIZE (0.27); matches the built mesh.
  framingDistance: 1.3,
  facts: {
    radiusKm: 1737,
    distanceAu: 1.0,
    orbitalPeriodDays: 27.322,
    eccentricity: 0.0549,
    inclinationDeg: 5.14,
    ascendingNodeDeg: 125.08,
    spinSpeed: 0.05
  }
};

const BODY_BY_ID: ReadonlyMap<BodyId, BodyConfig> = new Map<BodyId, BodyConfig>([
  ...BODIES.map((b) => [b.id, b] as const),
  ["moon", MOON]
]);

export function getBody(id: BodyId): BodyConfig {
  const found = BODY_BY_ID.get(id);
  if (!found) throw new Error(`Unknown body id: ${id}`);
  return found;
}

/** Runtime type guard: validates that an arbitrary string is a known BodyId. */
export function isBodyId(id: string): id is BodyId {
  return BODY_BY_ID.has(id as BodyId);
}
