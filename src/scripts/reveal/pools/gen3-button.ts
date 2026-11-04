/**
 * Gen3 Button pool effects.
 *
 * Buttons are focusable links, so these effects animate the host only (through
 * --rv-* variables, masks and maskPosition). Nothing here splits text.
 *
 * Effects:
 * - button-iris-unveil: an iris mask opens from the centre of the button while it settles from a slight shrink.
 * - button-wipe-glint: a desktop sweep mask wipes the face open while the button slides in from its left.
 * - button-blur-focus: the button pulls into focus from a soft blur and brightness flare (blur dropped under lowFx and on glass).
 * - button-hinge-drop: the button drops and swings in on a hinge at its top edge.
 * - button-tremor-settle: a decaying three-beat tremor on the x axis before the button locks in place.
 * - button-orbit-arc: the button arrives along a curved arc, sampled as keyframes on x and y.
 */

import type { AnimationParams } from "animejs";
import { D, MASK_PATHS, px, seq, timeline, tw, useMask, type EffectBuilder } from "../kit";
import { isGlass } from "./glass";

/** Iris opens from the centre; without the desktop mask the shrink-and-fade still reads. */
const buttonIrisUnveil: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  useMask(el, "iris");
  tl.set(el, { "--rv-mr": "0%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "linear"),
      "--rv-mr": tw("0%", "100%", 560, "outExpo"),
      "--rv-s": tw(ctx.compact ? 0.94 : 0.88, 1, 580, "outExpo")
    },
    0
  );
  return tl;
};

/** A desktop sweep mask wipes the face open while the button slides in from its left. */
const buttonWipeGlint: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  useMask(el, "sweep-right");
  const path = MASK_PATHS["sweep-right"];
  tl.set(el, { maskPosition: path.from }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 220, "linear"),
      "--rv-x": tw(ctx.compact ? "-0.2em" : "-0.4em", "0em", 560, "outCubic"),
      maskPosition: tw(path.from, path.to, 640, "inOutCubic")
    },
    0
  );
  return tl;
};

/** Pulls into focus from a soft blur and a brief brightness flare. Glass hosts and lowFx skip the blur. */
const buttonBlurFocus: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 260, "linear"),
    "--rv-y": tw(px(ctx.compact ? 6 : 10), "0rem", 620, "outCubic"),
    "--rv-s": tw(1.04, 1, 700, "outQuart")
  };
  if (ctx.lowFx) {
    params.filter = tw("brightness(1.5)", "brightness(1)", 600, "outQuad");
  } else if (!isGlass(el)) {
    const blur = ctx.compact ? 6 : 10;
    params.filter = tw(
      `blur(${blur}px) brightness(1.4)`,
      "blur(0px) brightness(1)",
      700,
      "outQuart"
    );
  }
  return tl.add(el, params, 0);
};

/** Drops in and swings onto its top edge like a hinged panel, settling at rest. */
const buttonHingeDrop: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const s = ctx.side !== 0 ? ctx.side : 1;
  tl.set(el, { transformOrigin: "50% 0%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "outQuad"),
      "--rv-y": tw(px(-D(ctx) * (ctx.compact ? 0.6 : 0.9)), "0rem", 640, "outQuart"),
      "--rv-r": tw(`${s * (ctx.compact ? 5 : 12)}deg`, "0deg", 680, "outBack(1.2)")
    },
    0
  );
  return tl;
};

/** Three decaying beats on the x axis, like a latch that tremors before it locks. */
const buttonTremorSettle: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const s = ctx.side !== 0 ? ctx.side : 1;
  const amp = ctx.compact ? 6 : 10;
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 220, "linear"),
      "--rv-x": seq(px(s * amp), [
        [px(-s * amp * 0.5), 120, "inOutSine"],
        [px(s * amp * 0.3), 110, "inOutSine"],
        [px(-s * amp * 0.12), 100, "inOutSine"],
        ["0rem", 130, "outSine"]
      ])
    },
    0
  );
  return tl;
};

/** Arrives along a curved arc: x and y are sampled as keyframes that land at the resting spot. */
const buttonOrbitArc: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const s = ctx.side !== 0 ? ctx.side : 1;
  const r = ctx.compact ? 0.5 : 0.9;
  const e = (n: number): string => `${Math.round(n * 1000) / 1000}em`;
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "linear"),
      "--rv-x": seq(e(s * r), [
        [e(s * r * 0.5), 260, "outSine"],
        [e(s * r * 0.12), 220, "inOutSine"],
        [e(0), 220, "outQuart"]
      ]),
      "--rv-y": seq(e(-r * 0.6), [
        [e(-r * 0.2), 260, "outSine"],
        [e(r * 0.05), 220, "inOutSine"],
        [e(0), 220, "outQuart"]
      ])
    },
    0
  );
  return tl;
};

export const GEN3_BUTTON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "button-iris-unveil": buttonIrisUnveil,
  "button-wipe-glint": buttonWipeGlint,
  "button-blur-focus": buttonBlurFocus,
  "button-hinge-drop": buttonHingeDrop,
  "button-tremor-settle": buttonTremorSettle,
  "button-orbit-arc": buttonOrbitArc
});
