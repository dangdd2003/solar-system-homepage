/**
 * Gen3 Footer pool effects.
 *
 * Effects:
 * - footer-iris-bloom: the footer opens from a centre iris mask while its lines rise out of a blur.
 * - footer-light-sweep: a diagonal light mask crosses the footer once, with a brightness flash.
 * - footer-arc-links: lines arrive on alternating arcs from either side.
 * - footer-heart-orbit-dock: the heart orbits in and docks, while the lines fade up behind it.
 * - footer-line-wipe: each line is wiped on from the left, one after another.
 * - footer-depth-settle: the whole footer settles from a slightly near, soft-focus depth.
 *
 * Every timeline ends within DURATION_MS (1000 ms) of its delay. Host keys stay on --rv-*,
 * plus maskPosition, filter and transformOrigin, as the reveal harness allows.
 */

import type { Timeline } from "animejs";
import type { EffectBuilder, EffectContext } from "../kit";
import {
  D,
  MASK_PATHS,
  contentParts,
  fitStep,
  full,
  part,
  partStagger,
  seq,
  timeline,
  tw,
  useMask
} from "../kit";
import { isGlass } from "./glass";

const BLUR_IN = "blur(6px)";
const BLUR_OUT = "blur(0px)";
const BRIGHT_HOT = "brightness(1.6)";
const BRIGHT_REST = "brightness(1)";

/** Blur and brightness filters only on the full profile (not compact, not lowFx). */
const richFx = (ctx: EffectContext): boolean => !ctx.compact && !ctx.lowFx;

/** The footer's text lines: direct children that are not parts and not split copies. */
const linesOf = (el: HTMLElement): HTMLElement[] => contentParts(el, 8);

/** Host-only fallback for footers with nothing to choreograph: a fade, optionally with a rise. */
function hostFallback(el: HTMLElement, ctx: EffectContext, rise: boolean): Timeline {
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      ...(rise ? { "--rv-y": tw(ctx.compact ? "0.5rem" : "0.875rem", "0rem", 600, "outExpo") } : {})
    },
    0
  );
  return tl;
}

const irisBloom: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const rows = linesOf(el);
  const blur = richFx(ctx);
  const tl = timeline(ctx);

  // The iris only shows on desktop with a fine pointer; the rows still rise without it.
  useMask(el, "iris");
  tl.set(el, { "--rv-mr": "0%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      "--rv-mr": tw("0%", "100%", 640, "outExpo")
    },
    0
  );

  if (rows.length === 0) return tl;

  const y0 = ctx.compact ? "0.25rem" : "0.75rem";
  tl.set(rows, { opacity: 0, y: y0, ...(blur ? { filter: BLUR_IN } : {}) }, 0);
  const step = fitStep(rows.length, 60, 140);
  tl.add(
    rows,
    {
      opacity: tw(0, 1, 500, "outQuad"),
      y: tw(y0, "0rem", 520, "outExpo"),
      ...(blur ? { filter: tw(BLUR_IN, BLUR_OUT, 500, "outQuad") } : {})
    },
    partStagger(ctx, step, 0, c.pattern)
  );
  return tl;
};

const lightSweep: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const rows = linesOf(el);
  const { from, to } = MASK_PATHS["sweep-diag"];
  const tl = timeline(ctx);

  useMask(el, "sweep-diag");
  tl.set(el, { "--rv-o": 0 }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      maskPosition: tw(from, to, 700, "outQuart"),
      ...(richFx(ctx) && !isGlass(el)
        ? { filter: tw(BRIGHT_HOT, BRIGHT_REST, 660, "outQuad") }
        : {})
    },
    0
  );

  if (rows.length === 0) return tl;

  // Each line brightens as the streak reaches it, so the light reads as travelling.
  tl.set(rows, { opacity: 0.2 }, 0);
  const step = fitStep(rows.length, 50, 120);
  tl.add(rows, { opacity: tw(0.2, 1, 480, "outQuad") }, partStagger(ctx, step, 100, c.pattern));
  return tl;
};

const arcLinks: EffectBuilder = (el, ctx) => {
  const rows = linesOf(el);
  const tl = timeline(ctx);
  tl.add(el, { "--rv-o": tw(0, 1, 360, "outQuad") }, 0);

  if (rows.length === 0) return tl;

  const travel = D(ctx);
  const step = fitStep(rows.length, 70, 150);
  rows.forEach((row, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * travel;
    const rot = ctx.compact ? 0 : -side * 3;
    tl.set(row, { opacity: 0, x, rotate: rot, transformOrigin: "50% 100%" }, 0);
    tl.add(
      row,
      {
        opacity: tw(0, 1, 400, "outQuad"),
        x: tw(x, 0, 600, "outQuart"),
        rotate: tw(rot, 0, 600, "outQuart")
      },
      i * step
    );
  });
  return tl;
};

