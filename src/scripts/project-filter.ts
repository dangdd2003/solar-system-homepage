import { onPageReady } from "./page-ready";
import { createLayout, stagger, type AutoLayout } from "animejs";

/** Tracks cleanup functions per container without mutating the DOM element. */
const cleanups = new WeakMap<HTMLElement, () => void>();

interface ProjectContainerCache {
  grid: HTMLElement | null;
  cards: HTMLElement[];
  resetBtn: HTMLElement | null;
}

/** Cached DOM lookups per initialized projects container. */
const containerCache = new WeakMap<HTMLElement, ProjectContainerCache>();

/** Cached parsed tags per card element (as a Set for O(1) lookups) to avoid repeated JSON parsing during filtering */
const cardTagCache = new WeakMap<HTMLElement, ReadonlySet<string>>();

function getCardTags(card: HTMLElement): ReadonlySet<string> {
  let tags = cardTagCache.get(card);
  if (!tags) {
    try {
      const rawTags = card.getAttribute("data-tags") || "[]";
      const parsed: unknown = JSON.parse(rawTags);
      // Keep only string entries so one bad value does not discard the card's other tags
      const valid = Array.isArray(parsed)
        ? parsed.filter((t): t is string => typeof t === "string")
        : [];
      tags = new Set(valid.map((t) => t.trim().toLowerCase()));
    } catch {
      tags = new Set();
    }
    cardTagCache.set(card, tags);
  }
  return tags;
}

export const TAG_CHUNK_SIZE = 10;

export type SortMode = "date" | "asc" | "desc";

function getCardTitle(card: HTMLElement): string {
  return (
    card.getAttribute("data-title") ||
    card.querySelector(".card__title")?.textContent ||
    ""
  ).trim();
}

export function sortProjects(container: HTMLElement, sortMode: SortMode): void {
  const cached = containerCache.get(container);
  const grid = cached ? cached.grid : container.querySelector<HTMLElement>(".projects__grid");
  if (!grid) return;
  const cards = cached ? cached.cards : Array.from(grid.querySelectorAll<HTMLElement>(".card"));
  // Precompute sort keys once per card (avoids DOM reads inside the comparator)
  const keyed = cards.map((card) => ({
    card,
    title: sortMode === "date" ? "" : getCardTitle(card),
    order: sortMode === "date" ? parseInt(card.getAttribute("data-order") || "100", 10) : 0
  }));
  keyed.sort((a, b) => {
    if (sortMode === "asc") return a.title.localeCompare(b.title);
    if (sortMode === "desc") return b.title.localeCompare(a.title);
    // "date" (default numerical order)
    return a.order - b.order;
  });
  // Single fragment-based re-append keeps the DOM write to one reflow
  const fragment = grid.ownerDocument.createDocumentFragment();
  keyed.forEach(({ card }) => fragment.appendChild(card));
  grid.appendChild(fragment);
}

export function filterProjects(container: HTMLElement, activeTags: Set<string>): void {
  const cached = containerCache.get(container);
  const cards = cached ? cached.cards : container.querySelectorAll<HTMLElement>(".card");
  const resetBtn = cached
    ? cached.resetBtn
    : container.querySelector<HTMLElement>("[data-filter-reset]");

  if (resetBtn) {
    if (activeTags.size > 0) {
      resetBtn.removeAttribute("hidden");
    } else {
      resetBtn.setAttribute("hidden", "true");
    }
  }

  const noFilters = activeTags.size === 0;

  cards.forEach((card) => {
    if (noFilters) {
      if (card.classList.contains("is-filtered-out")) {
        card.classList.remove("is-filtered-out");
        card.removeAttribute("aria-hidden");
      }
      return;
    }

    const cardTags = getCardTags(card);
    let matchesAll = true;
    for (const activeTag of activeTags) {
      if (!cardTags.has(activeTag)) {
        matchesAll = false;
        break;
      }
    }

    if (matchesAll) {
      if (card.classList.contains("is-filtered-out")) {
        card.classList.remove("is-filtered-out");
        card.removeAttribute("aria-hidden");
      }
    } else {
      if (!card.classList.contains("is-filtered-out")) {
        card.classList.add("is-filtered-out");
        card.setAttribute("aria-hidden", "true");
      }
    }
  });
}

let reducedMotionMql: MediaQueryList | null | undefined;

