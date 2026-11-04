import type { AnimationParams } from "animejs";
/**
 * Gen3 Heading pool effects.
 *
 * Effects:
 * - nebula-bleed-in: words bloom out of a soft blur while scaling down onto the baseline.
 * - star-chart-plot: letters plot in as small dots that expand into their glyphs in order.
 * - event-horizon-slice: each word opens from a thin horizontal slit while rising from below.
 * - solar-flare-ink: a left-to-right brightness flare settles while the tracking tightens (no brightness under lowFx).
 * - comet-tail-track: words stretch like a comet tail and resolve with a skew that eases out.
 * - orbital-kerning: letters swing in from a spread, orbiting their landing cells.
 *
 * All pieces come from getSplit; a heading without pieces (links, nosplit, empty) falls back
 * to a host fade-up. Every timeline finishes within 1000ms of its delay.
 */

import { fitStep, full, partStagger, timeline, tw, type EffectBuilder } from "../kit";
import { getSplit } from "../split";

/** Host fade-up used when the heading has no split pieces. */
const fallbackFade: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 360, "outQuad"),
      "--rv-y": tw(compact ? "0.5rem" : "0.875rem", "0rem", 420, "outQuad")
    },
    0
  );
  return tl;
};

/** Words of a heading, or an empty list when splitting is unavailable. */
function wordsOf(el: HTMLElement): HTMLElement[] {
  return getSplit(el, "words").words;
}

/** Characters of a heading, falling back to words when chars cannot be split. */
function glyphsOf(el: HTMLElement): HTMLElement[] {
  const chars = getSplit(el, "chars").chars;
  return chars.length > 0 ? chars : wordsOf(el);
}

const nebulaBleedIn: EffectBuilder = (el, ctx) => {
  const words = wordsOf(el);
  if (words.length === 0) return fallbackFade(el, ctx);

  const c = full(ctx);
  const compact = ctx.compact;
  const blurOn = !ctx.lowFx;
  const scaleFrom = compact ? 1.04 : 1.12;
  const travel = compact ? "0.12em" : "0.3em";

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  const initial: AnimationParams = {
    opacity: 0,
    scale: scaleFrom,
    y: travel
  };
  if (blurOn) initial.filter = "blur(12px)";
  tl.set(words, initial, 0);

  const step = fitStep(words.length, 50, 260);
  const pos = partStagger(ctx, step, 0, c.pattern);

  const motion: AnimationParams = {
    opacity: tw(0, 1, 520, "outQuad"),
    scale: tw(scaleFrom, 1, 620, "outExpo"),
    y: tw(travel, "0em", 620, "outExpo")
  };
  if (blurOn) motion.filter = tw("blur(12px)", "blur(0px)", 520, "outQuad");
  tl.add(words, motion, pos);

  return tl;
};

const starChartPlot: EffectBuilder = (el, ctx) => {
  const glyphs = glyphsOf(el);
  if (glyphs.length === 0) return fallbackFade(el, ctx);

  const c = full(ctx);
  const compact = ctx.compact;
  const dotScale = compact ? 0.4 : 0.2;

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(glyphs, { opacity: 0, scale: dotScale }, 0);

  const step = fitStep(glyphs.length, 25, 300);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    glyphs,
    {
      opacity: tw(0, 1, 240, "outQuad"),
      scale: tw(dotScale, 1, 460, "outBack(1.4)")
    },
    pos
  );

  return tl;
};

const eventHorizonSlice: EffectBuilder = (el, ctx) => {
  const words = wordsOf(el);
  if (words.length === 0) return fallbackFade(el, ctx);

  const c = full(ctx);
  const compact = ctx.compact;
  const travel = compact ? "0.08em" : "0.15em";

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(words, { opacity: 0, clipPath: "inset(50% 0% 50% 0%)", y: travel }, 0);

  const step = fitStep(words.length, 40, 280);
  const pos = partStagger(ctx, step, 0, c.pattern);

  // The slit ends on a padded inset, not inset(0%): glyph ink (descenders, accents, italic
  // overhang) reaches past the piece box, and an inset(0%) clip would cut it off, then pop
  // when the engine reverts the clip at DONE. The padding is far larger than any overhang,
  // so the clip is visually absent at rest.
  tl.add(
    words,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      clipPath: tw("inset(50% 0% 50% 0%)", "inset(-50% -15% -50% -15%)", 620, "inOutQuart"),
      y: tw(travel, "0em", 620, "outExpo")
    },
    pos
  );

  return tl;
};

