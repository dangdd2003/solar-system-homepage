/**
 * Welcome-text helpers for the startup overlay.
 *
 * The dissolve turns the welcome text into the seed of the Sun. The eyebrow and subtitle
 * are split into letters that kindle into embers: each lifts away from the centre with a
 * slight 3D tilt, warms from white through gold to amber, then streams into the centre along
 * a curved path, stretched along its travel, and burns out, edges first. The title
 * stays whole (splitting it would break the background-clip gradient text): a sunlight
 * sweep crosses it, it swells, condenses into a horizontal line of light and collapses into
 * the point where the aperture's seed takes over. Pure helpers are exported for tests.
 */

import { splitText } from "animejs/text";

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Keyframe values for one element; index 0 is its live state, later entries are the targets. */
export interface DissolveFrames {
  transform: string[];
  opacity: number[];
  filter: string[];
}

export interface EmberFrames extends DissolveFrames {
  color: string[];
}

export interface TitleCollapseFrames extends DissolveFrames {
  /** The title's sunlight sweep: its shine layer slides across the gradient text. */
  backgroundPosition: [string, string];
}

/** Visual state of a line at the moment it starts to dissolve (sampled from its live style). */
export interface LineState {
  transform: string;
  opacity: number;
  filter: string;
  /** Computed text colour; absent when it could not be sampled. */
  color?: string;
}

/** An ember's scale as it burns out at the centre. */
export const EMBER_END_SCALE = 0.1;
/** The title's light line: nearly full width, a sliver of its height. */
export const TITLE_LINE_SCALE: readonly [x: number, y: number] = [0.82, 0.04];
/** The title's scale as the light line collapses into the seed point. */
export const TITLE_POINT_SCALE = 0.02;

/** Ember colours: white-hot on lift, gold in flight, amber as it burns out in the centre. */
const EMBER_COLORS = [
  "rgba(255, 252, 240, 1)",
  "rgba(255, 206, 110, 1)",
  "rgba(255, 150, 50, 1)"
] as const;
const EMBER_REST_COLOR = "rgba(248, 250, 252, 0.76)";

const REST_TRANSFORM = "translate3d(0px, 0px, 0) scale(1)";

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Wraps each letter in a `.startup-char` span, returning the letters (empty if splitting fails). */
export function splitLetters(el: HTMLElement): HTMLElement[] {
  try {
    const splitter = splitText(el, {
      words: { class: "startup-word" },
      chars: { class: "startup-char" },
      accessible: false
    });
    return splitter.chars.filter((n): n is HTMLElement => n instanceof HTMLElement);
  } catch {
    return [];
  }
}

/**
 * Delay in ms for letter `index` of `count`. Edge letters go first (0) and the
 * centre letter goes last (`spreadMs`), so the text is pulled in from the outside.
 */
export function absorbDelay(index: number, count: number, spreadMs: number): number {
  if (count <= 1) return 0;
  const mid = (count - 1) / 2;
  const edge = Math.abs(index - mid) / mid; // 0 at the centre, 1 at the edges
  return Math.round((1 - edge) * spreadMs * 100) / 100;
}

/**
 * Delay in ms for letter entrance from the centre outward (inverse of absorbDelay).
 */
export function entranceDelay(index: number, count: number, spreadMs: number): number {
  if (count <= 1) return 0;
  const mid = (count - 1) / 2;
  const edge = Math.abs(index - mid) / mid;
  return Math.round(edge * spreadMs * 100) / 100;
}

/** Translation that moves an element's centre onto the viewport centre. */
export function centerOffset(rect: Rect, viewport: Size): { dx: number; dy: number } {
  return {
    dx: viewport.width / 2 - (rect.left + rect.width / 2),
    dy: viewport.height / 2 - (rect.top + rect.height / 2)
  };
}

/**
 * Computes an orbital mid-trajectory offset perpendicular to the inward vector
 * so absorbed letters curve into the solar core like matter entering an accretion disc.
 */
export function orbitalSpiralMidOffset(
  dx: number,
  dy: number,
  index: number,
  count: number
): { midX: number; midY: number } {
  const mid = count > 1 ? (count - 1) / 2 : 0;
  const signedSide = index < mid ? -1 : index > mid ? 1 : 0;
  const swirlStrength = 0.24;
  // Perpendicular tangential kick + 44% of the way to center
  const midX = dx * 0.44 - dy * swirlStrength * signedSide;
  const midY = dy * 0.44 + dx * 0.14;
  return {
    midX: Math.round(midX * 100) / 100,
    midY: Math.round(midY * 100) / 100
  };
}

/**
 * One letter frame. Every frame lists the same functions (translate, tilt, rotate, stretch), so
 * Anime.js pairs the numbers one to one. Scale runs after rotate, so the x stretch follows the
 * travel heading.
 */
function letterTransform(
  dx: number,
  dy: number,
  tilt: number,
  heading: number,
  sx: number,
  sy: number
): string {
  return `translate3d(${fmt(dx)}px, ${fmt(dy)}px, 0) rotateX(${fmt(tilt)}deg) rotate(${fmt(heading)}deg) scale(${fmt(sx)}, ${fmt(sy)})`;
}

function transformAtXY(dx: number, dy: number, sx: number, sy: number): string {
  return `translate3d(${fmt(dx)}px, ${fmt(dy)}px, 0) scale(${fmt(sx)}, ${fmt(sy)})`;
}

/**
 * Heading of a letter's path into the centre, in degrees, folded into (-90, 90] so a glyph
 * never travels upside down. The stretch follows this heading.
 */
export function travelHeading(dx: number, dy: number): number {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  return Math.round(deg * 100) / 100;
}

