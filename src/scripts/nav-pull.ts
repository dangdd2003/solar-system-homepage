/**
 * Pull-to-refresh from the nav bar.
 *
 * The document is locked (panels.css): the scene stays put and only panel content
 * scrolls, which also switches off the browser's own pull-to-refresh. A downward
 * drag that starts on the nav bar takes its place: the whole page follows the
 * finger with rubber-band resistance, the refresh indicator shows in the gap above
 * it, and releasing past the threshold reloads. Releasing early springs back. A
 * tap (no drag) on a nav link or the menu button still works normally.
 */

// Finger travel is damped to this fraction, like a native rubber band.
const RESISTANCE = 0.5;
// Page offset (CSS px) that arms the reload, and the most it ever moves.
const THRESHOLD_PX = 72;
const MAX_PX = 140;
// Offset the page rests at while the reload starts.
const HOLD_PX = 56;
// Finger travel before a touch counts as a drag rather than a tap.
const SLOP_PX = 8;
// Spring-back duration; keep in step with the transition in NavPull.astro.
const SETTLE_MS = 320;

export function initNavPull(): void {
  const nav = document.querySelector<HTMLElement>(".nav");
  const indicator = document.querySelector<HTMLElement>("[data-nav-pull]");
  if (!nav || !indicator) return;

  const page = document.body;
  const root = document.documentElement;
  const reducedMotionQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pulling = false;
  let offset = 0;
  let moveFrame = 0;
  let pendingOffset: number | null = null;

  const cancelMoveFrame = (): void => {
    if (moveFrame !== 0) {
      cancelAnimationFrame(moveFrame);
      moveFrame = 0;
    }
    pendingOffset = null;
  };

  const apply = (px: number): void => {
    offset = px;
    page.style.transform = px > 0 ? `translate3d(0, ${px}px, 0)` : "";
    const progress = Math.min(1, px / THRESHOLD_PX);
    indicator.style.setProperty("--pull", progress.toFixed(3));
    indicator.classList.toggle("is-armed", px >= THRESHOLD_PX);
  };

  const settle = (px: number, done?: () => void): void => {
    if (moveFrame !== 0 && pendingOffset !== null) {
      apply(pendingOffset);
    }
    cancelMoveFrame();
    let finished = false;
    let fallback = 0;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      page.removeEventListener("transitionend", onEnd);
      root.classList.remove("nav-pull-settling");
      if (px === 0) root.classList.remove("nav-pull-active");
      done?.();
    };
    // transitionend bubbles up from every child; only the page's own transform counts.
    const onEnd = (e: TransitionEvent): void => {
      if (e.target === page && e.propertyName === "transform") finish();
    };
    const instant = px === offset || Boolean(reducedMotionQuery?.matches);
    if (!instant) {
      root.classList.add("nav-pull-settling");
      page.addEventListener("transitionend", onEnd);
      // An interrupted or throttled transition may never report its end.
      fallback = window.setTimeout(finish, SETTLE_MS + 120);
    }
    apply(px);
    if (instant) finish();
  };

  // A drag must not also fire the click of the link or button it started on.
  const swallowClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  nav.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches.length === 1 ? e.touches[0] : undefined;
      if (!touch || root.classList.contains("nav-pull-refreshing")) return;
      tracking = true;
      pulling = false;
      startX = touch.clientX;
      startY = touch.clientY;
    },
    { passive: true }
  );

  nav.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches.length === 1 ? e.touches[0] : undefined;
      if (!tracking || !touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
        // Only a mostly vertical downward drag is a pull.
        if (dy <= 0 || Math.abs(dx) > dy) {
          tracking = false;
          return;
        }
        pulling = true;
        root.classList.add("nav-pull-active");
        nav.addEventListener("click", swallowClick, { capture: true, once: true });
      }
      e.preventDefault();
      const nextOffset = Math.min(MAX_PX, (dy - SLOP_PX) * RESISTANCE);
      offset = nextOffset;
      pendingOffset = nextOffset;
      if (moveFrame === 0) {
        moveFrame = requestAnimationFrame(() => {
          moveFrame = 0;
          if (pendingOffset !== null) {
            const px = pendingOffset;
            pendingOffset = null;
            apply(px);
          }
        });
      }
    },
    { passive: false }
  );

  const end = (): void => {
    if (!tracking) return;
    tracking = false;
    if (!pulling) return;
    pulling = false;
    // The swallowed click only fires on some browsers after a drag; drop the guard after it.
    setTimeout(() => nav.removeEventListener("click", swallowClick, { capture: true }), 400);
    if (offset >= THRESHOLD_PX) {
      root.classList.add("nav-pull-refreshing");
      settle(HOLD_PX, () => location.reload());
    } else {
      settle(0);
    }
  };

  nav.addEventListener("touchend", end, { passive: true });
  nav.addEventListener("touchcancel", end, { passive: true });

  // Back/forward cache restores the page as it was left; never come back mid-pull.
  window.addEventListener("pageshow", () => {
    cancelMoveFrame();
    root.classList.remove("nav-pull-refreshing", "nav-pull-settling", "nav-pull-active");
    apply(0);
  });
}
