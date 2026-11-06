/**
 * Pool: hero-name (`div.hero__name`). Never split: the name is one gradient-text
 * title, so every effect animates the host and its decorative parts only.
 *
 * Effects (the legacy supernova stays in effects.ts):
 * - event-horizon: an iris mask opens from the centre while the host shrinks in.
 * - redshift-arrival: arrives stretched and red-shifted, then snaps to rest.
 * - corona-eclipse: a dark lens crosses behind the name; falls back without a lens.
 * - orbital-capture: a ring tightens around the name as it settles from a tilt.
 * - aurora-veil: an aurora mask rises through the letters before settling.
 */

import type { EffectBuilder } from "../kit";
import { glow, hostReveal, part, px, seq, sizeOf, timeline, tw, useMask } from "../kit";

/** Desktop and compact share one shape; compact only trims durations and travel. */
const eventHorizon: EffectBuilder = (el, ctx) => {
  const lens = part(el, "lens");
  const { w, h } = sizeOf(el);
  const lw = lens ? sizeOf(lens).w || h * 1.4 : 0;
  useMask(el, "iris");
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1, "--rv-mx": "50%", "--rv-my": "50%" }, 0);
  tl.add(
    el,
    {
      "--rv-mr": tw("-18%", "100%", ctx.compact ? 700 : 820, "outQuart"),
      "--rv-s": tw(1.08, 1, 900, "outExpo"),
      filter: ctx.compact
        ? tw("brightness(1.5)", "brightness(1)", 600, "outQuad")
        : tw(
            ctx.lowFx ? "brightness(1.6)" : "blur(6px) brightness(1.6)",
            ctx.lowFx ? "brightness(1)" : "blur(0px) brightness(1)",
            800,
            "outQuart"
          )
    },
    0
  );
  if (lens && !ctx.compact) {
    tl.set(lens, { x: px((w - lw) / 2), opacity: 0 }, 0);
    tl.add(
      lens,
      {
        opacity: seq(0, [
          [1, 120, "outQuad"],
          [0, 520, "inQuad"]
        ]),
        scale: tw(1.4, 0.2, 700, "inCubic")
      },
      0
    );
  }
  return tl;
};

const redshiftArrival: EffectBuilder = (el, ctx) => {
  const flare = part(el, "flare");
  const c = ctx.compact;
  const tl = timeline(ctx);
  tl.set(el, { transformOrigin: "0% 50%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 360, "outQuad"),
      "--rv-x": tw(c ? "-0.3em" : "-0.6em", "0em", 800, "outExpo"),
      "--rv-sx": tw(c ? 1.15 : 1.4, 1, 800, "outExpo"),
      filter: ctx.lowFx
        ? tw("hue-rotate(-40deg)", "hue-rotate(0deg)", 700, "outQuart")
        : c
          ? tw("blur(4px) hue-rotate(-40deg)", "blur(0px) hue-rotate(0deg)", 700, "outQuart")
          : tw(
              "blur(14px) hue-rotate(-50deg) brightness(1.5)",
              "blur(0px) hue-rotate(0deg) brightness(1)",
              850,
              "outQuart"
            )
    },
    0
  );
  if (flare) {
    tl.set(flare, { opacity: 0 }, 0);
    tl.add(
      flare,
      {
        opacity: seq(0, [
          [c ? 0.5 : 0.7, 160, "outQuad"],
          [0, 600, "inQuad"]
        ]),
        scaleX: tw(c ? 1.15 : 1.8, 0.7, 800, "outExpo"),
        scaleY: tw(0.18, 0.3, 800, "outExpo")
      },
      0
    );
  }
  return tl;
};

const coronaEclipse: EffectBuilder = (el, ctx) => {
  const lens = part(el, "lens");
  if (!lens) return hostReveal(el, ctx);
  const { w, h } = sizeOf(el);
  const lw = sizeOf(lens).w || h * 1.4;
  const tl = timeline(ctx);
  tl.set(lens, { opacity: 0 }, 0);
  tl.add(el, { "--rv-o": tw(0, 1, 640, "inQuad") }, 0);
  if (!(ctx.lowFx ?? ctx.compact)) {
    tl.add(
      el,
      {
        filter: tw(
          `brightness(1.6) ${glow("226, 115, 80", 22, 0.9)}`,
          `brightness(1) ${glow("226, 115, 80", 0, 0)}`,
          950,
          "outQuad"
        )
      },
      0
    );
  }
  if (lens && !ctx.compact) {
    tl.set(lens, { x: px((w - lw) / 2), opacity: 0 }, 0);
    tl.add(
      lens,
      {
        opacity: seq(0, [
          [1, 120, "outQuad"],
          [1, 560, "linear"],
          [0, 260, "inQuad"]
        ]),
        x: tw(0, px(Math.max(0, w - lw)), 900, "inOutSine")
      },
      0
    );
  }
  return tl;
};

const orbitalCapture: EffectBuilder = (el, ctx) => {
  const orbit = part(el, "orbit");
  const c = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-s": tw(c ? 1.08 : 1.18, 1, 900, "outExpo"),
      "--rv-r": tw(c ? "-1.5deg" : "-3deg", "0deg", 900, "outExpo"),
      ...(ctx.lowFx
        ? {}
        : {
            filter: c
              ? tw("blur(4px)", "blur(0px)", 700, "outQuart")
              : tw("blur(8px) brightness(1.4)", "blur(0px) brightness(1)", 800, "outQuart")
          })
    },
    0
  );
  if (orbit) {
    tl.set(orbit, { opacity: 0 }, 0);
    tl.add(
      orbit,
      {
        opacity: seq(0, [
          [0.85, 180, "outQuad"],
          [0, 640, "inQuad"]
        ]),
        scale: tw(c ? 1 : 1.7, 1, 820, "outExpo"),
        rotate: tw(-40, -8, 820, "outExpo")
      },
      0
    );
  }
  return tl;
};

const auroraVeil: EffectBuilder = (el, ctx) => {
  const c = ctx.compact;
  useMask(el, "sweep-up");
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.add(
    el,
    {
      maskPosition: tw("0% 0%", "0% 100%", c ? 700 : 900, "outQuart"),
      "--rv-y": tw("0.2em", "0em", 900, "outExpo"),
      filter:
        (ctx.lowFx ?? c)
          ? tw("brightness(1.3)", "brightness(1)", 700, "outQuad")
          : tw(
              "saturate(2) brightness(1.4) hue-rotate(40deg)",
              "saturate(1) brightness(1) hue-rotate(0deg)",
              900,
              "outQuad"
            )
    },
    0
  );
  return tl;
};

/** The five hero-name effects of SPEC-random §3.3 (the legacy supernova is not here). */
export const HERO_NAME_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "event-horizon": eventHorizon,
  "redshift-arrival": redshiftArrival,
  "corona-eclipse": coronaEclipse,
  "orbital-capture": orbitalCapture,
  "aurora-veil": auroraVeil
});
