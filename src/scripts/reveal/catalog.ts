/**
 * Complete effect catalog (191 members across 12 roles).
 *
 * Each profile captures the member's family, cost tier, compact safety,
 * prerequisite geometry capabilities, duration, and fallback target.
 * Used by choreography admit and scoring algorithms.
 */

import type { RevealType } from "./pools";

export type Cost = "plain" | "accent" | "premium";
export type Family = "rise" | "arc" | "iris" | "glow" | "draw" | "wave" | "fold" | "roll" | "coda";

export interface EffectProfile {
  readonly name: string;
  readonly type: RevealType;
  readonly family: Family;
  readonly cost: Cost;
  readonly compactSafe: boolean;
  readonly requires: readonly string[];
  readonly durationMs: number;
  readonly fallback: string;
  readonly flags: {
    readonly mask?: boolean;
    readonly clip?: boolean;
    readonly filter?: boolean;
    readonly textShadow?: boolean;
    readonly halo?: boolean;
    readonly svgDraw?: boolean;
  };
}

/**
 * Columns: name, role, family, cost, compactSafe, requirements, durationMs,
 * fallback, flags. Plain tuples avoid repeating object keys in the eager bundle;
 * decoding once preserves the public profiles and their original catalog order.
 */
type ProfileRow = readonly [
  name: string,
  type: RevealType,
  family: Family,
  cost: Cost,
  compactSafe: boolean,
  requires: readonly string[],
  durationMs: number,
  fallback: string,
  flags: EffectProfile["flags"]
];

function profileFromRow([
  name,
  type,
  family,
  cost,
  compactSafe,
  requires,
  durationMs,
  fallback,
  flags
]: ProfileRow): EffectProfile {
  return { name, type, family, cost, compactSafe, requires, durationMs, fallback, flags };
}

