/**
 * Gen2 Chip pool effects (council design).
 *
 * Effects:
 * - orbit-chip-settle: arc arrival with overshoot and rotation settling.
 * - orbit-chip-align: chips sliding from alternating sides into alignment.
 * - chip-wave: gentle sequential wave from the frame origin.
 * - grid-ripple-chips: 2D ripple originating from group center.
 * - chip-pop-stack: vertical drop and pop into a compact stack.
 */

import { fitStep, full, itemsOf, partStagger, px, timeline, tw, type EffectBuilder } from "../kit";

const orbitChipSettle: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    const sign = c.side !== 0 ? c.side : 1;
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw(compact ? "0rem" : px(sign * 14), "0rem", 420, "outBack(1.4)"),
        "--rv-y": tw(compact ? "0.5rem" : "0rem", "0rem", 420, "outQuad"),
        ...(compact ? {} : { "--rv-r": tw(`${sign * 10}deg`, "0deg", 420, "outBack(1.4)") })
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, y: compact ? "0.5rem" : "0rem" }, 0);

  const step = Math.min(
    fitStep(items.length, 40, 240),
    items.length > 1 ? Math.floor(600 / (items.length - 1)) : 40
  );
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      y: tw(compact ? "0.5rem" : "0rem", "0rem", 420, "outQuad"),
      ...(compact
        ? {}
        : {
            x: tw(
              (_t: unknown, i = 0) => (i % 2 === 0 ? "0.875rem" : "-0.875rem"),
              "0rem",
              420,
              "outBack(1.4)"
            )
          })
    },
    pos
  );

  return tl;
};

const orbitChipAlign: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const items = itemsOf(el);

  if (items.length === 0) {
    const sign = c.side !== 0 ? c.side : 1;
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw(px(compact ? sign * 10 : sign * 18), "0rem", 480, "outCubic")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0 }, 0);

  const step = Math.min(
    fitStep(items.length, 40, 240),
    items.length > 1 ? Math.floor(600 / (items.length - 1)) : 40
  );
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      x: tw(
        (_t: unknown, i = 0) =>
          i % 2 === 0 ? (compact ? "0.625rem" : "1.125rem") : compact ? "-0.625rem" : "-1.125rem",
        "0rem",
        480,
        "outCubic"
      )
    },
    pos
  );

  return tl;
};

const chipWave: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 480, "outQuad"),
        "--rv-y": tw("0.375rem", "0rem", 480, "outQuad")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, y: "0.375rem" }, 0);

  const step = Math.min(40, items.length > 1 ? Math.floor(600 / (items.length - 1)) : 40);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    items,
    {
      opacity: tw(0, 1, 480, "outQuad"),
      y: tw("0.375rem", "0rem", 480, "outQuad")
    },
    pos
  );

  return tl;
};

const gridRippleChips: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(0.7, 1, 420, "outBack(1.4)")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, scale: 0.7 }, 0);

  const step = Math.min(
    fitStep(items.length, 30, 240),
    items.length > 1 ? Math.floor(600 / (items.length - 1)) : 30
  );
  const pos = partStagger(ctx, step, 0, compact ? "first" : "center");

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      scale: tw(0.7, 1, 420, "outBack(1.4)")
    },
    pos
  );

  return tl;
};

const chipPopStack: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(compact ? 0.82 : 0.6, 1, 420, "outBack(1.4)"),
        "--rv-y": tw(compact ? "0rem" : "-0.5rem", "0rem", 420, "outCubic")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, scale: compact ? 0.82 : 0.6, y: compact ? "0rem" : "-0.5rem" }, 0);

  const step = Math.min(
    fitStep(items.length, 40, 240),
    items.length > 1 ? Math.floor(600 / (items.length - 1)) : 40
  );
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      scale: tw(compact ? 0.82 : 0.6, 1, 420, "outBack(1.4)"),
      y: tw(compact ? "0rem" : "-0.5rem", "0rem", 420, "outCubic")
    },
    pos
  );

  return tl;
};

export const GEN2_CHIP_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "orbit-chip-settle": orbitChipSettle,
  "orbit-chip-align": orbitChipAlign,
  "chip-wave": chipWave,
  "grid-ripple-chips": gridRippleChips,
  "chip-pop-stack": chipPopStack
});
