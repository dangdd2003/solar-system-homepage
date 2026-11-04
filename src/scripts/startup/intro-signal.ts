/**
 * Lifecycle signal for the scene: `startup:intro-started` fires on the document once the
 * welcome intro has begun and at least one frame has painted with it. It is also announced
 * on the no-intro paths (session already seen, reduced motion, no Anime.js) so a listener
 * never waits forever. The sticky `startup-intro-started` class on <html> lets a listener
 * that attaches late check the state instead of missing the event.
 */

export const INTRO_STARTED_EVENT = "startup:intro-started";
export const INTRO_STARTED_CLASS = "startup-intro-started";

/** Runs `cb` after two animation frames, so the intro's first frame has been painted. */
export function afterTwoFrames(cb: () => void): void {
  // Availability is re-checked at each step: rAF can be removed while a frame is pending.
  const next = (fn: () => void): void => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
    else setTimeout(fn, 0);
  };
  next(() => next(cb));
}

/** Marks the intro as started and dispatches the event on the document. Idempotent per document. */
export function announceIntroStarted(doc: Document = document): void {
  const root = doc.documentElement;
  if (root.classList.contains(INTRO_STARTED_CLASS)) return;
  root.classList.add(INTRO_STARTED_CLASS);
  doc.dispatchEvent(new CustomEvent(INTRO_STARTED_EVENT));
}
