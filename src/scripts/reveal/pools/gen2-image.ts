/**
 * Gen2 Image pool effects (council design).
 *
 * Effects:
 * - iris-open-lite: circular iris opening expanding from center.
 * - image-drift-in: subtle scale-down and directional drift.
 * - image-shutter-sweep: linear mask sweep unveiling portrait.
 * - image-focus-pull: defocus blur clearing as image settles.
 */

import { full, px, timeline, tw, useMask, type EffectBuilder } from "../kit";

const imageDriftIn: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const sign = c.side !== 0 ? c.side : 1;

  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0.2, 1, 500, "outQuad"),
      "--rv-s": tw(compact ? 1.03 : 1.06, 1, compact ? 640 : 900, "outExpo"),
      ...(compact ? {} : { "--rv-x": tw(px(sign * 12), "0rem", 900, "outExpo") })
    },
    0
  );

  return tl;
};

const irisOpenLite: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  if (compact) return imageDriftIn(el, ctx);

  useMask(el, "iris");
  const tl = timeline(ctx);
  tl.set(el, { "--rv-mx": "50%", "--rv-my": "50%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0.2, 1, 500, "outQuad"),
      "--rv-mr": tw("0%", "100%", 700, "outQuart")
    },
    0
  );

  return tl;
};

const imageShutterSweep: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  if (compact) return imageDriftIn(el, ctx);

  useMask(el, "sweep-right");
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0.2, 1, 500, "outQuad"),
      "--rv-s": tw(1.02, 1, 820, "outQuad"),
      maskPosition: tw("100% 0%", "0% 0%", 820, "outQuart")
    },
    0
  );

  return tl;
};

const imageFocusPull: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 560, "outQuad"),
        "--rv-s": tw(1.02, 1, 560, "outQuad")
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 500, "outQuad"),
      "--rv-s": tw(1.04, 1, 800, "outQuart"),
      filter: tw("blur(6px)", "blur(0px)", 800, "outQuart")
    },
    0
  );

  return tl;
};

export const GEN2_IMAGE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "iris-open-lite": irisOpenLite,
  "image-drift-in": imageDriftIn,
  "image-shutter-sweep": imageShutterSweep,
  "image-focus-pull": imageFocusPull
});