/**
 * Keyframes for one letter kindling into an ember: it lifts away from the centre, tilts back
 * in 3D and swells (anticipation), streams along the curved orbital path stretched along its
 * travel (a motion-blur feel), then falls into the centre and burns out. `from` is the letter's
 * live state, so the dissolve continues the intro without a blink.
 */
export function letterEmberFrames(
  dx: number,
  dy: number,
  index: number,
  count: number,
  from?: LineState
): EmberFrames {
  const live = from ? parseLiveTransform(from.transform) : { x: 0, y: 0, scale: 1 };
  const opacity = from ? from.opacity : 1;
  const filter = from && from.filter && from.filter !== "none" ? from.filter : "blur(0px)";
  const color = from?.color || EMBER_REST_COLOR;
  const { midX, midY } = orbitalSpiralMidOffset(dx, dy, index, count);
  const heading = travelHeading(dx, dy);
  return {
    transform: [
      letterTransform(live.x, live.y, 0, 0, live.scale, live.scale),
      letterTransform(-dx * 0.05, -dy * 0.05 - 6, -28, 0, 1.16, 1.16),
      letterTransform(midX, midY, -40, heading * 0.5, 1.9, 0.55),
      letterTransform(dx, dy, -60, heading, 2.6, EMBER_END_SCALE)
    ],
    opacity: [opacity, opacity, opacity * 0.92, 0],
    filter: [filter, "blur(0px)", "blur(1.4px)", "blur(4px)"],
    color: [color, ...EMBER_COLORS]
  };
}

/** The title's resting glow. The intro ends on exactly this string, so the dissolve starts from it. */
export const TITLE_GLOW_REST = "blur(0px) drop-shadow(0px 0px 18px rgba(254, 215, 102, 0.5))";

const MATRIX_2D_RE = /^matrix\(([^)]*)\)$/;
const MATRIX_3D_RE = /^matrix3d\(([^)]*)\)$/;

/**
 * Rewrites a computed transform as `translate3d(...) scale(...)`, the function list the
 * absorb keyframes use. Computed styles report a live transform as `matrix(...)`, and
 * Anime.js pairs numbers positionally, so both endpoints must share one function list.
 * Unrecognised or identity values map to the rest transform.
 */
export function normaliseTransform(transform: string): string {
  const value = transform.trim();
  const m2 = MATRIX_2D_RE.exec(value);
  if (m2?.[1]) {
    const v = m2[1].split(",").map((n) => parseFloat(n));
    if (v.length === 6 && v.every(Number.isFinite)) {
      const [a = 1, b = 0, , , e = 0, f = 0] = v;
      return `translate3d(${fmt(e)}px, ${fmt(f)}px, 0) scale(${fmt(Math.hypot(a, b))})`;
    }
  }
  const m3 = MATRIX_3D_RE.exec(value);
  if (m3?.[1]) {
    const v = m3[1].split(",").map((n) => parseFloat(n));
    if (v.length === 16 && v.every(Number.isFinite)) {
      const [a = 1, b = 0, , , , , , , , , , , tx = 0, ty = 0, tz = 0] = v;
      return `translate3d(${fmt(tx)}px, ${fmt(ty)}px, ${fmt(tz)}px) scale(${fmt(Math.hypot(a, b))})`;
    }
  }
  return REST_TRANSFORM;
}

/** Translation and uniform scale of a live transform, as the normalised `translate3d() scale()` form. */
export interface LiveTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** Reads a live transform's translation and uniform scale (the rest transform when unrecognised). */
export function parseLiveTransform(transform: string): LiveTransform {
  const match = /translate3d\(([^,]+)px, ([^,]+)px, [^)]*\) scale\(([^,)]+)\)/.exec(
    normaliseTransform(transform)
  );
  const x = Number(match?.[1] ?? 0);
  const y = Number(match?.[2] ?? 0);
  const scale = Number(match?.[3] ?? 1);
  return { x, y, scale: Number.isFinite(scale) ? scale : 1 };
}

/**
 * Keyframes for the whole title: swell under the sunlight sweep, condense into a horizontal
 * line of light, then collapse into the seed point at the centre. Every transform uses the
 * same `translate3d() scale(x, y)` list so Anime.js pairs the numbers one to one.
 */
export function titleCollapseFrames(
  dx: number,
  dy: number,
  from: LineState = { transform: REST_TRANSFORM, opacity: 1, filter: TITLE_GLOW_REST }
): TitleCollapseFrames {
  const start = normaliseTransform(from.transform).replace(
    /scale\(([^),]+)\)$/,
    (_, s: string) => `scale(${s}, ${s})`
  );
  const [lineX, lineY] = TITLE_LINE_SCALE;
  // The filter starts from the authored glow, not the sampled one: browsers serialise a computed
  // drop-shadow with its colour first, which would pair numbers against the wrong parameters.
  return {
    transform: [
      start,
      transformAtXY(dx * 0.04, dy * 0.04, 1.05, 1.05),
      transformAtXY(dx, dy, lineX, lineY),
      transformAtXY(dx, dy, TITLE_POINT_SCALE, TITLE_POINT_SCALE)
    ],
    opacity: [from.opacity, from.opacity, from.opacity, 0],
    filter: [
      TITLE_GLOW_REST,
      "blur(0px) drop-shadow(0px 0px 34px rgba(255, 228, 150, 0.95))",
      "blur(0.6px) drop-shadow(0px 0px 26px rgba(255, 244, 214, 1))",
      "blur(4px) drop-shadow(0px 0px 16px rgba(255, 250, 235, 1))"
    ],
    backgroundPosition: ["120% 0%, 0% 0%", "-40% 0%, 0% 0%"]
  };
}
