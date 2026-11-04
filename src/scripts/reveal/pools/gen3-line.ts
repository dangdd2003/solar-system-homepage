/**
 * Gen3 Line pool effects.
 *
 * Effects:
 * - line-fork-split: the rule grows outward from its centre with a brightness flare.
 * - line-stepped-measure: the rule lengthens in measured steps, like a ruler being read.
 * - line-spring-overshoot: the rule lands on a spring that overshoots and settles.
 * - line-thin-thick-settle: a heavy rule thins to its resting weight while it grows.
 * - line-dock-slide: the rule slides along its own axis, then docks into its cell.
 * - line-ripple-wave: the rule ripples once across its thickness before flattening.
 *
 * Bars grow along their long axis (--rv-sx horizontal, --rv-sy vertical) and are
 * thickened on the other. SVG strokes (pathLength="1") draw through --rv-draw.
 * Every builder works with the host alone: no children are required.
 */

import type { EasingParam, Timeline, TweenKeyValue, TweenParamValue } from "animejs";
import {
  D,
  SPRING_POP,
  SPRING_SOFT,
  glow,
  isVertical,
  px,
  seq,
  sp,
  timeline,
  tw,
  useStroke,
  type EffectBuilder,
  type EffectContext
} from "../kit";

/** Which host scale and translate carry the rule's growth, thickness and travel. */
type Axes = {
  /** Scale along the rule's length. */
  readonly length: "--rv-sx" | "--rv-sy";
  /** Scale across the rule. */
  readonly thick: "--rv-sx" | "--rv-sy";
  /** Translate along the rule's length. */
  readonly shift: "--rv-x" | "--rv-y";
  /** Start edge of a bar's growth. */
  readonly origin: string;
};

/** Vertical rules run on --rv-sy from their top edge; horizontal ones on --rv-sx from their left. */
function axes(el: HTMLElement): Axes {
  return isVertical(el)
    ? { length: "--rv-sy", thick: "--rv-sx", shift: "--rv-y", origin: "50% 0%" }
    : { length: "--rv-sx", thick: "--rv-sy", shift: "--rv-x", origin: "0% 50%" };
}

/**
 * Pins every tweened key to its from-value at time zero, then starts the tweens.
 * Each builder's first frame therefore equals its from-values, so a delayed start
 * never shows the resting CSS state (a fully drawn stroke, a full-length rule or an
 * unflared filter) before the tween begins. `statics` holds non-tweened start values.
 */
function enter(
  tl: Timeline,
  el: HTMLElement,
  props: Record<string, TweenKeyValue | TweenKeyValue[]>,
  statics: Record<string, string | number> = {}
): Timeline {
  const start: Record<string, TweenParamValue> = { ...statics };
  for (const [key, value] of Object.entries(props)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first?.from !== undefined) start[key] = first.from;
  }
  tl.set(el, start, 0);
  return tl.add(el, props, 0);
}

/** Brightness flare, with an accent glow unless the profile is low-effects. Structure is identical from and to. */
function flash(ctx: EffectContext, duration: number): TweenKeyValue {
  if (ctx.lowFx) return tw("brightness(1.8)", "brightness(1)", duration, "outQuad");
  const blur = ctx.compact ? 5 : 8;
  return tw(
    `brightness(1.8) ${glow(ctx.accentRgb, blur, 0.85)}`,
    `brightness(1) ${glow(ctx.accentRgb, 0, 0)}`,
    duration,
    "outQuad"
  );
}

