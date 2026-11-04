/**
 * Gen2 Card pool effects (council design).
 *
 * Effects:
 * - focus-lens-settle: lands with a soft perimeter ring via ::before and lifts into place.
 * - ellipse-drift: shallow elliptical arc drift with alternating direction.
 * - depth-shift: subtle scale overshoot settling onto the glass surface.
 * - eclipse-terminator: diagonal terminator wipe across the card surface.
 * - shutter-rise: vertical shutter unroll from base origin.
 * - edge-pulse-once: accent edge brightens once after landing, no loop.
 */

import { full, px, seq, timeline, tw, useMask, type EffectBuilder } from "../kit";

const focusLensSettle: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 420, "outQuad"),
        "--rv-y": tw("0.5rem", "0rem", 420, "outExpo")
      },
      0
    );
    return tl;
  }

  tl.set(el, { "--rv-edge": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw("0.625rem", "0rem", 520, "outExpo"),
      "--rv-edge": seq(0, [
        [0.6, 220, "outQuad"],
        [0, 300, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

const ellipseDrift: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const sign = c.side !== 0 ? c.side : c.index % 2 === 0 ? 1 : -1;
  const xDist = compact ? sign * 10 : sign * 18;

  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 432, "outQuad"),
      "--rv-x": tw(px(xDist), "0rem", 720, "outExpo"),
      "--rv-y": tw("0.75rem", "0rem", 720, "outExpo")
    },
    0
  );

  return tl;
};

const depthShift: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-s": tw(compact ? 0.98 : 0.96, 1, compact ? 480 : 600, "outBack(1.2)")
    },
    0
  );

  return tl;
};

const eclipseTerminator: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 480, "outQuad"),
        "--rv-y": tw("0.625rem", "0rem", 480, "outQuad")
      },
      0
    );
    return tl;
  }

  useMask(el, "sweep-diag");
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 480, "outQuad"),
      "--rv-y": tw("0.875rem", "0rem", 480, "outQuad"),
      maskPosition: tw("100% 100%", "0% 0%", 640, "outQuart")
    },
    0
  );

  return tl;
};

const shutterRise: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-y": tw("0.625rem", "0rem", 600, "outCubic")
      },
      0
    );
    return tl;
  }

  tl.set(el, { transformOrigin: "50% 100%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 360, "outQuad"),
      "--rv-y": tw("1rem", "0rem", 600, "outCubic"),
      "--rv-sy": tw(0.92, 1, 600, "outCubic")
    },
    0
  );

  return tl;
};

const edgePulseOnce: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(el, { "--rv-o": tw(0, 1, 420, "outQuad") }, 0);
    return tl;
  }

  tl.set(el, { "--rv-edge": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-edge": seq(0, [
        [0.7, 240, "outQuad"],
        [0, 480, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

export const GEN2_CARD_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "focus-lens-settle": focusLensSettle,
  "ellipse-drift": ellipseDrift,
  "depth-shift": depthShift,
  "eclipse-terminator": eclipseTerminator,
  "shutter-rise": shutterRise,
  "edge-pulse-once": edgePulseOnce
});
