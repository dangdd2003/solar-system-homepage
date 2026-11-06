/**
 * Footer pool (SPEC-random §3.12): the panel footer line and its heart.
 *
 * Effects:
 * - heartbeat-pulsar: the line settles up, the heart double-beats with a pink glow.
 * - cosmic-dust: a dust mask sweeps across the line, then the heart pops in.
 *
 * Both animate the host alone when the footer has no `heart` part.
 */

import type { EffectBuilder } from "../kit";
import { MASK_PATHS, part, seq, shadow, timeline, tw, useMask } from "../kit";

/** Pink glow colour for the heartbeat. */
const HEART_RGB = "255, 105, 135";

const heartbeatPulsar: EffectBuilder = (el, ctx) => {
  const heart = part(el, "heart");
  const tl = timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 500, "outQuad"),
      "--rv-y": tw("0.375rem", "0rem", 700, "outExpo")
    },
    0
  );
  if (heart) {
    const beat = {
      scale: seq(1, [
        [1.3, 140, "outQuad"],
        [1, 160, "inOutQuad"],
        [1.2, 120, "outQuad"],
        [1, 220, "outBack(2)"]
      ])
    };
    tl.add(
      heart,
      ctx.compact || ctx.lowFx
        ? beat
        : {
            ...beat,
            filter: tw(
              shadow(HEART_RGB, 0, 0, 8, 0.9),
              shadow(HEART_RGB, 0, 0, 0, 0),
              640,
              "outQuad"
            )
          },
      300
    );
  }
  return tl;
};

const cosmicDust: EffectBuilder = (el, ctx) => {
  const heart = part(el, "heart");
  const { from, to } = MASK_PATHS["sweep-right"];
  useMask(el, "sweep-right");
  // The mask only shows on desktop with a fine pointer, so the host fades in too.
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      maskPosition: tw(from, to, ctx.compact ? 640 : 800, "outQuart"),
      ...(ctx.compact || ctx.lowFx
        ? {}
        : { filter: tw("brightness(1.6)", "brightness(1)", 800, "outQuad") })
    },
    0
  );
  if (heart) {
    tl.set(heart, { scale: 0 }, 0).add(
      heart,
      {
        scale: tw(0, 1, 450, "outBack(2)"),
        rotate: tw(-20, 0, 450, "outExpo")
      },
      400
    );
  }
  return tl;
};

export const FOOTER_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "heartbeat-pulsar": heartbeatPulsar,
  "cosmic-dust": cosmicDust
});
