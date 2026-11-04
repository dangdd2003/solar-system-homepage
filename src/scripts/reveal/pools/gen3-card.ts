/**
 * Gen3 Card pool effects (premium layer).
 *
 * Effects:
 * - aperture-open: an iris mask opens from the card's centre while the frame settles up.
 * - lens-flare-sweep: a left-to-right mask sweep with a brightness flare; content slides in behind it.
 * - scan-line-down: a top-to-bottom scan reveals the card; content drops into place as the line passes.
 * - mass-collapse: the card contracts from 1.12 with a blur-to-sharp focus pull (filter skipped under lowFx).
 * - depth-focus-pull: the frame rises slowly while the content pulls into focus from a blur.
 * - gyro-tilt-settle: a spring-settled gyroscope swing that lands level, content cascades from the last part.
 *
 * Host: only --rv-* vars, filter, maskPosition and transformOrigin. Children get
 * opacity, x, y, scale and filter. Every add ends within 1000 ms of its delay.
 */

import type { EffectBuilder } from "../kit";
import {
  contentParts,
  fitStep,
  full,
  MASK_PATHS,
  partStagger,
  px,
  SPRING_SOFT,
  sp,
  timeline,
  tw,
  useMask
} from "../kit";
import { isGlass } from "./glass";

/** Iris opens from the centre (desktop mask); phones and touch get a plain rise and fade. */
const apertureOpen: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  if (ctx.compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 380, "outQuad"),
        "--rv-y": tw("0.75rem", "0rem", 640, "outCubic")
      },
      0
    );
    if (content.length) {
      tl.set(content, { opacity: 0 }, 0).add(
        content,
        { opacity: tw(0, 1, 320, "outQuad") },
        partStagger(ctx, fitStep(content.length, 50, 140), 220, "first")
      );
    }
    return tl;
  }
  useMask(el, "iris");
  tl.set(
    el,
    {
      "--rv-o": 0,
      "--rv-mr": "0%",
      "--rv-mx": "50%",
      "--rv-my": "50%",
      "--rv-y": "0.75rem",
      "--rv-s": 0.97
    },
    0
  );
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 120, "linear"),
      "--rv-mr": tw("0%", "100%", 780, "outExpo"),
      "--rv-y": tw("0.75rem", "0rem", 780, "outQuint"),
      "--rv-s": tw(0.97, 1, 780, "outExpo")
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      { opacity: tw(0, 1, 320, "outQuad") },
      partStagger(ctx, fitStep(content.length, 60, 180), 300, "first")
    );
  }
  return tl;
};

/** A left-to-right mask sweep carries a brightness flare; the content slides in behind it. */
const lensFlareSweep: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  if (ctx.compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 380, "outQuad"),
        "--rv-y": tw("0.625rem", "0rem", 520, "outQuart")
      },
      0
    );
    if (content.length) {
      tl.set(content, { opacity: 0 }, 0).add(
        content,
        { opacity: tw(0, 1, 300, "outQuad") },
        partStagger(ctx, fitStep(content.length, 50, 140), 200, "first")
      );
    }
    return tl;
  }
  useMask(el, "sweep-left");
  const mask = MASK_PATHS["sweep-left"];
  const flare = !ctx.lowFx && !isGlass(el);
  tl.set(el, { "--rv-o": 0, ...(flare ? { filter: "brightness(1.7)" } : {}) }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 120, "linear"),
      maskPosition: tw(mask.from, mask.to, 860, "outQuart"),
      ...(flare ? { filter: tw("brightness(1.7)", "brightness(1)", 700, "outQuad") } : {})
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0, x: -10 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 340, "outQuad"),
        x: tw(-10, 0, 520, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 70, 200), 260, "first")
    );
  }
  return tl;
};

/** A top-to-bottom scan reveals the card; each content part drops in as the line passes it. */
const scanLineDown: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  if (ctx.compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-y": tw("-0.75rem", "0rem", 560, "outCubic")
      },
      0
    );
    if (content.length) {
      tl.set(content, { opacity: 0, y: -6 }, 0).add(
        content,
        {
          opacity: tw(0, 1, 280, "outQuad"),
          y: tw(-6, 0, 400, "outCubic")
        },
        partStagger(ctx, fitStep(content.length, 50, 120), 160, "first")
      );
    }
    return tl;
  }
  useMask(el, "sweep-down");
  const mask = MASK_PATHS["sweep-down"];
  tl.set(el, { "--rv-o": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 120, "linear"),
      maskPosition: tw(mask.from, mask.to, 900, "inOutQuad")
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0, y: -6 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 260, "outQuad"),
        y: tw(-6, 0, 420, "outQuart")
      },
      partStagger(ctx, fitStep(content.length, 60, 220), 180, "first")
    );
  }
  return tl;
};

