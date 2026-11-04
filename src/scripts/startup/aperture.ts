/**
 * Geometry and timing for the single-owner startup aperture.
 *
 * The opening is deliberately represented by one full-screen radial field. There
 * is no second ring, canvas, veil, or shockwave competing for the first circle;
 * Anime.js only changes the field's CSS variables. The keyframes that drive those
 * variables live in `StartupController.addAperture`, the only place that defines
 * the curve the page shows.
 *
 * The opening plays in four acts, and the ring makes exactly two motions:
 *   1. Seed: the dissolving welcome text condenses into one point of sunlight.
 *   2. Open: the point opens, in one smooth move, into a ring the size of the Sun.
 *   3. Shrink: the ring closes back to the centre and is gone, with no pause.
 *   4. Blast: the ring re-emerges from the centre and accelerates outward to clear the
 *      viewport, while the sunlight at the centre holds still and only fades as it exits.
 */

export const CLEAR_MARGIN_PX = 80;

export interface ApertureTiming {
  /** Time for the converging text to condense into a single point of sunlight. */
  readonly seedMs: number;
  /** Time for that point to open, in one move, into the Sun-sized ring. */
  readonly ignitionMs: number;
  /** Time for the ring to shrink back to the centre and vanish before the blast. */
  readonly collapseMs: number;
  /** Time for the blast to clear the viewport corners. */
  readonly surgeMs: number;
}

/** Pacing of the opening: a short seed, a ~1s open and shrink of the Sun ring, then the blast. */
export const DEFAULT_APERTURE_TIMING: ApertureTiming = {
  seedMs: 400,
  ignitionMs: 620,
  collapseMs: 380,
  surgeMs: 2000
};

/**
 * Glare beam length, as a fraction of the glare's full span (1.5 x the viewport's longer side).
 * The ring carries a thick cross of light, held steady through the blast.
 */
export const GLARE_RING_LENGTH = 0.42;
/** Beam thickness multiplier, where 1 is the glare's base thickness. */
export const GLARE_RING_THICK = 1.6;

/**
 * The blast's starting speed as a fraction of its average speed. The ring starts moving at once
 * and accelerates steadily, reaching (2 - BLAST_LAUNCH_VELOCITY) x the average at the corners.
 */
export const BLAST_LAUNCH_VELOCITY = 0.35;

/** Constant-acceleration ease for the blast: never starts from rest, never decelerates. */
export function acceleratingEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const v = BLAST_LAUNCH_VELOCITY;
  return v * x + (1 - v) * x * x;
}

export interface ApertureGeometry {
  readonly sunRadiusPx: number;
  readonly maxRadiusPx: number;
}

export interface AperturePhaseMetrics {
  /** Radius the first ring opens to: the Sun's own disc. */
  readonly sunRingPx: number;
  /** Full viewport-clearing radius. */
  readonly releaseRadiusPx: number;
  /** Spread of the central sunlight at the seed (held through the blast) and the open ring. */
  readonly seedBloomPx: number;
  readonly ringBloomPx: number;
  /** Corona widths for each phase. */
  readonly ringCoronaPx: number;
  readonly surgeCoronaPx: number;
  readonly releaseCoronaPx: number;
  /** Feather widths for each phase. */
  readonly initialFeatherPx: number;
  readonly ringFeatherPx: number;
  readonly surgeFeatherPx: number;
  /** Glare beam length on the steady ring, held through the blast. */
  readonly glareRingLength: number;
}

/** Time the aperture spends as the Sun-sized ring (open, then shrink) before the blast. */
export function firstRingMs(timing: ApertureTiming): number {
  return timing.ignitionMs + timing.collapseMs;
}

export function totalApertureMs(timing: ApertureTiming): number {
  return timing.seedMs + firstRingMs(timing) + timing.surgeMs;
}

/** Radius needed for a circle centred in the viewport to clear all four corners. */
export function maxRadiusFor(width: number, height: number): number {
  return Math.ceil(Math.hypot(Math.max(0, width) / 2, Math.max(0, height) / 2)) + CLEAR_MARGIN_PX;
}

/** The corona is widest during coronal surge and scales smoothly with radius. */
export function coronaWidthFor(radius: number, sunRadius: number): number {
  const r = Math.max(0, radius);
  const s = Math.max(1, sunRadius);
  return Math.max(18, Math.min(148, s * 0.48 + r * 0.095));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Computes the physical radii, corona widths, feathering and glare sizes of each phase. */
export function computeApertureMetrics(geometry: ApertureGeometry): AperturePhaseMetrics {
  const sun = Math.max(1, geometry.sunRadiusPx);
  const max = Math.max(sun + 100, geometry.maxRadiusPx);

  const sunRingPx = round2(sun);
  const releaseRadiusPx = round2(max);

  const ringCoronaPx = round2(coronaWidthFor(sun, sun) * 1.15);
  const surgeCoronaPx = round2(coronaWidthFor(max * 0.45, sun) * 1.25);
  const releaseCoronaPx = round2(coronaWidthFor(max, sun) * 0.72);

  return {
    sunRingPx,
    releaseRadiusPx,
    seedBloomPx: round2(sun * 0.66),
    ringBloomPx: round2(sun * 1.4),
    ringCoronaPx,
    surgeCoronaPx,
    releaseCoronaPx,
    initialFeatherPx: 14,
    ringFeatherPx: 42,
    surgeFeatherPx: 96,
    glareRingLength: GLARE_RING_LENGTH
  };
}
