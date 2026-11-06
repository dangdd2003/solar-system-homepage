/**
 * Reveal effect builders (space / solar-system themed).
 *
 * Each `data-reveal="<name>"` maps to a builder that returns one anime
 * Timeline for its element. The engine owns timing (delay, done timer, reset)
 * and reverts the timeline once the element is done, which removes every
 * inline style written here.
 *
 * Rules every builder follows:
 * - The host (the element carrying `data-reveal`) is only animated through
 *   the `--rv-*` custom properties that reveal.css maps onto `opacity` and the
 *   individual `translate` / `scale` / `rotate` properties, plus `filter`,
 *   `maskPosition` and `transformOrigin`, so component hover transforms keep
 *   composing. Parts (split text, flare, rail, stars, chips) take anime keys.
 * - Explicit from/to values, numeric positions or `stagger(step, { start })`.
 * - Every tween ends within DURATION_MS (1000ms) of the timeline's delay;
 *   spring tweens count their settling duration.
 * - Filter from/to strings share the same functions and number count.
 */

import type { AnimationParams, Timeline } from "animejs";
import {
  D,
  MASK_PATHS,
  SPRING_GRAVITY,
  SPRING_POP,
  SPRING_SOFT,
  fitStep,
  glow,
  hostFade,
  hostReveal,
  isVertical,
  itemsOf,
  px,
  part,
  parts,
  stagger,
  sp,
  timeline,
  tw,
  useHalo,
  useMask,
  useStroke,
  type EffectBuilder,
  type EffectContext
} from "./kit";
import { getSplit } from "./split";

/** Drift in from one side with a slight angle; compact rises instead. */
function drift(el: HTMLElement, ctx: EffectContext, dir: -1 | 1): Timeline {
  const params: AnimationParams = ctx.compact
    ? {
        "--rv-o": tw(0, 1, 420, "outQuad"),
        "--rv-y": tw(px(D(ctx)), "0rem", 720, "outExpo")
      }
    : {
        "--rv-o": tw(0, 1, 420, "outQuad"),
        "--rv-x": tw(px(dir * 1.4 * D(ctx)), "0rem", 760, "outExpo"),
        "--rv-r": tw(`${dir * 1.5}deg`, "0deg", 760, "outExpo")
      };
  return timeline(ctx).add(el, params, 0);
}

function zoom(el: HTMLElement, ctx: EffectContext, fromScale: number): Timeline {
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 420, "outQuad"),
    "--rv-s": tw(fromScale, 1, 800, "outExpo")
  };
  if (!ctx.compact && !ctx.lowFx) params.filter = tw("blur(6px)", "blur(0px)", 600, "outQuart");
  return timeline(ctx).add(el, params, 0);
}

/** Day/night terminator sweeping a soft mask edge across the host. */
function wipe(el: HTMLElement, ctx: EffectContext, shape: "sweep-right" | "sweep-up"): Timeline {
  const { from, to } = MASK_PATHS[shape];
  useMask(el, shape);
  const dur = ctx.compact ? 640 : 820;
  // The mask only shows on desktop with a fine pointer, so the host fades in too.
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 260, "outQuad"),
    maskPosition: tw(from, to, dur, "outQuart")
  };
  if (!ctx.compact && !ctx.lowFx)
    params.filter = tw("brightness(1.6)", "brightness(1)", 820, "outQuad");
  return timeline(ctx).add(el, params, 0);
}

/** Starfade: soft fade with a tiny settle. */
const fade: EffectBuilder = (el, ctx) => hostFade(el, ctx);

/** Ascend: rises into place. */
const fadeUp: EffectBuilder = (el, ctx) => hostReveal(el, ctx);

const fadeDown: EffectBuilder = (el, ctx) =>
  timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 420, "outQuad"),
      "--rv-y": tw(px(-D(ctx)), "0rem", 720, "outExpo")
    },
    0
  );

/** Liftoff: larger lift with a scale-up. */
const rise: EffectBuilder = (el, ctx) =>
  timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      "--rv-y": tw(px((ctx.compact ? 1.6 : 2.2) * D(ctx)), "0rem", 820, "outExpo"),
      "--rv-s": tw(0.94, 1, 820, "outExpo")
    },
    0
  );

/** Nebula text: condenses out of a glowing haze. */
const blurIn: EffectBuilder = (el, ctx) =>
  timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 480, "outQuad"),
      "--rv-y": tw(px(0.5 * D(ctx)), "0rem", 720, "outExpo"),
      ...(ctx.lowFx
        ? {}
        : {
            filter: ctx.compact
              ? tw("blur(5px) brightness(1)", "blur(0px) brightness(1)", 600, "outQuart")
              : tw("blur(10px) brightness(1.5)", "blur(0px) brightness(1)", 720, "outQuart")
          })
    },
    0
  );

