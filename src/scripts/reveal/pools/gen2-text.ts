/**
 * Gen2 Text pool effects (council design).
 *
 * Effects:
 * - lines-rise: line-by-line reveal out of clipped baseline overflow.
 * - word-skew-in: words slide in with temporary skew angle.
 * - paragraph-breathe: full paragraph subtle scale settle without splitting.
 * - line-scan-opacity: sequential line opacity sweep without translation.
 * - soft-focus-in: paragraph comes into focus from soft blur (desktop only).
 */

import { fitStep, full, partStagger, seq, timeline, tw, type EffectBuilder } from "../kit";
import { getSplit } from "../split";

const linesRise: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const parts = getSplit(el, "lines");
  const lines = parts.lines;

  if (lines.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      { "--rv-o": tw(0, 1, 360, "outQuad"), "--rv-y": tw("0.5rem", "0rem", 420, "outExpo") },
      0
    );
    return tl;
  }

  // Every line takes the same tween; fitStep keeps long paragraphs' cascade bounded.
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(lines, { opacity: 0, y: compact ? "60%" : "100%" }, 0);

  const step = fitStep(lines.length, 60, 240);
  const pos = partStagger(ctx, step, 0, "first");

  tl.add(
    lines,
    {
      opacity: tw(0, 1, 300, "outQuad"),
      y: tw(compact ? "60%" : "100%", "0%", compact ? 420 : 560, "outExpo")
    },
    pos
  );

  return tl;
};

const wordSkewIn: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const parts = getSplit(el, "words");
  const words = parts.words;

  if (words.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw(compact ? "0.25em" : "0.5em", "0em", 420, "outQuart")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(
    words,
    {
      opacity: 0,
      x: compact ? "0.25em" : "0.5em",
      ...(compact ? {} : { skewX: "-12deg" })
    },
    0
  );
  const step = fitStep(words.length, 30, 360);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    words,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      x: tw(compact ? "0.25em" : "0.5em", "0em", 420, "outQuart"),
      ...(compact ? {} : { skewX: tw("-12deg", "0deg", 420, "outQuart") })
    },
    pos
  );

  return tl;
};

const paragraphBreathe: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 480, "outQuad"),
      "--rv-s": tw(compact ? 0.99 : 0.985, 1, compact ? 480 : 640, "outQuad")
    },
    0
  );
  return tl;
};

const lineScanOpacity: EffectBuilder = (el, ctx) => {
  const parts = getSplit(el, "lines");
  const lines = parts.lines;

  if (lines.length === 0) {
    const tl = timeline(ctx);
    tl.add(el, { "--rv-o": tw(0, 1, 360, "outQuad") }, 0);
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(lines, { opacity: 0.15 }, 0);

  const step = fitStep(lines.length, 70, 240);
  const pos = partStagger(ctx, step, 0, "first");

  tl.add(
    lines,
    {
      opacity: seq(0.15, [[1, 220, "outQuad"]])
    },
    pos
  );

  return tl;
};

const softFocusIn: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const hasLink = el.tagName === "A" || el.querySelector("a") !== null;
  const tl = timeline(ctx);

  if (compact || hasLink) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 420, "outQuad"),
        "--rv-y": tw("0.5rem", "0rem", 480, "outExpo")
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw("0.375rem", "0rem", 600, "outExpo"),
      filter: tw("blur(8px)", "blur(0px)", 600, "outQuart")
    },
    0
  );

  return tl;
};

export const GEN2_TEXT_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "lines-rise": linesRise,
  "word-skew-in": wordSkewIn,
  "paragraph-breathe": paragraphBreathe,
  "line-scan-opacity": lineScanOpacity,
  "soft-focus-in": softFocusIn
});