/** Reads the live reduced-motion preference, so a change made while the page is open is honoured. */
function prefersReducedMotion(): boolean {
  if (reducedMotionMql === undefined) {
    reducedMotionMql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
  }
  return reducedMotionMql?.matches ?? false;
}

/** True when a FLIP layout may run now: motion allowed and WAAPI available (jsdom lacks it). */
function canAnimateLayout(grid: HTMLElement | null): grid is HTMLElement {
  return grid !== null && !prefersReducedMotion() && typeof grid.animate === "function";
}

/** FLIP layout for filter/sort re-flow. Null under reduced motion or without WAAPI (jsdom), so updates run synchronously. */
function createGridLayout(grid: HTMLElement): AutoLayout | null {
  if (!canAnimateLayout(grid)) return null;
  return createLayout(grid, {
    children: ".card",
    duration: 520,
    ease: "outExpo",
    delay: stagger(24),
    enterFrom: { opacity: 0, scale: 0.92 },
    leaveTo: { opacity: 0, scale: 0.92 },
    // While anime drives the cards, the shared `.surface-card` transform/opacity transitions
    // are switched off (see `[data-layout-animating]` in Projects.astro) so they do not lag
    // every frame that anime writes.
    onBegin: () => {
      grid.setAttribute("data-layout-animating", "");
    },
    // anime commits each card's final computed transform (and a translate) inline when a
    // layout animation completes; inline values beat `.surface-card` hover and the reveal's
    // `translate`, so clear them once no layout animation is running. Deferred one frame
    // because interrupted runs write `translate` after the earlier onComplete. Cards that are
    // still mid-reveal are skipped so their reveal translate is not cut short.
    onComplete: () => {
      requestAnimationFrame(() => {
        grid.removeAttribute("data-layout-animating");
        grid
          .querySelectorAll<HTMLElement>(".card:not([data-reveal]), .card[data-reveal-done]")
          .forEach((card) => {
            card.style.removeProperty("transform");
            card.style.removeProperty("translate");
          });
      });
    }
  });
}

/**
 * Shows every card that has not played its reveal yet. createLayout mis-records
 * cards that reveal.css still holds at opacity 0 and leaves inline
 * transform/translate on them, so they must be visible before it records.
 * The reveal engine resets these attributes when the panel is left, so the
 * entrance still replays next visit.
 */
function settleCardReveals(grid: HTMLElement | null): void {
  grid
    ?.querySelectorAll<HTMLElement>(".card[data-reveal]:not([data-reveal-done])")
    .forEach((card) => {
      // The reveal engine (if running) reverts the card's timeline and clears its fx attrs.
      card.dispatchEvent(new Event("reveal:settle", { bubbles: true }));
      card.classList.add("is-revealed");
      card.setAttribute("data-reveal-done", "");
    });
}

