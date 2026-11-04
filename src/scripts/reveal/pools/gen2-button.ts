/**
 * Gen2 Button pool effects (council design).
 *
 * Effects:
 * - button-press-in: settling with a subtle scale-up and temporary shadow pop.
 * - button-thruster: upward thruster launch settling with soft overshoot.
 * - button-dock-slide: sliding in laterally like docking clamps.
 * - button-tick-scale: mechanical two-step scale latch.
 * - button-ripple-once: single expanding accent ring expanding outward on landing.
 */

import { full, seq, timeline, tw, type EffectBuilder } from "../kit";

const buttonPressIn: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 380, "outQuad"),
        "--rv-s": tw(0.96, 1, 380, "outQuad")
      },
      0
    );
    return tl;
  }

  tl.set(el, { "--rv-edge": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      "--rv-s": tw(0.96, 1, 380, "outQuad"),
      "--rv-edge": seq(0, [
        [0.35, 220, "outQuad"],
        [0, 220, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

const buttonThruster: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-y": tw(compact ? "0.6em" : "1.2em", "0em", 520, "outBack(1.3)")
    },
    0
  );
  return tl;
};

const buttonDockSlide: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const sign = c.side !== 0 ? c.side : c.index % 2 === 0 ? 1 : -1;
  const xDist = compact ? `${sign * 0.5}em` : `${sign * 1.2}em`;

  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 240, "outQuad"),
      "--rv-x": tw(xDist, "0em", 560, "outExpo")
    },
    0
  );
  return tl;
};

const buttonTickScale: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);

  if (compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 200, "linear"),
        "--rv-s": tw(0.9, 1, 300, "outQuad")
      },
      0
    );
    return tl;
  }

  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "linear"),
      "--rv-s": seq(0.8, [
        [1.06, 300, "outBack(1.6)"],
        [1, 160, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

const buttonRippleOnce: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  if (compact) return buttonPressIn(el, ctx);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-edge": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-s": tw(0.96, 1, 380, "outQuad"),
      "--rv-edge": seq(0, [
        [0.4, 260, "outQuad"],
        [0, 260, "outQuad"]
      ])
    },
    0
  );

  return tl;
};

export const GEN2_BUTTON_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "button-press-in": buttonPressIn,
  "button-thruster": buttonThruster,
  "button-dock-slide": buttonDockSlide,
  "button-tick-scale": buttonTickScale,
  "button-ripple-once": buttonRippleOnce
});