const MEASURE_DESKTOP: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [0.22, 160, "outQuad"],
  [0.22, 140, "linear"],
  [0.68, 200, "outCubic"],
  [0.68, 120, "linear"],
  [1, 220, "outQuart"]
];
const MEASURE_COMPACT: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [0.5, 180, "outQuad"],
  [0.5, 120, "linear"],
  [1, 260, "outQuart"]
];
const DRAW_DESKTOP: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [0.6, 200, "outQuad"],
  [0.6, 120, "linear"],
  [0.25, 180, "outCubic"],
  [0.25, 100, "linear"],
  [0, 220, "inOutQuad"]
];
const DRAW_COMPACT: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [0.5, 180, "outQuad"],
  [0.5, 120, "linear"],
  [0, 260, "inOutQuad"]
];
const CREST_DESKTOP: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [2.4, 180, "outSine"],
  [0.6, 220, "inOutSine"],
  [1.5, 200, "inOutSine"],
  [1, 240, "outSine"]
];
const CREST_COMPACT: ReadonlyArray<readonly [number, number, EasingParam]> = [
  [1.8, 160, "outSine"],
  [0.8, 180, "inOutSine"],
  [1, 200, "outSine"]
];
const WOBBLE_DESKTOP: ReadonlyArray<readonly [string, number, EasingParam]> = [
  ["-0.1875rem", 180, "outSine"],
  ["0.125rem", 200, "inOutSine"],
  ["0rem", 220, "outSine"]
];
const WOBBLE_COMPACT: ReadonlyArray<readonly [string, number, EasingParam]> = [
  ["-0.125rem", 160, "outSine"],
  ["0.0625rem", 180, "inOutSine"],
  ["0rem", 200, "outSine"]
];

const lineForkSplit: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-draw": tw(1, 0, 640, "inOutSine"),
      filter: flash(ctx, 640)
    });
  }
  return enter(
    tl,
    el,
    {
      [ax.length]: tw(0, 1, ctx.compact ? 480 : 640, "outExpo"),
      filter: flash(ctx, 620)
    },
    { "--rv-o": 1, transformOrigin: "50% 50%" }
  );
};

const lineSteppedMeasure: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 160, "outQuad"),
      "--rv-draw": seq(1, ctx.compact ? DRAW_COMPACT : DRAW_DESKTOP)
    });
  }
  return enter(
    tl,
    el,
    { [ax.length]: seq(0, ctx.compact ? MEASURE_COMPACT : MEASURE_DESKTOP) },
    { "--rv-o": 1, transformOrigin: ax.origin }
  );
};

const lineSpringOvershoot: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 160, "outQuad"),
      "--rv-draw": tw(1, 0, 560, "outCubic"),
      "--rv-s": sp(0.6, 1, SPRING_POP)
    });
  }
  return enter(
    tl,
    el,
    { [ax.length]: sp(0, 1, SPRING_SOFT) },
    {
      "--rv-o": 1,
      transformOrigin: ax.origin
    }
  );
};

const lineThinThickSettle: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-draw": tw(1, 0, 560, "inOutSine"),
      filter: flash(ctx, 700)
    });
  }
  const heavy = ctx.compact ? 1.8 : 3;
  return enter(
    tl,
    el,
    {
      [ax.length]: tw(0, 1, 640, "outQuart"),
      [ax.thick]: tw(heavy, 1, 760, "outCubic")
    },
    { "--rv-o": 1, transformOrigin: ax.origin }
  );
};

const lineDockSlide: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const travel = px(-D(ctx));
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 220, "outQuad"),
      [ax.shift]: tw(travel, "0rem", 620, "outExpo"),
      "--rv-draw": tw(1, 0, 560, "outQuart")
    });
  }
  return enter(
    tl,
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      [ax.shift]: tw(travel, "0rem", 620, "outExpo"),
      [ax.length]: tw(0.4, 1, 620, "outExpo")
    },
    { "--rv-o": 0, transformOrigin: "50% 50%" }
  );
};

const lineRippleWave: EffectBuilder = (el, ctx) => {
  const ax = axes(el);
  const tl = timeline(ctx);
  if (useStroke(el)) {
    return enter(tl, el, {
      "--rv-o": tw(0, 1, 160, "outQuad"),
      "--rv-draw": tw(1, 0, 560, "inOutSine"),
      "--rv-y": seq("0rem", ctx.compact ? WOBBLE_COMPACT : WOBBLE_DESKTOP)
    });
  }
  return enter(
    tl,
    el,
    {
      [ax.length]: tw(0, 1, 520, "outCubic"),
      [ax.thick]: seq(1, ctx.compact ? CREST_COMPACT : CREST_DESKTOP)
    },
    { "--rv-o": 1, transformOrigin: ax.origin }
  );
};

export const GEN3_LINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "line-fork-split": lineForkSplit,
  "line-stepped-measure": lineSteppedMeasure,
  "line-spring-overshoot": lineSpringOvershoot,
  "line-thin-thick-settle": lineThinThickSettle,
  "line-dock-slide": lineDockSlide,
  "line-ripple-wave": lineRippleWave
});
