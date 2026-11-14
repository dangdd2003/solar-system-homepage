/**
 * First-load startup sequence: welcome text shimmers with a continuous solar wave,
 * streams inward into the centre as a gravitational accretion cascade, and ignites the
 * single-owner Anime.js solar aperture (`[data-aperture="master"]`): the ring opens onto
 * the Sun, shrinks back to the centre, then re-emerges and accelerates outward to reveal
 * the page while the sunlight at the centre holds still.
 *
 * The opening effect has one visual owner: `[data-aperture="master"]`. Anime.js
 * drives that element's registered CSS custom properties as a unified timeline.
 * The welcome text is never reset to opacity: 0 after first paint, eliminating
 * any double-blink or flash when JS initializes or when the Sun texture finishes
 * loading.
 *
 * Reduced motion and browsers that cannot run Anime.js use the same lifecycle
 * timers, skipping visual interpolation so startup always completes cleanly.
 */

import {
  animate,
  createTimeline,
  type EasingParam,
  type JSAnimation,
  type Timeline,
  type TweenKeyValue
} from "animejs";
import {
  acceleratingEase,
  computeApertureMetrics,
  DEFAULT_APERTURE_TIMING,
  firstRingMs,
  GLARE_RING_THICK,
  maxRadiusFor,
  totalApertureMs,
  type ApertureGeometry,
  type ApertureTiming
} from "./startup/aperture";
import {
  absorbDelay,
  centerOffset,
  letterEmberFrames,
  splitLetters,
  titleCollapseFrames,
  normaliseTransform,
  TITLE_LINE_SCALE,
  type LineState
} from "./startup/welcome";
import {
  addIntroLine,
  charLine,
  primeIntro,
  titleLine,
  type IntroLine
} from "./startup/welcome-intro";
import { clamp01 } from "../utils/math";
import { nowMs } from "../utils/clock";
import { charStepMs, computeWelcomeTiming, type WelcomeTiming } from "./startup/welcome-timing";
import { lastRevealProgressMs, REVEAL_STALL_MS, revealLimitPx } from "./startup/reveal-gate";
import { capFontWait, FONT_WAIT_MS } from "./startup/font-wait";
import { afterTwoFrames, announceIntroStarted } from "./startup/intro-signal";

export const STARTUP_SESSION_KEY = "d_dev_has_seen_startup";

/**
 * Cinematic pacing. The text is drawn into the Sun as embers and a line of light, landing
 * exactly as the aperture's seed (its first act) condenses: the seed starts at
 * TEXT_DISSOLVE_MS and lasts DEFAULT_APERTURE_TIMING.seedMs, and the title's collapse and
 * the last embers end around that moment, so the light is handed over without a gap.
 */
const TEXT_DISSOLVE_MS = 560;
const LETTER_EMBER_MS = 760;
const LETTER_SPREAD_MS = 240;
const TITLE_START_MS = 40;
const TITLE_COLLAPSE_MS = 900;
/** The field is already clear when this runs, so it only softens the hand-off to the page. */
const FADE_OUT_MS = 200;
const SETTLE_SLACK_MS = 40;

/**
 * Reveal gate pacing. The aperture's visible edge (radius plus 1.15 x feather) may
 * never pass the scene's reveal limit. Inside GATE_BAND_PX of the limit the timeline
 * decelerates; at the limit it holds until the scene reports more texture.
 * Feather 1.15 is where the outer ring is 95% void, so any scene show-through is
 * counted as inside the aperture (conservative).
 */
const GATE_BAND_PX = 110;
const GATE_VISIBLE_FEATHER = 1.15;
/** Fraction of the remaining distance a single frame may consume. */
const GATE_STEP_SAFETY = 0.5;
/**
 * Longest one blast hold may last, counted from the frame the limit first slows the wavefront.
 * Textures still arriving after this pop in behind the reveal instead of stalling the first view.
 * The first ring (open and shrink) is never held.
 */
export const MAX_GATE_WAIT_MS = 1200;
/**
 * How often the finish watchdog re-checks a timeline that is still playing after its authored
 * deadline. A gate hold slows the timeline below the wall clock, so the blast can still have
 * frames left when the deadline passes.
 */
export const WATCHDOG_RECHECK_MS = 200;
const GATE_FRAME_MS = 1000 / 60;
const GATE_MAX_FRAME_MS = 100;
const GATE_SPEED_SMOOTH_MS = 140;
const GATE_VELOCITY_DECAY_MS = 600;
/** Below this speed the timeline is paused rather than crawled. */
const GATE_MIN_PLAY_SPEED = 0.02;
/** Period of the corona's breathing while the gate holds the wavefront. */
const HOLD_PULSE_PERIOD_MS = 1600;
/** Deepest dip of the held corona's brightness, as a fraction of full. */
const HOLD_PULSE_DEPTH = 0.22;
/** Time constant for easing the hold pulse in and out, so it never snaps. */
const HOLD_PULSE_SMOOTH_MS = 260;
/** Time for a released hold's corona to ease back to full brightness. */
const HOLD_PULSE_SETTLE_MS = 320;

const DEFAULT_SUN_RADIUS_PX = 72;

function sampleLine(el: HTMLElement): LineState {
  const cs = getComputedStyle(el);
  const opacity = parseFloat(cs.opacity);
  return {
    transform: normaliseTransform(cs.transform || "none"),
    opacity: Number.isFinite(opacity) ? opacity : 1,
    filter: cs.filter || "none",
    color: cs.color
  };
}

/** Freeze a CSS entrance before Anime.js takes ownership of the same properties. */
function commitEntrance(el: HTMLElement): void {
  if (typeof el.getAnimations !== "function") return;
  for (const animation of el.getAnimations()) {
    try {
      animation.commitStyles();
    } catch {
      // Some browsers expose getAnimations but not commitStyles.
    }
    try {
      animation.cancel();
    } catch {
      // The animation may have completed between the two calls.
    }
  }
}