/** A star igniting: springy pop with a brightness glint. */
const twinkle: EffectBuilder = (el, ctx) => {
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 200, "linear"),
    "--rv-s": sp(0.4, 1, SPRING_POP),
    filter: tw(ctx.compact ? "brightness(1.6)" : "brightness(2.2)", "brightness(1)", 520, "outQuad")
  };
  if (!ctx.compact) params["--rv-r"] = tw("-14deg", "0deg", 600, "outExpo");
  return timeline(ctx).add(el, params, 0);
};

/** Lifts from below, overshoots a hair and settles with an accent glow. */
const gravity: EffectBuilder = (el, ctx) => {
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 260, "outQuad"),
    "--rv-y": sp(px(1.4 * D(ctx)), "0rem", SPRING_GRAVITY),
    "--rv-s": sp(0.92, 1, SPRING_GRAVITY)
  };
  if (!ctx.compact && !ctx.lowFx) {
    params.filter = tw(glow(ctx.accentRgb, 14, 0.6), glow(ctx.accentRgb, 0, 0), 700, "outQuad");
  }
  return timeline(ctx).add(el, params, 0);
};

/** A line draws itself with a bright glowing head that cools. */
const comet: EffectBuilder = (el, ctx) => {
  const vertical = isVertical(el);
  const params: AnimationParams = vertical
    ? { "--rv-sy": tw(0, 1, 780, "outExpo") }
    : { "--rv-sx": tw(0, 1, 780, "outExpo") };
  if (!ctx.compact && !ctx.lowFx) {
    params.filter = tw(
      `brightness(2) ${glow(ctx.accentRgb, 8, 0.9)}`,
      `brightness(1) ${glow(ctx.accentRgb, 0, 0)}`,
      900,
      "outQuad"
    );
  }
  return timeline(ctx)
    .set(el, { "--rv-o": 1, transformOrigin: vertical ? "50% 0%" : "0% 50%" }, 0)
    .add(el, params, 0);
};

/** Cards swing in on a short arc from their own side and settle into orbit. */
const orbitIn: EffectBuilder = (el, ctx) => {
  const params: AnimationParams = ctx.compact
    ? {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-y": tw("1.75rem", "0rem", 720, "outQuart"),
        "--rv-s": tw(0.97, 1, 640, "outExpo")
      }
    : {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw(px(ctx.side * 56), "0rem", 820, "outCubic"),
        "--rv-y": tw("2.75rem", "0rem", 720, "outQuart"),
        "--rv-r": tw(`${ctx.side * 3}deg`, "0deg", 820, "outCubic"),
        "--rv-s": sp(0.94, 1, SPRING_SOFT)
      };
  return timeline(ctx).add(el, params, 0);
};

/** The card blooms out of a planet-coloured glow. */
const nebula: EffectBuilder = (el, ctx) => {
  const params: AnimationParams = {
    "--rv-o": tw(0, 1, 420, "outQuad"),
    "--rv-y": tw(ctx.compact ? "1rem" : "1.25rem", "0rem", 760, "outExpo")
  };
  if (!ctx.compact && !ctx.lowFx) {
    params.filter = tw(
      `blur(10px) brightness(1.35) ${glow(ctx.accentRgb, 24, 0.55)}`,
      `blur(0px) brightness(1) ${glow(ctx.accentRgb, 0, 0)}`,
      900,
      "outQuart"
    );
  }
  return timeline(ctx).add(el, params, 0);
};

/** Annular eclipse: a corona ring shows, then the moon slides off the portrait. */
const eclipse: EffectBuilder = (el, ctx) => {
  useMask(el, "moon");
  const tl = timeline(ctx)
    .add(el, { "--rv-o": tw(0, 1, 220, "outQuad") }, 0)
    .add(el, { "--rv-mx": tw("50%", "-60%", 860, "inOutCubic") }, 120);
  if (!ctx.compact && !ctx.lowFx) {
    tl.add(
      el,
      {
        filter: tw(
          `brightness(1.4) ${glow(ctx.accentRgb, 16, 0.85)}`,
          `brightness(1) ${glow(ctx.accentRgb, 0, 0)}`,
          900,
          "outQuad"
        )
      },
      0
    );
  }
  return tl;
};

