/**
 * Icon pool (SPEC-random §3.8): reveals for `span.contact__icon` hosts and SVG icons.
 *
 * Effects:
 * - pulsar-beacon: the icon springs in while a glow disc pulses (twice on desktop, once compact).
 * - orbit-spin: spins into place inside a dashed orbit that tightens (desktop only).
 * - comet-flyby: flies in on a short comet path while its glare cools.
 *
 * Halos come from `useHalo`, which returns false on SVG hosts; those skip the
 * `--rv-ring-*` tweens. The legacy ring and twinkle effects stay in effects.ts.
 */

import type { EffectBuilder } from "../kit";
import { SPRING_POP, seq, sp, timeline, tw, useHalo } from "../kit";

/** The icon springs in while a disc pulses twice like a pulsar; one pulse when compact. */
const pulsarBeacon: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-s": sp(0.6, 1, SPRING_POP)
    },
    0
  );
  if (useHalo(el, "disc")) {
    tl.add(
      el,
      {
        "--rv-ring-o": ctx.compact
          ? seq(0, [
              [0.6, 160, "outQuad"],
              [0, 500, "inQuad"]
            ])
          : seq(0, [
              [0.7, 140, "outQuad"],
              [0, 220, "inQuad"],
              [0.5, 160, "outQuad"],
              [0, 300, "inQuad"]
            ]),
        "--rv-ring-s": tw(0.6, 1.4, 820, "outExpo")
      },
      0
    );
  }
  return tl;
};

/** The icon spins up into place inside a dashed orbit that tightens (no orbit when compact). */
const orbitSpin: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "outQuad"),
      "--rv-r": tw(ctx.compact ? "-90deg" : "-200deg", "0deg", 800, "outExpo"),
      "--rv-s": tw(0.4, 1, 700, "outBack(1.4)")
    },
    0
  );
  if (!ctx.compact && useHalo(el, "orbit")) {
    tl.add(
      el,
      {
        "--rv-ring-o": seq(0, [
          [0.8, 200, "outQuad"],
          [0, 500, "inQuad"]
        ]),
        "--rv-ring-s": tw(1.5, 1, 700, "outExpo"),
        "--rv-ring-r": tw("-120deg", "-18deg", 800, "outExpo")
      },
      0
    );
  }
  return tl;
};

/** The icon flies in on a short comet path while its blur and glare cool. */
const cometFlyby: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  return timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-x": tw(compact ? "-1rem" : "-2rem", "0rem", 640, "outExpo"),
      "--rv-y": tw(compact ? "0.5rem" : "0.875rem", "0rem", 640, "outExpo"),
      ...(ctx.lowFx
        ? {}
        : {
            filter: compact
              ? tw("brightness(1.6)", "brightness(1)", 480, "outQuad")
              : tw("blur(5px) brightness(2)", "blur(0px) brightness(1)", 560, "outQuart")
          })
    },
    0
  );
};

export const ICON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "pulsar-beacon": pulsarBeacon,
  "orbit-spin": orbitSpin,
  "comet-flyby": cometFlyby
});
