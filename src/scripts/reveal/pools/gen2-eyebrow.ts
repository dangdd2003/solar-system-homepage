/**
 * Gen2 Eyebrow pool effects (council design).
 *
 * Effects:
 * - eyebrow-two-step: soft two-stage opacity step as one continuous phrase.
 * - eyebrow-slide-track: short lateral tracking slide with smooth fade.
 * - eyebrow-settle-scale: subtle scale settling into rest.
 * - eyebrow-flash-once: single brightness beacon blink on landing.
 */

import { seq, timeline, tw, type EffectBuilder } from "../kit";

const eyebrowTwoStep: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": seq(0, [
        [0.5, 180, "outQuad"],
        [1, 180, "outQuad"]
      ]),
      "--rv-y": tw("0.25rem", "0rem", 360, "outQuad")
    },
    0
  );
  return tl;
};

const eyebrowSlideTrack: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-x": tw(compact ? "-0.375rem" : "-0.75rem", "0rem", 380, "outCubic")
    },
    0
  );
  return tl;
};

const eyebrowSettleScale: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 280, "linear"),
      "--rv-s": tw(compact ? 0.96 : 0.9, 1, 380, "outExpo")
    },
    0
  );
  return tl;
};

const eyebrowFlashOnce: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": seq(0, [
          [1, 240, "outQuad"],
          [0.55, 160, "linear"],
          [1, 200, "outQuad"]
        ])
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": seq(0, [
        [1, 240, "outQuad"],
        [0.55, 160, "linear"],
        [1, 200, "outQuad"]
      ]),
      filter: tw("brightness(1.8)", "brightness(1)", 480, "outQuad")
    },
    0
  );

  return tl;
};

export const GEN2_EYEBROW_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "eyebrow-two-step": eyebrowTwoStep,
  "eyebrow-slide-track": eyebrowSlideTrack,
  "eyebrow-settle-scale": eyebrowSettleScale,
  "eyebrow-flash-once": eyebrowFlashOnce
});
