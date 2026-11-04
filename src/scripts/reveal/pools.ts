/**
 * Effect pools per reveal type (data only).
 *
 * A `data-reveal="@<type>"` element draws one member of its type's pool each
 * time its panel is entered (see randomizer.ts). `PATTERNS` lists the cascade
 * orders that type may use. Pool members are builders in ./pools/<type>.ts and
 * ./pools/gen2-<type>.ts; they are registered in ./effects.ts.
 */

import type { StaggerPattern } from "./kit";

export const REVEAL_TYPES = [
  "heading",
  "card",
  "hero-name",
  "text",
  "chip",
  "image",
  "button",
  "icon",
  "eyebrow",
  "timeline",
  "line",
  "footer"
] as const;

export type RevealType = (typeof REVEAL_TYPES)[number];

/** One pool member. `compact: false` keeps it off screens at most 480px wide. */
export interface PoolEntry {
  readonly name: string;
  readonly compact?: false;
}

export function isRevealType(value: string): value is RevealType {
  return (REVEAL_TYPES as readonly string[]).includes(value);
}

const LINEAR = ["first", "last", "center", "random"] as const satisfies readonly StaggerPattern[];
const GRID = [...LINEAR, "grid-center", "grid-corner"] as const satisfies readonly StaggerPattern[];

/** Cascade orders each type may roll (the roller never repeats the last one). */
export const PATTERNS = Object.freeze({
  heading: LINEAR,
  card: GRID,
  "hero-name": ["first"],
  text: LINEAR,
  chip: GRID,
  image: ["first"],
  button: LINEAR,
  icon: GRID,
  eyebrow: LINEAR,
  timeline: LINEAR,
  line: LINEAR,
  footer: ["first"]
} satisfies Record<RevealType, readonly StaggerPattern[]>);

