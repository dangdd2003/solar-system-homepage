/**
 * Gen3 Timeline pool effects (premium layer).
 *
 * Effects:
 * - meridian-sweep: the rail is uncovered top to bottom and each stop lights up as the meridian passes it.
 * - star-hop-nodes: each stop hops onto the rail along a small arc, one after another.
 * - gravity-pull-entries: entries are drawn toward the rail from the right, blur resolving as they dock.
 * - beacon-node-blink: each dot flashes once with a brightness beacon and a glow that settles to rest.
 * - date-coordinate-roll: each year rolls up out of its own clip edge, then its label fades in.
 * - ring-stack-in: stops stack outward from the rail in a ring, each one settling from a tilted, smaller state.
 *
 * Host: only --rv-* vars. Children (rail, stops, year and label pieces) get the
 * remaining keys. Every builder returns a paused timeline whose tweens all end
 * within DURATION_MS of the delay; compact and lowFx trade blur and travel away.
 */

import {
  D,
  fitStep,
  full,
  hostReveal,
  part,
  parts,
  partStagger,
  px,
  seq,
  timeline,
  tw,
  type EffectBuilder
} from "../kit";
import { isGlass } from "./glass";

const CLIP_HIDDEN_BOTTOM = "inset(0% 0% 100% 0%)";
const CLIP_HIDDEN_TOP = "inset(100% 0% 0% 0%)";
const CLIP_SHOWN = "inset(0% 0% 0% 0%)";
const BRIGHT_REST = "brightness(1)";
const BRIGHT_PEAK = "brightness(2.2)";
const BRIGHT_DIM = "brightness(0.4)";
const BRIGHT_FLASH = "brightness(2.4)";
const BLUR_REST = "blur(0px)";
const BLUR_AWAY = "blur(6px)";

/** The stops of the timeline: `star` parts, else the host's list items. */
function stepsOf(el: HTMLElement): HTMLElement[] {
  const stars = parts(el, "star");
  return stars.length > 0 ? stars : Array.from(el.querySelectorAll<HTMLElement>("li"));
}

/** A stop's pieces: its year (first child) and its label (second child), when present. */
function piecesOf(star: HTMLElement): { year: HTMLElement | null; label: HTMLElement | null } {
  const kids = Array.from(star.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  return { year: kids[0] ?? null, label: kids[1] ?? null };
}

/** A cascade position function, as partStagger returns it. */
type Pos = ReturnType<typeof partStagger>;

/** The same cascade, delayed by `by` ms (labels follow their stop). */
function after(pos: Pos, by: number): Pos {
  return ((target: unknown, index: number, total: number) =>
    (pos as unknown as (t: unknown, i: number, n: number) => number)(target, index, total) +
    by) as unknown as Pos;
}

const meridianSweep: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const rail = part(el, "rail");
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  if (rail) {
    tl.set(rail, { clipPath: CLIP_HIDDEN_BOTTOM }, 0);
    tl.add(rail, { clipPath: tw(CLIP_HIDDEN_BOTTOM, CLIP_SHOWN, 720, "inOutCubic") }, 0);
  }

  // Brightness flashes are filter work: desktop only. Compact and lowFx keep the opacity and dot.
  const flash = !compact;
  tl.set(stars, { opacity: 0.25, "--rv-dot": 0, ...(flash ? { filter: BRIGHT_PEAK } : {}) }, 0);
  const step = fitStep(stars.length, compact ? 80 : 120, 480);
  const pos = partStagger(ctx, step, 0, c.pattern);
  tl.add(
    stars,
    {
      opacity: tw(0.25, 1, 360, "outQuad"),
      "--rv-dot": tw(0, 1, 360, "outQuad"),
      ...(flash ? { filter: tw(BRIGHT_PEAK, BRIGHT_REST, 360, "outQuad") } : {})
    },
    pos
  );

  return tl;
};

const starHopNodes: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const lift = compact ? 8 : 16;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(stars, { opacity: 0, y: px(lift), "--rv-dot": 0 }, 0);

  const step = fitStep(stars.length, 80, 300);
  const pos = partStagger(ctx, step, 0, c.pattern);
  tl.add(
    stars,
    {
      opacity: tw(0, 1, 200, "outQuad"),
      y: seq(px(lift), [
        [px(-lift * 0.4), 200, "outQuad"],
        ["0rem", 220, "outBack(1.4)"]
      ]),
      "--rv-dot": tw(0, 1, 260, "outQuad")
    },
    pos
  );

  return tl;
};

