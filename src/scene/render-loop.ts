import * as THREE from "three";

/**
 * Frame rate the WebGL scene is drawn at at most, in ms per draw (about 120 fps).
 * Higher refresh displays skip vsyncs so the GPU and compositor keep up with the DOM reveals.
 */
export const TARGET_FRAME_INTERVAL_MS = 1000 / 120;

// Smoothing factor for the measured rAF interval, and the largest gap still treated as a
// frame interval (longer gaps come from the tab being backgrounded or the loop being held).
const INTERVAL_SMOOTHING = 0.1;
const MAX_MEASURED_INTERVAL_MS = 250;
// Drawing-buffer budget (pixels) shared by all viewports: 4K UHD worth of fill.
const MAX_DRAW_PIXELS = 3840 * 2160;
// Quiet time after the last window resize event before a burst counts as settled.
const RESIZE_SETTLE_MS = 200;
// The pixel ratio moves only in whole steps of this size, so a window that is being
// resized continuously does not reallocate the drawing buffer on every frame.
const PIXEL_RATIO_STEP = 0.25;

export interface RenderLoopOptions {
  canvas: HTMLCanvasElement;
  pixelRatioCap: number;
  /** Advance scene state (meshes, camera) for this elapsed time. */
  onFrame: (elapsed: number) => void;
  /** Draw the current scene. Called each active frame after onFrame. */
  render: () => void;
  /**
   * Optional: compile the scene's shader programs before the first draw (for example
   * renderer.compileAsync). Draws wait for it, so the compile never lands inside a
   * single frame. A rejected compile is not fatal: the draw compiles what is missing.
   */
  compile?: (() => Promise<unknown>) | undefined;
  /**
   * Optional: whether the scene is still changing after the frame just drawn. When it
   * returns false the loop goes idle (no rAF, no draws) until wake() is called, so a
   * scene at rest costs nothing. Omitted, the loop draws every frame while it runs.
   */
  isAnimating?: (() => boolean) | undefined;
}

/**
 * Owns the renderer, the clock, and the animation loop. Pauses the loop (and
 * the clock, so orbit time does not advance) whenever nothing is watching:
 * the tab is hidden, or the canvas has scrolled out of view. Resuming does not
 * jump planets forward, because the clock was stopped rather than ignored.
 */
export class RenderLoop {
  readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  // Elapsed scene time, accumulated manually so pausing simply stops it from
  // advancing. THREE.Clock is unusable here: Clock.start() zeroes elapsedTime,
  // so a stop/start pause would snap every planet back to its t=0 position.
  private elapsed = 0;
  private lastTs = 0;
  // Frame pacing: timestamp of the previous rAF tick, the smoothed rAF interval, and the
  // number of ticks since the scene was last drawn. Draws happen every `divisor` ticks.
  private lastRafTs = -1;
  private smoothedInterval = 0;
  private divisor = 1;
  private ticksSinceDraw = 0;
  private readonly onFrame: (elapsed: number) => void;
  private readonly renderScene: () => void;
  private readonly compile: (() => Promise<unknown>) | undefined;
  private readonly isAnimating: (() => boolean) | undefined;
  // Set while the shader compile runs; draws wait on it. Cleared once every program is ready.
  private warming: Promise<void> | null = null;
  private frame = 0;
  private running = false;
  private docVisible = true;
  private canvasVisible = true;
  // Held loops draw one frame (compiling shaders up front) and then idle until released.
  private held = false;
  // Idle loops have drawn a scene at rest and wait for wake(); see RenderLoopOptions.isAnimating.
  private idle = false;
  // Callbacks waiting for the next drawn frame (see renderOnce).
  private afterRender: Array<() => void> = [];
  private oneShotFrame = 0;
  private observer: IntersectionObserver | null = null;
  private resizeCallbacks: Array<(w: number, h: number) => void> = [];
  private cachedRect: DOMRect | null = null;
  // Drawing-buffer size last handed to the renderer; an unchanged size skips setSize.
  private appliedWidth = -1;
  private appliedHeight = -1;
  // A window resize is waiting to be applied. It is applied on the frame that draws
  // (never in a separate rAF), so the drawing buffer is never cleared without a draw.
  private resizePending = false;
  // Performance time until which a resize burst is still in progress (see applySize).
  private resizeSettleAt = 0;
  private resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly pixelRatioCap: number;
  // Last ratio handed to the renderer; setPixelRatio is skipped when unchanged.
  private appliedPixelRatio: number;

