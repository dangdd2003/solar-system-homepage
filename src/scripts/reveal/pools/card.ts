/**
 * Card pool (`data-reveal="@card"`): five randomized entries for a card's box
 * and its inner content. The three legacy card effects (orbit-in, nebula, rise)
 * stay in ../effects.ts.
 *
 * - gravity-assist: slingshots in from the pattern origin's direction and settles into orbit.
 * - warp-jump: drops out of hyperspace, stretched along its travel, then snaps to shape.
 * - eclipse-transit: a diagonal shadow terminator sweeps off the card; the rim glows.
 * - starfield-parallax: the far-layer card drifts up slowly while its content rises faster.
 * - ring-plane: a ring system tilts edge-on into view and the card opens vertically.
 *
 * Only the host's --rv-* vars and filter, maskPosition and transformOrigin are
 * animated on the host; inner content gets opacity, x, y, scale-free parts.
 */

import type { EffectBuilder } from "../kit";
import {
  contentParts,
  full,
  fitStep,
  glow,
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Slingshot in from the pattern origin's direction, then settle into orbit. */
const gravityAssist: EffectBuilder = (el, ctx) => {
  const v = full(ctx).vec;
  const tl = timeline(ctx);
  if (ctx.compact) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 320, "outQuad"),
        "--rv-y": tw("1.5rem", "0rem", 720, "outQuart")
      },
      0
    );
  }
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 320, "outQuad"),
      "--rv-x": sp(px(v.x * 72), "0rem", SPRING_SOFT),
      "--rv-y": sp(px(v.y * 56 + 24), "0rem", SPRING_SOFT),
      "--rv-r": tw(`${round2(-v.x * 4)}deg`, "0deg", 700, "outExpo")
    },
    0
  );
  const content = contentParts(el, 5);
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 320, "outQuad"),
        y: tw(14, 0, 520, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 70, 200), 240, "first")
    );
  }
  return tl;
};

/** Drops out of hyperspace: stretched along its travel, snapping back to shape. */
const warpJump: EffectBuilder = (el, ctx) => {
  const s = ctx.side || -1;
  const tl = timeline(ctx);
  const filtered = !isGlass(el);
  tl.set(el, { transformOrigin: s < 0 ? "100% 50%" : "0% 50%" }, 0);
  if (ctx.compact) {
    return tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 260, "outQuad"),
        "--rv-x": tw(px(s * 20), "0rem", 620, "outExpo"),
        "--rv-sx": tw(1.12, 1, 620, "outExpo"),
        ...(filtered ? { filter: tw("brightness(1.4)", "brightness(1)", 480, "outQuad") } : {})
      },
      0
    );
  }
  // Low-effects profiles keep the brightness flash but drop the blur (kit: no blur under lowFx).
  const warp = ctx.lowFx
    ? tw("brightness(1.6)", "brightness(1)", 560, "outQuart")
    : tw("blur(8px) brightness(1.6)", "blur(0px) brightness(1)", 560, "outQuart");
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-x": tw(px(s * 48), "0rem", 620, "outExpo"),
      "--rv-sx": tw(1.3, 1, 620, "outExpo"),
      ...(filtered ? { filter: warp } : {})
    },
    0
  );
  const content = contentParts(el, 5);
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 300, "outQuad"),
        x: tw(s * 16, 0, 500, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 60, 180), 200, "first")
    );
  }
  return tl;
};

/** A diagonal shadow terminator sweeps off the card; the rim glows like a corona. */
const eclipseTransit: EffectBuilder = (el, ctx) => {
  useMask(el, "sweep-diag");
  const mask = MASK_PATHS["sweep-diag"];
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  if (ctx.compact) {
    return tl.add(el, { maskPosition: tw(mask.from, mask.to, 680, "outQuart") }, 0);
  }
  // The corona glow is a drop-shadow (blur): low-effects profiles keep only the brightness.
  const corona = ctx.lowFx ? "" : ` ${glow(ctx.accentRgb, 20, 0.6)}`;
  const rest = ctx.lowFx ? "" : ` ${glow(ctx.accentRgb, 0, 0)}`;
  tl.add(
    el,
    {
      maskPosition: tw(mask.from, mask.to, 860, "inOutCubic"),
      ...(isGlass(el)
        ? {}
        : {
            filter: tw(`brightness(1.5)${corona}`, `brightness(1)${rest}`, 900, "outQuad")
          })
    },
    0
  );
  const content = contentParts(el, 5);
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      { opacity: tw(0, 1, 360, "outQuad") },
      partStagger(ctx, fitStep(content.length, 80, 240), 260, "first")
    );
  }
  return tl;
};

/** Depth: the card drifts up slowly while its content rises faster and catches up. */
const starfieldParallax: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw(ctx.compact ? "1rem" : "1.125rem", "0rem", 900, "outQuart")
    },
    0
  );
  const content = contentParts(el, ctx.compact ? 3 : 5);
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 360, "outQuad"),
        y: tw(ctx.compact ? 24 : 48, 0, 700, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 60, 180), 60, "first")
    );
  }
  return tl;
};

/** A ring system tilting edge-on into view: the card opens vertically from a thin line. */
const ringPlane: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx);
  tl.set(el, { transformOrigin: "50% 50%" }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-sy": tw(ctx.compact ? 0.6 : 0.25, 1, 760, "outExpo"),
      "--rv-sx": tw(1.06, 1, 760, "outExpo")
    },
    0
  );
  if (ctx.compact) return tl;
  if (!isGlass(el))
    tl.add(el, { filter: tw("brightness(1.8)", "brightness(1)", 600, "outQuad") }, 0);
  const content = contentParts(el, 5);
  if (content.length) {
    tl.set(content, { opacity: 0 }, 0).add(
      content,
      {
        opacity: tw(0, 1, 320, "outQuad"),
        y: tw(-10, 0, 480, "outExpo")
      },
      partStagger(ctx, fitStep(content.length, 60, 200), 260, "first")
    );
  }
  return tl;
};

export const CARD_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "gravity-assist": gravityAssist,
  "warp-jump": warpJump,
  "eclipse-transit": eclipseTransit,
  "starfield-parallax": starfieldParallax,
  "ring-plane": ringPlane
});
