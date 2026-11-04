import { onPageReady } from "./page-ready";

const INDICATOR_TRANSITION =
  "transform 0.38s cubic-bezier(0.25, 1, 0.5, 1), width 0.38s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.25s ease";

/** Sub-pixel jitter below this is not worth a style write during a resize. */
const TRACK_EPSILON_PX = 0.25;
/** Plain-resize fallback (no viewport engine): how long to keep re-measuring after the last resize event. */
const TRACK_SETTLE_MS = 100;

const TITLE_PREFIX = "Doan Dinh Dang";
/** Tab label when no section link is active (overview / hero). */
const TITLE_HOME = "Home";

/** Mirror the active nav section in the browser tab: "Doan Dinh Dang | <section>". */
function syncDocumentTitle(activeLink: HTMLElement | null): void {
  const label = activeLink?.textContent?.trim() || TITLE_HOME;
  const next = `${TITLE_PREFIX} | ${label}`;
  if (document.title !== next) document.title = next;
}

/**
 * Transform-immune link geometry. offsetLeft/offsetWidth ignore transforms (FLIP glides,
 * the nav entrance, press scale), unlike getBoundingClientRect. They are relative to the
 * offsetParent, which is `.nav__links` because it is `position: relative` (see Nav.astro).
 */
function measureLink(link: HTMLElement): { left: number; width: number } {
  return { left: link.offsetLeft, width: link.offsetWidth };
}

