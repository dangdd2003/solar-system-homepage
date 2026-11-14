/**
 * Shared building blocks for the reveal effect builders.
 *
 * Every effect file (the legacy builders in ./effects.ts and the pool files in
 * ./pools/*.ts) imports from here: the effect context and its types, tween and
 * spring helpers, CSS value formatting, part queries, the seeded hash used by
 * randomized staggers, and the attribute helpers that set masks, halos and
 * strokes synchronously while a host is still hidden.
 */

import { createTimeline } from "animejs/timeline";
import { spring } from "animejs/easings";
import { stagger } from "animejs/utils";
import { clearTextClip } from "./text-clip";
import { clearPrimedGlass } from "./pools/glass";
import type {
  EasingParam,
  Spring,
  StaggerFunction,
  Timeline,
  TweenKeyValue,
  TweenParamValue
} from "animejs";

export { stagger } from "animejs/utils";

/** How a cascade orders the parts of one entry (see randomizer.ts planCascade). */
export type StaggerPattern = "first" | "last" | "center" | "random" | "grid-center" | "grid-corner";

/** A 2D direction; components are unit-ish, clamped to [-1, 1]. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Device tier, resolved from the breakpoint table in tiers.ts (declared here so tiers and choreography need no cycle). */
export type Tier = "compact-phone" | "landscape-phone" | "touch-tablet" | "desktop";

/** Panel-wide choreography motif (see choreography.ts). */
export type Motif =
  "arrival" | "orbit" | "eclipse" | "flare" | "signal" | "drift" | "constellation" | "coda";

/** Where a frame's cascade starts. */
export type Origin = "first" | "last" | "center" | "edge";

/** Pace of a frame: calm uses the 60 ms step, lively the 40 ms step. */
export type Tempo = "calm" | "lively";

/** The frame rolled for one panel entry; every typed element in the entry shares it. */
export interface Frame {
  readonly motif: Motif;
  readonly origin: Origin;
  readonly tempo: Tempo;
}

export interface EffectContext {
  /** ms: stagger slot + data-reveal-delay. */
  readonly delay: number;
  /** Phone tiers only (`compact-phone` and `landscape-phone`, see tiers.ts): `(max-width: 480px)` or a short landscape phone. */
  readonly compact: boolean;
  /** Device tier for this activation. Optional, so callers that predate tiers still compile. */
  readonly tier?: Tier | undefined;
  /** Low-effects profile (compact, save-data, reduced transparency, forced colours or zoom): blur, drop-shadow and glow filters are dropped; brightness-only flashes stay. Optional. */
  readonly lowFx?: boolean | undefined;
  /** The panel entry's rolled frame. Optional, so typed callers outside the engine still compile. */
  readonly frame?: Frame | undefined;
  /** "r, g, b" of the panel's planet accent (hero = white). */
  readonly accentRgb: string;
  /** Horizontal position against the panel centre. */
  readonly side: -1 | 0 | 1;
  /** Typed elements only: the cascade order for this entry's type. */
  readonly pattern?: StaggerPattern | undefined;
  /** Typed elements only: seed for hash01 and seeded staggers. */
  readonly seed?: number | undefined;
  /** Typed elements only: position in the pattern order. */
  readonly index?: number | undefined;
  /** Typed elements only: number of members sharing the pattern. */
  readonly count?: number | undefined;
  /** Typed elements only: unit-ish vector from the pattern origin. */
  readonly vec?: Vec | undefined;
}

export type EffectBuilder = (el: HTMLElement, ctx: EffectContext) => Timeline;

/**
 * The context with every optional typed-element field filled in with its default.
 * `tier`, `lowFx` and `frame` are left out: `full()` does not fill them, so they stay optional.
 */
export type FullContext = {
  readonly [K in Exclude<keyof EffectContext, "tier" | "lowFx" | "frame">]-?: NonNullable<
    EffectContext[K]
  >;
};

