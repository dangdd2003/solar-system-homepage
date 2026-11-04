/**
 * Gen3 Icon pool effects.
 *
 * Effects:
 * - icon-iris-bloom: an iris mask opens on the icon while it scales up from a small disc.
 * - icon-gyro-settle: a spring spin that unwinds to rest, like a gyroscope stopping.
 * - icon-core-ignite: the icon ignites from dark through an overdriven brightness peak.
 * - icon-rim-trace: the outline draws back from its far end, then the icon fades up.
 * - icon-signal-ping: a single halo ring pings outward as the icon lands.
 * - icon-planet-arc: the icon enters along a small arc around its resting point and docks.
 */

import {
  fitStep,
  px,
  seq,
  sp,
  SPRING_SOFT,
  timeline,
  tw,
  useHalo,
  useMask,
  stagger,
  type EffectBuilder,
  type EffectContext
} from "../kit";
import type { Timeline } from "animejs";
import { drawableStrokes } from "../svg-draw";

const iconIrisBloom: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  // The iris mask only renders on desktop pointers; elsewhere the scale and opacity carry the reveal.
  useMask(el, "iris");
  tl.set(el, { "--rv-o": 0, "--rv-mr": "0%", "--rv-s": compact ? 0.82 : 0.6 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-mr": tw("0%", "100%", 640, "outExpo"),
      "--rv-s": tw(compact ? 0.82 : 0.6, 1, 620, "outExpo")
    },
    0
  );

  return tl;
};

const iconGyroSettle: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);
  const spin = compact ? "180deg" : "360deg";

  tl.set(el, { "--rv-o": 0, "--rv-r": spin, "--rv-s": compact ? 0.8 : 0.7 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 220, "outQuad"),
      "--rv-r": sp(spin, "0deg", SPRING_SOFT),
      "--rv-s": tw(compact ? 0.8 : 0.7, 1, 480, "outBack(1.2)")
    },
    0
  );

  return tl;
};

const iconCoreIgnite: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  // Brightness only: the same skeleton under lowFx, with no blur or drop-shadow.
  const dark = "brightness(0.4)";

  tl.set(el, { "--rv-o": 0, "--rv-s": 0.94, filter: dark }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "linear"),
      filter: seq(dark, [
        ["brightness(1.9)", 300, "outQuad"],
        ["brightness(1)", 360, "inOutQuad"]
      ]),
      "--rv-s": tw(0.94, 1, 560, "outQuad")
    },
    0
  );

  return tl;
};

const STROKE_SELECTOR = "path, line, polyline, circle, rect, polygon, [pathLength]";

/** A stroke only shows when it has a real colour and a positive width (fill-only paths do not). */
function hasVisibleStroke(node: Element): boolean {
  const style = getComputedStyle(node);
  // Browsers report "none" for an unset stroke; "rgba(0, 0, 0, 0)" means the stroke is not painted
  // in the cascade the DOM exposes, so the presentation attribute decides.
  const computed = style.stroke && style.stroke !== "rgba(0, 0, 0, 0)" ? style.stroke : "";
  const stroke = (computed || node.getAttribute("stroke") || "").trim();
  if (stroke === "" || stroke === "none" || stroke === "transparent") return false;
  if (/^rgba?\(.*,\s*0(\.0+)?\)$/.test(stroke)) return false;
  if (style.strokeOpacity === "0") return false;
  const width = parseFloat(style.strokeWidth || node.getAttribute("stroke-width") || "0");
  return Number.isFinite(width) && width > 0;
}

/** Fallback for icons with no painted stroke: the legacy fade-up, with its initial state set. */
function traceFallback(el: HTMLElement, ctx: EffectContext): Timeline {
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 0, "--rv-y": px(8) }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 520, "outQuad"),
      "--rv-y": tw(px(8), "0rem", 620, "outExpo")
    },
    0
  );
  return tl;
}

const iconRimTrace: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  // Check before drawing: createDrawable rewrites the paths, so fill-only icons must not reach it.
  const painted = Array.from(el.querySelectorAll(STROKE_SELECTOR)).filter(hasVisibleStroke);

  if (painted.length === 0) {
    return traceFallback(el, ctx);
  }

  const strokes = drawableStrokes(el);

  const tl = timeline(ctx);
  const span = compact ? 420 : 560;
  const step = fitStep(strokes.length, 90, Math.max(0, 1000 - 120 - span));

  tl.set(el, { "--rv-o": 0 }, 0);
  tl.add(el, { "--rv-o": tw(0, 1, 240, "outQuad") }, 0);
  // Strokes trace back from their far end (draw "1 1" to "0 1"), one piece after another.
  tl.add(
    strokes,
    {
      draw: tw("1 1", "0 1", span, "inOutSine")
    },
    stagger(step, { from: "last" })
  );

  return tl;
};

const iconSignalPing: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);

  // SVG hosts have no halo; they fall back to a scale settle.
  if (compact || !useHalo(el, "ring")) {
    tl.set(el, { "--rv-o": 0, "--rv-s": 0.8 }, 0);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 240, "outQuad"),
        "--rv-s": tw(0.8, 1, 460, "outBack(1.3)")
      },
      0
    );
    return tl;
  }

  tl.set(el, { "--rv-o": 0, "--rv-s": 0.8, "--rv-ring-o": 0, "--rv-ring-s": 0.8 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "outQuad"),
      "--rv-s": tw(0.8, 1, 460, "outBack(1.3)"),
      "--rv-ring-s": tw(0.8, 1.7, 620, "outExpo"),
      "--rv-ring-o": seq(0, [
        [0.85, 160, "outQuad"],
        [0, 460, "inQuad"]
      ])
    },
    0
  );

  return tl;
};

const iconPlanetArc: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);
  // The arc radius halves on compact phones; the path is sampled as x and y keyframes.
  const k = compact ? 0.5 : 1;
  const x0 = -22 * k;
  const x1 = -9 * k;
  const y0 = 18 * k;
  const y1 = 6 * k;

  tl.set(
    el,
    { "--rv-o": 0, "--rv-x": `${x0 / 16}rem`, "--rv-y": `${y0 / 16}rem`, "--rv-r": "-40deg" },
    0
  );
  // Opacity spans the whole docking path so the icon is never fully opaque while still sliding in.
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 600, "outQuad"),
      "--rv-x": seq(`${x0 / 16}rem`, [
        [`${x1 / 16}rem`, 300, "outQuad"],
        ["0rem", 300, "outCubic"]
      ]),
      "--rv-y": seq(`${y0 / 16}rem`, [
        [`${y1 / 16}rem`, 300, "outQuad"],
        ["0rem", 300, "outCubic"]
      ]),
      "--rv-r": tw("-40deg", "0deg", 560, "outBack(1.2)")
    },
    0
  );

  return tl;
};

export const GEN3_ICON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "icon-iris-bloom": iconIrisBloom,
  "icon-gyro-settle": iconGyroSettle,
  "icon-core-ignite": iconCoreIgnite,
  "icon-rim-trace": iconRimTrace,
  "icon-signal-ping": iconSignalPing,
  "icon-planet-arc": iconPlanetArc
});
