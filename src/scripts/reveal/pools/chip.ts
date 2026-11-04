/**
 * Chip pool: pills and tag clusters (SPEC-random §3.5).
 *
 * Two structures share one helper. A host with `data-reveal-items` (default
 * `li`) animates its items as a cluster, cascaded by the rolled stagger. A
 * host without items animates the host alone through the `--rv-*` variables.
 *
 * Effects:
 * - twinkle-cluster: chips scale up from 0.6 and the cluster ignites.
 * - meteor-scatter: chips rain in from scattered points and land in their slots.
 * - orbit-ring: chips sweep in tangentially around the group centre.
 * - solar-flare-burst: chips burst out of the origin like flare ejecta.
 * - asteroid-belt: a belt of chips streams in from the left with a wave.
 * - binary-pulse: each chip blinks twice like a binary star, then holds.
 */

import type { AnimationParams, Timeline, TweenKeyValue } from "animejs";
import {
  D,
  full,
  hash01,
  partStagger,
  px,
  seq,
  timeline,
  tw,
  fitStep,
  hostReveal,
  itemsOf,
  rectOf,
  type EffectBuilder,
  type EffectContext,
  type Vec
} from "../kit";
import { isGlass } from "./glass";

type Key = "opacity" | "x" | "y" | "scale" | "rotate" | "filter";
type Pose = Partial<Record<Key, TweenKeyValue | TweenKeyValue[]>>;

/** Which structure the chip is: a single host, or the items of a cluster. */
type Path = "single" | "cluster";

interface Env {
  readonly compact: boolean;
  /** Low-effects profile: no blur. */
  readonly lowFx: boolean;
  readonly seed: number;
  readonly path: Path;
  /** Base distance in px, already scaled by 0.6 in compact mode. */
  readonly dist: number;
}

interface ChipSpec {
  /** Tweens for one chip. `i` is its index, `v` its unit offset from the group centre. */
  readonly pose: (i: number, v: Vec, env: Env) => Pose;
  /** Cluster stagger step for `n` items, given the compact flag. */
  readonly step: (n: number, compact: boolean) => number;
  /** Cluster cascade pattern; undefined uses the rolled pattern. */
  readonly from?: "first" | "random" | "center";
}

const ZERO: Vec = { x: 0, y: 0 };

/** Host variables for the single path (filter has no host variable). */
const HOST_VAR: Partial<Record<Key, string>> = {
  opacity: "--rv-o",
  x: "--rv-x",
  y: "--rv-y",
  scale: "--rv-s",
  rotate: "--rv-r"
};

const KEYS: readonly Key[] = ["opacity", "x", "y", "scale", "rotate", "filter"];

/** Per-chip tween with a static from/to, or a keyframe list (passed through unchanged). */
function isPlain(t: TweenKeyValue | TweenKeyValue[] | undefined): t is TweenKeyValue {
  return t !== undefined && !Array.isArray(t);
}

const TWINKLE: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 24 : 40, c ? 240 : 360),
  from: "first",
  pose: (_i, _v, env) => {
    const pose: Pose = {
      opacity: tw(0, 1, 220, "outQuad"),
      scale: tw(0.6, 1, 480, "outBack(1.3)")
    };
    if (env.path === "single") {
      if (!env.compact) pose.rotate = tw("-14deg", "0deg", 600, "outExpo");
    } else {
      if (!env.compact) pose.filter = tw("brightness(1.5)", "brightness(1)", 420, "outQuad");
    }
    return pose;
  }
};

const METEOR: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 20 : 32, 300),
  from: "random",
  pose: (i, _v, env) => {
    const { seed, dist } = env;
    const pose: Pose = {
      opacity: tw(0, 1, 240, "outQuad"),
      x: tw(px((hash01(seed, i) - 0.5) * 3.2 * dist), "0rem", 660, "outExpo"),
      y: tw(px(-(0.5 + hash01(seed, i + 50)) * dist), "0rem", 660, "outExpo"),
      rotate: tw(`${(hash01(seed, i + 99) - 0.5) * 40}deg`, "0deg", 660, "outExpo"),
      scale: tw(0.85, 1, 660, "outExpo")
    };
    if (env.path === "cluster" && !env.compact && !env.lowFx) {
      pose.filter = tw("blur(3px)", "blur(0px)", 500, "outQuart");
    }
    return pose;
  }
};

const ORBIT: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 20 : 30, 260),
  from: "center",
  pose: (_i, v, env) => {
    const theta = (50 * Math.PI) / 180;
    const { dist } = env;
    const still = v.x === 0 && v.y === 0;
    const x = (v.x * Math.cos(theta) - v.y * Math.sin(theta)) * 1.4 * dist;
    const y = still ? 0.6 * dist : (v.x * Math.sin(theta) + v.y * Math.cos(theta)) * 1.4 * dist;
    const pose: Pose = {
      opacity: tw(0, 1, 280, "outQuad"),
      x: tw(px(x), "0rem", 720, "outCubic"),
      y: tw(px(y), "0rem", 720, "outCubic"),
      scale: tw(0.8, 1, 720, "outCubic")
    };
    if (!env.compact) {
      const sign = v.x < 0 ? -1 : 1;
      pose.rotate = tw(`${30 * sign}deg`, "0deg", 720, "outCubic");
    }
    return pose;
  }
};