/** Fills the typed-element defaults: pattern "first", seed 0, index 0, count 1, vec {0,0}. */
export function full(ctx: EffectContext): FullContext {
  return {
    delay: ctx.delay,
    compact: ctx.compact,
    accentRgb: ctx.accentRgb,
    side: ctx.side,
    pattern: ctx.pattern ?? "first",
    seed: ctx.seed ?? 0,
    index: ctx.index ?? 0,
    count: ctx.count ?? 1,
    vec: ctx.vec ?? { x: 0, y: 0 }
  };
}

/** Base travel distance in 16px-root units (see px). */
export const D = (c: EffectContext): number => (c.compact ? 18 : 28);

/** Soft settle for cards; settles in ~800ms. */
export const SPRING_SOFT: Spring = spring({ bounce: 0.2, duration: 420 });
/** Star-like pop for chips and icons; settles in ~820ms. */
export const SPRING_POP: Spring = spring({ bounce: 0.4, duration: 300 });
/** Lift with a hair of overshoot for buttons; settles in ~740ms. */
export const SPRING_GRAVITY: Spring = spring({ bounce: 0.3, duration: 300 });

export type Value = number | string;

/** One tween with explicit from/to. */
export function tw(
  from: TweenParamValue,
  to: TweenParamValue,
  duration: number,
  ease: EasingParam
): TweenKeyValue {
  return { from, to, duration, ease };
}

/** One spring tween; the spring's settling time replaces the duration. */
export function sp(from: TweenParamValue, to: TweenParamValue, ease: Spring): TweenKeyValue {
  return { from, to, ease };
}

/** Keyframes: each step starts where the previous one ended. */
export function seq(
  from: Value,
  steps: ReadonlyArray<readonly [to: Value, duration: number, ease: EasingParam]>
): TweenKeyValue[] {
  return steps.map(([to, duration, ease], i) =>
    i === 0 ? { from, to, duration, ease } : { to, duration, ease }
  );
}

/**
 * Travel length as rem, so reveal distances follow the root font size (global.css
 * scales it up on 2560x1440 and 4K). Input is in 16px-root units, rounded to hundredths.
 */
export function px(n: number): string {
  return `${Math.round((n / 16) * 1000) / 1000}rem`;
}

/** `drop-shadow` in the given "r, g, b" colour. */
export function glow(rgb: string, blur: number, alpha: number): string {
  return `drop-shadow(0px 0px ${blur}px rgba(${rgb}, ${alpha}))`;
}

/** `drop-shadow` with an offset, in the given "r, g, b" colour. */
export function shadow(rgb: string, x: number, y: number, blur: number, alpha: number): string {
  return `drop-shadow(${x}px ${y}px ${blur}px rgba(${rgb}, ${alpha}))`;
}

/** Cascade step that fits `n` items inside `spread`, never above `max`. */
export function fitStep(n: number, max: number, spread: number): number {
  return n > 1 ? Math.min(max, spread / (n - 1)) : 0;
}

/** The effect's timeline, built paused; the engine plays it on the frame-capped clock (clock.ts). */
export function timeline(ctx: EffectContext): Timeline {
  return createTimeline({ delay: ctx.delay, autoplay: false });
}

/**
 * Whether a node sits inside anime's visually hidden accessible copy of a split
 * host. That copy repeats the host's markup (decorative parts included), so the
 * real parts are the ones outside it.
 */
function inSplitCopy(node: Element, root: Element): boolean {
  for (let n = node.parentElement; n && n !== root; n = n.parentElement) {
    if (n.style.clipPath === "inset(50%)") return true;
  }
  return false;
}

/** First descendant with `data-reveal-part="name"`, ignoring split accessibility copies. */
export function part(el: Element, name: string): HTMLElement | null {
  return parts(el, name)[0] ?? null;
}

/** Every descendant with `data-reveal-part="name"`, ignoring split accessibility copies. */
export function parts(el: Element, name: string): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(`[data-reveal-part="${name}"]`)).filter(
    (node) => !inSplitCopy(node, el)
  );
}

/** Rects the engine read before its write loop, so builders do not force a layout per host. */
const primedRects = new Map<Element, DOMRect>();