export const POOLS = Object.freeze({
  heading: [
    { name: "starlight" },
    { name: "warp" },
    { name: "meteor-shower" },
    { name: "pulsar-wave" },
    { name: "gravity-well" },
    { name: "orbital-arc" },
    { name: "redshift" },
    { name: "deep-space-signal" },
    { name: "ticker-underline" },
    { name: "orbit-sweep" },
    { name: "word-fold-in" },
    { name: "word-rise" },
    { name: "num-roll" },
    { name: "nebula-bleed-in" },
    { name: "star-chart-plot" },
    { name: "event-horizon-slice" },
    { name: "solar-flare-ink" },
    { name: "comet-tail-track" },
    { name: "orbital-kerning" }
  ],
  card: [
    { name: "orbit-in" },
    { name: "nebula" },
    { name: "rise" },
    { name: "gravity-assist" },
    { name: "warp-jump" },
    { name: "eclipse-transit" },
    { name: "starfield-parallax" },
    { name: "ring-plane" },
    { name: "focus-lens-settle" },
    { name: "ellipse-drift" },
    { name: "depth-shift" },
    { name: "eclipse-terminator" },
    { name: "shutter-rise" },
    { name: "edge-pulse-once" },
    { name: "aperture-open" },
    { name: "lens-flare-sweep" },
    { name: "scan-line-down" },
    { name: "mass-collapse" },
    { name: "depth-focus-pull" },
    { name: "gyro-tilt-settle" }
  ],
  "hero-name": [
    { name: "supernova" },
    { name: "event-horizon" },
    { name: "redshift-arrival" },
    { name: "corona-eclipse" },
    { name: "orbital-capture" },
    { name: "aurora-veil" },
    { name: "hero-name-trace" },
    { name: "hero-name-scale-settle" },
    { name: "hero-name-flare-sweep" },
    { name: "hero-name-orbit-lock" },
    { name: "hero-name-lens-iris" },
    { name: "hero-name-gradient-slice-drift" },
    { name: "hero-name-disk-tilt-settle" },
    { name: "hero-name-singularity-pinch" },
    { name: "hero-name-pulsar-strobe" },
    { name: "hero-name-orbit-letter-swap" },
    { name: "hero-name-diag-mask-wipe", compact: false }
  ],
  text: [
    { name: "blur-in" },
    { name: "wipe-right" },
    { name: "fade-up" },
    { name: "solar-wind", compact: false },
    { name: "stellar-dawn" },
    { name: "word-constellation", compact: false },
    { name: "lines-rise" },
    { name: "word-skew-in" },
    { name: "paragraph-breathe" },
    { name: "line-scan-opacity" },
    { name: "soft-focus-in" },
    { name: "text-iris-lines" },
    { name: "text-tracking-settle" },
    { name: "text-line-fold" },
    { name: "text-wave-chars" },
    { name: "text-arc-swing" },
    { name: "text-light-sweep" }
  ],
  chip: [
    { name: "twinkle-cluster" },
    { name: "meteor-scatter" },
    { name: "orbit-ring" },
    { name: "solar-flare-burst" },
    { name: "asteroid-belt" },
    { name: "binary-pulse" },
    { name: "orbit-chip-settle" },
    { name: "orbit-chip-align" },
    { name: "chip-wave" },
    { name: "grid-ripple-chips" },
    { name: "chip-pop-stack" },
    { name: "tag-magnet-snap" },
    { name: "satellite-orbit-in" },
    { name: "spectrum-lineup" },
    { name: "comet-chip-dash" },
    { name: "eclipse-tag-fade" },
    { name: "ripple-spark-once" }
  ],
  image: [
    { name: "eclipse" },
    { name: "wipe-up" },
    { name: "singularity-iris" },
    { name: "gravitational-lens" },
    { name: "lunar-phase" },
    { name: "iris-open-lite" },
    { name: "image-drift-in" },
    { name: "image-shutter-sweep" },
    { name: "image-focus-pull" },
    { name: "image-corner-aperture" },
    { name: "image-eclipse-exit" },
    { name: "image-chroma-bloom" },
    { name: "image-arc-swing" },
    { name: "image-squash-settle" },
    { name: "image-curtain-drop" }
  ],
  button: [
    { name: "gravity" },
    { name: "zoom-in" },
    { name: "thruster-ignition" },
    { name: "docking-sequence" },
    { name: "quasar-flash" },
    { name: "button-press-in" },
    { name: "button-thruster" },
    { name: "button-dock-slide" },
    { name: "button-tick-scale" },
    { name: "button-ripple-once" },
    { name: "button-iris-unveil" },
    { name: "button-wipe-glint" },
    { name: "button-blur-focus" },
    { name: "button-hinge-drop" },
    { name: "button-tremor-settle" },
    { name: "button-orbit-arc" }
  ],
  icon: [
    { name: "ring" },
    { name: "twinkle" },
    { name: "pulsar-beacon" },
    { name: "orbit-spin" },
    { name: "comet-flyby" },
    { name: "corona-icon-pop" },
    { name: "icon-spin-in" },
    { name: "icon-drop-settle" },
    { name: "icon-draw-in" },
    { name: "icon-twin-pop" },
    { name: "icon-iris-bloom" },
    { name: "icon-gyro-settle" },
    { name: "icon-core-ignite" },
    { name: "icon-rim-trace" },
    { name: "icon-signal-ping", compact: false },
    { name: "icon-planet-arc" }
  ],
  eyebrow: [
    { name: "fade" },
    { name: "fade-left" },
    { name: "fade-right" },
    { name: "transmission" },
    { name: "aurora-sweep" },
    { name: "eyebrow-two-step" },
    { name: "eyebrow-slide-track" },
    { name: "eyebrow-settle-scale" },
    { name: "eyebrow-flash-once" },
    { name: "eyebrow-iris-focus" },
    { name: "eyebrow-unfurl-scale" },
    { name: "eyebrow-signal-jitter" },
    { name: "eyebrow-moon-phase" },
    { name: "eyebrow-halo-ring-once" }
  ],
  timeline: [
    { name: "constellation" },
    { name: "comet-chain" },
    { name: "pulsar-sequence" },
    { name: "meteor-rain" },
    { name: "timeline-tick-in" },
    { name: "timeline-track-grow" },
    { name: "timeline-node-pop" },
    { name: "timeline-cascade-drop" },
    { name: "meridian-sweep" },
    { name: "star-hop-nodes" },
    { name: "gravity-pull-entries" },
    { name: "beacon-node-blink" },
    { name: "date-coordinate-roll" },
    { name: "ring-stack-in" }
  ],
  line: [
    { name: "comet-trail" },
    { name: "light-speed" },
    { name: "pulsar-beam" },
    { name: "retrograde" },
    { name: "signal-line-draw" },
    { name: "drawn-rule" },
    { name: "ink-wipe-line" },
    { name: "pulse-trace-line" },
    { name: "line-fork-split" },
    { name: "line-stepped-measure" },
    { name: "line-spring-overshoot" },
    { name: "line-thin-thick-settle" },
    { name: "line-dock-slide" },
    { name: "line-ripple-wave" }
  ],
  footer: [
    { name: "stardust" },
    { name: "heartbeat-pulsar" },
    { name: "cosmic-dust" },
    { name: "footer-coda-fade" },
    { name: "footer-heart-pulse-once" },
    { name: "footer-dock-rise" },
    { name: "footer-iris-bloom" },
    { name: "footer-light-sweep" },
    { name: "footer-arc-links" },
    { name: "footer-heart-orbit-dock" },
    { name: "footer-line-wipe" },
    { name: "footer-depth-settle" }
  ]
} as const satisfies Record<RevealType, readonly PoolEntry[]>);

/** Every pool member name; literal so a typo in a roll or a test is a compile error. */
export type PoolName = (typeof POOLS)[RevealType][number]["name"];