/** A computed CSS length in px, or the fallback when it is missing or "normal". */
function pxOf(value: string, fallback: number): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

const solarFlareInk: EffectBuilder = (el, ctx) => {
  const words = wordsOf(el);
  if (words.length === 0) return fallbackFade(el, ctx);

  const compact = ctx.compact;
  const flare = compact ? "brightness(1.8)" : "brightness(2.2)";
  // Headings rest on their own tracking (h1-h3 use a negative letter-spacing), so the
  // sweep is measured from that resting value. Ending on a fixed 0em would jump at DONE.
  const cs = getComputedStyle(el);
  const rest = pxOf(cs.letterSpacing, 0);
  const font = pxOf(cs.fontSize, 16);
  const track = `${Number(((rest + font * (compact ? 0.03 : 0.06)) / 16).toFixed(4))}rem`;
  const restTrack = `${Number((rest / 16).toFixed(4))}rem`;

  const flareOn = !ctx.lowFx;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  const initial: AnimationParams = { opacity: 0, letterSpacing: track };
  if (flareOn) initial.filter = flare;
  tl.set(words, initial, 0);

  // The flare always sweeps left to right, whatever the rolled pattern is.
  const step = fitStep(words.length, 30, 300);
  const pos = partStagger(ctx, step, 0, "first");

  const motion: AnimationParams = {
    opacity: tw(0, 1, 260, "outQuad"),
    letterSpacing: tw(track, restTrack, 480, "outQuart")
  };
  if (flareOn) motion.filter = tw(flare, "brightness(1)", 480, "outQuart");
  tl.add(words, motion, pos);

  return tl;
};

const cometTailTrack: EffectBuilder = (el, ctx) => {
  const words = wordsOf(el);
  if (words.length === 0) return fallbackFade(el, ctx);

  const c = full(ctx);
  const compact = ctx.compact;

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  if (compact) {
    // Phones keep only the translate half of the comet trail.
    tl.set(words, { opacity: 0, x: "-0.2em" }, 0);
    const step = fitStep(words.length, 50, 300);
    const pos = partStagger(ctx, step, 0, c.pattern);
    tl.add(
      words,
      {
        opacity: tw(0, 1, 360, "outQuad"),
        x: tw("-0.2em", "0em", 440, "outQuart")
      },
      pos
    );
    return tl;
  }

  tl.set(
    words,
    {
      opacity: 0,
      transformOrigin: "0% 50%",
      scaleX: 1.6,
      skewX: "-12deg",
      x: "-0.4em"
    },
    0
  );

  const step = fitStep(words.length, 60, 320);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    words,
    {
      opacity: tw(0, 1, 320, "outQuad"),
      scaleX: tw(1.6, 1, 520, "outQuart"),
      skewX: tw("-12deg", "0deg", 520, "outQuart"),
      x: tw("-0.4em", "0em", 520, "outQuart")
    },
    pos
  );

  return tl;
};

const orbitalKerning: EffectBuilder = (el, ctx) => {
  const glyphs = glyphsOf(el);
  if (glyphs.length === 0) return fallbackFade(el, ctx);

  const c = full(ctx);
  const compact = ctx.compact;
  const spread = compact ? "0.3em" : "0.6em";
  const swing = compact ? "-10deg" : "-22deg";

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(
    glyphs,
    {
      opacity: 0,
      x: spread,
      rotate: swing,
      transformOrigin: "50% 250%"
    },
    0
  );

  const step = fitStep(glyphs.length, 40, 320);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    glyphs,
    {
      opacity: tw(0, 1, 300, "outQuad"),
      x: tw(spread, "0em", 560, "outCubic"),
      rotate: tw(swing, "0deg", 560, "outCubic")
    },
    pos
  );

  return tl;
};

export const GEN3_HEADING_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "nebula-bleed-in": nebulaBleedIn,
  "star-chart-plot": starChartPlot,
  "event-horizon-slice": eventHorizonSlice,
  "solar-flare-ink": solarFlareInk,
  "comet-tail-track": cometTailTrack,
  "orbital-kerning": orbitalKerning
});
