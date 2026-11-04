/**
 * Gen2 Footer pool effects (council design).
 *
 * Effects:
 * - footer-coda-fade: gentle fade-up of footer block and internal items.
 * - footer-heart-pulse-once: decorative heart pulsing once on arrival.
 * - footer-dock-rise: confident bottom docking rise with subtle spring.
 */

import { fitStep, full, part, partStagger, seq, timeline, tw, type EffectBuilder } from "../kit";

const footerCodaFade: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const rows = Array.from(el.children).filter((ch): ch is HTMLElement => ch instanceof HTMLElement);

  const tl = timeline(ctx);

  if (rows.length === 0) {
    tl.add(
      el,
      {
        "--rv-o": tw(0, 1, 500, "outQuad"),
        "--rv-y": tw("0.625rem", "0rem", 620, "outExpo")
      },
      0
    );
    return tl;
  }

  tl.set(el, { "--rv-o": 1, "--rv-y": "0rem" }, 0);
  tl.set(rows, { opacity: 0, y: compact ? "0rem" : "0.625rem" }, 0);

  const step = fitStep(rows.length, 60, 240);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    rows,
    {
      opacity: tw(0, 1, 500, "outQuad"),
      ...(compact ? {} : { y: tw("0.625rem", "0rem", 620, "outExpo") })
    },
    pos
  );

  return tl;
};

const footerHeartPulseOnce: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const heart = part(el, "heart");

  if (compact || !heart) {
    return footerCodaFade(el, ctx);
  }

  const tl = timeline(ctx);
  tl.set(heart, { scale: 1 }, 0);
  tl.add(
    heart,
    {
      scale: seq(1, [
        [1.15, 220, "outQuad"],
        [1, 300, "outQuad"]
      ])
    },
    160
  );

  tl.add(el, { "--rv-o": tw(0, 1, 300, "outQuad") }, 0);

  return tl;
};

const footerDockRise: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const tl = timeline(ctx);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw(compact ? "0.5rem" : "1.125rem", "0rem", 600, "outBack(1.2)")
    },
    0
  );
  return tl;
};

export const GEN2_FOOTER_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "footer-coda-fade": footerCodaFade,
  "footer-heart-pulse-once": footerHeartPulseOnce,
  "footer-dock-rise": footerDockRise
});
