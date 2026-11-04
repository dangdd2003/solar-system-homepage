/**
 * Gen2 Heading pool effects (council design).
 *
 * Effects:
 * - ticker-underline: words rise in reading order while a 1px rule draws underneath.
 * - orbit-sweep: accent rule sweeps from origin, then title lifts into place.
 * - word-fold-in: 3D folding words with rotateX hinge.
 * - word-rise: clean baseline lift for split words.
 * - num-roll: numeric roll of section number while title slides in.
 */

import { fitStep, full, part, partStagger, timeline, tw, type EffectBuilder } from "../kit";
import { getSplit } from "../split";

const tickerUnderline: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const parts = getSplit(el, "words");
  const words = parts.words;

  if (words.length === 0) {
    const tl = timeline(ctx);
    tl.set(el, { "--rv-ux": 1 }, 0);
    tl.add(
      el,
      { "--rv-o": tw(0, 1, 420, "outQuad"), "--rv-y": tw("0.5rem", "0rem", 420, "outQuad") },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1, "--rv-ux": compact ? 1 : 0 }, 0);
  tl.set(words, { opacity: 0, y: compact ? "0.5rem" : "0.625rem" }, 0);

  const step = fitStep(words.length, 40, 240);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    words,
    {
      opacity: tw(0, 1, 520, "outQuad"),
      y: tw(compact ? "0.5rem" : "0.625rem", "0rem", 520, "outQuad")
    },
    pos
  );

  if (!compact) {
    tl.add(el, { "--rv-ux": tw(0, 1, 620, "outQuart") }, 240);
  }

  return tl;
};

const orbitSweep: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-ux": compact ? 1 : 0 }, 0);

  if (!compact) {
    tl.add(el, { "--rv-ux": tw(0, 1, 560, "outQuart") }, 0);
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw("0.5rem", "0rem", 420, "outQuad")
    },
    compact ? 0 : 160
  );

  return tl;
};

const wordFoldIn: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const parts = getSplit(el, "words");
  const words = parts.words;

  if (compact || words.length === 0) {
    return wordRise(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(
    words,
    { opacity: 0, perspective: "37.5rem", rotateX: "-70deg", transformOrigin: "50% 100%" },
    0
  );

  const step = fitStep(words.length, 35, 360);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    words,
    {
      opacity: tw(0, 1, 480, "outQuad"),
      rotateX: tw("-70deg", "0deg", 480, "outBack(1.2)")
    },
    pos
  );

  return tl;
};

const wordRise: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const parts = getSplit(el, "words");
  const words = parts.words;

  if (words.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      { "--rv-o": tw(0, 1, 360, "outQuad"), "--rv-y": tw("0.5rem", "0rem", 360, "outExpo") },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  tl.set(words, { opacity: 0, y: compact ? "0.5rem" : "0.4em" }, 0);

  const step = fitStep(words.length, 40, 360);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    words,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      y: tw(compact ? "0.5rem" : "0.4em", "0rem", 360, "outExpo")
    },
    pos
  );

  return tl;
};

/** The section number as authored, kept so a roll that was reverted mid-count can restart. */
const numOriginals = new WeakMap<HTMLElement, string>();

const numRoll: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const numEl = part(el, "num") ?? el.querySelector<HTMLElement>(".section__num");

  const tl = timeline(ctx);

  if (numEl) {
    const originalText = numOriginals.get(numEl) ?? numEl.textContent ?? "";
    numOriginals.set(numEl, originalText);
    numEl.textContent = originalText;
    const match = originalText.match(/^\s*(\d{1,2})\.(\s*)$/);
    if (match) {
      const targetNum = parseInt(match[1]!, 10);
      const suffix = `.${match[2] ?? ""}`;
      const counter = { val: 0 };

      tl.add(
        counter,
        {
          val: targetNum,
          duration: compact ? 240 : 320,
          ease: "outExpo",
          onUpdate: () => {
            const current = Math.round(counter.val);
            numEl.textContent = `${String(current).padStart(2, "0")}${suffix}`;
          },
          onComplete: () => {
            numEl.textContent = originalText;
          }
        },
        0
      );
    }
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 360, "outQuad"),
      "--rv-x": tw(compact ? "0em" : "-0.6em", "0em", 560, "outExpo")
    },
    0
  );

  return tl;
};

export const GEN2_HEADING_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "ticker-underline": tickerUnderline,
  "orbit-sweep": orbitSweep,
  "word-fold-in": wordFoldIn,
  "word-rise": wordRise,
  "num-roll": numRoll
});
