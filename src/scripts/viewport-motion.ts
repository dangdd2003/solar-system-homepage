/**
 * Central viewport motion engine. Tracks resize bursts and orientation flips,
 * toggles `html.is-viewport-resizing` / `html.is-viewport-rotating`, dispatches
 * `viewport:resize-start` / `viewport:resize-end`, and drives interruptible FLIP
 * animations for `[data-resize-flip]` elements. Framework-free and SSR-safe.
 */
import {
  isLandscape,
  isUrlBarJitter,
  FLIP_ATTRIBUTE,
  ROTATION_FLIP_DURATION_MS,
  GROUP_ATTRIBUTE
} from "./viewport-motion/geometry";
import { createFlipRunner } from "./viewport-motion/flip";

export const RESIZING_CLASS = "is-viewport-resizing";
export const ROTATING_CLASS = "is-viewport-rotating";
export const RESIZE_START_EVENT = "viewport:resize-start";
export const RESIZE_END_EVENT = "viewport:resize-end";
/** Marks a flip item (`[data-resize-flip]`). Any value is accepted; motion is always translate-only. */
export const FLIP_ATTR = FLIP_ATTRIBUTE;
/** Marks a container whose visible element children are each a flip item, cascaded by index. */
export const GROUP_ATTR = GROUP_ATTRIBUTE;
/** Set by the reveal engine when an element has finished revealing; its layout is then settled. */
export const REVEAL_DONE_ATTR = "data-reveal-done";

/** Quiet time after the last size change that ends a burst. */
export const SETTLE_MS = 200;
/** How long the rotating class lingers after a burst that flipped orientation. */
export const ROTATION_HOLD_MS = 300;
/** How long the resizing class lingers after a burst ends, so scoped CSS can finish its last frame. */
export const RESIZE_TAIL_MS = 100;
/** Quiet time before layout-changing mutations (reveal done, group content) refresh the snapshot. */
export const SNAPSHOT_DEBOUNCE_MS = 80;
const SNAPSHOT_AFTER_FLIP_MS = ROTATION_FLIP_DURATION_MS + 30;
const SCROLL_SETTLE_MS = 150;

export interface ViewportMotionDetail {
  orientationChanged: boolean;
  width: number;
  height: number;
}

