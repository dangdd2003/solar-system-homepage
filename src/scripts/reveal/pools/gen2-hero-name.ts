/**
 * Gen2 Hero-name pool effects (council design).
 *
 * Effects:
 * - hero-name-trace: letter-by-letter arrival from center with accent shadow pulse.
 * - hero-name-scale-settle: individual character scale settle sequence.
 * - hero-name-flare-sweep: horizontal streak crossing the name as it rises.
 * - hero-name-orbit-lock: rotating orbit ring locking into place around the name.
 * - hero-name-lens-iris: lens flare bloom blooming and fading while name settles.
 */

import { fitStep, full, part, partStagger, seq, timeline, tw, type EffectBuilder } from "../kit";
import { getSplit } from "../split";

const heroNameScaleSettle: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const parts = getSplit(el, compact ? "words" : "chars");
  const items = compact ? parts.words : parts.chars.length > 0 ? parts.chars : parts.words;

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(compact ? 1.04 : 1.12, 1, 560, "outCirc")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, scale: compact ? 1.04 : 1.12 }, 0);

  const step = fitStep(items.length, 40, 240);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      scale: tw(compact ? 1.04 : 1.12, 1, 560, "outCirc")
    },
    pos
  );

  return tl;
};

const heroNameTrace: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  if (compact) return heroNameScaleSettle(el, ctx);

  const parts = getSplit(el, "chars");
  const chars = parts.chars.length > 0 ? parts.chars : parts.words;

  if (chars.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      { "--rv-o": tw(0, 1, 480, "outQuad"), "--rv-y": tw("1.125rem", "0rem", 600, "outExpo") },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(chars, { opacity: 0, y: "1.125rem" }, 0);

  const step = fitStep(chars.length, 40, 240);
  const pos = partStagger(ctx, step, 0, "center");

  tl.add(
    chars,
    {
      opacity: tw(0, 1, 480, "outQuad"),
      y: tw("1.125rem", "0rem", 600, "outExpo")
    },
    pos
  );

  return tl;
};

const heroNameFlareSweep: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const flare = part(el, "flare");

  if (compact || !flare) {
    return heroNameScaleSettle(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(flare, { opacity: 0, x: "-40%" }, 0);
  tl.add(
    flare,
    {
      opacity: seq(0, [
        [1, 200, "outQuad"],
        [0, 700, "outQuad"]
      ]),
      x: tw("-40%", "120%", 900, "outQuad")
    },
    0
  );

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 500, "outQuad"),
      "--rv-y": tw("0.75rem", "0rem", 500, "outQuad")
    },
    200
  );

  return tl;
};

const heroNameOrbitLock: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const orbit = part(el, "orbit");

  if (compact || !orbit) {
    return heroNameScaleSettle(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(orbit, { opacity: 0, rotate: "-120deg" }, 0);
  tl.add(
    orbit,
    {
      opacity: seq(0, [
        [1, 300, "outQuad"],
        [0, 520, "inQuad"]
      ]),
      rotate: tw("-120deg", "0deg", 800, "outExpo")
    },
    0
  );

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 400, "outQuad"),
      "--rv-s": tw(0.96, 1, 560, "outBack(1.2)")
    },
    0
  );

  return tl;
};

const heroNameLensIris: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const lens = part(el, "lens");

  if (compact || !lens) {
    return heroNameScaleSettle(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(lens, { opacity: 0, scale: 0 }, 0);
  tl.add(
    lens,
    {
      opacity: seq(0, [
        [1, 300, "outQuad"],
        [0, 520, "inQuad"]
      ]),
      scale: seq(0, [
        [1.1, 420, "outBack(1.4)"],
        [1, 240, "outQuad"]
      ])
    },
    0
  );

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 500, "outQuad"),
      "--rv-y": tw("0.625rem", "0rem", 600, "outQuad")
    },
    0
  );

  return tl;
};

export const GEN2_HERO_NAME_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "hero-name-trace": heroNameTrace,
  "hero-name-scale-settle": heroNameScaleSettle,
  "hero-name-flare-sweep": heroNameFlareSweep,
  "hero-name-orbit-lock": heroNameOrbitLock,
  "hero-name-lens-iris": heroNameLensIris
});
