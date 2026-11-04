/**
 * Button pool (SPEC-random §3.7). Host-only effects: `.btn::before` and the
 * hover transforms are left alone, so nothing here targets parts.
 *
 * - thruster-ignition: launches up on a warm exhaust flame, squash-and-stretch.
 * - docking-sequence: slides in from its side and docks with a soft spring.
 * - quasar-flash: a brilliant quasar flash, then the button resolves.
 *
 * The legacy gravity and zoom-in builders stay in effects.ts.
 */

import type { AnimationParams, Timeline } from "animejs";
import {
  D,
  glow,
  px,
  shadow,
  sp,
  SPRING_GRAVITY,
  SPRING_SOFT,
  timeline,
  tw,
  type EffectBuilder
} from "../kit";

/** Rises from below on a warm flame, stretching then squashing into place. */
const thrusterIgnition: EffectBuilder = (el, ctx) => {
  const tl: Timeline = timeline(ctx);
  tl.set(el, { transformOrigin: "50% 100%" }, 0);
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 240, "outQuad"),
    "--rv-y": tw(px((ctx.compact ? 1.4 : 1.8) * D(ctx)), "0rem", 760, "outExpo"),
    "--rv-sy": sp(1.18, 1, SPRING_GRAVITY),
    "--rv-sx": sp(0.9, 1, SPRING_GRAVITY)
  };
  // The exhaust glow is a drop-shadow (blur): skipped in compact and low-effects profiles.
  if (!ctx.compact && !ctx.lowFx) {
    params.filter = tw(
      shadow("255, 170, 90", 0, 10, 14, 0.85),
      shadow("255, 170, 90", 0, 0, 0, 0),
      800,
      "outQuad"
    );
  }
  return tl.add(el, params, 0);
};

/** Slides in from its side with a brief counter-tilt and docks with a soft spring. */
const dockingSequence: EffectBuilder = (el, ctx) => {
  const s = ctx.side || -1;
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 300, "outQuad"),
    "--rv-x": sp(px(s * (ctx.compact ? 24 : 48)), "0rem", SPRING_SOFT)
  };
  params.filter = tw("brightness(1.6)", "brightness(1)", 600, "outQuad");
  if (!ctx.compact) {
    params["--rv-r"] = tw(`${-s * 4}deg`, "0deg", 700, "outExpo");
  }
  return timeline(ctx).add(el, params, 0);
};

/** A brilliant quasar flash that grows in, then resolves to the resting button. */
const quasarFlash: EffectBuilder = (el, ctx) => {
  const acc = ctx.accentRgb;
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 120, "linear"),
    "--rv-s": tw(0.7, 1, 520, "outBack(2)")
  };
  // The accent glow is a drop-shadow (blur): low-effects profiles keep only the brightness.
  params.filter = ctx.compact
    ? tw("brightness(2)", "brightness(1)", 500, "outQuad")
    : ctx.lowFx
      ? tw("brightness(2.6)", "brightness(1)", 700, "outQuart")
      : tw(
          `brightness(2.6) ${glow(acc, 22, 0.9)}`,
          `brightness(1) ${glow(acc, 0, 0)}`,
          700,
          "outQuart"
        );
  return timeline(ctx).add(el, params, 0);
};

export const BUTTON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "thruster-ignition": thrusterIgnition,
  "docking-sequence": dockingSequence,
  "quasar-flash": quasarFlash
});
