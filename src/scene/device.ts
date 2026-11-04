export interface QualityProfile {
  /** Segment count for planet sphere geometry (width and height). */
  readonly sphereSegments: number;
  /** Number of micro-stars in the starfield. */
  readonly starCount: number;
  /** Number of prominent focal stars in the starfield. */
  readonly focalStarCount: number;
  /** Upper bound applied to window.devicePixelRatio. */
  readonly pixelRatioCap: number;
}

export const qualityProfiles: Readonly<Record<"high" | "medium", QualityProfile>> = {
  high: {
    sphereSegments: 64,
    starCount: 3000,
    focalStarCount: 450,
    pixelRatioCap: 2
  },
  medium: {
    sphereSegments: 32,
    starCount: 1800,
    focalStarCount: 250,
    pixelRatioCap: 1.5
  }
};

/** Threshold below which we treat the viewport as a small/mobile screen. */
const NARROW_WIDTH = 768;

/**
 * Choose a rendering quality profile. Coarse pointers (touch), narrow viewports
 * and low-end devices get the lighter profile; everything else gets the full
 * desktop one. Pure — takes its inputs explicitly so it can be unit-tested.
 */
export function qualityProfileFor(input: {
  coarsePointer: boolean;
  viewportWidth: number;
  lowEnd?: boolean;
}): QualityProfile {
  if (input.coarsePointer || input.viewportWidth < NARROW_WIDTH || input.lowEnd === true) {
    return qualityProfiles.medium;
  }
  return qualityProfiles.high;
}

/** Device hints the browser may expose. Each one is optional and absent on some browsers. */
interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

/** At or below this many GB of memory, or logical cores, the scene is treated as low-end. */
const LOW_END_MEMORY_GB = 4;
const LOW_END_CORES = 4;

/** Low-end when memory or cores are scarce, or the user asked to save data. Missing hints count as capable. */
export function isLowEndHints(hints: DeviceHints): boolean {
  if (hints.connection?.saveData === true) return true;
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= LOW_END_MEMORY_GB) return true;
  if (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= LOW_END_CORES) {
    return true;
  }
  return false;
}

/**
 * Browser-side convenience: read the environment and pick a profile. Called once when
 * the scene is built, because the profile sets geometry and pixel ratio. A pointer
 * that appears or leaves later (a mouse on a tablet) is handled by the live cursor
 * and input code, not by rebuilding the scene.
 */
export function detectQuality(): QualityProfile {
  // A touch screen that also has a fine pointer (mouse, trackpad, stylus) is not
  // coarse-only, so it keeps the full profile instead of the phone profile.
  const coarsePointer =
    window.matchMedia("(pointer: coarse)").matches &&
    !window.matchMedia("(any-pointer: fine)").matches;
  const hints: DeviceHints = typeof navigator === "undefined" ? {} : navigator;
  return qualityProfileFor({
    coarsePointer,
    viewportWidth: window.innerWidth,
    lowEnd: isLowEndHints(hints)
  });
}