/** The hero name ignites while a lens flare blooms behind it and fades. */
const supernova: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 380, "outQuad"),
      "--rv-y": tw("0.35em", "0em", 900, "outExpo"),
      "--rv-s": tw(ctx.compact ? 1.06 : 1.12, 1, 950, "outExpo"),
      filter: ctx.lowFx
        ? tw("brightness(1.6)", "brightness(1)", 900, "outQuart")
        : ctx.compact
          ? tw("blur(8px) brightness(1.8)", "blur(0px) brightness(1)", 900, "outQuart")
          : tw("blur(18px) brightness(1.7)", "blur(0px) brightness(1)", 900, "outQuart")
    },
    0
  );
  const flare = part(el, "flare");
  if (flare) {
    tl.add(
      flare,
      {
        opacity: [
          { from: 0, to: ctx.compact ? 0.7 : 0.95, duration: 220, ease: "outQuad" },
          { to: 0, duration: 760, ease: "inQuad" }
        ],
        scaleX: tw(0.2, 1.3, 980, "outExpo"),
        scaleY: tw(0.6, 1, 980, "outExpo")
      },
      0
    );
  }
  return tl;
};

/** Heading chars light up left to right like stars appearing. */
const starlight: EffectBuilder = (el, ctx) => {
  const split = getSplit(el, ctx.compact ? "words" : "chars");
  const pieces = ctx.compact ? split.words : split.chars;
  if (pieces.length === 0) return fadeUp(el, ctx);

  const tl = timeline(ctx).set(el, { "--rv-o": 1 }, 0);
  const num = part(el, "num");
  if (num) {
    tl.add(
      num,
      {
        opacity: tw(0, 1, 200, "outQuad"),
        scale: sp(0.4, 1, SPRING_POP),
        rotate: tw(-45, 0, 600, "outExpo")
      },
      0
    );
  }
  const step = fitStep(pieces.length, ctx.compact ? 60 : 28, 380);
  return tl.set(pieces, { opacity: 0 }, 0).add(
    pieces,
    {
      opacity: tw(0, 1, 260, "outQuad"),
      y: tw("0.4em", "0em", 520, "outExpo"),
      filter:
        ctx.compact || ctx.lowFx
          ? tw("brightness(1.8)", "brightness(1)", 480, "outQuart")
          : tw("blur(4px) brightness(2.2)", "blur(0px) brightness(1)", 480, "outQuart"),
      ...(ctx.compact || ctx.lowFx
        ? {}
        : {
            textShadow: tw(
              `0px 0px 12px rgba(${ctx.accentRgb}, 0.95)`,
              `0px 0px 0px rgba(${ctx.accentRgb}, 0)`,
              520,
              "outQuad"
            )
          })
    },
    stagger(step, { start: 60 })
  );
};

/** Host-only warp streak: compact screens and text that cannot be split. */
function warpHost(el: HTMLElement, ctx: EffectContext): Timeline {
  return timeline(ctx)
    .set(el, { transformOrigin: "0% 50%" }, 0)
    .add(
      el,
      {
        "--rv-o": tw(0, 1, 360, "outQuad"),
        "--rv-x": tw("-0.625rem", "0rem", 600, "outExpo"),
        "--rv-sx": tw(1.08, 1, 600, "outExpo")
      },
      0
    );
}

/** Words drop out of light speed: stretched streaks snap to crisp letters. */
const warp: EffectBuilder = (el, ctx) => {
  if (ctx.compact) return warpHost(el, ctx);
  const words = getSplit(el, "words").words;
  if (words.length === 0) return warpHost(el, ctx);

  const step = fitStep(words.length, 45, 300);
  return timeline(ctx)
    .set(el, { "--rv-o": 1 }, 0)
    .set(words, { opacity: 0, transformOrigin: "0% 50%" }, 0)
    .add(
      words,
      {
        opacity: tw(0, 1, 260, "outQuad"),
        x: tw("-0.8em", "0em", 600, "outExpo"),
        scaleX: tw(1.6, 1, 600, "outExpo"),
        ...(ctx.lowFx ? {} : { filter: tw("blur(6px)", "blur(0px)", 560, "outQuart") })
      },
      stagger(step, { start: 0 })
    );
};