export function initProjectFilter(rootElement?: HTMLElement | undefined): () => void {
  const container =
    rootElement || (typeof document !== "undefined" ? document.getElementById("projects") : null);
  if (!container) return () => {};

  // Clean up prior instance if attached
  cleanups.get(container)?.();

  const moreBtn = container.querySelector<HTMLElement>(
    "[data-other-toggle], [data-dropdown-toggle]"
  );
  const lessBtn = container.querySelector<HTMLElement>("[data-less-toggle]");
  const toggleLabel = container.querySelector<HTMLElement>(
    ".filter-pill__toggle-label, .filter-dropdown__label"
  );
  const toggleBadge = container.querySelector<HTMLElement>(".filter-pill__badge");
  const overflowPills = container.querySelectorAll<HTMLElement>("[data-overflow-tag]");
  // Queried once per instance: the pill set is static after markup is rendered
  const filterPills = container.querySelectorAll<HTMLElement>("[data-filter-btn]");
  const pillByTag = new Map<string, HTMLElement>();
  filterPills.forEach((pill) => {
    const tag = pill.getAttribute("data-filter-btn")?.trim().toLowerCase();
    if (tag) pillByTag.set(tag, pill);
  });
  const sortBtn = container.querySelector<HTMLElement>("[data-project-sort]");
  const sortLabel = container.querySelector<HTMLElement>(".sort-label");
  const grid = container.querySelector<HTMLElement>(".projects__grid");
  const resetBtnEl = container.querySelector<HTMLElement>("[data-filter-reset]");
  const cachedCards = Array.from((grid ?? container).querySelectorAll<HTMLElement>(".card"));
  containerCache.set(container, { grid, cards: cachedCards, resetBtn: resetBtnEl });
  let layout: AutoLayout | null = grid ? createGridLayout(grid) : null;
  // Drops the FLIP layout (and any in-flight run) once motion is no longer allowed
  const dropLayout = (): void => {
    layout?.revert();
    layout = null;
    grid?.removeAttribute("data-layout-animating");
  };
  const relayout = (mutate: () => void): void => {
    // Re-checked on every update: reduced motion can be switched on or off while the page is open
    if (layout && !canAnimateLayout(grid)) {
      dropLayout();
    } else if (!layout && canAnimateLayout(grid)) {
      layout = createGridLayout(grid);
    }
    if (layout) {
      settleCardReveals(grid);
      layout.update(mutate);
    } else {
      mutate();
    }
  };

  // Keep track of currently active tags and sort mode
  const activeTags = new Set<string>();
  let currentSort: SortMode = "date";

  const updateSortUI = () => {
    if (!sortBtn) return;
    sortBtn.setAttribute("data-sort-mode", currentSort);
    if (sortLabel) {
      if (currentSort === "asc") {
        sortLabel.textContent = "A → Z";
      } else if (currentSort === "desc") {
        sortLabel.textContent = "Z → A";
      } else {
        sortLabel.textContent = "Default order";
      }
    }
    const sortDesc =
      currentSort === "asc"
        ? "alphabetical A to Z"
        : currentSort === "desc"
          ? "reverse alphabetical Z to A"
          : "default order";
    sortBtn.setAttribute("aria-label", `Sort projects: Currently showing ${sortDesc}`);
    if (currentSort === "asc") {
      sortBtn.setAttribute("title", "Sort: A–Z (Click for Z–A)");
    } else if (currentSort === "desc") {
      sortBtn.setAttribute("title", "Sort: Z–A (Click for Default order)");
    } else {
      sortBtn.setAttribute("title", "Sort: Default order (Click for A–Z)");
    }
  };

  const hasActiveOverflowPill = (): boolean => {
    for (let i = 0; i < overflowPills.length; i++) {
      if (overflowPills[i]!.getAttribute("aria-pressed") === "true") return true;
    }
    return false;
  };

  const hasVisibleOverflowPill = (): boolean => {
    for (let i = 0; i < overflowPills.length; i++) {
      if (!overflowPills[i]!.hidden) return true;
    }
    return false;
  };

  const updateToggleState = () => {
    const totalOverflow = overflowPills.length;
    if (totalOverflow === 0) {
      if (moreBtn) moreBtn.hidden = true;
      if (lessBtn) lessBtn.hidden = true;
      return;
    }

    let hiddenCount = 0;
    overflowPills.forEach((pill) => {
      if (pill.hidden) hiddenCount++;
    });

    const revealedCount = totalOverflow - hiddenCount;

    // "Less" button: visible whenever at least 1 overflow pill is revealed
    if (lessBtn) {
      lessBtn.hidden = revealedCount === 0;
    }

    // "Other / More" button:
    if (moreBtn) {
      if (hiddenCount === 0) {
        // All overflow pills are visible -> hide "More" button
        moreBtn.hidden = true;
      } else {
        moreBtn.hidden = false;
        if (revealedCount > 0) {
          if (toggleLabel) {
            toggleLabel.textContent = "More";
          }
        } else {
          if (toggleLabel) {
            toggleLabel.textContent = "Other";
          }
        }
        if (toggleBadge) {
          toggleBadge.textContent = `+${hiddenCount}`;
        }
        const nextStep = Math.min(TAG_CHUNK_SIZE, hiddenCount);
        moreBtn.setAttribute(
          "title",
          `Show next ${nextStep} technology tags (+${hiddenCount} remaining)`
        );
        moreBtn.setAttribute("aria-expanded", revealedCount > 0 ? "true" : "false");
      }
    }

    // Highlight toggle button if any overflow tag is currently active
    const hasActiveOverflow = hasActiveOverflowPill();
    if (moreBtn) moreBtn.classList.toggle("is-active", hasActiveOverflow && !moreBtn.hidden);
    if (lessBtn) lessBtn.classList.toggle("is-active", hasActiveOverflow && !lessBtn.hidden);
  };

  const expandNextChunk = () => {
    let unhiddenInThisStep = 0;
    overflowPills.forEach((pill) => {
      if (pill.hidden && unhiddenInThisStep < TAG_CHUNK_SIZE) {
        pill.hidden = false;
        unhiddenInThisStep++;
      }
    });
    updateToggleState();
  };

  const collapseOverflow = (restoreFocus = false) => {
    // Don't collapse overflow pills if any of them are active
    if (hasActiveOverflowPill()) return;

    overflowPills.forEach((pill) => {
      pill.hidden = true;
    });
    updateToggleState();
    if (restoreFocus && moreBtn) {
      moreBtn.focus();
    }
  };

  const updatePillsState = () => {
    filterPills.forEach((pill) => {
      const pillTag = pill.getAttribute("data-filter-btn")?.trim().toLowerCase();
      if (pillTag) {
        const isActive = activeTags.has(pillTag);
        pill.setAttribute("aria-pressed", isActive ? "true" : "false");
        pill.classList.toggle("is-active", isActive);
      }
    });
    updateToggleState();
  };

  const handleClick = (e: MouseEvent) => {
    // Type guard instead of a cast: click targets may be non-Element nodes
    if (!(e.target instanceof Element)) return;
    const target = e.target;

    // Let card links (anchors with href) behave normally without triggering filter/sort logic
    if (target.closest("a[href]")) return;

    // Reset button click
    const resetBtn = target.closest<HTMLElement>("[data-filter-reset]");
    if (resetBtn && container.contains(resetBtn)) {
      activeTags.clear();
      updatePillsState();
      relayout(() => filterProjects(container, activeTags));
      return;
    }

    // Sort button click
    const clickedSort = target.closest<HTMLElement>("[data-project-sort]");
    if (clickedSort && container.contains(clickedSort)) {
      currentSort = currentSort === "date" ? "asc" : currentSort === "asc" ? "desc" : "date";
      updateSortUI();
      relayout(() => sortProjects(container, currentSort));
      return;
    }

    // Less button click
    const clickedLess = target.closest<HTMLElement>("[data-less-toggle]");
    if (clickedLess && container.contains(clickedLess)) {
      e.stopPropagation();
      e.preventDefault();
      collapseOverflow(true);
      return;
    }

    // Toggle button click (Other / More)
    const clickedToggle = target.closest<HTMLElement>(
      "[data-other-toggle], [data-dropdown-toggle]"
    );
    if (clickedToggle && container.contains(clickedToggle)) {
      e.stopPropagation();
      e.preventDefault();
      expandNextChunk();
      return;
    }

    // Filter button click (primary or overflow pills)
    const filterBtn = target.closest<HTMLElement>("[data-filter-btn]");
    if (filterBtn && container.contains(filterBtn)) {
      const tag = filterBtn.getAttribute("data-filter-btn")?.trim().toLowerCase();
      if (tag) {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
        } else {
          activeTags.add(tag);
        }
        updatePillsState();
        relayout(() => filterProjects(container, activeTags));
      }
      return;
    }

    // Tag button click inside a project card
    const tagClickBtn = target.closest<HTMLElement>("[data-tag-click]");
    if (tagClickBtn && container.contains(tagClickBtn)) {
      const tag = tagClickBtn.getAttribute("data-tag-click")?.trim().toLowerCase();
      if (tag) {
        if (!activeTags.has(tag)) {
          activeTags.add(tag);

          // Ensure matching pill is unhidden even if in overflow
          const matchingPill = pillByTag.get(tag);
          if (
            matchingPill &&
            matchingPill.hasAttribute("data-overflow-tag") &&
            matchingPill.hidden
          ) {
            matchingPill.hidden = false;
          }
        } else {
          activeTags.delete(tag);
        }

        updatePillsState();
        relayout(() => filterProjects(container, activeTags));

        // Scroll to the top of the projects section so user sees the filtered results
        const reducedMotion = prefersReducedMotion();
        container.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start"
        });
      }
      return;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;

    // Only handle Escape when focus is inside this projects root
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (!active || !container.contains(active)) return;

    if (hasVisibleOverflowPill()) {
      e.preventDefault();
      collapseOverflow(true);
    }
  };

  container.addEventListener("click", handleClick);
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", handleKeyDown);
  }

  const cleanup = () => {
    container.removeEventListener("click", handleClick);
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", handleKeyDown);
    }
    dropLayout();
    containerCache.delete(container);
    cleanups.delete(container);
  };

  cleanups.set(container, cleanup);
  return cleanup;
}

onPageReady(() => initProjectFilter());
