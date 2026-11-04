/**
 * Gen3 Hero-name pool effects.
 *
 * Effects:
 * - hero-name-gradient-slice-drift: split gradient slices slide in from the left, one after another.
 * - hero-name-disk-tilt-settle: characters tilt in on a 3D plane (perspective on their parents) and settle level.
 * - hero-name-singularity-pinch: characters start stretched wide and pinch into place from the centre out.
 * - hero-name-pulsar-strobe: the host strobes brightness in pulses before settling (filter brightness only).
 * - hero-name-orbit-letter-swap: each character swings in on a short arc around its resting spot.
 * - hero-name-diag-mask-wipe: a diagonal mask sweep uncovers the host while it rises (desktop); phones rise and glow.
 */

import {
  full,
  hostReveal,
  MASK_PATHS,
  fitStep,
  hash01,
  partStagger,
  px,
  seq,
  timeline,
  tw,
  useMask,
  type EffectBuilder
} from "../kit";
import { getSplit } from "../split";

/** Pieces for a cascade: words on compact (fewer pieces), characters otherwise; falls back to the other unit. */
function piecesOf(el: HTMLElement, compact: boolean): HTMLElement[] {
  const split = getSplit(el, compact ? "words" : "chars");
  const primary = compact ? split.words : split.chars;
  if (primary.length > 0) return primary;
  return compact ? split.chars : split.words;
}

/** Rounds an em length so the same value is produced for the set and the tween. */
const em = (n: number): string => `${Math.round(n * 1000) / 1000}em`;

const gradientSliceDrift: EffectBuilder = (el, ctx) => {
  const items = piecesOf(el, ctx.compact);
  if (items.length === 0) return hostReveal(el, ctx);

  const travel = ctx.compact ? 20 : 40;
  const tl = timeline(ctx);
  tl.set(items, { opacity: 0, x: px(-travel) }, 0);

  const step = fitStep(items.length, ctx.compact ? 60 : 45, 300);
  tl.add(
    items,
    {
      opacity: tw(0, 1, 340, "outQuad"),
      x: tw(px(-travel), "0rem", 420, "outExpo")
    },
    partStagger(ctx, step, 0, "first")
  );
  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad") }, 0);
  return tl;
};

const diskTiltSettle: EffectBuilder = (el, ctx) => {
  const items = piecesOf(el, ctx.compact);
  if (items.length === 0) return hostReveal(el, ctx);

  const from = ctx.compact ? 40 : 70;
  const tl = timeline(ctx);
  // Perspective applies to the transforms of direct children only, and the pieces sit one level
  // below the host (host > h1 > .rv-word > .rv-char on desktop), so the perspective goes on each
  // piece's parent. The tween's rotateX then gets a real 3D plane. Reverted with the timeline.
  // Text sitting directly in the host (no title element) would make the host its own holder, so skip it.
  const holders = [...new Set(items.map((item) => item.parentElement))].filter(
    (node): node is HTMLElement => node !== null && node !== el
  );
  if (holders.length > 0) tl.set(holders, { perspective: "56.25rem" }, 0);
  tl.set(items, { opacity: 0, rotateX: from, transformOrigin: "50% 50%" }, 0);

  const step = fitStep(items.length, 40, 260);
  tl.add(
    items,
    {
      opacity: tw(0, 1, 380, "outQuad"),
      rotateX: tw(from, 0, 620, "outExpo")
    },
    partStagger(ctx, step, 0, "center")
  );
  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad") }, 0);
  return tl;
};

const singularityPinch: EffectBuilder = (el, ctx) => {
  const items = piecesOf(el, ctx.compact);
  if (items.length === 0) return hostReveal(el, ctx);

  const from = ctx.compact ? 1.6 : 2.4;
  const tl = timeline(ctx);
  tl.set(items, { opacity: 0, scaleX: from, transformOrigin: "50% 50%" }, 0);

  const step = fitStep(items.length, 32, 240);
  tl.add(
    items,
    {
      opacity: tw(0, 1, 300, "outQuad"),
      scaleX: tw(from, 1, 480, "outBack(1.2)")
    },
    partStagger(ctx, step, 0, "center")
  );
  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad") }, 0);
  return tl;
};