export function setupNavIndicator(): () => void {
  const nav = document.querySelector<HTMLElement>(".nav__links");
  const indicator = document.querySelector<HTMLElement>(".nav__indicator");
  const links = document.querySelectorAll<HTMLElement>(".nav__links a");
  const navHeader = document.querySelector<HTMLElement>(".nav");

  if (!nav || !indicator || links.length === 0) return () => {};

  let isFirstShow = true;

  const initialHash = typeof window !== "undefined" ? window.location.hash : "";
  if (initialHash && initialHash !== "#" && initialHash !== "#hero") {
    links.forEach((link) => {
      const isMatch = link.getAttribute("href") === initialHash;
      link.setAttribute("aria-current", String(isMatch));
    });
  }

  /**
   * Place the indicator on the active link. `instant` writes without a transition
   * (used while tracking a resize, so the indicator follows the link frame by frame).
   */
  function updateIndicator(instant = false): void {
    if (!nav || !indicator) return;
    const activeLink = nav.querySelector<HTMLElement>('a[aria-current="true"]');
    syncDocumentTitle(activeLink);

    if (activeLink) {
      const { left, width } = measureLink(activeLink);

      if (instant) {
        indicator.style.transition = "none";
        indicator.style.width = `${width}px`;
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.opacity = "1";
        isFirstShow = false;
      } else if (isFirstShow || indicator.style.opacity === "0") {
        // Snap instantly if it's currently hidden
        indicator.style.transition = "none";
        indicator.style.width = `${width}px`;
        indicator.style.transform = `translateX(${left}px)`;

        // Force layout recalculation
        void indicator.offsetWidth;

        // Restore transition and fade in
        indicator.style.transition = INDICATOR_TRANSITION;
        indicator.style.opacity = "1";
        isFirstShow = false;
      } else {
        indicator.style.transition = INDICATOR_TRANSITION;
        indicator.style.width = `${width}px`;
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.opacity = "1";
      }
    } else {
      indicator.style.opacity = "0";
      isFirstShow = true;
    }
  }

  // Resize tracking: while the viewport is changing, link positions move under
  // the indicator. Each frame we re-measure and write transform/width instantly,
  // so the indicator stays glued to the link with no transition lag. The nav
  // itself does not animate its width, so there is nothing to trail behind.
  let trackFrame = 0;
  let trackUntil = 0;
  let lastTrack: { left: number; width: number } | null = null;

  const trackFrameTick = (): void => {
    trackFrame = 0;
    if (!indicator || !nav) return;
    const now = performance.now();
    const activeLink = nav.querySelector<HTMLElement>('a[aria-current="true"]');
    if (activeLink) {
      const { left, width } = measureLink(activeLink);
      const moved =
        lastTrack === null ||
        Math.abs(lastTrack.left - left) > TRACK_EPSILON_PX ||
        Math.abs(lastTrack.width - width) > TRACK_EPSILON_PX;
      if (moved) {
        lastTrack = { left, width };
        updateIndicator(true);
      }
    }
    if (now < trackUntil) {
      trackFrame = requestAnimationFrame(trackFrameTick);
    } else {
      lastTrack = null;
      updateIndicator(true);
    }
  };

  function startTracking(until: number): void {
    trackUntil = until;
    if (trackFrame === 0) trackFrame = requestAnimationFrame(trackFrameTick);
  }

  const onViewportResizeStart = (): void => {
    startTracking(Number.POSITIVE_INFINITY);
  };

  const onViewportResizeEnd = (): void => {
    // One final instant measurement on the next frame, then stop: no trailing follow.
    startTracking(performance.now());
  };

  window.addEventListener("viewport:resize-start", onViewportResizeStart);
  window.addEventListener("viewport:resize-end", onViewportResizeEnd);

  // Initial update
  let initialFrame = requestAnimationFrame(() => {
    initialFrame = 0;
    updateIndicator();
  });

  // Watch for active state changes
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "aria-current") {
        shouldUpdate = true;
        break;
      }
    }
    if (shouldUpdate) {
      updateIndicator();
    }
  });

  const onLinkClick = (e: Event): void => {
    const clicked = e.currentTarget;
    if (!(clicked instanceof HTMLElement)) return;
    links.forEach((l) => {
      if (l !== clicked) l.setAttribute("aria-current", "false");
    });
    clicked.setAttribute("aria-current", "true");
    updateIndicator();
  };

  links.forEach((link) => {
    link.addEventListener("click", onLinkClick);
    observer.observe(link, { attributes: true, attributeFilter: ["aria-current"] });
  });

  const onBrandClick = (): void => {
    links.forEach((l) => l.setAttribute("aria-current", "false"));
    updateIndicator();
  };

  // Clear active state instantly if brand (overview) link is clicked
  const brandLink = document.querySelector<HTMLElement>(".nav__brand");
  if (brandLink) {
    brandLink.addEventListener("click", onBrandClick);
  }

  let startupFrame = 0;
  const onStartupComplete = (): void => {
    if (startupFrame !== 0) cancelAnimationFrame(startupFrame);
    startupFrame = requestAnimationFrame(() => {
      startupFrame = 0;
      updateIndicator();
    });
  };
  document.addEventListener("startup:complete", onStartupComplete);

  const onPopState = (): void => {
    const currentHash = window.location.hash;
    links.forEach((link) => {
      const isMatch = Boolean(
        currentHash && currentHash !== "#hero" && link.getAttribute("href") === currentHash
      );
      link.setAttribute("aria-current", String(isMatch));
    });
    updateIndicator();
  };

  window.addEventListener("popstate", onPopState);

  // Plain resize (the viewport engine may not be loaded): short tracking window.
  const onResize = (): void => {
    startTracking(performance.now() + TRACK_SETTLE_MS);
  };
  window.addEventListener("resize", onResize);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      updateIndicator();
    });
    resizeObserver.observe(nav);
    if (navHeader) {
      resizeObserver.observe(navHeader);
    }
  }

  const onTransitionEnd = (e: TransitionEvent): void => {
    if (e.propertyName === "width") {
      updateIndicator();
    }
  };

  const onAnimationEnd = (e: AnimationEvent): void => {
    if (navHeader && (e.animationName === "navEntrance" || e.target === navHeader)) {
      navHeader.style.animation = "none";
      updateIndicator();
    }
  };

  if (navHeader) {
    navHeader.addEventListener("transitionend", onTransitionEnd);
    navHeader.addEventListener("animationend", onAnimationEnd);
  }

  return () => {
    if (trackFrame !== 0) cancelAnimationFrame(trackFrame);
    trackFrame = 0;
    if (initialFrame !== 0) cancelAnimationFrame(initialFrame);
    initialFrame = 0;
    if (startupFrame !== 0) cancelAnimationFrame(startupFrame);
    startupFrame = 0;
    window.removeEventListener("viewport:resize-start", onViewportResizeStart);
    window.removeEventListener("viewport:resize-end", onViewportResizeEnd);
    observer.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("startup:complete", onStartupComplete);
    links.forEach((link) => link.removeEventListener("click", onLinkClick));
    brandLink?.removeEventListener("click", onBrandClick);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("resize", onResize);
    navHeader?.removeEventListener("transitionend", onTransitionEnd);
    navHeader?.removeEventListener("animationend", onAnimationEnd);
  };
}

let cleanupCurrentInstance: (() => void) | null = null;

export function initNavIndicator(): () => void {
  if (cleanupCurrentInstance) {
    cleanupCurrentInstance();
    cleanupCurrentInstance = null;
  }
  cleanupCurrentInstance = setupNavIndicator();
  return cleanupCurrentInstance;
}

// Auto-run on DOM load
onPageReady(initNavIndicator);
