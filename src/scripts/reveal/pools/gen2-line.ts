/**
 * Gen2 Line pool effects (council design).
 *
 * Effects:
 * - signal-line-draw: unadorned directional divider trace.
 * - drawn-rule: SVG stroke draw or bar fallback.
 * - ink-wipe-line: crisp mask wipe along divider axis.
 * - pulse-trace-line: growing rule with a single opacity blink on landing.
 *
 * Bars grow along their long axis: horizontal rules scale on --rv-sx, vertical
 * rules (such as the More accent) on --rv-sy from their top edge.
 */

import {
  MASK_PATHS,
  full,
  isVertical,
  seq,
  timeline,
  tw,
  useMask,
  type EffectBuilder
} from "../kit";
import { drawableStrokes } from "../svg-draw";

/** The bar's growth axis: vertical bars grow down from the top edge, horizontal ones use `horizontalOrigin`. */
function growAxis(el: HTMLElement, horizontalOrigin: string) {
  const vertical = isVertical(el);
  return {
    vertical,
    scale: vertical ? "--rv-sy" : "--rv-sx",
    origin: vertical ? "50% 0%" : horizontalOrigin
  } as const;
}

const signalLineDraw: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const axis = growAxis(el, c.side < 0 ? "100% 50%" : "0% 50%");

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1, [axis.scale]: 0, transformOrigin: axis.origin }, 0);
  tl.add(el, { [axis.scale]: tw(0, 1, 620, "outExpo") }, 0);
  return tl;
};

const drawnRule: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const strokes = drawableStrokes(el);

  if (strokes.length === 0) {
    const axis = growAxis(el, "0% 50%");
    const tl = timeline(ctx);
    tl.set(el, { "--rv-o": 1, [axis.scale]: 0, transformOrigin: axis.origin }, 0);
    tl.add(el, { [axis.scale]: tw(0, 1, compact ? 480 : 640, "outQuart") }, 0);
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.add(
    strokes,
    {
      draw: tw("0 0", "0 1", compact ? 480 : 640, "inOutQuad")
    },
    0
  );

  return tl;
};

const inkWipeLine: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  if (compact) return signalLineDraw(el, ctx);

  const axis = growAxis(el, "0% 50%");
  const shape = axis.vertical ? "sweep-down" : "sweep-right";
  const { from, to } = MASK_PATHS[shape];
  useMask(el, shape);
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.add(
    el,
    {
      maskPosition: tw(from, to, 640, "outQuad")
    },
    0
  );

  return tl;
};

const pulseTraceLine: EffectBuilder = (el, ctx) => {
  const axis = growAxis(el, "0% 50%");
  const tl = timeline(ctx);

  if (ctx.compact) {
    tl.set(el, { "--rv-o": 1, [axis.scale]: 0, transformOrigin: axis.origin }, 0);
    tl.add(el, { [axis.scale]: tw(0, 1, 420, "outCubic") }, 0);
    return tl;
  }

  tl.set(el, { [axis.scale]: 0, transformOrigin: axis.origin }, 0);
  tl.add(
    el,
    {
      [axis.scale]: tw(0, 1, 560, "outCubic"),
      "--rv-o": seq(0.3, [
        [0.3, 120, "linear"],
        [1, 160, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

export const GEN2_LINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "signal-line-draw": signalLineDraw,
  "drawn-rule": drawnRule,
  "ink-wipe-line": inkWipeLine,
  "pulse-trace-line": pulseTraceLine
});
