/**
 * Gen3 Chip pool effects.
 *
 * Effects:
 * - tag-magnet-snap: chips converge from the group centre and snap into their cells with an overshoot.
 * - satellite-orbit-in: each chip circles its resting spot on a small orbit before it drops in.
 * - spectrum-lineup: chips fade in together with one shared hue-rotate tint that resolves to neutral (a uniform colour flash, not a per-chip hue sequence); dropped under lowFx and on glass.
 * - comet-chip-dash: chips stretch like a comet tail, skewed, and resolve while fading in.
 * - eclipse-tag-fade: chips are uncovered top to bottom by a lifting clip edge.
 * - ripple-spark-once: chips fade in along a wave, then one brightness spark passes through them.
 */

import {
  D,
  fitStep,
  full,
  hash01,
  itemsOf,
  partStagger,
  px,
  seq,
  timeline,
  tw,
  type EffectBuilder
} from "../kit";
import { isGlass } from "./glass";

/** A per-item value: anime passes the target index as the second argument. */
const at =
  (fn: (i: number) => string) =>
  (_t: unknown, i = 0): string =>
    fn(i);

const HUE_FROM = "hue-rotate(60deg) brightness(1.08) saturate(1.2)";
const HUE_TO = "hue-rotate(0deg) brightness(1) saturate(1)";
const BRIGHT_REST = "brightness(1)";
const BRIGHT_PEAK = "brightness(1.9)";
const CLIP_HIDDEN = "inset(0% 0% 100% 0%)";
const CLIP_SHOWN = "inset(0% 0% 0% 0%)";

const tagMagnetSnap: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-s": tw(compact ? 0.94 : 0.86, 1, 480, "outBack(1.6)")
      },
      0
    );
    return tl;
  }

  const n = items.length;
  const travel = D(ctx) * (compact ? 0.5 : 0.8);
  const mid = (n - 1) / 2;
  const fromX = at((i) => px((mid - i) * travel * 0.5));
  const fromY = at((i) => px((hash01(c.seed, i) - 0.5) * travel));

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, x: fromX, y: fromY, scale: 0.8 }, 0);

  const pos = partStagger(ctx, fitStep(n, 50, 260), 0, "center");
  tl.add(
    items,
    {
      opacity: tw(0, 1, 300, "outQuad"),
      x: tw(fromX, "0rem", 620, "outBack(1.6)"),
      y: tw(fromY, "0rem", 620, "outBack(1.6)"),
      scale: tw(0.8, 1, 620, "outBack(1.6)")
    },
    pos
  );
  return tl;
};

const satelliteOrbitIn: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);
  const radius = compact ? 6 : 12;

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-y": tw(px(-radius), "0rem", 420, "outCubic")
      },
      0
    );
    return tl;
  }

  const n = items.length;
  const theta = (i: number): number => (i / n) * Math.PI * 2 + hash01(c.seed, i) * 0.8;
  const orbitX = (i: number, k: number): string => px(radius * Math.cos(theta(i) + k * 2.1));
  const orbitY = (i: number, k: number): string => px(radius * Math.sin(theta(i) + k * 2.1));
  const startX = at((i) => orbitX(i, 0));
  const startY = at((i) => orbitY(i, 0));
  const midX = at((i) => orbitX(i, 1));
  const midY = at((i) => orbitY(i, 1));

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, x: startX, y: startY }, 0);

  const pos = partStagger(ctx, fitStep(n, 40, 200), 0, c.pattern);
  tl.add(
    items,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      x: [tw(startX, midX, 320, "inOutSine"), { to: "0rem", duration: 320, ease: "outCubic" }],
      y: [tw(startY, midY, 320, "inOutSine"), { to: "0rem", duration: 320, ease: "outCubic" }]
    },
    pos
  );
  return tl;
};

const spectrumLineup: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);
  const hued = !ctx.lowFx && !isGlass(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(el, { "--rv-o": tw(0, 1, 360, "outQuad") }, 0);
    return tl;
  }

  const startY = compact ? "0.25rem" : "0.5rem";
  const tl = timeline(ctx);
  // The host ramps in over the first frames instead of snapping to full opacity.
  tl.set(el, { "--rv-o": 0 }, 0);
  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad") }, 0);
  tl.set(items, { opacity: 0, y: startY, ...(hued ? { filter: HUE_FROM } : {}) }, 0);

  const pos = partStagger(ctx, fitStep(items.length, 35, 240), 0, "first");
  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      y: tw(startY, "0rem", 420, "outQuad"),
      ...(hued ? { filter: tw(HUE_FROM, HUE_TO, 480, "outSine") } : {})
    },
    pos
  );
  return tl;
};

const cometChipDash: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);
  const travel = D(ctx) * 1.4;
  const stretch = compact ? 1.3 : 1.6;

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw(px(-travel), "0rem", 560, "outExpo")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(
    items,
    { opacity: 0, x: px(-travel), scaleX: stretch, skewX: "-14deg", transformOrigin: "100% 50%" },
    0
  );

  const pos = partStagger(ctx, fitStep(items.length, 60, 240), 0, c.pattern);
  tl.add(
    items,
    {
      opacity: seq(0, [
        [0.3, 120, "linear"],
        [1, 300, "outQuad"]
      ]),
      x: tw(px(-travel), "0rem", 560, "outExpo"),
      scaleX: tw(stretch, 1, 560, "outExpo"),
      skewX: tw("-14deg", "0deg", 560, "outExpo")
    },
    pos
  );
  return tl;
};

const eclipseTagFade: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const items = itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-y": tw(compact ? "0.375rem" : "0rem", "0rem", 420, "outQuad")
      },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, clipPath: CLIP_HIDDEN }, 0);

  const pos = partStagger(ctx, fitStep(items.length, 45, 260), 0, c.pattern);
  tl.add(
    items,
    {
      opacity: tw(0, 1, 200, "outQuad"),
      clipPath: tw(CLIP_HIDDEN, CLIP_SHOWN, compact ? 380 : 460, "outCubic")
    },
    pos
  );
  return tl;
};

const rippleSparkOnce: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const items = itemsOf(el);
  const lit = !ctx.lowFx && !isGlass(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(el, { "--rv-o": tw(0, 1, 360, "outQuad") }, 0);
    return tl;
  }

  const step = fitStep(items.length, 40, 200);
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, ...(lit ? { filter: BRIGHT_REST } : {}) }, 0);

  tl.add(items, { opacity: tw(0, 1, 300, "outQuad") }, partStagger(ctx, step, 0, c.pattern));
  if (lit) {
    tl.add(
      items,
      {
        filter: seq(BRIGHT_REST, [
          [BRIGHT_PEAK, 160, "outQuad"],
          [BRIGHT_REST, 200, "inQuad"]
        ])
      },
      partStagger(ctx, step, 180, "first")
    );
  }
  return tl;
};

export const GEN3_CHIP_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "tag-magnet-snap": tagMagnetSnap,
  "satellite-orbit-in": satelliteOrbitIn,
  "spectrum-lineup": spectrumLineup,
  "comet-chip-dash": cometChipDash,
  "eclipse-tag-fade": eclipseTagFade,
  "ripple-spark-once": rippleSparkOnce
});
