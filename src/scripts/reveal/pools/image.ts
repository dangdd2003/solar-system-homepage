/**
 * Image pool (SPEC-random §3.6): effects for the `img` portrait. An `img` has
 * no children and no pseudo-elements, so every tween targets the host itself.
 *
 * - singularity-iris: the portrait opens out of a point, like light escaping a black hole.
 * - gravitational-lens: the image is bent into focus, as if seen through a lensing mass.
 * - lunar-phase: a diagonal phase terminator sweeps across with a corona rim.
 *
 * The masks only show on desktop with a fine pointer (reveal.css), so every
 * effect also fades the host in: phones and touch screens get the fade alone.
 * The legacy eclipse and wipe-up effects are not pool members; they stay in effects.ts.
 */

import type { EffectBuilder } from "../kit";
import { MASK_PATHS, SPRING_SOFT, glow, sp, timeline, tw, useMask } from "../kit";

/** Host fade-in shared by every image effect. */
const FADE_MS = 260;

/** Iris opens from the centre; compact shortens the radius sweep and lowFx drops the filter. */
const singularityIris: EffectBuilder = (el, ctx) => {
  useMask(el, "iris");
  const tl = timeline(ctx);
  tl.set(el, { "--rv-mx": "50%", "--rv-my": "50%" }, 0);
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-mr": tw("-18%", "100%", ctx.compact ? 680 : 820, "outQuart"),
      "--rv-s": tw(1.12, 1, 900, "outExpo"),
      ...(ctx.lowFx
        ? {}
        : {
            filter: ctx.compact
              ? tw("brightness(1.4)", "brightness(1)", 600, "outQuad")
              : tw("blur(6px) brightness(1.6)", "blur(0px) brightness(1)", 800, "outQuart")
          })
    },
    0
  );
};

/** Focus pull: the portrait settles from a soft, over-scaled blur. Compact and lowFx drop the rotation and the filter. */
const gravitationalLens: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  if (ctx.compact || ctx.lowFx) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(0.85, 1, 700, "outExpo"),
        ...(ctx.lowFx ? {} : { filter: tw("blur(4px)", "blur(0px)", 600, "outQuart") })
      },
      0
    );
  }
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 360, "outQuad"),
      "--rv-s": sp(0.7, 1, SPRING_SOFT),
      "--rv-r": tw("-8deg", "0deg", 800, "outExpo"),
      filter: tw(
        "blur(10px) contrast(1.5) saturate(1.6)",
        "blur(0px) contrast(1) saturate(1)",
        760,
        "outQuart"
      )
    },
    0
  );
};

/** A diagonal terminator sweeps the portrait in; desktop adds a corona glow that fades out. */
const lunarPhase: EffectBuilder = (el, ctx) => {
  useMask(el, "sweep-diag");
  const path = MASK_PATHS["sweep-diag"];
  const tl = timeline(ctx);
  if (ctx.compact) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
        maskPosition: tw(path.from, path.to, 700, "outQuart")
      },
      0
    );
  }
  const acc = ctx.accentRgb;
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      maskPosition: tw(path.from, path.to, 880, "inOutCubic"),
      ...(ctx.lowFx
        ? {}
        : {
            filter: tw(
              `brightness(1.8) ${glow(acc, 18, 0.8)}`,
              `brightness(1) ${glow(acc, 0, 0)}`,
              900,
              "outQuad"
            )
          })
    },
    0
  );
};

export const IMAGE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "singularity-iris": singularityIris,
  "gravitational-lens": gravitationalLens,
  "lunar-phase": lunarPhase
});