/** Reads and remembers an element's rect for the current cascade (call from the engine's read phase). */
export function primeRect(el: Element): void {
  primedRects.set(el, el.getBoundingClientRect());
}

/** A primed rect when the engine read one this cascade, otherwise a live read. */
export function rectOf(el: Element): DOMRect {
  return primedRects.get(el) ?? el.getBoundingClientRect();
}

/** Layout sizes (offsetWidth/offsetHeight, untransformed) read in the same phase. */
const primedSizes = new Map<Element, { w: number; h: number }>();

/** Reads and remembers an element's layout size for the current cascade (engine read phase). */
export function primeSize(el: HTMLElement): void {
  primedSizes.set(el, { w: el.offsetWidth, h: el.offsetHeight });
}

/** A primed layout size when the engine read one this cascade, otherwise a live read. */
export function sizeOf(el: HTMLElement): { w: number; h: number } {
  return primedSizes.get(el) ?? { w: el.offsetWidth, h: el.offsetHeight };
}

/** Drops the primed rects, sizes, colors, and glass flags once the cascade's writes are done. */
export function clearPrimedRects(): void {
  primedRects.clear();
  primedSizes.clear();
  primedColors.clear();
  clearPrimedGlass();
}

/** The cascade items inside a host: its `data-reveal-items` selector, or every `li` when the attribute is missing or empty. */
export function itemsOf(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(el.dataset.revealItems || "li"));
}

/** Whether a host is taller than it is wide, so its long axis runs vertically. */
export function isVertical(el: HTMLElement): boolean {
  const s = sizeOf(el);
  return s.h > s.w;
}

/**
 * Deterministic pseudo-random number in [0, 1) for (seed, i).
 * Used wherever an effect needs per-piece scatter that must repeat.
 */
export function hash01(seed: number, i: number): number {
  let t = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Stagger over a set of parts. `from` defaults to the rolled pattern; grid
 * patterns fall back to their centre, and "random" is seeded by the roll.
 */
export function partStagger(
  ctx: EffectContext,
  step: number,
  start: number,
  from?: StaggerPattern
): StaggerFunction<number> {
  const c = full(ctx);
  const pattern = from ?? c.pattern;
  if (pattern === "random") return stagger(step, { start, from: "random", seed: c.seed });
  if (pattern === "grid-center" || pattern === "grid-corner") {
    return stagger(step, { start, from: "center" });
  }
  return stagger(step, { start, from: pattern });
}

/** Direct element children that hold content (not reveal parts, not hidden from AT), first `max`. */
export function contentParts(el: HTMLElement, max: number): HTMLElement[] {
  return Array.from(el.children)
    .filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.hasAttribute("data-reveal") &&
        !child.hasAttribute("data-reveal-part") &&
        child.getAttribute("aria-hidden") !== "true"
    )
    .slice(0, max);
}

/** Text colors read in the cascade read phase. */
const primedColors = new Map<Element, string>();

/** Reads and remembers an element's text color for the current cascade (engine read phase). */
export function primeColor(el: Element, style: CSSStyleDeclaration = getComputedStyle(el)): void {
  primedColors.set(el, style.color || "rgb(255, 255, 255)");
}

/** The element's text colour, with white as the fallback. */
export function readColor(el: Element): string {
  return primedColors.get(el) ?? (getComputedStyle(el).color || "rgb(255, 255, 255)");
}

/** Shared host fade with a vertical settle; the legacy fade-up body. */
function fadeY(
  el: HTMLElement,
  ctx: EffectContext,
  fromY: number,
  oDur: number,
  yDur: number
): Timeline {
  return timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, oDur, "outQuad"),
      "--rv-y": tw(px(fromY), "0rem", yDur, "outExpo")
    },
    0
  );
}

/** Fallback for any effect that cannot reach its parts: the legacy fade-up. */
export function hostReveal(el: HTMLElement, ctx: EffectContext): Timeline {
  return fadeY(el, ctx, D(ctx), 420, 720);
}

