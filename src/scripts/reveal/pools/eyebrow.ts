/**
 * Eyebrow / subtitle pool (SPEC-random §3.9): short single-line labels.
 *
 * Effects:
 * - transmission: the label types itself out, char by char (words on compact),
 *   with a brief brightness flare on the host as the signal locks.
 * - aurora-sweep: an aurora band sweeps across the label and leaves it lit,
 *   drifting in from the side the panel's planet sits on.
 *
 * The hero eyebrow holds the greeting rotator and carries `data-reveal-nosplit`,
 * so text splitting returns no pieces there and transmission falls back to the
 * legacy fade. The legacy fade entries (fade, fade-left, fade-right) live in
 * effects.ts and are not part of this pool.
 */

import {
  fitStep,
  hostFade,
  MASK_PATHS,
  partStagger,
  timeline,
  tw,
  useMask,
  type EffectBuilder
} from "../kit";
import { getSplit } from "../split";

/** Chars (words on compact) type in on a stagger; the host flares as the signal locks. */
const transmission: EffectBuilder = (el, ctx) => {
  const pieces = ctx.compact ? getSplit(el, "words").words : getSplit(el, "chars").chars;
  if (pieces.length === 0) return hostFade(el, ctx);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(pieces, { opacity: 0 }, 0);
  tl.add(
    pieces,
    { opacity: tw(0, 1, 60, "linear") },
    partStagger(ctx, fitStep(pieces.length, ctx.compact ? 60 : 30, 600), 0, "first")
  );
  if (!ctx.compact) {
    tl.add(el, { filter: tw("brightness(1.6)", "brightness(1)", 700, "outQuad") }, 0);
  }
  return tl;
};

/** An aurora band sweeps across the label from the planet's side and leaves it lit. */
const auroraSweep: EffectBuilder = (el, ctx) => {
  const shape = ctx.side > 0 ? "sweep-left" : "sweep-right";
  useMask(el, shape);
  const travel = MASK_PATHS[shape];

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.add(
    el,
    {
      maskPosition: tw(travel.from, travel.to, 760, "outQuart"),
      "--rv-x": tw(ctx.side > 0 ? "0.375rem" : "-0.375rem", "0rem", 760, "outExpo")
    },
    0
  );
  if (!ctx.compact) {
    tl.add(
      el,
      {
        filter: tw("brightness(1.6) saturate(1.8)", "brightness(1) saturate(1)", 760, "outQuad")
      },
      0
    );
  }
  return tl;
};

export const EYEBROW_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  transmission,
  "aurora-sweep": auroraSweep
});
