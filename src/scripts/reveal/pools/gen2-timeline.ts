/**
 * Gen2 Timeline pool effects (council design).
 *
 * Effects:
 * - timeline-tick-in: rail extends downwards followed by staggered timeline items.
 * - timeline-track-grow: long vertical rail growth with node pops along the line.
 * - timeline-node-pop: stars popping on without the rail.
 * - timeline-cascade-drop: items dropping down in reverse order.
 */

import {
  fitStep,
  full,
  itemsOf,
  part,
  parts,
  partStagger,
  timeline,
  tw,
  type EffectBuilder
} from "../kit";

const timelineTickIn: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const rail = part(el, "rail");
  const items = parts(el, "star").length > 0 ? parts(el, "star") : itemsOf(el);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  if (rail) {
    tl.set(rail, { scaleY: 0, transformOrigin: "50% 0%" }, 0);
    tl.add(rail, { scaleY: tw(0, 1, compact ? 240 : 320, "outQuad") }, 0);
  }

  if (items.length > 0) {
    tl.set(items, { opacity: 0, x: compact ? "0rem" : "0.5rem" }, 0);
    const step = fitStep(items.length, 60, 240);
    const pos = partStagger(ctx, step, compact ? 0 : 160, c.pattern);
    tl.add(
      items,
      {
        opacity: tw(0, 1, 300, "outQuad"),
        ...(compact ? {} : { x: tw("0.5rem", "0rem", 300, "outQuad") })
      },
      pos
    );
  }

  return tl;
};

const timelineTrackGrow: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const rail = part(el, "rail");
  const stars = parts(el, "star");

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  if (rail) {
    tl.set(rail, { scaleY: 0, transformOrigin: "50% 0%" }, 0);
    tl.add(rail, { scaleY: tw(0, 1, 760, "outQuart") }, 0);
  }

  if (stars.length > 0) {
    tl.set(stars, { opacity: 0, scale: compact ? 1 : 0.5 }, 0);
    const step = fitStep(stars.length, 80, 240);
    const pos = partStagger(ctx, step, 160, c.pattern);
    tl.add(
      stars,
      {
        opacity: tw(0, 1, 360, "outQuad"),
        ...(compact ? {} : { scale: tw(0.5, 1, 360, "outBack(1.4)") })
      },
      pos
    );
  }

  return tl;
};

const timelineNodePop: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact;
  const stars = parts(el, "star").length > 0 ? parts(el, "star") : itemsOf(el);

  if (stars.length === 0) {
    const tl = timeline(ctx);
    tl.add(el, { "--rv-o": tw(0, 1, 360, "outQuad") }, 0);
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(stars, { opacity: 0, scale: compact ? 1 : 0.4 }, 0);

  const step = fitStep(stars.length, 70, 240);
  const pos = partStagger(ctx, step, 0, c.pattern);

  tl.add(
    stars,
    {
      opacity: tw(0, 1, 200, "outQuad"),
      ...(compact ? {} : { scale: tw(0.4, 1, 420, "outBack(1.4)") })
    },
    pos
  );

  return tl;
};

const timelineCascadeDrop: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const items = parts(el, "star").length > 0 ? parts(el, "star") : itemsOf(el);

  if (items.length === 0) {
    const tl = timeline(ctx);
    tl.add(
      el,
      { "--rv-o": tw(0, 1, 360, "outQuad"), "--rv-y": tw("-0.625rem", "0rem", 560, "outExpo") },
      0
    );
    return tl;
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0, y: "-0.625rem" }, 0);

  const step = compact ? fitStep(items.length, 60, 360) : fitStep(items.length, 90, 240);
  const pos = partStagger(ctx, step, 0, "last");

  tl.add(
    items,
    {
      opacity: tw(0, 1, 360, "outQuad"),
      y: tw("-0.625rem", "0rem", 560, "outExpo")
    },
    pos
  );

  return tl;
};

export const GEN2_TIMELINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "timeline-tick-in": timelineTickIn,
  "timeline-track-grow": timelineTrackGrow,
  "timeline-node-pop": timelineNodePop,
  "timeline-cascade-drop": timelineCascadeDrop
});