/** Fallback: the legacy fade (starfade). */
export function hostFade(el: HTMLElement, ctx: EffectContext): Timeline {
  return fadeY(el, ctx, 8, 520, 620);
}

export type NumStyle = "spin" | "pop" | "drop" | "flash";

/** Animates the `num` part of a heading (section number) in one of four styles. */
export function animateNum(
  tl: Timeline,
  el: HTMLElement,
  _ctx: EffectContext,
  style: NumStyle
): void {
  const num = part(el, "num");
  if (!num) return;
  switch (style) {
    case "spin":
      tl.add(
        num,
        {
          opacity: tw(0, 1, 200, "outQuad"),
          scale: sp(0.4, 1, SPRING_POP),
          rotate: tw(-45, 0, 600, "outExpo")
        },
        0
      );
      return;
    case "pop":
      tl.add(
        num,
        {
          opacity: tw(0, 1, 160, "outQuad"),
          scale: tw(0.3, 1, 520, "outBack(1.8)")
        },
        0
      );
      return;
    case "drop":
      tl.add(
        num,
        {
          opacity: tw(0, 1, 220, "outQuad"),
          y: tw("-0.6em", "0em", 560, "outExpo")
        },
        0
      );
      return;
    case "flash":
      tl.add(
        num,
        {
          opacity: seq(0, [
            [1, 90, "linear"],
            [0.3, 90, "linear"],
            [1, 140, "outQuad"]
          ]),
          filter: tw("brightness(2.5)", "brightness(1)", 500, "outQuad")
        },
        0
      );
      return;
  }
}

export type MaskShape =
  "sweep-right" | "sweep-left" | "sweep-up" | "sweep-down" | "sweep-diag" | "iris" | "moon";

/** Mask-position travel for each sweep shape (the soft edge moves across the host). */
export const MASK_PATHS: Readonly<
  Record<
    "sweep-right" | "sweep-left" | "sweep-up" | "sweep-down" | "sweep-diag",
    { from: string; to: string }
  >
> = Object.freeze({
  "sweep-right": { from: "100% 0%", to: "0% 0%" },
  "sweep-left": { from: "0% 0%", to: "100% 0%" },
  "sweep-up": { from: "0% 0%", to: "0% 100%" },
  "sweep-down": { from: "0% 100%", to: "0% 0%" },
  "sweep-diag": { from: "100% 100%", to: "0% 0%" }
});

export type HaloShape = "ring" | "disc" | "orbit";

/** Attribute names the kit writes; reveal.css styles them, the engine removes them. */
export const FX_ATTR = "data-reveal-fx";
export const MASK_ATTR = "data-reveal-mask";
export const HALO_ATTR = "data-reveal-halo";
export const STROKE_ATTR = "data-reveal-stroke";

/** Selects a CSS mask shape on the element (set synchronously, before the roll is visible). */
export function useMask(el: Element, shape: MaskShape): void {
  el.setAttribute(MASK_ATTR, shape);
}

/** Selects a halo shape on an HTML host. SVG hosts have no `::after` halo, so they get false. */
export function useHalo(el: Element, shape: HaloShape): boolean {
  if (!(el instanceof HTMLElement)) return false;
  el.setAttribute(HALO_ATTR, shape);
  return true;
}

/** Marks an SVG host whose strokes trace themselves (needs `pathLength="1"`). */
export function useStroke(el: Element): boolean {
  const selector = '[pathLength="1"]';
  if (!el.matches(selector) && !el.querySelector(selector)) return false;
  el.setAttribute(STROKE_ATTR, "");
  return true;
}

/** Removes the kit's attributes from an element; `includeFx` also drops the rolled effect name. */
export function clearFxAttrs(el: Element, includeFx: boolean): void {
  clearTextClip(el);
  el.removeAttribute(MASK_ATTR);
  el.removeAttribute(HALO_ATTR);
  el.removeAttribute(STROKE_ATTR);
  if (includeFx) el.removeAttribute(FX_ATTR);
}