const heartOrbitDock: EffectBuilder = (el, ctx) => {
  const heart = part(el, "heart");
  if (!heart) return hostFallback(el, ctx, true);

  const c = full(ctx);
  const rows = linesOf(el);
  const tl = timeline(ctx);
  const x0 = -Math.round(D(ctx) * 0.8);
  const y0 = -Math.round(D(ctx) * 0.5);

  tl.add(el, { "--rv-o": tw(0, 1, 420, "outQuad") }, 0);

  // The heart starts on a small orbit above-left of its dock, then settles on it.
  tl.set(heart, { opacity: 0, scale: 0, x: x0, y: y0, rotate: -90, transformOrigin: "50% 50%" }, 0);
  tl.add(
    heart,
    {
      opacity: tw(0, 1, 200, "outQuad"),
      scale: seq(0, [
        [1.12, 240, "outQuad"],
        [1, 280, "outQuad"]
      ]),
      x: seq(x0, [
        [Math.round(x0 * 0.3), 240, "outQuad"],
        [0, 300, "outBack(1.4)"]
      ]),
      y: seq(y0, [
        [Math.round(y0 * 0.3), 240, "outQuad"],
        [0, 300, "outQuart"]
      ]),
      rotate: tw(-90, 0, 520, "outQuart")
    },
    40
  );

  // The heart sits inside its text row (p.footer__copy), so that row is never tweened: a row
  // tween would multiply onto the heart's own opacity and orbit transform. Other rows still rise.
  const textRows = rows.filter((row) => !row.contains(heart));
  if (textRows.length > 0) {
    const lift = ctx.compact ? 0 : 8;
    tl.set(textRows, { opacity: 0, y: lift }, 0);
    tl.add(
      textRows,
      {
        opacity: tw(0, 1, 500, "outQuad"),
        y: tw(lift, 0, 600, "outExpo")
      },
      partStagger(ctx, fitStep(textRows.length, 50, 100), 100, c.pattern)
    );
  } else {
    // Nested heart with no sibling rows: lift the host so the text still rises behind the heart.
    // The host moves the heart and the text together, so the dock still lands on its target.
    const lift = ctx.compact ? "0.25rem" : "0.5rem";
    tl.set(el, { "--rv-y": lift }, 0);
    tl.add(el, { "--rv-y": tw(lift, "0rem", 520, "outExpo") }, 100);
  }
  return tl;
};

const lineWipe: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const rows = linesOf(el);
  if (rows.length === 0) return hostFallback(el, ctx, false);

  const tl = timeline(ctx);
  tl.add(el, { "--rv-o": tw(0, 1, 300, "outQuad") }, 0);
  tl.set(rows, { clipPath: "inset(0 100% 0 0)", opacity: 0.6 }, 0);
  tl.add(
    rows,
    {
      clipPath: tw("inset(0 100% 0 0)", "inset(0 0% 0 0)", 480, "outQuart"),
      opacity: tw(0.6, 1, 360, "outQuad")
    },
    partStagger(ctx, fitStep(rows.length, 80, 160), 0, c.pattern)
  );
  return tl;
};

const depthSettle: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const rows = linesOf(el);
  const lift = ctx.compact ? "0.375rem" : "0.75rem";
  const tl = timeline(ctx);

  tl.set(el, { "--rv-s": 0.97, "--rv-y": lift, transformOrigin: "50% 100%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 340, "outQuad"),
      "--rv-s": tw(0.97, 1, 640, "outQuart"),
      "--rv-y": tw(lift, "0rem", 640, "outQuart"),
      ...(richFx(ctx) && !isGlass(el) ? { filter: tw(BLUR_IN, BLUR_OUT, 600, "outQuad") } : {})
    },
    0
  );

  if (rows.length > 0) {
    const childLift = ctx.compact ? "0.375rem" : "0.875rem";
    tl.set(rows, { opacity: 0, y: childLift }, 0);
    tl.add(
      rows,
      {
        opacity: tw(0, 1, 460, "outQuad"),
        y: tw(childLift, "0rem", 520, "outQuint")
      },
      partStagger(ctx, fitStep(rows.length, 50, 90), 90, c.pattern)
    );
  }
  return tl;
};

export const GEN3_FOOTER_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "footer-iris-bloom": irisBloom,
  "footer-light-sweep": lightSweep,
  "footer-arc-links": arcLinks,
  "footer-heart-orbit-dock": heartOrbitDock,
  "footer-line-wipe": lineWipe,
  "footer-depth-settle": depthSettle
});
