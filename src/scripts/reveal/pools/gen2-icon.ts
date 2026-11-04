/**
 * Gen2 Icon pool effects (council design).
 *
 * Effects:
 * - corona-icon-pop: pop with temporary corona halo disc.
 * - icon-spin-in: quarter turn unspin while scaling in.
 * - icon-drop-settle: vertical drop with springy overshoot.
 * - icon-draw-in: animated SVG stroke draw-in.
 * - icon-twin-pop: scale bounce with angular settle.
 */

import { seq, timeline, tw, useHalo, type EffectBuilder } from "../kit";
import { drawableStrokes } from "../svg-draw";

const coronaIconPop: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 200, "linear"),
        "--rv-s": tw(0.82, 1, 360, "outQuad")
      },
      0
    );
    return tl;
  }

  // The halo tween only applies where a halo exists (HTML hosts; SVG hosts have no ::after).
  const halo = useHalo(el, "disc");
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "linear"),
      "--rv-s": tw(0.6, 1, 420, "outBack(1.4)"),
      ...(halo
        ? {
            "--rv-ring-o": seq(0, [
              [0.8, 320, "outQuad"],
              [0, 320, "outQuad"]
            ])
          }
        : {})
    },
    0
  );

  return tl;
};

const iconSpinIn: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 200, "outQuad"),
        "--rv-s": tw(0.6, 1, 420, "outBack(1.4)")
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-s": tw(0.5, 1, 520, "outBack(1.4)"),
      "--rv-r": tw("-90deg", "0deg", 620, "outExpo")
    },
    0
  );

  return tl;
};

const iconDropSettle: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "outQuad"),
      "--rv-y": tw(compact ? "-0.4em" : "-0.8em", "0em", 520, "outBack(1.3)")
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

const iconDrawIn: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  // Check before drawing: createDrawable rewrites the paths, so fill-only icons must not reach it.
  const painted = Array.from(el.querySelectorAll(STROKE_SELECTOR)).filter(hasVisibleStroke);

  if (painted.length === 0) {
    // Fill-only icons have nothing to draw; fall back to the visible drop-in instead of a blank reveal.
    return iconDropSettle(el, ctx);
  }

  const strokes = drawableStrokes(el);
  if (strokes.length === 0) {
    return iconDropSettle(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.add(
    strokes,
    {
      draw: tw("0 0", "0 1", compact ? 480 : 620, "inOutQuad")
    },
    0
  );

  return tl;
};

const iconTwinPop: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 200, "outQuad"),
        "--rv-s": tw(0.6, 1, 420, "outBack(1.4)")
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-s": seq(0, [
        [1.2, 360, "outBack(1.5)"],
        [1, 200, "outQuad"]
      ]),
      "--rv-r": tw("45deg", "0deg", 420, "outExpo")
    },
    0
  );

  return tl;
};

export const GEN2_ICON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "corona-icon-pop": coronaIconPop,
  "icon-spin-in": iconSpinIn,
  "icon-drop-settle": iconDropSettle,
  "icon-draw-in": iconDrawIn,
  "icon-twin-pop": iconTwinPop
});