/** A custom property's live numeric value (as Anime.js writes it inline), or `fallback`. */
function readNumber(el: HTMLElement, name: string, fallback: number): number {
  const value = parseFloat(el.style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function tween(
  from: string | number,
  to: string | number,
  duration: number,
  ease: EasingParam
): TweenKeyValue {
  return { from, to, duration, ease };
}

type Segments = ReadonlyArray<readonly [duration: number, ease: EasingParam]>;

/** Keyframes through `values` (index 0 is the start), one segment per later value. */
function keyframes(values: ReadonlyArray<string | number>, segments: Segments): TweenKeyValue[] {
  const [first = 0, ...rest] = values;
  return seq(
    first,
    segments.map(([duration, ease], index) => [rest[index] ?? first, duration, ease] as const)
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function seq(
  from: string | number,
  steps: ReadonlyArray<readonly [to: string | number, duration: number, ease: EasingParam]>
): TweenKeyValue[] {
  return steps.map(([to, duration, ease], index) =>
    index === 0 ? { from, to, duration, ease } : { to, duration, ease }
  );
}

export interface StartupControllerOptions {
  container?: HTMLElement | null | undefined;
  welcomeEl?: HTMLElement | null | undefined;
  reducedMotion?: boolean | undefined;
  /**
   * Low-effects tier (phones, save-data, reduced transparency, forced colors, zoom). The aperture
   * keeps its radius and fade, but its coronal rays hold still and the page drops the blur and
   * blend layers that are costly to repaint across a full phone viewport.
   */
  lowFx?: boolean | undefined;
  sunRadiusPx?: number | undefined;
  /** Seed act: the text condenses into a point of sunlight. */
  sunSeedDurationMs?: number | undefined;
  /** Open act: the point opens, in one move, into the Sun-sized ring. */
  sunRevealDurationMs?: number | undefined;
  /** Shrink act: the ring closes back to the centre and vanishes. */
  sunCollapseDurationMs?: number | undefined;
  /** Blast act: the blast clears the viewport. */
  mainExpansionDurationMs?: number | undefined;
  /** Longest one reveal-gate hold may last. */
  maxGateWaitMs?: number | undefined;
  onComplete?: (() => void) | undefined;
}

export class StartupController {
  private isExpanding = false;
  private isComplete = false;
  private isDisposed = false;
  private readonly container: HTMLElement | null;
  private readonly welcomeEl: HTMLElement | null;
  private readonly reducedMotion: boolean;
  private readonly lowFx: boolean;
  /** Text-length timing for the welcome intro. */
  private readonly welcomeTiming: WelcomeTiming;
  /** Time for the intro's last glyph to land; the dissolve never cuts the intro short. */
  private readonly landMs: number;
  private readonly sunRadiusPx: number;
  private readonly timing: ApertureTiming;
  private readonly onComplete?: (() => void) | undefined;
  private readonly startTime: number;
  private readonly useAnime: boolean;
  private entranceTimeline: Timeline | null = null;
  /**
   * Clock start of the welcome intro. The hold counts from here, not from construction, so
   * late-loading fonts cannot dissolve the text before it has landed. Null until the intro starts.
   */
  private introStartMs: number | null = null;
  /** Set once startExpansion has been requested; the dissolve is scheduled after the intro starts. */
  private expansionRequested = false;
  private dissolveStarted = false;
  private timeline: Timeline | null = null;
  private apertureEl: HTMLElement | null = null;
  private gateFrame: number | null = null;
  private gateEngaged = false;
  private gateReleased = false;
  private gateSpeed = 1;
  /** Clock time the gate first engaged; stall detection counts from here until a texture settles. */
  private gateEngagedAt: number | null = null;
  /** Clock time the current hold began; its wait cap counts from here. Null while running free. */
  private gateHoldStartedAt: number | null = null;
  private readonly maxGateWaitMs: number;
  /** True once the timeline reaches the blast; only the blast is ever paced by the gate. */
  private blastStarted = false;
  /** Timeline clock at the watchdog's previous check, to tell a playing timeline from a frozen one. */
  private watchdogClockMs = -1;
  /** Width of the title's line of light, so the anamorphic streak can continue it. */
  private titleLinePx = 0;
  private gateLastTs: number | null = null;
  private gateLastVisible: number | null = null;
  /** Nominal (speed 1) visible-edge advance in px per ms, decayed so it stays conservative. */
  private gateVelocity = 0;
  /** 0 while the wavefront runs freely, 1 while the gate fully holds it. */
  private holdStrength = 0;
  /** Clock of the hold pulse; advances only while the hold is visible. */
  private holdPhaseMs = 0;
  private fadeAnimation: JSAnimation | null = null;
  private completionDispatched = false;
  /** Set once the intro-started signal has been queued; it fires once, after two painted frames. */
  private introSignalQueued = false;
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  /** Max radius captured by the one master aperture while it is running. */
  private apertureMaxPx = 0;
  private resizeGuarded = false;
  /** Pre-split letters per welcome line so ambient shimmer and absorption share the same spans. */
  private readonly splitCache = new Map<HTMLElement, HTMLElement[]>();
  /** Intro lines built and primed once, in the constructor, before fonts resolve. */
  private introLines: IntroLine[] = [];

  private readonly onResize = (): void => {
    if (this.isComplete || this.apertureMaxPx <= 0) return;
    // Do not retarget an in-flight timeline. Fading the owner out is deterministic
    // and prevents an uncovered corner when a window grows during the sequence.
    if (maxRadiusFor(window.innerWidth, window.innerHeight) > this.apertureMaxPx) {
      this.finish();
    }
  };

  constructor(opts: StartupControllerOptions = {}) {
    this.container = opts.container ?? null;
    this.welcomeEl = opts.welcomeEl ?? null;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.lowFx = opts.lowFx ?? false;
    // The stylesheet keys its low-effects overrides off this attribute, so it is set before any paint.
    if (this.lowFx) this.container?.setAttribute("data-startup-fx", "lite");
    this.welcomeTiming = computeWelcomeTiming(welcomeLineTexts(this.welcomeEl));
    this.sunRadiusPx = Math.max(1, opts.sunRadiusPx ?? DEFAULT_SUN_RADIUS_PX);
    this.timing = {
      seedMs: Math.max(1, opts.sunSeedDurationMs ?? DEFAULT_APERTURE_TIMING.seedMs),
      ignitionMs: Math.max(1, opts.sunRevealDurationMs ?? DEFAULT_APERTURE_TIMING.ignitionMs),
      collapseMs: Math.max(1, opts.sunCollapseDurationMs ?? DEFAULT_APERTURE_TIMING.collapseMs),
      surgeMs: Math.max(1, opts.mainExpansionDurationMs ?? DEFAULT_APERTURE_TIMING.surgeMs)
    };
    this.onComplete = opts.onComplete;
    this.maxGateWaitMs = Math.max(0, opts.maxGateWaitMs ?? MAX_GATE_WAIT_MS);
    this.startTime = nowMs();
    this.useAnime =
      !this.reducedMotion &&
      this.container !== null &&
      typeof window !== "undefined" &&
      typeof document !== "undefined" &&
      typeof requestAnimationFrame === "function";
    // No fixed hold: the dissolve starts as soon as the scene is ready (startExpansion)
    // and the intro has landed. Without Anime (reduced motion, no rAF) or without a
    // welcome element there is no intro to wait for.
    this.landMs = this.useAnime && this.welcomeEl !== null ? this.welcomeTiming.landMs : 0;

    if (this.useAnime) {
      // Primed before anything else, so the resting text stays hidden while fonts load.
      this.primeWelcomeText();
      const fonts = typeof document !== "undefined" ? document.fonts : undefined;
      if (fonts && fonts.status !== "loaded") {
        // Capped: a slow font download must not keep the primed text invisible.
        void capFontWait(fonts.ready, FONT_WAIT_MS).then(() => this.startWelcomeIntro());
      } else {
        this.startWelcomeIntro();
      }
    } else {
      // No intro runs, so the hold counts from construction as before.
      this.introStartMs = this.startTime;
      this.revealWelcome();
      this.queueIntroSignal();
    }
  }

  /** Time from the intro's start until its last glyph lands; the earliest the dissolve can begin. */
  get introLandMs(): number {
    return this.landMs;
  }

  static hasSeenStartup(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage?.getItem(STARTUP_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }

  static markStartupSeen(): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage?.setItem(STARTUP_SESSION_KEY, "true");
    } catch {
      // Storage can be blocked; startup must remain non-blocking.
    }
  }

  private setTrackedTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    const handle = setTimeout(
      () => {
        this.pendingTimeouts.delete(handle);
        if (!this.isDisposed) fn();
      },
      Math.max(0, delay)
    );
    this.pendingTimeouts.add(handle);
    return handle;
  }

  private getOrSplitLetters(line: HTMLElement): HTMLElement[] {
    const cached = this.splitCache.get(line);
    if (cached) return cached;
    const letters = splitLetters(line);
    this.splitCache.set(line, letters);
    return letters;
  }

  /**
   * Starts the welcome intro and the solar aperture's pre-warm on one timeline. Lines are
   * split only after fonts load, so the character metrics are final before they are measured.
   */
  private startWelcomeIntro(): void {
    if (this.isDisposed || this.isComplete || this.introStartMs !== null) return;
    const master = this.container?.querySelector<HTMLElement>('[data-aperture="master"]');
    if (this.introLines.length > 0 || master) this.playWelcomeIntro(master ?? null);
    // Landing is measured from here, so late-loading fonts never cut the intro short.
    this.introStartMs = nowMs();
    this.queueIntroSignal();
    if (this.expansionRequested) this.scheduleDissolve();
  }

  /** Announces `startup:intro-started` once the intro has painted, so the scene can start loading. */
  private queueIntroSignal(): void {
    if (this.introSignalQueued) return;
    this.introSignalQueued = true;
    afterTwoFrames(() => announceIntroStarted());
  }

  /**
   * Splits and primes the welcome text synchronously, as soon as the controller exists. The
   * text sits at opacity 0 from this point, so neither a late font nor a slow module can
   * expose the resting copy, and the split never waits on fonts.
   */
  private primeWelcomeText(): void {
    if (!this.welcomeEl) return;
    try {
      this.introLines = this.buildIntroLines(this.welcomeEl);
      this.introLines.forEach(primeIntro);
    } catch {
      this.introLines = [];
      this.restoreWelcomeStyles();
    }
    this.revealWelcome();
  }

  /** Lifts the CSS pre-paint hide that keeps the server-rendered text from flashing. */
  private revealWelcome(): void {
    this.welcomeEl?.classList.add("is-intro-live");
  }

  /** Clears the intro's inline styles so the static CSS text shows if the intro cannot run. */
  private restoreWelcomeStyles(): void {
    if (!this.welcomeEl) return;
    const targets = this.welcomeEl.querySelectorAll<HTMLElement>("[data-welcome], .startup-char");
    for (const el of targets) {
      el.style.opacity = "";
      el.style.transform = "";
      el.style.filter = "";
      el.style.clipPath = "";
    }
  }

  private playWelcomeIntro(master: HTMLElement | null): void {
    try {
      const tl = createTimeline({ autoplay: false });
      this.entranceTimeline = tl;

      if (master) {
        tl.add(
          master,
          {
            // One rise each, so the centre glow only builds while the text lands.
            "--aperture-core-alpha": tween(0, 0.3, 720, "outSine"),
            "--aperture-halo-alpha": tween(0, 0.22, 720, "outSine"),
            "--aperture-starlight": tween(0, 0.9, 720, "outQuart")
          },
          0
        );
      }

      this.introLines.forEach((line) => addIntroLine(tl, line));

      tl.play();
    } catch {
      this.cancelEntranceAnimation();
      this.restoreWelcomeStyles();
    }
  }

  /** Intro rises for the eyebrow, title and subtitle, timed from the text itself. */
  private buildIntroLines(welcome: HTMLElement): IntroLine[] {
    const { lineStarts } = this.welcomeTiming;
    const lines: IntroLine[] = [];
    const eyebrow = welcome.querySelector<HTMLElement>('[data-welcome="eyebrow"]');
    const title = welcome.querySelector<HTMLElement>('[data-welcome="title"]');
    const sub = welcome.querySelector<HTMLElement>('[data-welcome="sub"]');

    if (eyebrow) {
      const chars = this.getOrSplitLetters(eyebrow);
      lines.push(charLine(chars, lineStarts[0] ?? 0, charStepMs(chars.length)));
    }
    if (title) lines.push(titleLine(title, lineStarts[1] ?? 0));
    if (sub) {
      const chars = this.getOrSplitLetters(sub);
      lines.push(charLine(chars, lineStarts[2] ?? 0, charStepMs(chars.length)));
    }
    return lines;
  }

  private cancelEntranceAnimation(): void {
    try {
      this.entranceTimeline?.pause();
    } catch {
      // Ignore if already completed or disposed.
    }
    this.entranceTimeline = null;
  }

  startExpansion(): void {
    if (this.isExpanding || this.isComplete) return;
    this.isExpanding = true;
    this.expansionRequested = true;
    // If fonts are still loading, the intro has not started; startWelcomeIntro schedules the dissolve then.
    this.scheduleDissolve();
  }

  /** Schedules the dissolve for when the intro has landed (immediately if it already has). */
  private scheduleDissolve(): void {
    if (this.isDisposed || this.isComplete || this.dissolveStarted) return;
    if (this.introStartMs === null) return;
    const remaining = Math.max(0, this.introStartMs + this.landMs - nowMs());
    if (remaining === 0) {
      this.beginSequence();
    } else {
      this.setTrackedTimeout(() => this.beginSequence(), remaining);
    }
  }

  private beginSequence(): void {
    if (this.isDisposed || this.isComplete || this.dissolveStarted) return;
    this.dissolveStarted = true;

    if (this.reducedMotion) {
      this.finish();
      return;
    }

    const total = totalApertureMs(this.timing);
    // These timers are the lifecycle safety net. They are intentionally
    // independent from Anime.js' render loop and event callbacks. The finish
    // timer is chained off the opening, so a busy main thread delays the
    // aperture instead of firing both timers back to back and skipping it.
    // With Anime running, the timeline's onComplete normally finishes first; the
    // watchdog only steps in if the reveal stops moving (see armFinishWatchdog).
    this.setTrackedTimeout(() => {
      this.container?.classList.add("is-opening");
      document.dispatchEvent(new CustomEvent("startup:opening"));
      this.armFinishWatchdog(total + SETTLE_SLACK_MS);
    }, TEXT_DISSOLVE_MS);

    if (!(this.useAnime && this.startVisuals())) {
      this.fadeWelcomeWithoutAnime();
    }
  }

  /**
   * Finishes the startup if it is still running after `delay`, unless the reveal gate is
   * legitimately holding for textures that are still arriving, or the timeline is still
   * playing its blast after a gate hold has slowed it; then it re-arms. A stalled rAF or a
   * dead network therefore can never trap the user, but a slow one is waited for.
   */
  private armFinishWatchdog(delay: number): void {
    this.setTrackedTimeout(() => {
      if (this.isComplete) return;
      if (this.timeline && this.gateEngaged && !this.gateReleased && !this.gateStalled(nowMs())) {
        this.armFinishWatchdog(REVEAL_STALL_MS);
        return;
      }
      if (this.timelineAdvancing()) {
        this.armFinishWatchdog(WATCHDOG_RECHECK_MS);
        return;
      }
      this.finish();
    }, delay);
  }

  /** True while the timeline has not completed and its clock moved since the previous check. */
  private timelineAdvancing(): boolean {
    const timeline = this.timeline;
    if (!timeline || timeline.completed) return false;
    const clock = timeline.currentTime;
    const advanced = clock > this.watchdogClockMs;
    this.watchdogClockMs = clock;
    return advanced;
  }

  /** True when the gate is engaged but no texture has settled within REVEAL_STALL_MS. */
  private gateStalled(now: number): boolean {
    const since = Math.max(lastRevealProgressMs() ?? -Infinity, this.gateEngagedAt ?? now);
    return now - since >= REVEAL_STALL_MS;
  }

  private fadeWelcomeWithoutAnime(): void {
    this.welcomeEl?.classList.add("is-fading-out");
    this.setTrackedTimeout(() => {
      if (this.welcomeEl) this.welcomeEl.style.display = "none";
    }, TEXT_DISSOLVE_MS);
  }

  /** Build one master timeline before it starts, so no visual layer can race another. */
  private startVisuals(): boolean {
    try {
      const timeline = createTimeline({
        autoplay: false,
        onComplete: () => this.finish()
      });
      this.timeline = timeline;
      this.addWelcomeDissolve(timeline);
      this.addAperture(timeline, TEXT_DISSOLVE_MS);
      this.cancelEntranceAnimation();
      timeline.play();
      this.startRevealGate();
      return true;
    } catch {
      this.cancelOpeningAnimation();
      return false;
    }
  }

  private addWelcomeDissolve(timeline: Timeline): void {
    const welcome = this.welcomeEl;
    if (!welcome) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    // Batch reads and writes across both letter lines and the title, so the browser lays
    // out once for the whole dissolve, not once per line or letter.
    const groups: HTMLElement[][] = [];
    for (const selector of ['[data-welcome="eyebrow"]', '[data-welcome="sub"]']) {
      const line = welcome.querySelector<HTMLElement>(selector);
      if (!line) continue;
      commitEntrance(line);
      groups.push(this.getOrSplitLetters(line));
    }
    const title = welcome.querySelector<HTMLElement>('[data-welcome="title"]');

    // Reads: samples must see each letter (and the title) before its entrance is committed.
    const lives = groups.map((letters) => letters.map(sampleLine));
    const from = title ? sampleLine(title) : null;
    // Writes.
    groups.forEach((letters) => letters.forEach((letter) => commitEntrance(letter)));
    if (title) commitEntrance(title);
    // The line masks only serve the intro's unroll; the embers must fly past them to the centre.
    welcome.classList.add("is-dissolving");
    // Reads: one layout for every rect, after all commits.
    const rects = groups.map((letters) => letters.map((letter) => letter.getBoundingClientRect()));
    const titleRect = title?.getBoundingClientRect();

    // Ember: kindle (lift and swell), swirl along the orbital curve, then fall in and burn out.
    const emberPath: Segments = [
      [LETTER_EMBER_MS * 0.18, "outSine"],
      [LETTER_EMBER_MS * 0.42, "inOutSine"],
      [LETTER_EMBER_MS * 0.4, "inExpo"]
    ];
    const emberFade: Segments = [
      [LETTER_EMBER_MS * 0.18, "linear"],
      [LETTER_EMBER_MS * 0.42, "inOutSine"],
      [LETTER_EMBER_MS * 0.4, "inCubic"]
    ];

    groups.forEach((letters, g) => {
      letters.forEach((letter, index) => {
        const live = lives[g]?.[index];
        const rect = rects[g]?.[index];
        if (!live || !rect) return;
        const { dx, dy } = centerOffset(rect, viewport);
        const frames = letterEmberFrames(dx, dy, index, letters.length, live);
        timeline.add(
          letter,
          {
            transform: keyframes(frames.transform, emberPath),
            opacity: keyframes(frames.opacity, emberFade),
            filter: keyframes(frames.filter, emberFade),
            color: keyframes(frames.color, emberPath)
          },
          absorbDelay(index, letters.length, LETTER_SPREAD_MS)
        );
      });
    });

    if (!title || !from || !titleRect) return;
    const { dx, dy } = centerOffset(titleRect, viewport);
    const frames = titleCollapseFrames(dx, dy, from);
    this.titleLinePx = titleRect.width * TITLE_LINE_SCALE[0];
    // Swell under the sunlight sweep, condense into a line of light, collapse into the seed.
    const collapse: Segments = [
      [TITLE_COLLAPSE_MS * 0.3, "outSine"],
      [TITLE_COLLAPSE_MS * 0.42, "inOutCubic"],
      [TITLE_COLLAPSE_MS * 0.28, "inExpo"]
    ];

    timeline.add(
      title,
      {
        transform: keyframes(frames.transform, collapse),
        opacity: keyframes(frames.opacity, [
          [TITLE_COLLAPSE_MS * 0.3, "linear"],
          [TITLE_COLLAPSE_MS * 0.42, "linear"],
          [TITLE_COLLAPSE_MS * 0.28, "inCubic"]
        ]),
        filter: keyframes(frames.filter, [
          [TITLE_COLLAPSE_MS * 0.3, "outQuad"],
          [TITLE_COLLAPSE_MS * 0.42, "inOutSine"],
          [TITLE_COLLAPSE_MS * 0.28, "inQuad"]
        ]),
        backgroundPosition: [
          tween(
            frames.backgroundPosition[0],
            frames.backgroundPosition[1],
            TITLE_COLLAPSE_MS * 0.46,
            "inOutSine"
          )
        ]
      },
      TITLE_START_MS
    );
  }

  /**
   * Add the sole circular field and the sun's glare to the timeline: the seed of sunlight, the
   * ring opening onto the Sun, its shrink to the centre, and the blast that reveals the page.
   *
   * The ring makes exactly two waves: a small one (open onto the Sun, then shrink away) and the
   * blast, which follows the shrink straight away and accelerates steadily out to the corners. Every track is one continuous arc per act, handing
   * each act's last value to the next act's first, so nothing at the centre blinks: the light
   * only changes where the choreography means it to.
   */
  private addAperture(timeline: Timeline, delay: number): void {
    const container = this.container;
    if (!container) return;
    const master = container.querySelector<HTMLElement>('[data-aperture="master"]');
    if (!master) throw new Error("Startup aperture master is missing");
    this.apertureEl = master;
    const glare = container.querySelector<HTMLElement>("[data-glare]");

    const geometry: ApertureGeometry = {
      sunRadiusPx: this.sunRadiusPx,
      maxRadiusPx: maxRadiusFor(window.innerWidth, window.innerHeight)
    };
    this.apertureMaxPx = geometry.maxRadiusPx;
    window.addEventListener("resize", this.onResize, { passive: true });
    this.resizeGuarded = true;

    const { seedMs, ignitionMs, collapseMs, surgeMs } = this.timing;
    const m = computeApertureMetrics(geometry);
    const ringMs = firstRingMs(this.timing);
    const totalMs = totalApertureMs(this.timing);
    const blastAt = delay + seedMs + ringMs;

    // Act IV, the blast: the ring re-emerges from the centre and accelerates outward, cooling
    // from white-gold to crimson. There is no flash: the centre's sunlight holds still while the
    // ring passes it and only fades as the wavefront exits. Every release track ends at
    // travelMs, together, the moment the faded rim has cleared the corners.
    const travelMs = surgeMs * 0.9;
    const launchDur = surgeMs * 0.1;
    const cruiseDur = surgeMs * 0.5;
    const exitDur = travelMs - launchDur - cruiseDur;

    const px = (n: number): string => `${round3(n)}px`;
    // The intro leaves a faint glow at the centre. Continuing from its live values, instead
    // of restarting from 0, is what keeps the centre from blinking at the hand-off.
    const liveCore = readNumber(master, "--aperture-core-alpha", 0);
    const liveHalo = readNumber(master, "--aperture-halo-alpha", 0);
    const liveStarlight = readNumber(master, "--aperture-starlight", 0);

    // The ring: closed through the seed, one smooth open onto the Sun, one smooth shrink to the
    // centre, then the blast straight out. The shrink ends at 0 and the blast starts there, so
    // the centre never dwells dark between them; the blast starts moving at once and gathers
    // speed all the way to the corners.
    const radius = seq("0px", [
      ["0px", seedMs, "linear"],
      [px(m.sunRingPx), ignitionMs, "outCubic"],
      ["0px", collapseMs, "inCubic"],
      [px(m.releaseRadiusPx), travelMs, acceleratingEase]
    ]);

    const corona = seq("0px", [
      ["0px", seedMs, "linear"],
      [px(m.ringCoronaPx), ignitionMs, "outCubic"],
      ["0px", collapseMs, "inCubic"],
      [px(m.surgeCoronaPx), travelMs * 0.6, "inQuad"],
      [px(m.releaseCoronaPx), travelMs * 0.4, "inOutSine"]
    ]);

    const edgeAlpha = seq(0, [
      [0, seedMs, "linear"],
      [1, ignitionMs, "outCubic"],
      [0, collapseMs, "inCubic"],
      [1, launchDur, "outExpo"],
      [0.92, cruiseDur, "inOutSine"],
      [0, exitDur, "inQuad"]
    ]);

    const feather = seq(px(m.initialFeatherPx), [
      [px(m.initialFeatherPx), seedMs, "linear"],
      [px(m.ringFeatherPx), ignitionMs, "outCubic"],
      [px(m.initialFeatherPx), collapseMs, "inCubic"],
      [px(m.surgeFeatherPx), travelMs, "inQuad"]
    ]);

    // The halo rises with the open and holds through the shrink, so the centre never loses its
    // halo before the blast; it only swells into the blast's flash.
    const haloAlpha = seq(liveHalo, [
      [0.35, seedMs, "inQuad"],
      [0.9, ignitionMs, "outCubic"],
      [0.9, collapseMs, "linear"],
      [1, launchDur, "outQuad"],
      [0.82, cruiseDur, "inOutSine"],
      [0, exitDur, "inQuad"]
    ]);

    // The centre's sunlight, one arc per act: it builds as the text gathers, eases down while the
    // ring frames the Sun (never to zero), re-intensifies as the ring shrinks, then holds still
    // while the blast passes it and only fades as the wavefront exits. No flash, no spread.
    const coreAlpha = seq(liveCore, [
      [0.7, seedMs, "inQuad"],
      [0.3, ignitionMs, "inOutSine"],
      [0.9, collapseMs, "inCubic"],
      [0.9, launchDur + cruiseDur, "linear"],
      [0, exitDur, "inOutSine"]
    ]);

    const bloomSpread = seq("4px", [
      [px(m.seedBloomPx), seedMs, "outCubic"],
      [px(m.ringBloomPx), ignitionMs, "outCubic"],
      [px(m.seedBloomPx), collapseMs, "inCubic"],
      [px(m.seedBloomPx), travelMs, "linear"]
    ]);

    // 0 until the blast, 1 when the wavefront has spent its energy: drives the rim's cooling.
    const heat = seq(0, [
      [0, seedMs + ringMs, "linear"],
      [1, travelMs, "inOutSine"]
    ]);

    // Coronal streamers: unfurl as the ring opens, retract as it shrinks, burst with the blast,
    // then thin out as the wavefront carries them away.
    const rayAlpha = seq(0, [
      [0, seedMs, "linear"],
      [0.7, ignitionMs, "outCubic"],
      [0, collapseMs, "inCubic"],
      [1, launchDur, "outQuad"],
      [0, cruiseDur * 0.85, "inOutSine"]
    ]);
    // Low-effects tier: the rays stay at their resting angle, so no conic layer turns under the wavefront.
    const rayAngle: string | TweenKeyValue[] = this.lowFx
      ? "0deg"
      : seq("0deg", [
          ["24deg", seedMs + ignitionMs, "linear"],
          ["60deg", collapseMs, "inCubic"],
          ["86deg", travelMs, "outCubic"]
        ]);

    // Deep-space starlight: rises with the seed, holds steady through the ring, flares with
    // the blast and fades as the page takes over. It never dips, so the void never blinks.
    const starlight = seq(liveStarlight, [
      [0.9, seedMs, "inQuad"],
      [0.9, ignitionMs, "linear"],
      [0.9, collapseMs, "linear"],
      [1, launchDur, "outQuad"],
      [0, travelMs - launchDur, "outQuad"]
    ]);

    timeline.add(
      master,
      {
        "--aperture-radius": radius,
        "--aperture-corona": corona,
        "--aperture-edge-alpha": edgeAlpha,
        "--aperture-feather": feather,
        "--aperture-halo-alpha": haloAlpha,
        "--aperture-core-alpha": coreAlpha,
        "--aperture-bloom": bloomSpread,
        "--aperture-heat": heat,
        "--aperture-ray-alpha": rayAlpha,
        "--aperture-ray-angle": rayAngle,
        "--aperture-starlight": starlight
      },
      delay
    );

    if (glare) this.addGlare(timeline, glare, delay, m.glareRingLength, totalMs);

    // Hand off to the page as the rim clears the corners, not when the last off-screen glow
    // has faded: the navigation and controls glide in behind the departing wavefront. On the
    // timeline, so a gate hold delays it with the wave.
    timeline.call(() => this.revealPageChrome(), blastAt + launchDur + cruiseDur);
    // From here the reveal gate paces the blast, not the first ring.
    timeline.call(() => {
      this.blastStarted = true;
    }, blastAt);
  }

  /**
   * The sun's glare: a thick cross of soft beams and a bloom at the centre of the page. It grows
   * out of the title's line of light as the text condenses, then holds steady through the ring's
   * open, shrink and blast (its only motion is a slow turn), fading only as the wavefront exits.
   * Only transform and opacity change, through registered custom properties.
   */
  private addGlare(
    timeline: Timeline,
    glare: HTMLElement,
    delay: number,
    ringLength: number,
    totalMs: number
  ): void {
    const { seedMs, ignitionMs, collapseMs, surgeMs } = this.timing;
    // The glare's beams span 1.5 x the viewport's longer side; the title's line of light is a
    // fraction of that, so the horizontal beam starts exactly as long as the line it continues.
    const glareSpanPx = 1.5 * Math.max(window.innerWidth, window.innerHeight);
    const lineScale = round3(clamp01((this.titleLinePx || glareSpanPx * 0.16) / glareSpanPx));
    const travelMs = surgeMs * 0.9;
    const holdMs = surgeMs * 0.6;
    const exitDur = travelMs - holdMs;

    timeline.add(
      glare,
      {
        "--glare-alpha": seq(0, [
          [0.8, seedMs, "outQuad"],
          [0.8, ignitionMs, "linear"],
          [0.92, collapseMs, "inCubic"],
          [0.92, holdMs, "linear"],
          [0, exitDur, "inOutSine"]
        ]),
        "--glare-len": seq(lineScale, [
          [ringLength, seedMs, "outCubic"],
          [ringLength, ignitionMs, "linear"],
          [ringLength, collapseMs, "linear"],
          [ringLength, travelMs, "linear"]
        ]),
        "--glare-thick": seq(0.2, [
          [GLARE_RING_THICK, seedMs, "outCubic"],
          [GLARE_RING_THICK, ignitionMs, "linear"],
          [GLARE_RING_THICK * 1.2, collapseMs, "inCubic"],
          [GLARE_RING_THICK * 1.2, travelMs, "linear"]
        ]),
        "--glare-bloom": seq(0.5, [
          [1, seedMs, "outCubic"],
          [1, ignitionMs, "linear"],
          [1.1, collapseMs, "inCubic"],
          [1.1, travelMs, "linear"]
        ]),
        "--glare-rotate": seq("0deg", [["12deg", totalMs, "linear"]])
      },
      delay
    );
  }

  /** Starts the page UI's entrance (it keys off `startup-ready`); finish() sets it too. */
  private revealPageChrome(): void {
    if (this.isDisposed || typeof document === "undefined") return;
    document.documentElement.classList.add("startup-ready");
  }

  /** Begin pacing the timeline against the scene's reveal limit, once per frame. */
  private startRevealGate(): void {
    if (!this.apertureEl || typeof requestAnimationFrame !== "function") return;
    this.scheduleGateFrame();
  }

  private scheduleGateFrame(): void {
    if (this.gateFrame !== null || this.gateReleased || this.isComplete) return;
    this.gateFrame = requestAnimationFrame(() => {
      this.gateFrame = null;
      if (this.isDisposed || this.isComplete || this.gateReleased) return;
      const now = nowMs();
      const dt =
        this.gateLastTs === null
          ? 0
          : Math.min(Math.max(now - this.gateLastTs, 0), GATE_MAX_FRAME_MS);
      this.gateLastTs = now;
      try {
        this.applyRevealGate(dt, now);
      } catch {
        // A gate fault must never block the reveal: release it and let the timeline run.
        this.releaseRevealGate();
        return;
      }
      this.scheduleGateFrame();
    });
  }

  /**
   * Paces the timeline so the aperture's visible edge stays inside the scene's
   * reveal limit. Speed eases down through GATE_BAND_PX, a per-frame step cap stops
   * overshoot, and the timeline pauses when no progress is safe.
   */
  private applyRevealGate(dt: number, now: number): void {
    const timeline = this.timeline;
    const master = this.apertureEl;
    if (!timeline || !master) return;

    // The first ring is never paced: the limit only applies once the blast has started.
    const limit = this.blastStarted ? revealLimitPx() : Infinity;
    if (limit !== Infinity && !this.gateEngaged) {
      this.gateEngaged = true;
      this.gateEngagedAt = now;
    }
    // Nothing has ever been pending: the aperture runs exactly as before.
    if (!this.gateEngaged) return;
    if (this.gateHoldStartedAt !== null && now - this.gateHoldStartedAt >= this.maxGateWaitMs) {
      this.releaseRevealGate();
      return;
    }

    const radius = readNumber(master, "--aperture-radius", 0);
    const feather = readNumber(master, "--aperture-feather", 0);
    const visible = radius + feather * GATE_VISIBLE_FEATHER;

    if (this.gateLastVisible !== null && dt > 0 && this.gateSpeed >= GATE_MIN_PLAY_SPEED) {
      const measured = Math.max(0, visible - this.gateLastVisible) / dt / this.gateSpeed;
      const decayed = this.gateVelocity * Math.exp(-dt / GATE_VELOCITY_DECAY_MS);
      this.gateVelocity = Math.max(measured, decayed);
    }
    this.gateLastVisible = visible;

    const remaining = limit - visible;
    const bandT = clamp01(remaining / GATE_BAND_PX);
    const target = remaining >= GATE_BAND_PX ? 1 : bandT * bandT * (3 - 2 * bandT);
    const smoothing = dt > 0 ? 1 - Math.exp(-dt / GATE_SPEED_SMOOTH_MS) : 1;
    let speed = this.gateSpeed + (target - this.gateSpeed) * smoothing;

    if (remaining < Infinity) {
      // Hard step cap: one frame may only consume a fraction of what is left.
      const step = Math.max(this.gateVelocity * GATE_FRAME_MS, 1e-6);
      speed = Math.min(speed, (remaining * GATE_STEP_SAFETY) / step);
    }
    speed = Math.min(1, Math.max(0, speed));
    this.gateSpeed = speed;
    // Each hold is capped on its own: it starts when the limit first slows the wavefront and
    // ends once the limit has moved clear.
    if (target < 1) {
      this.gateHoldStartedAt ??= now;
    } else {
      this.gateHoldStartedAt = null;
    }

    if (speed < GATE_MIN_PLAY_SPEED) {
      if (!timeline.paused) timeline.pause();
    } else {
      if (timeline.paused) timeline.resume();
      timeline.speed = speed;
    }

    this.applyHoldPulse(master, dt, 1 - speed);

    // Hold for as long as textures keep arriving; only a stalled load releases the gate.
    if (speed < 1 && this.gateStalled(now)) this.releaseRevealGate();
  }

  /**
   * While the gate slows or holds the wavefront, the corona breathes instead of freezing:
   * a slow brightness swell on the rim, eased in and out with the hold itself.
   */
  private applyHoldPulse(master: HTMLElement, dt: number, target: number): void {
    const smoothing = dt > 0 ? 1 - Math.exp(-dt / HOLD_PULSE_SMOOTH_MS) : 0;
    this.holdStrength += (clamp01(target) - this.holdStrength) * smoothing;
    if (this.holdStrength < 0.001) {
      this.holdStrength = 0;
      this.holdPhaseMs = 0;
      master.style.setProperty("--aperture-pulse", "1");
      return;
    }
    this.holdPhaseMs += dt;
    const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.holdPhaseMs) / HOLD_PULSE_PERIOD_MS);
    const pulse = 1 - HOLD_PULSE_DEPTH * this.holdStrength * wave;
    master.style.setProperty("--aperture-pulse", pulse.toFixed(4));
  }

  /** Eases a breathing corona back to full brightness, so a released hold never pops. */
  private settleHoldPulse(): void {
    const master = this.apertureEl;
    this.holdStrength = 0;
    this.holdPhaseMs = 0;
    if (!master) return;
    const current = parseFloat(master.style.getPropertyValue("--aperture-pulse"));
    if (!(current < 0.999) || !this.useAnime) {
      master.style.setProperty("--aperture-pulse", "1");
      return;
    }
    try {
      animate(master, { "--aperture-pulse": tween(current, 1, HOLD_PULSE_SETTLE_MS, "outSine") });
    } catch {
      master.style.setProperty("--aperture-pulse", "1");
    }
  }

  /** Stop pacing and let the timeline run at its authored speed. Idempotent. */
  private releaseRevealGate(): void {
    this.gateReleased = true;
    if (this.gateFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.gateFrame);
    }
    this.gateFrame = null;
    this.gateSpeed = 1;
    this.settleHoldPulse();
    const timeline = this.timeline;
    if (!timeline) return;
    try {
      if (timeline.paused) timeline.resume();
      timeline.speed = 1;
    } catch {
      // The timeline has already completed or been cancelled.
    }
  }

  private cancelOpeningAnimation(): void {
    this.releaseRevealGate();
    this.cancelEntranceAnimation();
    try {
      this.timeline?.cancel();
    } catch {
      // Anime.js can already have disposed a completed timeline.
    }
    this.timeline = null;
  }

  private hideContainer(): void {
    const container = this.container;
    if (!container) return;
    this.cancelOpeningAnimation();
    container.hidden = true;
    container.style.display = "none";
  }

  private fadeOutContainer(container: HTMLElement): void {
    if (this.useAnime) {
      try {
        this.fadeAnimation = animate(container, {
          opacity: tween(1, 0, FADE_OUT_MS, "outQuad"),
          onComplete: () => {
            this.fadeAnimation = null;
            this.hideContainer();
          }
        });
        return;
      } catch {
        this.fadeAnimation = null;
      }
    }

    container.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
    container.style.opacity = "0";
    this.setTrackedTimeout(() => this.hideContainer(), FADE_OUT_MS);
  }

  private removeResizeGuard(): void {
    if (!this.resizeGuarded) return;
    this.resizeGuarded = false;
    window.removeEventListener("resize", this.onResize);
  }

  private finish(): void {
    if (this.isComplete) return;
    this.isComplete = true;
    this.removeResizeGuard();
    // The aperture must not stay held while the container fades out.
    this.releaseRevealGate();

    if (this.reducedMotion) {
      this.hideContainer();
    } else if (this.container) {
      this.fadeOutContainer(this.container);
    }

    // The session flag records a completed startup, never an attempted one.
    StartupController.markStartupSeen();
    if (typeof document !== "undefined" && !this.completionDispatched) {
      this.completionDispatched = true;
      document.documentElement.classList.add("startup-ready");
      document.dispatchEvent(new CustomEvent("startup:complete"));
    }
    this.onComplete?.();
  }

  isFinished(): boolean {
    return this.isComplete;
  }

  dispose(): void {
    this.isDisposed = true;
    this.isComplete = true;
    this.pendingTimeouts.forEach((timer) => clearTimeout(timer));
    this.pendingTimeouts.clear();
    this.removeResizeGuard();
    this.cancelOpeningAnimation();
    try {
      this.fadeAnimation?.cancel();
    } catch {
      // Already complete or removed.
    }
    this.fadeAnimation = null;
  }
}

/** Welcome line texts in intro order (eyebrow, title, subtitle), empty when absent. */
function welcomeLineTexts(welcome: HTMLElement | null): string[] {
  return ["eyebrow", "title", "sub"].map(
    (key) => welcome?.querySelector<HTMLElement>(`[data-welcome="${key}"]`)?.textContent ?? ""
  );
}