const FLARE: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 24 : 36, 340),
  pose: (_i, v, env) => ({
    opacity: tw(0, 1, 200, "outQuad"),
    x: tw(px(-v.x * 1.2 * env.dist), "0rem", 560, "outExpo"),
    y: tw(px(-v.y * 1.2 * env.dist), "0rem", 560, "outExpo"),
    scale: tw(0.3, 1, 560, "outBack(1.6)"),
    filter: env.compact
      ? tw("brightness(1.6)", "brightness(1)", 400, "outQuad")
      : tw("brightness(2.2)", "brightness(1)", 500, "outQuad")
  })
};

const BELT: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 18 : 28, 300),
  from: "first",
  pose: (i, _v, env) => {
    const pose: Pose = {
      opacity: tw(0, 1, 260, "outQuad"),
      x: tw(px(-2 * env.dist), "0rem", 640, "outExpo"),
      y: tw(px(Math.sin(i * 1.3) * 0.4 * env.dist), "0rem", 640, "outExpo")
    };
    if (!env.compact) pose.rotate = tw("-8deg", "0deg", 640, "outExpo");
    return pose;
  }
};

const PULSE: ChipSpec = {
  step: (n, c) => fitStep(n, c ? 24 : 40, 400),
  pose: (_i, _v, env) => {
    const pose: Pose = {
      scale: seq(0.7, [
        [1.08, 220, "outQuad"],
        [1, 260, "inOutQuad"]
      ]),
      opacity: seq(0, [
        [1, 100, "linear"],
        [0.35, 100, "linear"],
        [1, 140, "outQuad"]
      ])
    };
    if (!env.compact) pose.filter = tw("brightness(1.8)", "brightness(1)", 480, "outQuad");
    return pose;
  }
};

/** Cluster items' unit offset from the host centre, scaled by the host half-width. */
function offsetsOf(el: HTMLElement, items: HTMLElement[]): Vec[] {
  // Rects primed by the engine's read phase, so a cascade of clusters forces no layout.
  const box = rectOf(el);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const half = Math.max(box.width / 2, 1);
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  return items.map((item) => {
    const r = rectOf(item);
    return {
      x: clamp((r.left + r.width / 2 - cx) / half),
      y: clamp((r.top + r.height / 2 - cy) / half)
    };
  });
}

/**
 * Runs one chip structure: a cluster (items staggered) or the host alone.
 * Clusters over 24 items in compact mode fall back to the host fade.
 */
function chipTimeline(el: HTMLElement, ctx: EffectContext, spec: ChipSpec): Timeline {
  const c = full(ctx);
  const items = itemsOf(el);
  const compact = ctx.compact;
  const lowFx = Boolean(ctx.lowFx);

  if (items.length === 0) {
    const env: Env = {
      compact,
      lowFx,
      seed: c.seed,
      path: "single",
      dist: D(ctx) * (compact ? 0.6 : 1)
    };
    const pose = spec.pose(c.index, c.vec, env);
    const params: Record<string, TweenKeyValue | TweenKeyValue[]> = {};
    for (const key of KEYS) {
      const tween = pose[key];
      if (!tween) continue;
      // The filter has no host variable, so it goes on the host directly (skipped on glass, as in the cluster path).
      if (key === "filter") {
        if (!isGlass(el)) params.filter = tween;
        continue;
      }
      const variable = HOST_VAR[key];
      if (variable) params[variable] = tween;
    }
    return timeline(ctx).add(el, params, 0);
  }

  if (compact && items.length > 24) return hostReveal(el, ctx);

  const env: Env = {
    compact,
    lowFx,
    seed: c.seed,
    path: "cluster",
    dist: D(ctx) * (compact ? 0.6 : 1)
  };
  const vecs = offsetsOf(el, items);
  const poses = items.map((_, i) => spec.pose(i, vecs[i] ?? ZERO, env));
  const probe = poses[0] ?? {};
  // Filter on a glass item repaints its backdrop blur every frame: skip it there.
  const glass = items[0] !== undefined && isGlass(items[0]);

  const params: AnimationParams = {};
  for (const key of KEYS) {
    const tween = probe[key];
    if (!tween) continue;
    if (key === "filter" && glass) continue;
    if (key === "filter" || !isPlain(tween)) {
      params[key] = tween;
      continue;
    }
    params[key] = {
      ...tween,
      from: (_t?: unknown, i = 0) => {
        const own = poses[i] ?? probe;
        const value = own[key];
        return isPlain(value) ? (value.from as number | string) : (tween.from as number | string);
      }
    };
  }

  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 1 }, 0);
  tl.set(items, { opacity: 0 }, 0);
  const maxStep = items.length > 1 ? Math.floor(600 / (items.length - 1)) : 40;
  const step = Math.min(spec.step(items.length, compact), maxStep);
  const position = partStagger(ctx, step, 0, spec.from);
  tl.add(items, params, position);
  return tl;
}

const twinkleCluster: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, TWINKLE);
const meteorScatter: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, METEOR);
const orbitRing: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, ORBIT);
const solarFlareBurst: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, FLARE);
const asteroidBelt: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, BELT);
const binaryPulse: EffectBuilder = (el, ctx) => chipTimeline(el, ctx, PULSE);

export const CHIP_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "twinkle-cluster": twinkleCluster,
  "meteor-scatter": meteorScatter,
  "orbit-ring": orbitRing,
  "solar-flare-burst": solarFlareBurst,
  "asteroid-belt": asteroidBelt,
  "binary-pulse": binaryPulse
});