const gravityPullEntries: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const travel = compact ? D(ctx) * 0.6 : D(ctx) * 0.8;
  const blur = !ctx.lowFx && !stars.some((star) => isGlass(star));
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(stars, { opacity: 0, x: px(travel), ...(blur ? { filter: BLUR_AWAY } : {}) }, 0);

  const step = fitStep(stars.length, 70, 260);
  const pos = partStagger(ctx, step, 0, c.pattern);
  tl.add(
    stars,
    {
      opacity: tw(0, 1, 320, "outQuad"),
      x: tw(px(travel), "0rem", 560, "outExpo"),
      ...(blur ? { filter: tw(BLUR_AWAY, BLUR_REST, 420, "outQuad") } : {})
    },
    pos
  );

  // Labels dock a beat after their entry, pulled by the same gravity at half the distance.
  const labels = stars.map((star) => piecesOf(star).label).filter((n): n is HTMLElement => !!n);
  if (labels.length > 0) {
    tl.set(labels, { opacity: 0, x: px(travel * 0.5) }, 0);
    tl.add(
      labels,
      {
        opacity: tw(0, 1, 280, "outQuad"),
        x: tw(px(travel * 0.5), "0rem", 400, "outQuart")
      },
      after(pos, 90)
    );
  }

  return tl;
};

const beaconNodeBlink: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  // Brightness flash is filter work: skipped under lowFx, where the dot glow and opacity carry it.
  const flash = !ctx.lowFx;
  tl.set(
    stars,
    {
      opacity: 0,
      "--rv-dot": 0,
      "--rv-dot-glow": 0,
      ...(flash ? { filter: BRIGHT_DIM } : {})
    },
    0
  );

  const step = fitStep(stars.length, 90, 260);
  const pos = partStagger(ctx, step, 0, c.pattern);
  tl.add(
    stars,
    {
      opacity: tw(0, 1, 180, "outQuad"),
      ...(flash
        ? {
            filter: seq(BRIGHT_DIM, [
              [BRIGHT_FLASH, 180, "outQuad"],
              [BRIGHT_REST, 320, "outQuad"]
            ])
          }
        : {}),
      "--rv-dot": tw(0, 1, 500, "outQuad"),
      "--rv-dot-glow": seq(0, [
        [1, 180, "outQuad"],
        [0, 320, "outQuad"]
      ])
    },
    pos
  );

  return tl;
};

const dateCoordinateRoll: EffectBuilder = (el, ctx) => {
  const c = full(ctx);
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const pieces = stars.map(piecesOf);
  const years = pieces.map((p) => p.year).filter((n): n is HTMLElement => !!n);
  const labels = pieces.map((p) => p.label).filter((n): n is HTMLElement => !!n);

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  const rise = compact ? "0.5em" : "0.9em";
  const step = fitStep(stars.length, 90, 260);
  const pos = partStagger(ctx, step, 0, c.pattern);

  if (years.length > 0) {
    tl.set(years, { clipPath: CLIP_HIDDEN_TOP, y: rise }, 0);
    tl.add(
      years,
      {
        clipPath: tw(CLIP_HIDDEN_TOP, CLIP_SHOWN, 460, "outExpo"),
        y: tw(rise, "0rem", 460, "outExpo")
      },
      pos
    );
  }

  if (labels.length > 0) {
    tl.set(labels, { opacity: 0 }, 0);
    tl.add(labels, { opacity: tw(0, 1, 320, "outQuad") }, after(pos, 140));
  }

  return tl;
};

const ringStackIn: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact || Boolean(ctx.lowFx);
  const stars = stepsOf(el);

  if (stars.length === 0) return hostReveal(el, ctx);

  const travel = compact ? D(ctx) * 0.5 : D(ctx);
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);

  if (compact) {
    tl.set(stars, { opacity: 0, x: px(-travel) }, 0);
    const pos = partStagger(ctx, fitStep(stars.length, 60, 260), 0, "first");
    tl.add(
      stars,
      {
        opacity: tw(0, 1, 320, "outQuad"),
        x: tw(px(-travel), "0rem", 420, "outQuart")
      },
      pos
    );
    return tl;
  }

  tl.set(
    stars,
    { opacity: 0, x: px(-travel), scale: 0.6, rotate: -14, transformOrigin: "0% 50%" },
    0
  );
  const pos = partStagger(ctx, fitStep(stars.length, 90, 300), 0, "center");
  tl.add(
    stars,
    {
      opacity: tw(0, 1, 320, "outQuad"),
      x: tw(px(-travel), "0rem", 520, "outExpo"),
      scale: tw(0.6, 1, 520, "outBack(1.3)"),
      rotate: tw(-14, 0, 520, "outExpo")
    },
    pos
  );

  return tl;
};

export const GEN3_TIMELINE_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "meridian-sweep": meridianSweep,
  "star-hop-nodes": starHopNodes,
  "gravity-pull-entries": gravityPullEntries,
  "beacon-node-blink": beaconNodeBlink,
  "date-coordinate-roll": dateCoordinateRoll,
  "ring-stack-in": ringStackIn
});
