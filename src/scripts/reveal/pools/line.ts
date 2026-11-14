/**
 * Line / rail / accent pool (SPEC-random §3.11). Two geometries share one
 * builder each: a CSS bar (the `more__accent` rule) that grows along its long
 * axis, and an SVG stroke (`contact__arrow`, `pathLength="1"`) that draws
 * itself through `--rv-draw`.
 *
 * - comet-trail: draws behind a bright glowing head.
 * - light-speed: snaps out from its centre with a blur streak.
 * - pulsar-beam: strobes on like a pulsar beam sweeping past.
 * - retrograde: draws backwards from the far end, like a planet's loop.
 */

import {
  glow,
  isVertical,
  seq,
  timeline,
  tw,
  useStroke,
  type EffectBuilder,
  type EffectContext
} from "../kit";

type Geometry = {
  readonly stroke: boolean;
  readonly vertical: boolean;
  readonly axis: "--rv-sx" | "--rv-sy";
};

/** Picks the stroke path when the host holds a `pathLength="1"` stroke; otherwise a bar along its long side. */
function geometry(el: HTMLElement): Geometry {
  const stroke = useStroke(el);
  const vertical = isVertical(el);
  return { stroke, vertical, axis: vertical ? "--rv-sy" : "--rv-sx" };
}

const cometTrail: EffectBuilder = (el, ctx: EffectContext) => {
  const acc = ctx.accentRgb;
  const g = geometry(el);
  const flare = ctx.compact
    ? {}
    : {
        filter: tw(
          ctx.lowFx ? "brightness(2)" : `brightness(2) ${glow(acc, 8, 0.9)}`,
          ctx.lowFx ? "brightness(1)" : `brightness(1) ${glow(acc, 0, 0)}`,
          900,
          "outQuad"
        )
      };
  const tl = timeline(ctx);
  if (g.stroke) {
    return tl.add(
      el,
      { "--rv-o": tw(0, 1, 200, "outQuad"), "--rv-draw": tw(1, 0, 600, "inOutQuad"), ...flare },
      0
    );
  }
  return tl
    .set(el, { "--rv-o": 1, transformOrigin: g.vertical ? "50% 0%" : "0% 50%" }, 0)
    .add(el, { [g.axis]: tw(0, 1, 780, "outExpo"), ...flare }, 0);
};

const lightSpeed: EffectBuilder = (el, ctx: EffectContext) => {
  const g = geometry(el);
  const flare = ctx.compact
    ? { filter: tw("brightness(2)", "brightness(1)", 500, "outQuad") }
    : {
        filter: tw(
          ctx.lowFx ? "brightness(2.4)" : "blur(4px) brightness(2.4)",
          ctx.lowFx ? "brightness(1)" : "blur(0px) brightness(1)",
          620,
          "outQuart"
        )
      };
  const tl = timeline(ctx);
  if (g.stroke) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 160, "outQuad"),
        "--rv-draw": tw(1, 0, 360, "outExpo"),
        "--rv-x": tw("-0.5rem", "0rem", 520, "outExpo"),
        ...flare
      },
      0
    );
  }
  return tl
    .set(el, { "--rv-o": 1, transformOrigin: "50% 50%" }, 0)
    .add(el, { [g.axis]: tw(0, 1, 520, "outExpo"), ...flare }, 0);
};

const pulsarBeam: EffectBuilder = (el, ctx: EffectContext) => {
  const g = geometry(el);
  const strobe = seq(0, [
    [1, 120, "linear"],
    [0.3, 120, "linear"],
    [1, 160, "outQuad"],
    [0.5, 120, "linear"],
    [1, 160, "outQuad"]
  ]);
  const flare = ctx.compact ? {} : { filter: tw("brightness(2)", "brightness(1)", 700, "outQuad") };
  const tl = timeline(ctx);
  if (g.stroke) {
    return tl.add(el, { "--rv-o": strobe, "--rv-draw": tw(1, 0, 300, "outQuad"), ...flare }, 0);
  }
  return tl.add(el, { "--rv-o": strobe, ...flare }, 0);
};

const retrograde: EffectBuilder = (el, ctx: EffectContext) => {
  const g = geometry(el);
  const flare = ctx.compact
    ? {}
    : { filter: tw("brightness(1.8)", "brightness(1)", 700, "outQuad") };
  const tl = timeline(ctx);
  if (g.stroke) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 200, "outQuad"),
        "--rv-draw": tw(-1, 0, 640, "inOutCubic"),
        "--rv-y": tw("-0.1875rem", "0rem", 640, "outExpo")
      },
      0
    );
  }
  return tl
    .set(el, { "--rv-o": 1, transformOrigin: g.vertical ? "50% 100%" : "100% 50%" }, 0)
    .add(el, { [g.axis]: tw(0, 1, 700, "outQuart"), ...flare }, 0);
};

export const LINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "comet-trail": cometTrail,
  "light-speed": lightSpeed,
  "pulsar-beam": pulsarBeam,
  retrograde
});