/** Brightness only, so it survives lowFx. Three pulses on desktop, two on compact. */
const pulsarStrobe: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  const filter = ctx.compact
    ? seq("brightness(0.35)", [
        ["brightness(1.6)", 150, "outQuad"],
        ["brightness(0.5)", 120, "inQuad"],
        ["brightness(1.2)", 140, "outQuad"],
        ["brightness(1)", 220, "outCubic"]
      ])
    : seq("brightness(0.35)", [
        ["brightness(1.8)", 140, "outQuad"],
        ["brightness(0.5)", 100, "inQuad"],
        ["brightness(1.4)", 120, "outQuad"],
        ["brightness(0.6)", 100, "inQuad"],
        ["brightness(1.15)", 110, "outQuad"],
        ["brightness(1)", 150, "outCubic"]
      ]);

  tl.set(el, { filter: "brightness(0.35)" }, 0);
  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad"), filter }, 0);
  return tl;
};

const orbitLetterSwap: EffectBuilder = (el, ctx) => {
  const items = piecesOf(el, ctx.compact);
  if (items.length === 0) return hostReveal(el, ctx);

  const c = full(ctx);
  const r = ctx.compact ? 0.2 : 0.4;
  const step = fitStep(items.length, 32, 180);
  const tl = timeline(ctx);

  items.forEach((item, i) => {
    const a = hash01(c.seed, i) * Math.PI * 2;
    const b = a + Math.PI * 0.6;
    const x0 = em(r * Math.cos(a));
    const y0 = em(r * Math.sin(a));
    const xm = em(r * 0.6 * Math.cos(b));
    const ym = em(r * 0.6 * Math.sin(b));

    tl.set(item, { opacity: 0, x: x0, y: y0 }, 0);
    tl.add(
      item,
      {
        opacity: tw(0, 1, 280, "outQuad"),
        x: seq(x0, [
          [xm, 280, "inOutSine"],
          ["0em", 320, "outExpo"]
        ]),
        y: seq(y0, [
          [ym, 280, "inOutSine"],
          ["0em", 320, "outExpo"]
        ])
      },
      i * step
    );
  });

  tl.add(el, { "--rv-o": tw(0, 1, 260, "outQuad") }, 0);
  return tl;
};

/**
 * The mask sweep only exists on desktop pointers, so phones get the rise and the
 * brightness settle on their own. lowFx keeps brightness and drops the blur.
 */
const diagMaskWipe: EffectBuilder = (el, ctx) => {
  const masked = !ctx.compact;
  const sweep = MASK_PATHS["sweep-diag"];
  const tl = timeline(ctx);

  if (masked) {
    useMask(el, "sweep-diag");
    tl.set(el, { maskPosition: sweep.from }, 0);
    tl.add(el, { maskPosition: tw(sweep.from, sweep.to, 820, "inOutQuart") }, 0);
  }

  const soft = ctx.compact || Boolean(ctx.lowFx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      "--rv-y": tw(px(ctx.compact ? 14 : 26), "0rem", 760, "outExpo"),
      filter: soft
        ? tw("brightness(1.5)", "brightness(1)", 700, "outQuad")
        : tw("blur(6px) brightness(1.5)", "blur(0px) brightness(1)", 500, "outQuart")
    },
    0
  );
  return tl;
};

export const GEN3_HERO_NAME_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "hero-name-gradient-slice-drift": gradientSliceDrift,
  "hero-name-disk-tilt-settle": diskTiltSettle,
  "hero-name-singularity-pinch": singularityPinch,
  "hero-name-pulsar-strobe": pulsarStrobe,
  "hero-name-orbit-letter-swap": orbitLetterSwap,
  "hero-name-diag-mask-wipe": diagMaskWipe
});