export const CATALOG: readonly EffectProfile[] = Object.freeze(
  (
    [
      // HEADING (19)
      [
        "starlight",
        "heading",
        "rise",
        "plain",
        true,
        ["split-words"],
        760,
        "fade",
        { textShadow: true }
      ],
      ["warp", "heading", "arc", "accent", true, ["split-words"], 820, "starlight", {}],
      ["meteor-shower", "heading", "arc", "accent", true, ["split-words"], 800, "starlight", {}],
      ["pulsar-wave", "heading", "wave", "accent", true, ["split-words"], 780, "starlight", {}],
      [
        "gravity-well",
        "heading",
        "fold",
        "premium",
        false,
        ["split-words", "no-focusable-host"],
        840,
        "starlight",
        {}
      ],
      ["orbital-arc", "heading", "arc", "plain", true, [], 720, "fade", {}],
      ["redshift", "heading", "glow", "accent", true, [], 800, "orbital-arc", { filter: true }],
      [
        "deep-space-signal",
        "heading",
        "draw",
        "plain",
        true,
        ["split-chars"],
        760,
        "starlight",
        {}
      ],
      [
        "ticker-underline",
        "heading",
        "draw",
        "accent",
        true,
        ["split-words"],
        860,
        "word-rise",
        {}
      ],
      [
        "orbit-sweep",
        "heading",
        "draw",
        "plain",
        true,
        ["no-focusable-host"],
        720,
        "word-rise",
        {}
      ],
      [
        "word-fold-in",
        "heading",
        "fold",
        "premium",
        false,
        ["split-words", "no-focusable-host"],
        840,
        "word-rise",
        {}
      ],
      ["word-rise", "heading", "rise", "plain", true, ["split-words"], 720, "fade", {}],
      ["num-roll", "heading", "roll", "plain", true, ["numeric"], 560, "word-rise", {}],
      [
        "nebula-bleed-in",
        "heading",
        "glow",
        "accent",
        true,
        ["split-words"],
        880,
        "starlight",
        { filter: true }
      ],
      ["star-chart-plot", "heading", "rise", "accent", true, ["split-chars"], 760, "starlight", {}],
      [
        "event-horizon-slice",
        "heading",
        "iris",
        "accent",
        true,
        ["split-words"],
        900,
        "warp",
        { clip: true }
      ],
      [
        "solar-flare-ink",
        "heading",
        "glow",
        "accent",
        true,
        ["split-words"],
        780,
        "word-rise",
        { filter: true }
      ],
      ["comet-tail-track", "heading", "arc", "accent", true, ["split-words"], 840, "word-rise", {}],
      ["orbital-kerning", "heading", "arc", "accent", true, ["split-chars"], 880, "starlight", {}],

      // CARD (20)
      ["orbit-in", "card", "arc", "plain", true, [], 760, "fade", {}],
      ["nebula", "card", "glow", "accent", true, [], 800, "orbit-in", { filter: true }],
      ["rise", "card", "rise", "plain", true, [], 640, "fade", {}],
      ["gravity-assist", "card", "arc", "accent", true, [], 840, "orbit-in", {}],
      ["warp-jump", "card", "fold", "premium", false, ["no-focusable-host"], 880, "rise", {}],
      [
        "eclipse-transit",
        "card",
        "iris",
        "premium",
        false,
        ["no-focusable-host"],
        840,
        "orbit-in",
        { mask: true }
      ],
      ["starfield-parallax", "card", "wave", "accent", true, [], 720, "rise", {}],
      ["ring-plane", "card", "arc", "plain", true, [], 800, "orbit-in", {}],
      ["focus-lens-settle", "card", "glow", "accent", true, [], 520, "depth-shift", {}],
      ["ellipse-drift", "card", "arc", "plain", true, [], 720, "depth-shift", {}],
      ["depth-shift", "card", "rise", "plain", true, [], 600, "fade", {}],
      [
        "eclipse-terminator",
        "card",
        "iris",
        "premium",
        false,
        ["no-focusable-host"],
        640,
        "depth-shift",
        { mask: true }
      ],
      ["shutter-rise", "card", "rise", "plain", true, [], 600, "depth-shift", {}],
      ["edge-pulse-once", "card", "glow", "accent", true, [], 720, "depth-shift", {}],
      ["aperture-open", "card", "iris", "accent", true, [], 780, "fade", { mask: true }],
      [
        "lens-flare-sweep",
        "card",
        "glow",
        "accent",
        true,
        [],
        860,
        "fade",
        { mask: true, filter: true }
      ],
      ["scan-line-down", "card", "wave", "accent", true, [], 900, "fade", { mask: true }],
      ["mass-collapse", "card", "rise", "premium", false, [], 820, "fade", { filter: true }],
      ["depth-focus-pull", "card", "rise", "accent", true, [], 900, "fade", { filter: true }],
      ["gyro-tilt-settle", "card", "arc", "premium", false, [], 820, "fade", {}],

      // HERO-NAME (17)
      [
        "supernova",
        "hero-name",
        "glow",
        "premium",
        false,
        ["no-focusable-host"],
        840,
        "hero-name-scale-settle",
        { filter: true, mask: true }
      ],
      [
        "event-horizon",
        "hero-name",
        "fold",
        "premium",
        false,
        ["no-focusable-host"],
        880,
        "hero-name-scale-settle",
        { filter: true }
      ],
      [
        "redshift-arrival",
        "hero-name",
        "glow",
        "accent",
        true,
        [],
        850,
        "hero-name-scale-settle",
        { filter: true }
      ],
      [
        "corona-eclipse",
        "hero-name",
        "iris",
        "premium",
        false,
        ["no-focusable-host"],
        880,
        "hero-name-scale-settle",
        { filter: true }
      ],
      [
        "orbital-capture",
        "hero-name",
        "arc",
        "accent",
        true,
        [],
        820,
        "hero-name-scale-settle",
        { filter: true }
      ],
      [
        "aurora-veil",
        "hero-name",
        "wave",
        "premium",
        false,
        ["no-focusable-host"],
        900,
        "hero-name-scale-settle",
        { filter: true, mask: true }
      ],
      [
        "hero-name-trace",
        "hero-name",
        "wave",
        "premium",
        false,
        ["split-chars", "no-focusable-host"],
        840,
        "hero-name-scale-settle",
        { textShadow: true }
      ],
      [
        "hero-name-scale-settle",
        "hero-name",
        "rise",
        "plain",
        true,
        ["split-words"],
        600,
        "fade",
        {}
      ],
      [
        "hero-name-flare-sweep",
        "hero-name",
        "arc",
        "accent",
        true,
        ["part:flare"],
        900,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-orbit-lock",
        "hero-name",
        "arc",
        "accent",
        true,
        ["part:orbit"],
        800,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-lens-iris",
        "hero-name",
        "iris",
        "accent",
        true,
        ["part:lens"],
        660,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-gradient-slice-drift",
        "hero-name",
        "rise",
        "plain",
        true,
        ["split-chars"],
        720,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-disk-tilt-settle",
        "hero-name",
        "fold",
        "accent",
        true,
        ["split-chars"],
        880,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-singularity-pinch",
        "hero-name",
        "iris",
        "accent",
        true,
        ["split-chars"],
        860,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-pulsar-strobe",
        "hero-name",
        "wave",
        "accent",
        true,
        [],
        840,
        "fade",
        { filter: true }
      ],
      [
        "hero-name-orbit-letter-swap",
        "hero-name",
        "arc",
        "accent",
        true,
        ["split-chars"],
        900,
        "hero-name-scale-settle",
        {}
      ],
      [
        "hero-name-diag-mask-wipe",
        "hero-name",
        "wave",
        "premium",
        false,
        [],
        820,
        "hero-name-scale-settle",
        { mask: true, filter: true }
      ],

      // TEXT (17)
      ["blur-in", "text", "glow", "plain", true, [], 640, "fade", { filter: true }],
      ["wipe-right", "text", "iris", "plain", true, [], 760, "fade", { mask: true }],
      ["fade-up", "text", "rise", "plain", true, [], 560, "fade", {}],
      ["solar-wind", "text", "wave", "accent", false, ["split-words"], 840, "fade-up", {}],
      ["stellar-dawn", "text", "glow", "plain", true, [], 720, "fade-up", { filter: true }],
      ["word-constellation", "text", "wave", "accent", false, ["split-words"], 880, "fade-up", {}],
      ["lines-rise", "text", "rise", "plain", true, ["split-lines"], 800, "paragraph-breathe", {}],
      [
        "word-skew-in",
        "text",
        "fold",
        "plain",
        true,
        ["split-words"],
        780,
        "paragraph-breathe",
        {}
      ],
      ["paragraph-breathe", "text", "coda", "plain", true, [], 640, "fade", {}],
      [
        "line-scan-opacity",
        "text",
        "wave",
        "plain",
        true,
        ["split-lines"],
        460,
        "paragraph-breathe",
        {}
      ],
      [
        "soft-focus-in",
        "text",
        "glow",
        "premium",
        false,
        ["no-focusable-host"],
        600,
        "paragraph-breathe",
        { filter: true }
      ],
      [
        "text-iris-lines",
        "text",
        "iris",
        "accent",
        true,
        ["split-lines"],
        850,
        "fade",
        { clip: true }
      ],
      ["text-tracking-settle", "text", "rise", "plain", true, ["split-words"], 860, "fade", {}],
      ["text-line-fold", "text", "fold", "accent", true, ["split-lines"], 840, "fade", {}],
      ["text-wave-chars", "text", "wave", "accent", true, ["split-chars"], 900, "fade", {}],
      ["text-arc-swing", "text", "arc", "accent", true, ["split-words"], 900, "fade", {}],
      [
        "text-light-sweep",
        "text",
        "glow",
        "premium",
        false,
        ["split-words"],
        840,
        "fade",
        { mask: true, filter: true }
      ],

      // CHIP (17)
      ["twinkle-cluster", "chip", "roll", "plain", true, [], 720, "fade", {}],
      ["meteor-scatter", "chip", "arc", "accent", true, [], 820, "twinkle-cluster", {}],
      ["orbit-ring", "chip", "arc", "plain", true, [], 760, "twinkle-cluster", {}],
      ["solar-flare-burst", "chip", "glow", "accent", true, [], 820, "twinkle-cluster", {}],
      ["asteroid-belt", "chip", "wave", "plain", true, [], 760, "twinkle-cluster", {}],
      ["binary-pulse", "chip", "glow", "plain", true, [], 680, "twinkle-cluster", {}],
      ["orbit-chip-settle", "chip", "arc", "accent", true, [], 660, "chip-wave", {}],
      ["orbit-chip-align", "chip", "arc", "plain", true, [], 720, "chip-wave", {}],
      ["chip-wave", "chip", "wave", "plain", true, [], 720, "fade", {}],
      ["grid-ripple-chips", "chip", "wave", "accent", true, [], 660, "chip-wave", {}],
      ["chip-pop-stack", "chip", "rise", "plain", true, [], 660, "chip-wave", {}],
      ["tag-magnet-snap", "chip", "arc", "accent", true, [], 880, "chip-wave", {}],
      ["satellite-orbit-in", "chip", "arc", "accent", true, [], 840, "chip-wave", {}],
      ["spectrum-lineup", "chip", "wave", "accent", true, [], 720, "fade", { filter: true }],
      ["comet-chip-dash", "chip", "rise", "plain", true, [], 800, "chip-wave", {}],
      ["eclipse-tag-fade", "chip", "iris", "plain", true, [], 720, "chip-wave", { clip: true }],
      ["ripple-spark-once", "chip", "glow", "accent", true, [], 880, "chip-wave", { filter: true }],

      // IMAGE (15)
      [
        "eclipse",
        "image",
        "iris",
        "premium",
        false,
        ["image-not-link"],
        860,
        "image-drift-in",
        { mask: true }
      ],
      ["wipe-up", "image", "iris", "plain", true, [], 760, "image-drift-in", { mask: true }],
      [
        "singularity-iris",
        "image",
        "iris",
        "premium",
        false,
        ["image-not-link"],
        900,
        "image-drift-in",
        { mask: true, filter: true }
      ],
      [
        "gravitational-lens",
        "image",
        "glow",
        "premium",
        false,
        ["image-not-link"],
        840,
        "image-drift-in",
        { halo: true, filter: true }
      ],
      ["lunar-phase", "image", "iris", "plain", true, [], 840, "image-drift-in", { mask: true }],
      [
        "iris-open-lite",
        "image",
        "iris",
        "premium",
        false,
        ["image-not-link"],
        700,
        "image-drift-in",
        { mask: true }
      ],
      ["image-drift-in", "image", "arc", "plain", true, [], 900, "fade", {}],
      [
        "image-shutter-sweep",
        "image",
        "iris",
        "premium",
        false,
        ["image-not-link"],
        820,
        "image-drift-in",
        { mask: true }
      ],
      [
        "image-focus-pull",
        "image",
        "glow",
        "premium",
        false,
        ["image-not-link"],
        800,
        "image-drift-in",
        { filter: true }
      ],
      [
        "image-corner-aperture",
        "image",
        "iris",
        "accent",
        true,
        ["image-not-link"],
        900,
        "image-drift-in",
        { mask: true }
      ],
      [
        "image-eclipse-exit",
        "image",
        "iris",
        "accent",
        true,
        ["image-not-link"],
        900,
        "image-drift-in",
        { mask: true }
      ],
      [
        "image-chroma-bloom",
        "image",
        "glow",
        "accent",
        true,
        ["image-not-link"],
        900,
        "image-drift-in",
        { filter: true }
      ],
      ["image-arc-swing", "image", "arc", "plain", true, [], 900, "image-drift-in", {}],
      ["image-squash-settle", "image", "wave", "plain", true, [], 820, "image-drift-in", {}],
      [
        "image-curtain-drop",
        "image",
        "roll",
        "accent",
        true,
        ["image-not-link"],
        880,
        "image-drift-in",
        { mask: true, filter: true }
      ],

      // BUTTON (16)
      ["gravity", "button", "rise", "plain", true, [], 520, "fade", {}],
      ["zoom-in", "button", "roll", "plain", true, [], 480, "fade", {}],
      ["thruster-ignition", "button", "glow", "accent", true, [], 720, "gravity", {}],
      ["docking-sequence", "button", "arc", "plain", true, [], 640, "gravity", {}],
      ["quasar-flash", "button", "glow", "accent", true, [], 640, "gravity", { filter: true }],
      ["button-press-in", "button", "rise", "accent", true, [], 380, "button-thruster", {}],
      ["button-thruster", "button", "rise", "plain", true, [], 520, "fade", {}],
      ["button-dock-slide", "button", "arc", "plain", true, [], 560, "button-thruster", {}],
      ["button-tick-scale", "button", "roll", "plain", true, [], 460, "button-thruster", {}],
      ["button-ripple-once", "button", "glow", "accent", true, [], 520, "button-press-in", {}],
      [
        "button-iris-unveil",
        "button",
        "iris",
        "accent",
        true,
        [],
        580,
        "button-press-in",
        { mask: true }
      ],
      [
        "button-wipe-glint",
        "button",
        "roll",
        "accent",
        true,
        [],
        640,
        "button-dock-slide",
        { mask: true }
      ],
      [
        "button-blur-focus",
        "button",
        "rise",
        "accent",
        true,
        [],
        700,
        "button-press-in",
        { filter: true }
      ],
      ["button-hinge-drop", "button", "fold", "plain", true, [], 680, "button-thruster", {}],
      ["button-tremor-settle", "button", "wave", "plain", true, [], 460, "button-tick-scale", {}],
      ["button-orbit-arc", "button", "arc", "plain", true, [], 700, "docking-sequence", {}],

      // ICON (16)
      ["ring", "icon", "glow", "plain", true, [], 580, "fade", { halo: true }],
      ["twinkle", "icon", "roll", "plain", true, [], 560, "fade", {}],
      ["pulsar-beacon", "icon", "glow", "accent", true, [], 760, "ring", { halo: true }],
      ["orbit-spin", "icon", "roll", "plain", true, [], 620, "twinkle", {}],
      ["comet-flyby", "icon", "arc", "accent", true, [], 680, "twinkle", {}],
      [
        "corona-icon-pop",
        "icon",
        "glow",
        "premium",
        false,
        [],
        640,
        "icon-drop-settle",
        { halo: true }
      ],
      ["icon-spin-in", "icon", "roll", "plain", true, [], 620, "icon-drop-settle", {}],
      ["icon-drop-settle", "icon", "rise", "plain", true, [], 520, "fade", {}],
      [
        "icon-draw-in",
        "icon",
        "draw",
        "accent",
        true,
        ["stroke"],
        620,
        "icon-drop-settle",
        { svgDraw: true }
      ],
      ["icon-twin-pop", "icon", "roll", "plain", true, [], 560, "icon-drop-settle", {}],
      [
        "icon-iris-bloom",
        "icon",
        "iris",
        "accent",
        true,
        [],
        660,
        "icon-drop-settle",
        { mask: true }
      ],
      ["icon-gyro-settle", "icon", "roll", "plain", true, [], 560, "icon-spin-in", {}],
      ["icon-core-ignite", "icon", "glow", "accent", true, [], 660, "fade", { filter: true }],
      [
        "icon-rim-trace",
        "icon",
        "draw",
        "accent",
        true,
        ["stroke"],
        680,
        "icon-draw-in",
        { svgDraw: true }
      ],
      [
        "icon-signal-ping",
        "icon",
        "glow",
        "premium",
        false,
        [],
        620,
        "corona-icon-pop",
        { halo: true }
      ],
      ["icon-planet-arc", "icon", "arc", "accent", true, [], 560, "icon-drop-settle", {}],

      // EYEBROW (14)
      ["fade", "eyebrow", "coda", "plain", true, [], 400, "fade", {}],
      ["fade-left", "eyebrow", "arc", "plain", true, [], 420, "fade", {}],
      ["fade-right", "eyebrow", "arc", "plain", true, [], 420, "fade", {}],
      ["transmission", "eyebrow", "draw", "plain", true, [], 520, "fade", {}],
      ["aurora-sweep", "eyebrow", "wave", "accent", true, [], 640, "fade", { mask: true }],
      ["eyebrow-two-step", "eyebrow", "coda", "plain", true, [], 360, "fade", {}],
      ["eyebrow-slide-track", "eyebrow", "arc", "plain", true, [], 380, "eyebrow-two-step", {}],
      ["eyebrow-settle-scale", "eyebrow", "rise", "plain", true, [], 380, "fade", {}],
      [
        "eyebrow-flash-once",
        "eyebrow",
        "glow",
        "accent",
        true,
        [],
        480,
        "eyebrow-two-step",
        { filter: true }
      ],
      [
        "eyebrow-iris-focus",
        "eyebrow",
        "iris",
        "accent",
        true,
        [],
        720,
        "eyebrow-settle-scale",
        { mask: true, filter: true }
      ],
      [
        "eyebrow-unfurl-scale",
        "eyebrow",
        "fold",
        "accent",
        true,
        [],
        680,
        "eyebrow-settle-scale",
        { mask: true }
      ],
      ["eyebrow-signal-jitter", "eyebrow", "wave", "plain", true, [], 390, "eyebrow-two-step", {}],
      [
        "eyebrow-moon-phase",
        "eyebrow",
        "iris",
        "accent",
        true,
        [],
        760,
        "eyebrow-slide-track",
        { mask: true }
      ],
      [
        "eyebrow-halo-ring-once",
        "eyebrow",
        "rise",
        "accent",
        true,
        [],
        760,
        "fade",
        { halo: true }
      ],

      // TIMELINE (14)
      ["constellation", "timeline", "wave", "plain", true, [], 680, "fade", {}],
      ["comet-chain", "timeline", "arc", "accent", true, [], 760, "constellation", {}],
      ["pulsar-sequence", "timeline", "glow", "plain", true, [], 720, "constellation", {}],
      ["meteor-rain", "timeline", "arc", "plain", true, [], 800, "constellation", {}],
      ["timeline-tick-in", "timeline", "draw", "plain", true, [], 700, "timeline-node-pop", {}],
      ["timeline-track-grow", "timeline", "draw", "plain", true, [], 760, "timeline-node-pop", {}],
      ["timeline-node-pop", "timeline", "roll", "plain", true, [], 660, "fade", {}],
      [
        "timeline-cascade-drop",
        "timeline",
        "wave",
        "plain",
        true,
        [],
        800,
        "timeline-node-pop",
        {}
      ],
      [
        "meridian-sweep",
        "timeline",
        "draw",
        "accent",
        true,
        [],
        840,
        "timeline-track-grow",
        { clip: true, filter: true }
      ],
      ["star-hop-nodes", "timeline", "arc", "plain", true, [], 720, "timeline-node-pop", {}],
      [
        "gravity-pull-entries",
        "timeline",
        "rise",
        "accent",
        true,
        [],
        820,
        "timeline-cascade-drop",
        { filter: true }
      ],
      [
        "beacon-node-blink",
        "timeline",
        "glow",
        "accent",
        true,
        [],
        760,
        "timeline-node-pop",
        { filter: true }
      ],
      [
        "date-coordinate-roll",
        "timeline",
        "roll",
        "accent",
        true,
        [],
        720,
        "timeline-node-pop",
        { clip: true }
      ],
      ["ring-stack-in", "timeline", "arc", "plain", true, [], 820, "timeline-cascade-drop", {}],

      // LINE (14)
      ["comet-trail", "line", "arc", "accent", true, [], 680, "fade", {}],
      ["light-speed", "line", "draw", "plain", true, [], 640, "fade", {}],
      ["pulsar-beam", "line", "glow", "plain", true, [], 720, "light-speed", {}],
      ["retrograde", "line", "arc", "plain", true, [], 620, "light-speed", {}],
      ["signal-line-draw", "line", "draw", "plain", true, [], 620, "fade", {}],
      [
        "drawn-rule",
        "line",
        "draw",
        "accent",
        true,
        ["stroke"],
        640,
        "signal-line-draw",
        { svgDraw: true }
      ],
      [
        "ink-wipe-line",
        "line",
        "iris",
        "premium",
        false,
        [],
        640,
        "signal-line-draw",
        { mask: true }
      ],
      ["pulse-trace-line", "line", "glow", "plain", true, [], 560, "signal-line-draw", {}],
      [
        "line-fork-split",
        "line",
        "iris",
        "accent",
        true,
        [],
        640,
        "signal-line-draw",
        { filter: true, svgDraw: true }
      ],
      [
        "line-stepped-measure",
        "line",
        "draw",
        "plain",
        true,
        [],
        840,
        "drawn-rule",
        { svgDraw: true }
      ],
      [
        "line-spring-overshoot",
        "line",
        "wave",
        "accent",
        true,
        [],
        800,
        "pulse-trace-line",
        { svgDraw: true }
      ],
      [
        "line-thin-thick-settle",
        "line",
        "glow",
        "accent",
        true,
        [],
        760,
        "signal-line-draw",
        { filter: true, svgDraw: true }
      ],
      [
        "line-dock-slide",
        "line",
        "rise",
        "plain",
        true,
        [],
        620,
        "signal-line-draw",
        { svgDraw: true }
      ],
      [
        "line-ripple-wave",
        "line",
        "wave",
        "accent",
        true,
        [],
        840,
        "signal-line-draw",
        { svgDraw: true }
      ],

      // FOOTER (12)
      ["stardust", "footer", "coda", "plain", true, [], 540, "fade", {}],
      ["heartbeat-pulsar", "footer", "glow", "accent", true, ["part:heart"], 680, "stardust", {}],
      ["cosmic-dust", "footer", "coda", "plain", true, [], 600, "stardust", {}],
      ["footer-coda-fade", "footer", "coda", "plain", true, [], 740, "fade", {}],
      [
        "footer-heart-pulse-once",
        "footer",
        "glow",
        "accent",
        true,
        ["part:heart"],
        460,
        "footer-coda-fade",
        {}
      ],
      ["footer-dock-rise", "footer", "rise", "plain", true, [], 600, "footer-coda-fade", {}],
      [
        "footer-iris-bloom",
        "footer",
        "iris",
        "accent",
        true,
        [],
        820,
        "footer-coda-fade",
        { mask: true, filter: true }
      ],
      [
        "footer-light-sweep",
        "footer",
        "wave",
        "accent",
        true,
        [],
        860,
        "footer-coda-fade",
        { mask: true, filter: true }
      ],
      ["footer-arc-links", "footer", "arc", "plain", true, [], 840, "footer-coda-fade", {}],
      [
        "footer-heart-orbit-dock",
        "footer",
        "arc",
        "accent",
        true,
        ["part:heart"],
        840,
        "footer-dock-rise",
        {}
      ],
      [
        "footer-line-wipe",
        "footer",
        "draw",
        "plain",
        true,
        [],
        760,
        "footer-coda-fade",
        { clip: true }
      ],
      [
        "footer-depth-settle",
        "footer",
        "fold",
        "accent",
        true,
        [],
        820,
        "footer-dock-rise",
        { filter: true }
      ]
    ] satisfies ProfileRow[]
  ).map(profileFromRow)
);

const BY_NAME = new Map<string, EffectProfile>();
for (const p of CATALOG) {
  BY_NAME.set(p.name, p);
}

/** Looks up a member's profile by name. */
export function profileOf(name: string): EffectProfile | undefined {
  return BY_NAME.get(name);
}

/**
 * Returns a canonical signature string for uniqueness testing and grouping.
 * Combines role type, family, cost, durationMs, and active flags.
 */
export function signatureOf(p: EffectProfile): string {
  const flags = Object.entries(p.flags)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .sort()
    .join(",");
  const reqs = [...p.requires].sort().join(",");
  return `${p.type}:${p.name}:${p.family}:${p.cost}:${p.durationMs}:${reqs}:${flags}`;
}
