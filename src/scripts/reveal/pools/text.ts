/**
 * Text pool: reveal effects for paragraphs (`@text`).
 *
 * Paragraphs may hold links or `data-reveal-nosplit` widgets, in which case
 * getSplit returns no pieces and every builder falls back to the host alone.
 *
 * - solar-wind: words carried in from the left by the solar wind (desktop only).
 * - stellar-dawn: dawn light spreads from a corner across the text (iris mask).
 * - word-constellation: words appear one by one in random order, like stars (desktop only).
 */

import type { EffectBuilder } from "../kit";
import { fitStep, hostFade, partStagger, timeline, tw, useMask } from "../kit";
import { getSplit } from "../split";

const solarWind: EffectBuilder = (el, ctx) => {
  const words = ctx.compact ? [] : getSplit(el, "words").words;
  if (words.length === 0) {
    return timeline(ctx).add(
      el,
      {
        "--rv-o": tw(0, 1, 420, "outQuad"),
        "--rv-x": tw("-1rem", "0rem", 700, "outExpo"),
        filter: tw("blur(4px)", "blur(0px)", 600, "outQuart")
      },
      0
    );
  }
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(words, { opacity: 0 }, 0);
  tl.add(
    words,
    {
      opacity: tw(0, 1, 300, "outQuad"),
      x: tw("-0.6em", "0em", 600, "outExpo"),
      filter: tw("blur(3px)", "blur(0px)", 500, "outQuart")
    },
    partStagger(ctx, fitStep(words.length, 12, 360), 0, "first")
  );
  return tl;
};

const stellarDawn: EffectBuilder = (el, ctx) => {
  useMask(el, "iris");
  const tl = timeline(ctx);
  tl.set(
    el,
    {
      "--rv-o": 1,
      "--rv-mx": ctx.side > 0 ? "100%" : "0%",
      "--rv-my": "0%"
    },
    0
  );
  if (ctx.compact) {
    tl.add(el, { "--rv-mr": tw("-18%", "100%", 720, "outQuart") }, 0);
  } else {
    tl.add(
      el,
      {
        "--rv-mr": tw("-18%", "100%", 900, "outQuart"),
        filter: tw("brightness(1.5)", "brightness(1)", 900, "outQuad")
      },
      0
    );
  }
  return tl;
};

const wordConstellation: EffectBuilder = (el, ctx) => {
  const words = ctx.compact ? [] : getSplit(el, "words").words;
  if (words.length === 0) return hostFade(el, ctx);
  const acc = ctx.accentRgb;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(words, { opacity: 0 }, 0);
  tl.add(
    words,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      filter: tw("brightness(2.2)", "brightness(1)", 400, "outQuad"),
      textShadow: tw(
        `0px 0px 10px rgba(${acc}, 0.9)`,
        `0px 0px 0px rgba(${acc}, 0)`,
        460,
        "outQuad"
      )
    },
    partStagger(ctx, fitStep(words.length, 8, 420), 0, "random")
  );
  return tl;
};

export const TEXT_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "solar-wind": solarWind,
  "stellar-dawn": stellarDawn,
  "word-constellation": wordConstellation
});
