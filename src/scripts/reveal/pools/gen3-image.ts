/**
 * Gen3 Image pool effects. The portrait is an `img` with no children, so every
 * tween targets the host itself through --rv-* vars, `filter` or `maskPosition`.
 *
 * Effects:
 * - image-corner-aperture: an iris opens from the top-left corner while the portrait turns into place.
 * - image-eclipse-exit: a moon-shaped occluder slides off the portrait, revealing it behind.
 * - image-chroma-bloom: colour returns from grayscale with a brightness bloom that settles.
 * - image-arc-swing: the portrait swings in along a curved path and lands with a small overshoot.
 * - image-squash-settle: a stretched portrait springs back to its true proportions.
 * - image-curtain-drop: a vertical sweep drops the portrait in with a brightness flash.
 *
 * Masks render only on desktop fine-pointer viewports (reveal.css), so every
 * effect keeps a mask-free path for phones and touch screens.
 *
 * Integration constraint: a mask clips everything outside the border box, so
 * image-corner-aperture, image-eclipse-exit and image-curtain-drop hide any
 * outer box-shadow on the host until data-reveal-done removes the mask. Wire
 * these to an @image host whose outer shadow lives on a wrapper (or accept the
 * shadow popping in at DONE). The About portrait (.about__portrait,
 * box-shadow: var(--glass-shadow)) is affected today.
 *
 * Staging: this pool is not yet referenced by effects.ts, pools.ts or
 * catalog.ts. Until those are wired, the six names are unreachable at runtime.
 */

import type { Timeline } from "animejs";
import {
  MASK_PATHS,
  SPRING_POP,
  full,
  px,
  seq,
  sp,
  timeline,
  tw,
  useMask,
  type EffectBuilder
} from "../kit";

/** Opacity ramp shared by every image effect. */
const FADE_MS = 340;

/** Initial host state: sets each var to its first tween's from-value, so there is no jump at start. */
function primeHost(tl: Timeline, el: HTMLElement, start: Record<string, number | string>): void {
  tl.set(el, start, 0);
}

/** An iris opens from the top-left corner (not the centre, unlike singularity-iris) while the portrait turns into place. */
const cornerAperture: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  if (ctx.compact) {
    primeHost(tl, el, { "--rv-o": 0, "--rv-s": 1.04 });
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
        "--rv-s": tw(1.04, 1, 680, "outExpo")
      },
      0
    );
  }
  useMask(el, "iris");
  primeHost(tl, el, {
    "--rv-o": 0,
    "--rv-mx": "0%",
    "--rv-my": "0%",
    "--rv-mr": "-18%",
    "--rv-r": "-14deg"
  });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-mr": tw("-18%", "100%", 860, "outQuart"),
      "--rv-r": tw("-14deg", "0deg", 900, "outExpo")
    },
    0
  );
};

/** A moon-shaped occluder sits over the portrait and slides off to the right, so the portrait is revealed behind it. */
const eclipseExit: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  if (ctx.compact) {
    primeHost(tl, el, { "--rv-o": 0, "--rv-s": 1.05 });
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
        "--rv-s": tw(1.05, 1, 760, "outQuart")
      },
      0
    );
  }
  useMask(el, "moon");
  primeHost(tl, el, { "--rv-o": 0, "--rv-s": 1.05, "--rv-mx": "50%" });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-mx": tw("50%", "160%", 900, "inOutCubic"),
      "--rv-s": tw(1.05, 1, 900, "outQuart")
    },
    0
  );
};

/** Colour returns from grayscale with a brightness bloom; lowFx keeps only the brightness flash. */
const chromaBloom: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const lowFx = Boolean(ctx.lowFx);
  // grayscale(1) already equals saturate(0), so one colour primitive is enough
  // and keeps the per-frame filter chain short.
  const from = lowFx ? "brightness(1.6)" : "grayscale(1) brightness(1.4)";
  const to = lowFx ? "brightness(1)" : "grayscale(0) brightness(1)";
  const dur = ctx.compact ? 620 : 900;
  primeHost(tl, el, { "--rv-o": 0, "--rv-s": 1.03, filter: from });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-s": tw(1.03, 1, dur, "outQuart"),
      filter: tw(from, to, lowFx ? 700 : dur, "outQuart")
    },
    0
  );
};

/** The portrait swings in along a curve: it overshoots the rest point sideways, then settles, with a small rotation on desktop. */
const arcSwing: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const sign = c.side !== 0 ? c.side : 1;
  const reach = ctx.compact ? 12 : 26;
  const start = px(-sign * reach);
  const overshoot = px(sign * reach * 0.22);
  const tl = timeline(ctx);
  primeHost(tl, el, {
    "--rv-o": 0,
    "--rv-x": start,
    "--rv-y": px(16),
    ...(ctx.compact ? {} : { "--rv-r": "-6deg" })
  });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-x": seq(start, [
        [overshoot, 460, "inOutSine"],
        ["0rem", 440, "outBack"]
      ]),
      "--rv-y": tw(px(16), "0rem", 900, "outQuart"),
      ...(ctx.compact ? {} : { "--rv-r": tw("-6deg", "0deg", 900, "outExpo") })
    },
    0
  );
};

/** A stretched portrait (wider and shorter) springs back to its true proportions. */
const squashSettle: EffectBuilder = (el, ctx) => {
  const k = ctx.compact ? 0.5 : 1;
  const sx = 1 + 0.12 * k;
  const sy = 1 - 0.1 * k;
  const tl = timeline(ctx);
  primeHost(tl, el, { "--rv-o": 0, "--rv-sx": sx, "--rv-sy": sy });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-sx": sp(sx, 1, SPRING_POP),
      "--rv-sy": sp(sy, 1, SPRING_POP)
    },
    0
  );
};

/** A vertical sweep drops the portrait in from the top while a brief brightness flash settles. */
const curtainDrop: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  if (ctx.compact) {
    primeHost(tl, el, { "--rv-o": 0, "--rv-y": px(-12), filter: "brightness(1.7)" });
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
        "--rv-y": tw(px(-12), "0rem", 620, "outQuart"),
        filter: tw("brightness(1.7)", "brightness(1)", 620, "outQuad")
      },
      0
    );
  }
  useMask(el, "sweep-down");
  const path = MASK_PATHS["sweep-down"];
  primeHost(tl, el, {
    "--rv-o": 0,
    "--rv-y": px(-12),
    maskPosition: path.from,
    filter: "brightness(1.7)"
  });
  return tl.add(
    el,
    {
      "--rv-o": tw(0, 1, FADE_MS, "outQuad"),
      "--rv-y": tw(px(-12), "0rem", 880, "outQuart"),
      maskPosition: tw(path.from, path.to, 880, "outQuart"),
      filter: tw("brightness(1.7)", "brightness(1)", 700, "outQuad")
    },
    0
  );
};

export const GEN3_IMAGE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "image-corner-aperture": cornerAperture,
  "image-eclipse-exit": eclipseExit,
  "image-chroma-bloom": chromaBloom,
  "image-arc-swing": arcSwing,
  "image-squash-settle": squashSettle,
  "image-curtain-drop": curtainDrop
});