export interface ViewportMotionEnv {
  win: Window;
  doc: Document;
  raf: (cb: () => void) => number;
  cancelRaf: (id: number) => void;
  setTimer: (cb: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

function defaultEnv(): ViewportMotionEnv {
  return {
    win: window,
    doc: document,
    raf: (cb) => requestAnimationFrame(() => cb()),
    cancelRaf: (id) => cancelAnimationFrame(id),
    setTimer: (cb, ms) => window.setTimeout(cb, ms),
    clearTimer: (id) => window.clearTimeout(id)
  };
}

/** Wires the viewport motion engine to `env`. Returns the cleanup function. */
export function createViewportMotion(env: ViewportMotionEnv): () => void {
  const { win, doc } = env;
  const root = doc.documentElement;
  const flips = createFlipRunner(win, doc);
  const disposers: Array<() => void> = [];
  const observers: MutationObserver[] = [];

  let lastWidth = win.innerWidth;
  let lastHeight = win.innerHeight;
  let lastLandscape = isLandscape(lastWidth, lastHeight);
  let burstActive = false;
  let burstFlipped = false;
  let reduced = false;
  let framePending: number | null = null;
  let endTimer: number | null = null;
  let holdTimer: number | null = null;
  let tailTimer: number | null = null;
  let snapshotTimer: number | null = null;
  let snapshotDebounce: number | null = null;
  let scrollTimer: number | null = null;

  function coarsePointer(): boolean {
    return win.matchMedia?.("(pointer: coarse)").matches ?? false;
  }

  function dispatch(name: string, orientationChanged: boolean): void {
    const detail: ViewportMotionDetail = {
      orientationChanged,
      width: win.innerWidth,
      height: win.innerHeight
    };
    win.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function clear(id: number | null): void {
    if (id !== null) env.clearTimer(id);
  }

  function takeSnapshot(): void {
    if (burstActive) return;
    flips.snapshot();
  }

  function scheduleSnapshot(): void {
    clear(snapshotDebounce);
    snapshotDebounce = env.setTimer(() => {
      snapshotDebounce = null;
      takeSnapshot();
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  function scheduleFrame(): void {
    if (framePending !== null) return;
    framePending = env.raf(() => {
      framePending = null;
      if (!reduced) flips.animate(burstFlipped);
    });
  }

  function endBurst(): void {
    endTimer = null;
    burstActive = false;
    dispatch(RESIZE_END_EVENT, burstFlipped);

    clear(tailTimer);
    tailTimer = env.setTimer(() => {
      tailTimer = null;
      root.classList.remove(RESIZING_CLASS);
    }, RESIZE_TAIL_MS);

    if (burstFlipped) {
      clear(holdTimer);
      holdTimer = env.setTimer(() => {
        holdTimer = null;
        root.classList.remove(ROTATING_CLASS);
      }, ROTATION_HOLD_MS);
    }
    burstFlipped = false;

    // Refresh the idle snapshot now (skips elements still flipping), and again once flips finish.
    takeSnapshot();
    clear(snapshotTimer);
    snapshotTimer = env.setTimer(() => {
      snapshotTimer = null;
      takeSnapshot();
    }, SNAPSHOT_AFTER_FLIP_MS);
  }

  /**
   * True while a text entry has focus. An on-screen keyboard resizes the viewport under the user's
   * finger; animating the page then would move the field being typed into. Not a resize to animate.
   */
  function editingText(): boolean {
    const active = doc.activeElement;
    if (!active) return false;
    if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") return true;
    if ((active as HTMLElement).isContentEditable === true) return true;
    return active.closest("[contenteditable]:not([contenteditable='false'])") !== null;
  }

  function onViewportChange(forced: boolean): void {
    const width = win.innerWidth;
    const height = win.innerHeight;
    const sized = Math.abs(width - lastWidth) >= 1 || Math.abs(height - lastHeight) >= 1;
    if (!sized && !forced) return;
    // The last size is kept, so the keyboard closing reads as no change and needs no animation.
    if (!forced && editingText()) return;
    if (!forced && isUrlBarJitter(lastWidth, lastHeight, width, height, coarsePointer())) return;

    const landscape = isLandscape(width, height);
    const flipped = forced || landscape !== lastLandscape;
    lastWidth = width;
    lastHeight = height;
    lastLandscape = landscape;

    if (!burstActive) {
      burstActive = true;
      burstFlipped = false;
      clear(tailTimer);
      tailTimer = null;
      root.classList.add(RESIZING_CLASS);
      dispatch(RESIZE_START_EVENT, flipped);
    }
    if (flipped && !burstFlipped) {
      burstFlipped = true;
      clear(holdTimer);
      holdTimer = null;
      root.classList.add(ROTATING_CLASS);
    }

    clear(endTimer);
    endTimer = env.setTimer(endBurst, SETTLE_MS);
    scheduleFrame();
  }

  function setReduced(next: boolean): void {
    reduced = next;
    if (reduced) {
      flips.cancelAll();
    } else {
      takeSnapshot();
    }
  }

  function listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  }

  // Viewport changes.
  listen(win, "resize", () => onViewportChange(false));
  listen(win, "orientationchange", () => onViewportChange(true));
  listen(win.visualViewport ?? win, "resize", () => onViewportChange(false));
  const orientation = win.screen?.orientation;
  if (orientation) listen(orientation, "change", () => onViewportChange(true));

  // Focus leaving a text field: the keyboard may have closed under a layout that was not animated.
  listen(doc, "focusout", () => scheduleSnapshot());

  // Reduced motion, live.
  const media = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (media) {
    reduced = media.matches;
    listen(media, "change", (event) => setReduced((event as MediaQueryListEvent).matches));
  }

  // Idle snapshots: panel visibility changes, flip roots being shown/hidden, and panel scroll.
  const panels = Array.from(doc.querySelectorAll<HTMLElement>("[data-planet-panel]"));
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => takeSnapshot());
    for (const panel of panels) {
      observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
    }
    for (const root of Array.from(doc.querySelectorAll<HTMLElement>("[data-resize-flip-root]"))) {
      observer.observe(root, { attributes: true, attributeFilter: ["hidden", "class"] });
    }
    observers.push(observer);

    // Layout changes that are not resizes: a reveal finishing, or a group's content or visibility changing.
    const settled = new MutationObserver(() => scheduleSnapshot());
    settled.observe(doc.body, {
      attributes: true,
      attributeFilter: [REVEAL_DONE_ATTR],
      subtree: true
    });
    for (const group of Array.from(doc.querySelectorAll<HTMLElement>(`[${GROUP_ATTR}]`))) {
      settled.observe(group, {
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "class", "style"],
        subtree: true
      });
    }
    observers.push(settled);
  }
  for (const panel of panels) {
    listen(
      panel,
      "scroll",
      () => {
        clear(scrollTimer);
        scrollTimer = env.setTimer(() => {
          scrollTimer = null;
          takeSnapshot();
        }, SCROLL_SETTLE_MS);
      },
      { passive: true }
    );
  }

  takeSnapshot();
  if (doc.readyState !== "complete") {
    listen(win, "load", () => takeSnapshot(), { once: true });
  }

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
    for (const observer of observers.splice(0)) observer.disconnect();
    if (framePending !== null) env.cancelRaf(framePending);
    for (const id of [
      endTimer,
      holdTimer,
      tailTimer,
      snapshotTimer,
      snapshotDebounce,
      scrollTimer
    ]) {
      clear(id);
    }
    framePending = null;
    endTimer = holdTimer = tailTimer = snapshotTimer = snapshotDebounce = scrollTimer = null;
    flips.cancelAll();
    root.classList.remove(RESIZING_CLASS, ROTATING_CLASS);
    burstActive = false;
    burstFlipped = false;
  };
}

let activeCleanup: (() => void) | null = null;

/**
 * Starts the viewport motion engine on the page. Idempotent: a second call
 * while active returns a no-op cleanup. SSR-safe (no window access on import).
 */
export function initViewportMotion(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (activeCleanup) return () => {};

  const cleanup = createViewportMotion(defaultEnv());
  activeCleanup = () => {
    activeCleanup = null;
    cleanup();
  };
  return activeCleanup;
}
