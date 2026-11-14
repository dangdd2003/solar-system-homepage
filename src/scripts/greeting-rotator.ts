export interface Greeting {
  text: string;
  lang: string;
}

export const GREETINGS: readonly Greeting[] = [
  { text: "Xin chào", lang: "vi" },
  { text: "Hello", lang: "en" },
  { text: "Bonjour", lang: "fr" }
];

export interface GreetingRotatorOptions {
  /** Time each greeting stays on screen, in ms. */
  intervalMs?: number;
  /** Swap transition duration (must match the CSS transition), in ms. */
  wipeMs?: number;
  /** Class of the word element inside `root`; the visual effect lives in that component's CSS. */
  wordClass?: string;
}

/**
 * Cycles the greeting inside `root`, a box holding one word element. Each step
 * marks the current word `is-leaving` and adds the next one starting from
 * `is-entering`, so the component's CSS decides the effect (the hero wipes
 * upward, About rolls like a cube). The box width animates to the new word so
 * the following text glides.
 *
 * Automatically pauses when document.hidden is true, the parent panel is hidden, or the hero is offscreen.
 * Stops while prefers-reduced-motion is on and resumes if the preference is turned off
 * after load. Returns a cleanup function.
 */
export function initGreetingRotator(
  root: HTMLElement,
  {
    intervalMs = 2600,
    wipeMs = 550,
    wordClass = "hero__greeting-word"
  }: GreetingRotatorOptions = {}
): () => void {
  let current = root.querySelector<HTMLElement>(`.${wordClass}`);
  if (!current) return () => {};

  const reduceQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  let index = Math.max(
    0,
    GREETINGS.findIndex((g) => g.text === current?.textContent?.trim())
  );
  // Every outgoing word has its own removal timer; track them all so cleanup can flush them.
  const pendingRemovals = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  // Layout width, not the transformed rect: an entrance scale on an ancestor (the hero eyebrow)
  // would otherwise shrink the measurement and clip the word. offsetWidth is rounded, so one
  // spare pixel keeps sub-pixel glyph edges from being clipped.
  const fitTo = (word: HTMLElement): void => {
    root.style.width = `${Math.ceil(word.offsetWidth) + 1}px`;
  };
  fitTo(current);

  const panel = root.closest<HTMLElement>("[data-planet-panel]");
  const isPaused = (): boolean => {
    if (typeof document !== "undefined" && document.hidden) return true;
    if (panel) {
      if (panel.getAttribute("aria-hidden") === "true") return true;
      if (panel.style.display === "none" || panel.style.visibility === "hidden") return true;
      if (panel.classList.contains("is-hidden")) return true;
    }
    return false;
  };

  const tick = (): void => {
    if (!current || isPaused()) return;

    index = (index + 1) % GREETINGS.length;
    const greeting = GREETINGS[index]!;

    // Clone so the incoming word keeps the component's scoped-style attribute.
    const next = current.cloneNode(false) as HTMLElement;
    next.className = `${wordClass} is-entering`;
    next.removeAttribute("aria-hidden");
    next.lang = greeting.lang;
    next.textContent = greeting.text;
    root.appendChild(next);

    const previous = current;
    previous.classList.add("is-leaving");
    previous.setAttribute("aria-hidden", "true");
    fitTo(next);

    // Commit the below-the-box start position, then release it to slide up.
    void next.offsetWidth;
    next.classList.remove("is-entering");
    current = next;

    const removal = setTimeout(() => {
      pendingRemovals.delete(previous);
      previous.remove();
    }, wipeMs);
    pendingRemovals.set(previous, removal);
  };

  let interval: ReturnType<typeof setInterval> | undefined;
  const start = (): void => {
    if (!interval) interval = setInterval(tick, intervalMs);
  };
  const stop = (): void => {
    if (interval) clearInterval(interval);
    interval = undefined;
  };

  // The interval runs only while motion is allowed, the hero is on screen and the page is visible.
  // Each of those can change after load, so every change re-syncs the one interval.
  let reducedMotion = Boolean(reduceQuery?.matches);
  let inView = true;
  const sync = (): void => {
    if (!reducedMotion && inView && !document.hidden) start();
    else stop();
  };

  // The preference can change after load, so the interval follows the media query.
  const onMotionChange = (e: MediaQueryListEvent): void => {
    reducedMotion = e.matches;
    sync();
  };
  // Hero offscreen: no ticks are needed. Observed on the hero section, falling back to the box itself.
  const hero = root.closest<HTMLElement>("#hero") ?? root;
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          const last = entries[entries.length - 1];
          if (!last) return;
          inView = last.isIntersecting;
          sync();
        })
      : null;
  io?.observe(hero);
  document.addEventListener("visibilitychange", sync);
  sync();
  reduceQuery?.addEventListener?.("change", onMotionChange);

  return () => {
    stop();
    io?.disconnect();
    document.removeEventListener("visibilitychange", sync);
    reduceQuery?.removeEventListener?.("change", onMotionChange);
    for (const [word, timer] of pendingRemovals) {
      clearTimeout(timer);
      word.remove();
    }
    pendingRemovals.clear();
  };
}
