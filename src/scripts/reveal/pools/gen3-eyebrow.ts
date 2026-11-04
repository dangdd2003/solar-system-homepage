/**
 * Gen3 Eyebrow pool effects.
 *
 * Eyebrows are short single-line labels that geometry.ts never splits, so every
 * effect here animates the host through --rv-* vars, filter, maskPosition or
 * transformOrigin only.
 *
 * Every effect fades the host in through --rv-o (0 to 1), so the same motion works
 * with or without a mask. Masks only exist on desktop pointers (see reveal.css), so
 * phones and touch tablets get the fade plus the slide or jitter.
 *
 * STAGED: these effects are not registered in EFFECTS, PATTERNS.eyebrow or catalog.ts
 * yet. The integrator wires GEN3_EYEBROW_EFFECTS into the registry (spread after the
 * GEN2_* pools), adds the names to PATTERNS.eyebrow and the catalog, and replaces the
 * moon mask rule in reveal.css with MOON_MASK_IMAGE (see the css output of this task).
 *
 * Effects:
 * - eyebrow-iris-focus: an iris mask opens on the label while it pulls focus from a soft blur.
 * - eyebrow-unfurl-scale: a downward mask sweep with a vertical unfurl from the baseline.
 * - eyebrow-signal-jitter: the label flickers in as a noisy signal, with stepped lateral jitter that settles.
 * - eyebrow-moon-phase: a lit moon-shaped mask drifts across the label until the whole line is visible.
 * - eyebrow-halo-ring-once: a single halo ring pulses out behind the label as it rises into place.
 *
 * The earlier eyebrow-dot-lead effect was dropped: the host opacity has to stay at 0
 * while the label is hidden, and that also hid the lead dot (a child of the host).
 */

import {
  hostFade,
  MASK_PATHS,
  px,
  seq,
  timeline,
  tw,
  useHalo,
  useMask,
  type EffectBuilder
} from "../kit";

/** Moon mask geometry, in percent of the label box. Shared with reveal.css (MOON_MASK_IMAGE). */
export const MOON_MASK = Object.freeze({
  /** Horizontal and vertical radius of the lit ellipse. */
  radius: 80,
  /** Solid (visible) share of the radius before the soft edge. */
  solid: 96,
  /** Centre x at the start: the whole ellipse sits left of the label. */
  start: -90,
  /** Centre x at rest: the ellipse covers the whole label. */
  end: 50
});

/** The mask-image value for the moon shape; the centre is driven by --rv-mx. */
export const MOON_MASK_IMAGE = `radial-gradient(${MOON_MASK.radius}% ${MOON_MASK.radius}% at var(--rv-mx) 50%, #000 ${MOON_MASK.solid}%, transparent 100%)`;

/** Iris opens on the label while a soft blur pulls focus; compact and lowFx keep only the iris, fade and rise. */
const irisFocus: EffectBuilder = (el, ctx) => {
  useMask(el, "iris");
  const blur = !(ctx.compact || ctx.lowFx);
  const rise = ctx.compact ? 6 : 12;

  const tl = timeline(ctx);
  tl.set(
    el,
    {
      "--rv-o": 0,
      "--rv-mr": "0%",
      "--rv-mx": "50%",
      "--rv-my": "50%",
      "--rv-y": px(rise),
      ...(blur ? { filter: "blur(6px)" } : {})
    },
    0
  );
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-mr": tw("0%", "100%", 720, "outExpo"),
      "--rv-y": tw(px(rise), "0rem", 640, "outQuart"),
      ...(blur ? { filter: tw("blur(6px)", "blur(0px)", 640, "outQuart") } : {})
    },
    0
  );
  return tl;
};

/** A downward mask sweep (desktop) with a vertical unfurl anchored at the baseline; phones unfurl alone. */
const unfurlScale: EffectBuilder = (el, ctx) => {
  useMask(el, "sweep-down");
  const from = ctx.compact ? 0.5 : 0.3;
  const travel = MASK_PATHS["sweep-down"];

  const tl = timeline(ctx);
  tl.set(
    el,
    { "--rv-o": 0, "--rv-sy": from, transformOrigin: "50% 100%", maskPosition: travel.from },
    0
  );
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 260, "outQuad"),
      "--rv-sy": tw(from, 1, 620, "outExpo"),
      maskPosition: tw(travel.from, travel.to, 680, "outQuart")
    },
    0
  );
  return tl;
};

/** Stepped flicker and jitter, like a noisy signal locking; the jitter shrinks to zero and the opacity steadies. */
const signalJitter: EffectBuilder = (el, ctx) => {
  const compact = ctx.compact;
  const jitter = compact ? 0.6 : 1;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 0, "--rv-x": px(-5 * jitter) }, 0);
  tl.add(
    el,
    {
      "--rv-o": seq(0, [
        [0.4, 70, "linear"],
        [0.1, 60, "linear"],
        [0.8, 80, "linear"],
        [1, 130, "outQuad"]
      ]),
      "--rv-x": seq(px(-5 * jitter), [
        [px(3 * jitter), 90, "linear"],
        [px(-2 * jitter), 90, "linear"],
        [px(1 * jitter), 90, "linear"],
        ["0rem", 120, "outQuad"]
      ])
    },
    0
  );
  return tl;
};

/**
 * A moon-shaped mask (desktop) drifts across the label and comes to rest centred.
 * Phones and touch tablets have no mask, so they fade in with a short slide.
 */
const moonPhase: EffectBuilder = (el, ctx) => {
  useMask(el, "moon");
  const start = `${MOON_MASK.start}%`;
  const rest = `${MOON_MASK.end}%`;
  const tl = timeline(ctx);
  tl.set(el, { "--rv-o": 0, "--rv-mx": start, "--rv-x": px(ctx.compact ? -6 : -12) }, 0);
  tl.add(
    el,
    {
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-mx": tw(start, rest, 760, "outCubic"),
      "--rv-x": tw(px(ctx.compact ? -6 : -12), "0rem", 700, "outCubic")
    },
    0
  );
  return tl;
};

/** A single halo ring pulses out behind the label as it rises; the ring is removed with the other fx attributes. */
const haloRingOnce: EffectBuilder = (el, ctx) => {
  if (!useHalo(el, "ring")) return hostFade(el, ctx);
  const tl = timeline(ctx);
  tl.set(
    el,
    { "--rv-o": 0, "--rv-y": px(ctx.compact ? 6 : 10), "--rv-ring-o": 0, "--rv-ring-s": 0.6 },
    0
  );
  tl.add(
    el,
    {
      "--rv-ring-o": seq(0, [
        [0.7, 200, "outQuad"],
        [0, 560, "outQuad"]
      ]),
      "--rv-ring-s": tw(0.6, 1.8, 760, "outExpo"),
      "--rv-o": tw(0, 1, 300, "outQuad"),
      "--rv-y": tw(px(ctx.compact ? 6 : 10), "0rem", 560, "outQuart")
    },
    0
  );
  return tl;
};

export const GEN3_EYEBROW_EFFECTS: Readonly<Record<string, EffectBuilder>> = Object.freeze({
  "eyebrow-iris-focus": irisFocus,
  "eyebrow-unfurl-scale": unfurlScale,
  "eyebrow-signal-jitter": signalJitter,
  "eyebrow-moon-phase": moonPhase,
  "eyebrow-halo-ring-once": haloRingOnce
});
