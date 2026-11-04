/**
 * Timeline pool (SPEC-random §3.10): the About biography track.
 *
 * Host `.about__track` holds a `rail` part (the vertical line) and `star`
 * parts (the `li` stops, whose `::before` dot reads --rv-dot and --rv-dot-glow).
 *
 * - comet-chain: a comet head runs down the rail and ignites each stop as it passes.
 * - pulsar-sequence: the track blinks on, then each stop pulses twice in the rolled order.
 * - meteor-rain: the rail grows up from the bottom while the stops fall into place in random order.
 *
 * With neither a rail nor stars, every builder falls back to hostReveal.
 */

import type { Timeline } from "animejs";
import type { EffectBuilder, EffectContext } from "../kit";
import { fitStep, hostReveal, part, parts, partStagger, seq, timeline, tw } from "../kit";

/** Host visible; stars start dark with their dot and glow at zero. */
function open(el: HTMLElement, ctx: EffectContext, stars: HTMLElement[]): Timeline {
  const tl = timeline(ctx).set(el, { "--rv-o": 1 }, 0);
  if (stars.length > 0) {
    tl.set(stars, { opacity: 0, "--rv-dot": 0, "--rv-dot-glow": 0 }, 0);
  }
  return tl;
}

/** A comet head runs down the rail and ignites each stop as it passes. */
const cometChain: EffectBuilder = (el, ctx) => {
  const rail = part(el, "rail");
  const stars = parts(el, "star");
  if (!rail && stars.length === 0) return hostReveal(el, ctx);

  const tl = open(el, ctx, stars);
  if (rail) {
    tl.set(rail, { transformOrigin: "50% 0%" }, 0).add(
      rail,
      {
        scaleY: tw(0, 1, 780, "inOutQuad"),
        ...(ctx.compact || ctx.lowFx
          ? {}
          : { filter: tw("brightness(2.2)", "brightness(1)", 900, "outQuad") })
      },
      0
    );
  }
  if (stars.length > 0) {
    tl.add(
      stars,
      {
        opacity: tw(0, 1, 280, "outQuad"),
        x: tw(ctx.compact ? 12 : 18, 0, 420, "outExpo"),
        "--rv-dot": seq(0, [
          [1.8, 160, "outQuad"],
          [1, 220, "inOutQuad"]
        ]),
        "--rv-dot-glow": seq(0, [
          [12, 160, "outQuad"],
          [0, 260, "inQuad"]
        ])
      },
      partStagger(ctx, fitStep(stars.length, 140, 400), 100, "first")
    );
  }
  return tl;
};

/** The track blinks on, then each stop pulses twice in the rolled order. */
const pulsarSequence: EffectBuilder = (el, ctx) => {
  const rail = part(el, "rail");
  const stars = parts(el, "star");
  if (!rail && stars.length === 0) return hostReveal(el, ctx);

  const tl = open(el, ctx, stars);
  if (rail) {
    tl.set(rail, { transformOrigin: "50% 50%" }, 0).add(
      rail,
      {
        opacity: tw(0, 1, 300, "outQuad"),
        scaleY: tw(0.6, 1, 600, "outExpo")
      },
      0
    );
  }
  if (stars.length > 0) {
    tl.add(
      stars,
      {
        opacity: tw(0, 1, 240, "outQuad"),
        ...(ctx.compact ? {} : { scale: tw(0.92, 1, 400, "outBack(1.4)") }),
        "--rv-dot": seq(0, [
          [2, 140, "outQuad"],
          [0.7, 140, "inOutQuad"],
          [1.3, 120, "outQuad"],
          [1, 120, "inOutQuad"]
        ]),
        "--rv-dot-glow": seq(0, [
          [14, 140, "outQuad"],
          [2, 140, "inQuad"],
          [8, 120, "outQuad"],
          [0, 120, "inQuad"]
        ])
      },
      partStagger(ctx, fitStep(stars.length, 90, 360), 60)
    );
  }
  return tl;
};

/** The rail grows up from the bottom while the stops fall into place in random order. */
const meteorRain: EffectBuilder = (el, ctx) => {
  const rail = part(el, "rail");
  const stars = parts(el, "star");
  if (!rail && stars.length === 0) return hostReveal(el, ctx);

  const tl = open(el, ctx, stars);
  if (rail) {
    tl.set(rail, { transformOrigin: "50% 100%" }, 0).add(
      rail,
      { scaleY: tw(0, 1, 640, "outQuart") },
      0
    );
  }
  if (stars.length > 0) {
    tl.add(
      stars,
      {
        opacity: tw(0, 1, 240, "outQuad"),
        y: tw(ctx.compact ? -10 : -18, 0, 520, "outBack(1.2)"),
        ...(ctx.compact || ctx.lowFx
          ? {}
          : { filter: tw("blur(3px)", "blur(0px)", 420, "outQuart") }),
        "--rv-dot": seq(0, [
          [1.5, 180, "outQuad"],
          [1, 240, "inOutQuad"]
        ]),
        "--rv-dot-glow": seq(0, [
          [10, 180, "outQuad"],
          [0, 240, "inQuad"]
        ])
      },
      partStagger(ctx, fitStep(stars.length, 80, 360), 40, "random")
    );
  }
  return tl;
};

export const TIMELINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "comet-chain": cometChain,
  "pulsar-sequence": pulsarSequence,
  "meteor-rain": meteorRain
});
