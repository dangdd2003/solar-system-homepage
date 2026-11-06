/**
 * Heading pool: the section `h2` (a `num` part plus a `[data-reveal-split]` title).
 *
 * - meteor-shower: letters streak in diagonally from the upper right, in random order.
 * - pulsar-wave: a pulse expands from the centre and letters pop with an accent glow.
 * - gravity-well: scattered letters are pulled into their slots, spinning.
 * - orbital-arc: each letter swings in on an arc around a low pivot.
 * - redshift: words decelerate in from the right, cooling from red to their colour.
 * - deep-space-signal: a faint transmission; letters flicker in like a received signal.
 *
 * Pieces are chars on desktop and words on compact (redshift is always words).
 * A heading with no pieces (links, nosplit, empty) falls back to hostReveal.
 */

import type { Timeline } from "animejs";
import {
  animateNum,
  fitStep,
  full,
  hash01,
  hostReveal,
  partStagger,
  readColor,
  seq,
  timeline,
  tw,
  type EffectBuilder,
  type EffectContext,
  type NumStyle
} from "../kit";
import { getSplit } from "../split";

/** Words on compact or for words-only effects, chars otherwise. */
function splitPieces(el: HTMLElement, ctx: EffectContext, wordsOnly = false): HTMLElement[] {
  if (ctx.compact || wordsOnly) return getSplit(el, "words").words;
  return getSplit(el, "chars").chars;
}

/** Starts the timeline: host visible, num animated, pieces hidden at 0. */
function open(el: HTMLElement, ctx: EffectContext, pieces: HTMLElement[], num: NumStyle): Timeline {
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  animateNum(tl, el, ctx, num);
  tl.set(pieces, { opacity: 0 }, 0);
  return tl;
}

const meteorShower: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const tl = open(el, ctx, pieces, "drop");
  const step = fitStep(pieces.length, ctx.compact ? 50 : 26, 360);
  tl.add(
    pieces,
    {
      opacity: tw(0, 1, 200, "outQuad"),
      x: tw(ctx.compact ? "0.5em" : "0.9em", "0em", 560, "outExpo"),
      y: tw("-1.1em", "0em", 560, "outExpo"),
      filter: ctx.compact
        ? tw("brightness(1.8)", "brightness(1)", 420, "outQuad")
        : tw(
            ctx.lowFx ? "brightness(2)" : "blur(3px) brightness(2)",
            ctx.lowFx ? "brightness(1)" : "blur(0px) brightness(1)",
            480,
            "outQuart"
          )
    },
    partStagger(ctx, step, 60, "random")
  );
  return tl;
};

const pulsarWave: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const tl = open(el, ctx, pieces, "flash");
  const acc = ctx.accentRgb;
  const step = fitStep(pieces.length, ctx.compact ? 60 : 30, 340);
  tl.add(
    pieces,
    {
      opacity: tw(0, 1, 180, "outQuad"),
      scale: tw(0.2, 1, 520, "outBack(1.6)"),
      textShadow: tw(
        `0px 0px 16px rgba(${acc}, 0.95)`,
        `0px 0px 0px rgba(${acc}, 0)`,
        600,
        "outQuad"
      )
    },
    partStagger(ctx, step, 40, "center")
  );
  return tl;
};

const gravityWell: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const c = full(ctx);
  const tl = open(el, ctx, pieces, "pop");
  // Compact words sit near the phone edges, so the x scatter is halved (max +/-1em).
  const spreadX = ctx.compact ? 2 : 3.2;
  const spreadY = (ctx.compact ? 0.8 : 1) * 2.4;
  const offset =
    (span: number, salt: number) =>
    (_t: unknown, i = 0) =>
      `${((hash01(c.seed, i + salt) - 0.5) * span).toFixed(2)}em`;
  tl.add(
    pieces,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      x: { from: offset(spreadX, 0), to: "0em", duration: 700, ease: "outCirc" },
      y: { from: offset(spreadY, 101), to: "0em", duration: 700, ease: "outCirc" },
      ...(ctx.compact
        ? {}
        : {
            rotate: {
              from: (_t: unknown, i = 0) => Math.round((hash01(c.seed, i + 202) - 0.5) * 120),
              to: 0,
              duration: 700,
              ease: "outCirc"
            }
          }),
      scale: tw(0.4, 1, 700, "outCirc")
    },
    partStagger(ctx, fitStep(pieces.length, 20, 240), 40)
  );
  return tl;
};

const orbitalArc: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const tl = open(el, ctx, pieces, "spin");
  tl.set(pieces, { transformOrigin: ctx.compact ? "50% 200%" : "50% 260%" }, 0);
  tl.add(
    pieces,
    {
      rotate: tw(ctx.compact ? -25 : -70, 0, 620, "outExpo"),
      opacity: tw(0, 1, 240, "outQuad"),
      filter: tw("brightness(1.8)", "brightness(1)", 500, "outQuad")
    },
    partStagger(ctx, fitStep(pieces.length, ctx.compact ? 60 : 28, 320), 40, "first")
  );
  return tl;
};

const redshift: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx, true);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const tl = open(el, ctx, pieces, "drop");
  const target = readColor(pieces[0] ?? el);
  tl.add(
    pieces,
    {
      color: tw("rgb(255, 92, 64)", target, 700, "outQuad"),
      x: tw(ctx.compact ? "0.6em" : "1.2em", "0em", 700, "outExpo"),
      opacity: tw(0, 1, 300, "outQuad"),
      ...(ctx.compact || ctx.lowFx ? {} : { filter: tw("blur(4px)", "blur(0px)", 500, "outQuart") })
    },
    partStagger(ctx, fitStep(pieces.length, 70, 260), 40, "first")
  );
  return tl;
};

const deepSpaceSignal: EffectBuilder = (el, ctx) => {
  const pieces = splitPieces(el, ctx);
  if (pieces.length === 0) return hostReveal(el, ctx);
  const tl = open(el, ctx, pieces, "flash");
  tl.add(
    pieces,
    {
      opacity: seq(0, [
        [1, 80, "linear"],
        [0.2, 80, "linear"],
        [1, 120, "outQuad"]
      ]),
      filter: ctx.compact
        ? tw("brightness(2)", "brightness(1)", 360, "outQuad")
        : tw(
            ctx.lowFx ? "brightness(2.4)" : "blur(2px) brightness(2.4)",
            ctx.lowFx ? "brightness(1)" : "blur(0px) brightness(1)",
            420,
            "outQuart"
          )
    },
    partStagger(ctx, fitStep(pieces.length, ctx.compact ? 50 : 24, 420), 40, "random")
  );
  return tl;
};

export const HEADING_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "meteor-shower": meteorShower,
  "pulsar-wave": pulsarWave,
  "gravity-well": gravityWell,
  "orbital-arc": orbitalArc,
  redshift,
  "deep-space-signal": deepSpaceSignal
});
