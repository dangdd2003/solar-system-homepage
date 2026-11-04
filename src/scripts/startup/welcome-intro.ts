/**
 * Welcome intro choreography for the startup overlay (anime.js v4).
 *
 * Every motion runs on transform, opacity, filter and clip-path, so the layout never reflows:
 * - Eyebrow and subtitle: each character rises from behind its own line mask, centre-out (the
 *   `overflow: hidden` on each welcome line), unrolls from a slight rotateX and sharpens
 *   from a short blur. The rise uses an anime.js spring, so each glyph settles with a
 *   barely-there overshoot instead of a hard stop.
 * - Title: a clip-path wipe with a slow scale settle. The mask edge sweeps up through the
 *   title box while the title eases from 103.5% to rest, the blur clears and the gold glow
 *   blooms to rest. The mask is in the title's own box, so the wipe edge stays with the glyphs.
 *
 * Start times come from `computeWelcomeTiming`, so the intro's length follows the text.
 */

import { spring, type EasingParam, type Timeline } from "animejs";
import { CHAR_DUR_MS, WHOLE_LINE_SPAN_MS } from "./welcome-timing";
import { TITLE_GLOW_REST } from "./welcome";

export interface IntroLine {
  /** Elements that animate: the split characters of a line, or a single element. */
  readonly targets: readonly HTMLElement[];
  /** Start of this line in ms on the intro timeline. */
  readonly start: number;
  /** Delay between neighbouring targets in ms. */
  readonly step: number;
  /** Rise distance in percent of the target's height, or null when the target does not rise. */
  readonly riseFrom: string | null;
  /** Duration of each target's motion. */
  readonly durationMs: number;
  /** Easing of the rise or wipe. */
  readonly ease: EasingParam;
  /** Clip-path that starts the wipe, or null when the target is not wiped. */
  readonly wipeFrom: string | null;
  /** Scale at the start of the settle, or null when the target does not scale. */
  readonly scaleFrom: number | null;
  /** Blur or glow at the start of the intro. */
  readonly blurFrom: string;
  readonly blurEase: EasingParam;
  readonly blurMs: number;
  /** Starting rotateX in degrees (used only when the target rises). */
  readonly rotateFrom: number;
  /** True when the target settles on the title's gold glow rather than a plain blur(0). */
  readonly glow: boolean;
}

/** The clip-path at rest: a little slack on every side so the glow and descenders are never cut. */
const WIPE_REST = "inset(-40% -25% -40% -25%)";

/** Spring for glyph rises: a small overshoot that reads as a settle, not a bounce. */
const GLYPH_SPRING = spring({ bounce: 0.18, duration: CHAR_DUR_MS });

const CHAR_LINE: Omit<IntroLine, "targets" | "start" | "step"> = {
  riseFrom: "110%",
  durationMs: CHAR_DUR_MS,
  ease: GLYPH_SPRING,
  wipeFrom: null,
  scaleFrom: null,
  blurFrom: "blur(10px)",
  blurEase: "outSine",
  blurMs: Math.round(CHAR_DUR_MS * 0.7),
  rotateFrom: -75,
  glow: false
};

/** Line settings for split characters (eyebrow and subtitle). */
export function charLine(targets: readonly HTMLElement[], start: number, step: number): IntroLine {
  return { ...CHAR_LINE, targets, start, step };
}

/**
 * Line settings for the title, animated as one unit so its gradient stays whole. The
 * clip-path wipe is the mask; the scale settle is centred, so the wipe edge stays on the glyphs.
 * Its span is WHOLE_LINE_SPAN_MS, the value `computeWelcomeTiming` advances the cursor by.
 */
export function titleLine(target: HTMLElement, start: number): IntroLine {
  return {
    targets: [target],
    start,
    step: 0,
    riseFrom: null,
    durationMs: WHOLE_LINE_SPAN_MS,
    ease: "outExpo",
    wipeFrom: "inset(100% -25% -40% -25%)",
    scaleFrom: 1.035,
    blurFrom: "blur(12px) drop-shadow(0px 0px 18px rgba(254, 215, 102, 0.5))",
    blurEase: "outSine",
    blurMs: 560,
    rotateFrom: 0,
    glow: true
  };
}

/**
 * Sets each target's pre-intro state synchronously, so the resting text never paints
 * before the intro begins. Called as soon as the controller exists, before fonts resolve.
 */
export function primeIntro(line: IntroLine): void {
  for (const el of line.targets) {
    el.style.opacity = "0";
    const transforms: string[] = [];
    if (line.riseFrom !== null) {
      transforms.push(`translate3d(0px, ${line.riseFrom}, 0) rotateX(${line.rotateFrom}deg)`);
    }
    if (line.scaleFrom !== null) transforms.push(`scale(${line.scaleFrom})`);
    el.style.transform = transforms.join(" ");
    el.style.filter = line.blurFrom;
    el.style.clipPath = line.wipeFrom ?? "";
  }
}

/**
 * Start offset of a target within its line. Split lines unfold from the centre outward, so
 * the glyphs closest to the middle rise first and the edges settle last. The offset is
 * 2 * step per unit of distance from the centre, which makes the last glyph land at
 * `(n - 1) * step`, the same spread `lineSpreadMs` reports to the hold timing.
 */
export function centerOutOffset(index: number, count: number, step: number): number {
  const distance = Math.abs(index - (count - 1) / 2);
  return distance * 2 * step;
}

/** Adds one line's motion to the intro timeline, each target at its own absolute position. */
export function addIntroLine(timeline: Timeline, line: IntroLine): void {
  line.targets.forEach((el, index) => {
    const position = line.start + centerOutOffset(index, line.targets.length, line.step);
    timeline.add(
      el,
      {
        opacity: { from: 0, to: 1, duration: Math.round(line.durationMs * 0.6), ease: "outSine" },
        filter: {
          from: line.blurFrom,
          to: line.glow ? TITLE_GLOW_REST : "blur(0px)",
          duration: line.blurMs,
          ease: line.blurEase
        },
        ...(line.riseFrom === null
          ? {}
          : {
              translateY: {
                from: line.riseFrom,
                to: "0%",
                duration: line.durationMs,
                ease: line.ease
              },
              rotateX: { from: line.rotateFrom, to: 0, duration: line.durationMs, ease: line.ease }
            }),
        ...(line.scaleFrom === null
          ? {}
          : {
              scale: { from: line.scaleFrom, to: 1, duration: line.durationMs, ease: "outQuart" }
            }),
        ...(line.wipeFrom === null
          ? {}
          : {
              clipPath: {
                from: line.wipeFrom,
                to: WIPE_REST,
                duration: line.durationMs,
                ease: line.ease
              }
            })
      },
      position
    );
  });
}