  constructor(opts: RenderLoopOptions) {
    this.canvas = opts.canvas;
    this.onFrame = opts.onFrame;
    this.renderScene = opts.render;
    this.compile = opts.compile;
    this.isAnimating = opts.isAnimating;
    this.pixelRatioCap = opts.pixelRatioCap;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false
    });
    const { width, height } = this.currentSize();
    this.appliedPixelRatio = this.currentPixelRatio(width, height);
    this.renderer.setPixelRatio(this.appliedPixelRatio);
  }

  /** Return cached canvas bounding rect to avoid layout thrashing on pointermove. */
  getRect(): DOMRect {
    if (!this.cachedRect) {
      this.cachedRect = this.canvas.getBoundingClientRect();
    }
    return this.cachedRect;
  }

  start(): void {
    this.applySize();
    window.addEventListener("resize", this.onWindowResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.observer = new IntersectionObserver(this.onIntersect, {
      threshold: 0
    });
    this.observer.observe(this.canvas);
    // A restored context comes back blank; an idle loop would otherwise never repaint it.
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    this.docVisible = document.visibilityState !== "hidden";
    if (this.compile) {
      const compile = this.compile;
      // The executor runs compile() synchronously and turns a throw into a rejection.
      this.warming = new Promise<unknown>((resolve) => resolve(compile()))
        .catch(() => undefined)
        .then(() => {
          this.warming = null;
        });
    }
    this.resume();
  }

  onResize(cb: (width: number, height: number) => void): void {
    this.resizeCallbacks.push(cb);
    const { width, height } = this.currentSize();
    cb(width, height);
  }

  private currentSize(): { width: number; height: number } {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    return { width, height };
  }

  /**
   * Device pixel ratio, capped by the profile and by a total drawing-buffer
   * budget: a large viewport on a high-DPR display (5K, 4K TV at 2x) would
   * otherwise fill far more pixels than the planets need. The result is floored
   * onto PIXEL_RATIO_STEP, so it never exceeds the budget and only moves in steps.
   */
  private currentPixelRatio(width: number, height: number): number {
    const area = Math.max(1, width * height);
    const budgetRatio = Math.sqrt(MAX_DRAW_PIXELS / area);
    const wanted = Math.min(window.devicePixelRatio, this.pixelRatioCap, budgetRatio);
    const stepped = Math.floor(wanted / PIXEL_RATIO_STEP) * PIXEL_RATIO_STEP;
    // Lower bound is one step, not a fixed 0.5: a floor above the budget would let the
    // drawing buffer exceed MAX_DRAW_PIXELS on very large viewports (above about 8K).
    return Math.max(PIXEL_RATIO_STEP, stepped);
  }

  /**
   * Window resize events fire many times per frame during a drag or rotation. Each one
   * only marks the size dirty. A running loop applies it on its next tick, which also
   * draws that frame; a paused or held loop draws one frame for it.
   */
  private readonly onWindowResize = (): void => {
    if (this.disposed) return;
    this.resizePending = true;
    this.resizeSettleAt = performance.now() + RESIZE_SETTLE_MS;
    if (this.resizeSettleTimer !== null) clearTimeout(this.resizeSettleTimer);
    this.resizeSettleTimer = setTimeout(this.onResizeSettled, RESIZE_SETTLE_MS);
    this.scheduleOneShot();
  };

  /** The burst is over: let the pixel ratio rise to its settled value. */
  private readonly onResizeSettled = (): void => {
    this.resizeSettleTimer = null;
    if (this.disposed) return;
    this.resizePending = true;
    this.scheduleOneShot();
  };

  /** Apply a pending resize now, if one is waiting. The caller draws in the same task. */
  private applyPendingResize(): void {
    if (!this.resizePending) return;
    this.resizePending = false;
    this.applySize();
  }

  private applySize(): void {
    if (this.disposed) return;
    this.cachedRect = this.canvas.getBoundingClientRect();
    const { width, height } = this.currentSize();
    let pixelRatio = this.currentPixelRatio(width, height);
    // During a burst the ratio may fall (it keeps the budget) but not rise: every rise is
    // a full buffer reallocation and a visible sharpness change. The settle timer re-applies.
    if (pixelRatio > this.appliedPixelRatio && performance.now() < this.resizeSettleAt) {
      pixelRatio = this.appliedPixelRatio;
    }
    if (
      pixelRatio === this.appliedPixelRatio &&
      width === this.appliedWidth &&
      height === this.appliedHeight
    ) {
      // Nothing about the drawing buffer changed (e.g. a resize event for an unchanged box).
      return;
    }
    if (pixelRatio !== this.appliedPixelRatio) {
      this.appliedPixelRatio = pixelRatio;
      // setPixelRatio re-runs setSize with the old size, so the size may be set twice
      // here. Both calls run in this task, before any draw, so only one frame is produced.
      this.renderer.setPixelRatio(pixelRatio);
    }
    if (width !== this.appliedWidth || height !== this.appliedHeight) {
      this.appliedWidth = width;
      this.appliedHeight = height;
      this.renderer.setSize(width, height, false);
    }
    for (const cb of this.resizeCallbacks) cb(width, height);
  }

  // Coming back into view redraws at least once (the browser may have dropped the
  // last frame), so both visibility signals end an idle spell.
  private readonly onVisibilityChange = (): void => {
    this.docVisible = document.visibilityState !== "hidden";
    this.idle = false;
    this.syncRunning();
  };

  private readonly onIntersect: IntersectionObserverCallback = (entries) => {
    const entry = entries[0];
    if (!entry) return;
    this.canvasVisible = entry.intersectionRatio > 0;
    this.idle = false;
    this.syncRunning();
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed) return;
    this.idle = false;
    this.syncRunning();
  };

  /**
   * Something changed that the scene must animate (input, a new tween, a speed change):
   * leave the idle state and run again. Cheap and idempotent, so callers may call it
   * on every event. Scene time does not jump: the idle gap is skipped like a pause.
   */
  wake(): void {
    if (this.disposed || !this.idle) return;
    this.idle = false;
    if (this.observer) this.syncRunning();
  }

  /** True while the loop is parked because the scene is at rest (for tests and diagnostics). */
  isIdle(): boolean {
    return this.idle;
  }

  /**
   * Hold the loop while something opaque covers the canvas (the startup screen),
   * so the main thread stays free for that overlay's animation. A loop held
   * before start() still draws its first frame, then waits for release.
   */
  setHeld(held: boolean): void {
    if (this.held === held) return;
    this.held = held;
    // The overlay lifting is a reveal: draw at least once rather than trusting a stale frame.
    if (!held) this.idle = false;
    if (this.observer) this.syncRunning();
  }

  /**
   * Draw one frame on the next animation frame, even while held, then call `cb`.
   * Scene time does not advance. Used to render a newly applied texture (compiling
   * its shader) before the startup reveals the scene.
   */
  renderOnce(cb?: () => void): void {
    if (this.disposed) return;
    if (cb) this.afterRender.push(cb);
    this.scheduleOneShot();
  }

  /**
   * Queue a single draw on the next animation frame. A running loop draws on its own
   * next tick instead, so this does nothing while running.
   */
  private scheduleOneShot(): void {
    if (this.disposed || this.running || this.oneShotFrame !== 0) return;
    this.oneShotFrame = requestAnimationFrame(() => {
      this.oneShotFrame = 0;
      if (this.disposed) return;
      this.drawWhenWarm();
    });
  }

  /** Apply any pending resize, then draw and flush the callbacks, after any shader compile. */
  private drawWhenWarm(): void {
    if (this.warming) {
      void this.warming.then(() => this.drawWhenWarm());
      return;
    }
    if (this.disposed) return;
    this.applyPendingResize();
    this.renderScene();
    this.flushAfterRender();
  }

  private flushAfterRender(): void {
    if (this.afterRender.length === 0) return;
    const callbacks = this.afterRender;
    this.afterRender = [];
    for (const cb of callbacks) cb();
  }

  /** Run only when the document is visible, the canvas is on screen, and the loop is neither held nor idle. */
  private syncRunning(): void {
    const shouldRun = this.docVisible && this.canvasVisible && !this.held && !this.idle;
    if (shouldRun && !this.running) this.resume();
    else if (!shouldRun && this.running) this.pause();
  }

  private resume(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    // Rebase the timestamp so the paused gap contributes zero elapsed time;
    // orbit time resumes exactly where it stopped (no forward jump).
    this.lastTs = performance.now();
    // The first tick after a pause measures the gap, not a frame interval, so skip it.
    this.lastRafTs = -1;
    this.frame = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /**
   * Track the rAF interval (EMA) and pick how many vsyncs to skip between draws so the
   * draw rate stays near TARGET_FRAME_INTERVAL_MS: 255 Hz draws every 2nd vsync, 144 Hz
   * and 60 Hz every vsync.
   */
  private measureInterval(now: number): void {
    // -1 marks "no previous tick"; a plain 0 would fake a gap on a page younger than the cap.
    const gap = this.lastRafTs < 0 ? -1 : now - this.lastRafTs;
    this.lastRafTs = now;
    if (gap <= 0 || gap > MAX_MEASURED_INTERVAL_MS) return;
    this.smoothedInterval =
      this.smoothedInterval === 0
        ? gap
        : this.smoothedInterval + (gap - this.smoothedInterval) * INTERVAL_SMOOTHING;
    this.divisor = Math.max(1, Math.round(TARGET_FRAME_INTERVAL_MS / this.smoothedInterval));
  }

  private readonly tick = (): void => {
    const now = performance.now();
    // Accumulate real time in seconds; the paused gap never enters this sum
    // because lastTs is rebased on resume. Time advances on every vsync, drawn or not.
    this.elapsed += (now - this.lastTs) / 1000;
    this.lastTs = now;
    this.measureInterval(now);
    // A pending resize is applied on this tick, before the scene advances, and this
    // frame is drawn with it regardless of the pacing divisor. The buffer is therefore
    // never cleared without a draw, and the camera aspect is current for the draw.
    // While shaders compile the resize waits with the draw.
    const resizing = this.resizePending && !this.warming;
    if (resizing) this.applyPendingResize();
    // Positions still update while shaders compile, so reads of the live scene (the
    // reveal limit) see the bodies where they are. Only the draw waits.
    this.onFrame(this.elapsed);
    this.ticksSinceDraw += 1;
    // Pending renderOnce callbacks draw on this tick rather than waiting out skipped vsyncs.
    const due = resizing || this.ticksSinceDraw >= this.divisor || this.afterRender.length > 0;
    let drawn = false;
    if (due && !this.warming) {
      this.ticksSinceDraw = 0;
      this.renderScene();
      this.flushAfterRender();
      drawn = true;
    }
    // A held loop stops after its first draw; while compiling it keeps ticking to reach that draw.
    if (this.held && !this.warming && drawn) {
      this.running = false;
      return;
    }
    // The frame just drawn shows the scene at rest: stop until wake(). Only a drawn
    // frame may end the run, so the final state is always on screen.
    if (drawn && this.isAnimating && !this.isAnimating()) {
      this.running = false;
      this.idle = true;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Stop the loop, detach every listener/observer, and free renderer resources. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.oneShotFrame);
    this.afterRender = [];
    window.removeEventListener("resize", this.onWindowResize);
    if (this.resizeSettleTimer !== null) clearTimeout(this.resizeSettleTimer);
    this.resizeSettleTimer = null;
    this.resizePending = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.observer?.disconnect();
    this.observer = null;
    this.resizeCallbacks = [];
    // Deliberately no forceContextLoss(): the canvas element outlives this loop,
    // and a lost context would be handed back to any later renderer built on it.
    this.renderer.dispose();
  }
}