/** Timeline rail draws down like a comet trail; each stop's star flares in turn. */
const constellation: EffectBuilder = (el, ctx) => {
  const rail = part(el, "rail");
  const stars = parts(el, "star");
  if (!rail && stars.length === 0) return fadeUp(el, ctx);

  const tl = timeline(ctx).set(el, { "--rv-o": 1 }, 0);
  if (rail) {
    tl.set(rail, { transformOrigin: "50% 0%" }, 0).add(
      rail,
      { scaleY: tw(0, 1, 720, "outQuart") },
      0
    );
  }
  if (stars.length > 0) {
    const step = ctx.compact ? fitStep(stars.length, 80, 320) : fitStep(stars.length, 110, 400);
    tl.set(stars, { opacity: 0, "--rv-dot": 0, "--rv-dot-glow": 0 }, 0).add(
      stars,
      {
        opacity: tw(0, 1, 360, "outQuad"),
        x: tw(ctx.compact ? -10 : -14, 0, 480, "outExpo"),
        "--rv-dot": [
          { from: 0, to: 1.6, duration: 200, ease: "outQuad" },
          { to: 1, duration: 260, ease: "inOutQuad" }
        ],
        "--rv-dot-glow": [
          { from: 0, to: 10, duration: 200, ease: "outQuad" },
          { to: 0, duration: 300, ease: "inQuad" }
        ]
      },
      stagger(step, { start: 80 })
    );
  }
  return tl;
};

/** A star cluster: the label first, then the chips twinkle in quick succession. */
const cluster: EffectBuilder = (el, ctx) => {
  const items = itemsOf(el);
  if (items.length === 0 || (ctx.compact && items.length > 24)) return fadeUp(el, ctx);

  const step = ctx.compact ? fitStep(items.length, 24, 240) : fitStep(items.length, 40, 360);
  const params: AnimationParams = {
    opacity: tw(0, 1, 220, "outQuad"),
    scale: tw(0.6, 1, 480, "outBack(1.3)")
  };
  if (!ctx.compact && !ctx.lowFx)
    params.filter = tw("brightness(1.5)", "brightness(1)", 420, "outQuad");
  return timeline(ctx)
    .set(el, { "--rv-o": 1 }, 0)
    .set(items, { opacity: 0, scale: 0.6 }, 0)
    .add(items, params, stagger(step, { start: 0 }));
};

/** A Saturn ring pulses once around the icon as it springs in. */
const ring: EffectBuilder = (el, ctx) => {
  useHalo(el, "ring");
  return timeline(ctx)
    .add(
      el,
      {
        "--rv-o": tw(0, 1, 240, "outQuad"),
        "--rv-s": sp(0.5, 1, SPRING_POP),
        "--rv-r": tw("-25deg", "0deg", 700, "outExpo")
      },
      0
    )
    .add(
      el,
      {
        "--rv-ring-s": tw(0.7, 1.25, 820, "outExpo"),
        "--rv-ring-o": [
          { from: 0, to: 0.9, duration: 160, ease: "outQuad" },
          { to: 0, duration: 620, ease: "inQuad" }
        ]
      },
      120
    );
};

/** SVG strokes trace themselves like a comet path (needs pathLength="1"). */
const draw: EffectBuilder = (el, ctx) => {
  useStroke(el);
  return timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 200, "outQuad"),
      "--rv-draw": tw(1, 0, 560, "inOutQuad"),
      "--rv-x": tw("-0.1875rem", "0rem", 560, "outExpo"),
      "--rv-y": tw("0.1875rem", "0rem", 560, "outExpo")
    },
    0
  );
};

/** The footer line settles softly and the heart gives one heartbeat. */
const stardust: EffectBuilder = (el, ctx) => {
  const tl = timeline(ctx).add(
    el,
    {
      "--rv-o": tw(0, 1, 600, "outQuad"),
      "--rv-y": tw("0.625rem", "0rem", 700, "outExpo")
    },
    0
  );
  const heart = part(el, "heart");
  if (heart) {
    tl.add(
      heart,
      {
        scale: [
          { from: 1, to: 1.35, duration: 180, ease: "outQuad" },
          { to: 1, duration: 420, ease: "outBack(2)" }
        ]
      },
      380
    );
  }
  return tl;
};

/** Every registry effect, keyed by its `data-reveal` name. */
export const LEGACY: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  fade,
  "fade-up": fadeUp,
  "fade-down": fadeDown,
  "fade-left": (el: HTMLElement, ctx: EffectContext) => drift(el, ctx, -1),
  "fade-right": (el: HTMLElement, ctx: EffectContext) => drift(el, ctx, 1),
  rise,
  "blur-in": blurIn,
  "zoom-in": (el: HTMLElement, ctx: EffectContext) => zoom(el, ctx, 0.86),
  "zoom-out": (el: HTMLElement, ctx: EffectContext) => zoom(el, ctx, 1.1),
  twinkle,
  gravity,
  "wipe-right": (el: HTMLElement, ctx: EffectContext) => wipe(el, ctx, "sweep-right"),
  "wipe-up": (el: HTMLElement, ctx: EffectContext) => wipe(el, ctx, "sweep-up"),
  comet,
  "orbit-in": orbitIn,
  nebula,
  eclipse,
  supernova,
  starlight,
  warp,
  constellation,
  cluster,
  ring,
  draw,
  stardust
});