/**
 * The card contracts from 1.12 like matter settling, pulling from a soft blur to
 * sharp. The filter (blur and brightness) is a full-card repaint, so it is skipped
 * on glass hosts and under lowFx.
 */
const massCollapse: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  tl.set(el, { transformOrigin: "50% 50%", "--rv-s": ctx.compact ? 1.06 : 1.12 }, 0);
  if (ctx.compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(1.06, 1, 560, "outCubic")
      },
      0
    );
    if (content.length) {
      tl.set(content, { opacity: 0 }, 0).add(
        content,
        { opacity: tw(0, 1, 300, "outQuad") },
        partStagger(ctx, fitStep(content.length, 50, 140), 200, "first")
      );
    }
    return tl;
  }
  const filterFx = !isGlass(el) && !ctx.lowFx;
  const from = "blur(6px) brightness(1.2)";
  const to = "blur(0px) brightness(1)";
  if (filterFx) tl.set(el, { filter: from }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-s": tw(1.12, 1, 820, "outExpo"),
      ...(filterFx ? { filter: tw(from, to, 700, "outQuart") } : {})
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0, scale: 1.05 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 320, "outQuad"),
        scale: tw(1.05, 1, 520, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 60, 180), 240, "center")
    );
  }
  return tl;
};

/**
 * Two depths: the frame rises slowly while the content pulls into focus from a
 * blur and a larger offset. Compact and lowFx keep the offset and drop the blur.
 */
const depthFocusPull: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  const focus = !ctx.compact && !ctx.lowFx && !isGlass(el);
  const offset = ctx.compact ? 10 : 22;
  tl.set(el, { "--rv-y": "0.625rem" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw("0.625rem", "0rem", 900, "outQuart")
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0, y: offset, ...(focus ? { filter: "blur(8px)" } : {}) }, 0).add(
      content,
      {
        opacity: tw(0, 1, 360, "outQuad"),
        y: tw(offset, 0, 640, "outExpo"),
        ...(focus ? { filter: tw("blur(8px)", "blur(0px)", 620, "outQuad") } : {})
      },
      partStagger(ctx, fitStep(content.length, 60, 200), 80, full(ctx).pattern)
    );
  }
  return tl;
};

/**
 * A gyroscope swing: the card tilts and drifts sideways, then a spring settles it
 * level. Content cascades from the last part toward the first.
 */
const gyroTiltSettle: EffectBuilder = (el, ctx) => {
  const dir = ctx.side !== 0 ? ctx.side : 1;
  const tl = timeline(ctx);
  const content = contentParts(el, 5);
  if (ctx.compact) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 380, "outQuad"),
        "--rv-y": tw("0.875rem", "0rem", 640, "outCubic")
      },
      0
    );
    if (content.length) {
      tl.set(content, { opacity: 0 }, 0).add(
        content,
        { opacity: tw(0, 1, 300, "outQuad") },
        partStagger(ctx, fitStep(content.length, 50, 140), 200, "last")
      );
    }
    return tl;
  }
  tl.set(el, { "--rv-r": `${-dir * 4}deg`, "--rv-x": px(-dir * 18), "--rv-s": 0.94 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-r": tw(`${-dir * 4}deg`, "0deg", 760, "outExpo"),
      "--rv-x": sp(px(-dir * 18), "0rem", SPRING_SOFT),
      "--rv-s": sp(0.94, 1, SPRING_SOFT)
    },
    0
  );
  if (content.length) {
    tl.set(content, { opacity: 0, y: 8 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 320, "outQuad"),
        y: tw(8, 0, 460, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 60, 180), 240, "last")
    );
  }
  return tl;
};

export const GEN3_CARD_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "aperture-open": apertureOpen,
  "lens-flare-sweep": lensFlareSweep,
  "scan-line-down": scanLineDown,
  "mass-collapse": massCollapse,
  "depth-focus-pull": depthFocusPull,
  "gyro-tilt-settle": gyroTiltSettle
});
