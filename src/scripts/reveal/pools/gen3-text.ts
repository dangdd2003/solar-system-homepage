/**
 * Gen3 Text pool effects (premium paragraph motion).
 *
 * Effects:
 * - text-iris-lines: each line opens from its own centre in a circular iris.
 * - text-tracking-settle: words stretch in from a wide transform into their resting width (no reflow).
 * - text-line-fold: lines unfold downward from their top edge, like a page opening.
 * - text-wave-chars: letters ride up in a short wave with a soft overshoot (words on phones).
 * - text-arc-swing: words swing in on small arcs from alternating sides.
 * - text-light-sweep: a diagonal mask sweep and brightness flash through the words (desktop); opacity fade alone on phones and lowFx.
 *
 * Every builder splits through getSplit, falls back to the host alone when no
 * pieces exist (links, nosplit widgets, failed splits), and keeps every timeline
 * inside DURATION_MS (1000 ms) counting its delay.
 */

import type { EffectBuilder } from "../kit";
import { fitStep, hostFade, MASK_PATHS, partStagger, timeline, tw, useMask } from "../kit";
import { getSplit } from "../split";

/** A circle clip that is fully closed at the line's centre. */
const IRIS_CLOSED = "circle(0% at 50% 50%)";
/** A circle clip large enough to cover any line, equal to no clip at rest. */
const IRIS_OPEN = "circle(150% at 50% 50%)";

const irisLines: EffectBuilder = (el, ctx) => {
  const lines = getSplit(el, "lines").lines;
  if (lines.length === 0) return hostFade(el, ctx);

  const compact = ctx.compact || Boolean(ctx.lowFx);
  const rise = compact ? "0.2em" : "0.4em";
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(lines, { opacity: 0, y: rise, clipPath: IRIS_CLOSED }, 0);
  tl.add(
    lines,
    {
      opacity: tw(0, 1, 240, "outQuad"),
      y: tw(rise, "0em", 460, "outCubic"),
      clipPath: tw(IRIS_CLOSED, IRIS_OPEN, 420, "outCubic")
    },
    partStagger(ctx, fitStep(lines.length, 80, 200), 0)
  );
  return tl;
};

const trackingSettle: EffectBuilder = (el, ctx) => {
  const words = getSplit(el, "words").words;
  if (words.length === 0) return hostFade(el, ctx);

  // Stretch is a transform, not letter-spacing: spacing changes re-wrap the lines
  // and slide words across them. A transform leaves the layout untouched.
  const from = ctx.compact ? 1.1 : 1.2;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(words, { opacity: 0, scaleX: from, transformOrigin: "50% 50%" }, 0);
  tl.add(
    words,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      scaleX: tw(from, 1, 560, "outExpo")
    },
    partStagger(ctx, fitStep(words.length, 30, 220), 0)
  );
  return tl;
};

const lineFold: EffectBuilder = (el, ctx) => {
  const lines = getSplit(el, "lines").lines;
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const foldFrom = compact ? 0.5 : 0.2;

  if (lines.length === 0) {
    return timeline(ctx).add(
      el,
      {
        "--rv-o": tw(0, 1, 380, "outQuad"),
        "--rv-sy": tw(compact ? 0.8 : 0.6, 1, 620, "outExpo")
      },
      0
    );
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(lines, { opacity: 0, scaleY: foldFrom, transformOrigin: "50% 0%" }, 0);
  tl.add(
    lines,
    {
      opacity: tw(0, 1, 240, "outQuad"),
      scaleY: tw(foldFrom, 1, 480, "outExpo")
    },
    partStagger(ctx, fitStep(lines.length, 70, 180), 0)
  );
  return tl;
};

const waveChars: EffectBuilder = (el, ctx) => {
  // Phones animate words (fewer pieces); desktop animates characters.
  const mode = ctx.compact ? "words" : "chars";
  const split = getSplit(el, mode);
  const pieces = mode === "chars" && split.chars.length > 0 ? split.chars : split.words;
  if (pieces.length === 0) return hostFade(el, ctx);

  const travel = ctx.compact ? "0.25em" : "0.45em";
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(pieces, { opacity: 0, y: travel }, 0);
  tl.add(
    pieces,
    {
      opacity: tw(0, 1, 240, "outQuad"),
      y: tw(travel, "0em", 480, "outBack(1.2)")
    },
    partStagger(ctx, fitStep(pieces.length, 12, 300), 0)
  );
  return tl;
};

const arcSwing: EffectBuilder = (el, ctx) => {
  const words = getSplit(el, "words").words;
  if (words.length === 0) return hostFade(el, ctx);

  const compact = ctx.compact || Boolean(ctx.lowFx);
  const reach = ctx.compact ? 8 : 22;
  const sideX = (_t: unknown, i = 0): string => `${(i % 2 === 0 ? -reach : reach) / 16}rem`;
  const sideRot = (_t: unknown, i = 0): string => (i % 2 === 0 ? "-6deg" : "6deg");

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(
    words,
    {
      opacity: 0,
      x: sideX,
      y: "0.35em",
      transformOrigin: "50% 100%",
      ...(compact ? {} : { rotate: sideRot })
    },
    0
  );
  tl.add(
    words,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      x: tw(sideX, "0rem", 520, "outExpo"),
      y: tw("0.35em", "0em", 520, "outExpo"),
      ...(compact ? {} : { rotate: tw(sideRot, "0deg", 520, "outExpo") })
    },
    partStagger(ctx, fitStep(words.length, 30, 240), 0)
  );
  return tl;
};

const lightSweep: EffectBuilder = (el, ctx) => {
  const words = getSplit(el, "words").words;
  if (words.length === 0) return hostFade(el, ctx);

  // The diagonal mask and the per-word brightness flash are desktop-only. Phones and
  // lowFx devices get an opacity-only fade, so no word forces a filter layer.
  const sweep = !ctx.compact && !ctx.lowFx;
  if (sweep) useMask(el, "sweep-diag");

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(words, { opacity: 0, ...(sweep ? { filter: "brightness(1.9)" } : {}) }, 0);
  if (sweep) {
    const path = MASK_PATHS["sweep-diag"];
    tl.add(el, { maskPosition: tw(path.from, path.to, 600, "inOutCubic") }, 0);
  }
  tl.add(
    words,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      ...(sweep ? { filter: tw("brightness(1.9)", "brightness(1)", 440, "outQuad") } : {})
    },
    partStagger(ctx, fitStep(words.length, 22, 240), 0, "first")
  );
  return tl;
};

export const GEN3_TEXT_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "text-iris-lines": irisLines,
  "text-tracking-settle": trackingSettle,
  "text-line-fold": lineFold,
  "text-wave-chars": waveChars,
  "text-arc-swing": arcSwing,
  "text-light-sweep": lightSweep
});
