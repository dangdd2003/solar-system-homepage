/**
 * Section content reveal engine (gen2 choreography integration).
 *
 * Mark any element inside a `[data-planet-panel]` with `data-reveal="<effect>"`.
 * When its panel becomes visible, elements enter following a deterministic
 * planEntry choreography generated from a per-load seed, panel motif, and tier.
 * Leaving the panel for longer than realEntryMs resets the items so the next
 * entry replays with fresh choreography. Shorter bounces maintain their running
 * or settled state without rerolling.
 */

import { initAmbient } from "./ambient";
import { drive } from "./clock";
import { runEffect } from "./effects";
import {
  clearFxAttrs,
  clearPrimedRects,
  FX_ATTR,
  itemsOf,
  primeRect,
  primeSize,
  type EffectContext
} from "./kit";
import {
  parseType,
  createRoller,
  getForcedMap,
  forceEffect,
  clearForced,
  planCascade,
  type PlanEntry,
  type Roll,
  type Rng
} from "./randomizer";
import { POOLS, type RevealType } from "./pools";
import { profileOf } from "./catalog";
import { measureHost } from "./geometry";
import { readTierEnv, realEntryMs, resolveTier, type TierProfile } from "./tiers";
import { planEntry, type EntryPlan, type Frame, type PlanItem } from "./choreography";
import { clearDrawable } from "./svg-draw";
import { releaseLineSplit, revertAllSplits } from "./split";

export const REVEALED_CLASS = "is-revealed";
export const DONE_ATTR = "data-reveal-done";

/** Gap between consecutive elements in one cascade. */
export const STAGGER_MS = 60;
/** Longest a whole cascade may spread; long batches tighten the gap to fit. */
export const MAX_SPREAD_MS = 600;
/** Max start delay allowed including authored delays. */
export const MAX_START_MS = 600;
/** Every effect timeline ends within this long after its own delay. */
export const DURATION_MS = 1000;
/** Extra time a clock-driven timeline gets before the backstop finishes it. */
export const STALL_GRACE_MS = 4000;
/** Grace windows a visible page may re-arm before the hard ceiling finishes the timeline. */
export const STALL_RETRIES = 3;
/**
 * Hard ceiling, measured from the element's own delay: a visible page whose
 * frame loop never advances the timeline still finishes it here, so content
 * cannot stay hidden forever.
 */
export const HARD_CEILING_MS = DURATION_MS + STALL_GRACE_MS * STALL_RETRIES;
/** Panels fade out over 0.4s (panels.css); reset default fallback. */
export const RESET_DELAY_MS = 450;

type Handle = { revert(): unknown };
type Timers = Set<ReturnType<typeof setTimeout>>;

/** Options accepted by initReveal. */
export interface RevealOptions {
  readonly rng?: Rng;
  readonly loadSeed?: number;
}

// RevealDebug global declared in randomizer.ts

function prefersReducedMotion(): boolean {
  return resolveTier(readTierEnv()).reducedMotion;
}

function isReady(panel: HTMLElement): boolean {
  if (!panel.classList.contains("is-visible")) return false;
  const gate = panel.dataset.revealGate;
  return !gate || panel.classList.contains(gate);
}

function revealNow(el: HTMLElement): void {
  el.classList.add(REVEALED_CLASS);
  el.setAttribute(DONE_ATTR, "");
}

function safeRevert(handle: Handle): void {
  try {
    handle.revert();
  } catch {
    // A failed revert must never keep an element hidden or break the cascade.
  }
}

/** Plans stored per panel key for debug inspection. */
const plansByPanel = new Map<string, EntryPlan>();

/** Wires one panel; returns its cleanup. */
function watchPanel(panel: HTMLElement, loadSeed: number, options: RevealOptions): () => void {
  const panelKey = (panel.dataset.planetPanel || panel.id || "overview").toLowerCase();
  const items = Array.from(panel.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (items.length === 0) return () => {};

  const roller = createRoller(options.rng);
  const types = new Set<RevealType>();
  for (const el of items) {
    const type = parseType(el.dataset.reveal);
    if (type) types.add(type);
  }
  let rolls: ReadonlyMap<RevealType, Roll> = new Map();

  let entryNo = 0;
  let currentPlan: EntryPlan | null = null;
  let profile: TierProfile = resolveTier(readTierEnv());
  const history: { frames: Frame[]; members: Partial<Record<RevealType, string[]>> } = {
    frames: [],
    members: {}
  };
  let needsPlan = true;
  /** True once the panel has been left since its plan was made (see activate). */
  let leftSincePlan = false;

  const timers: Timers = new Set();
  const running = new Map<HTMLElement, Handle>();
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  /** Marks the element done first, then reverts its timeline in the same task. */
  const finish = (el: HTMLElement): void => {
    if (!el.classList.contains(REVEALED_CLASS)) return;
    el.setAttribute(DONE_ATTR, "");
    el.removeAttribute("data-reveal-fx-forced");
    clearDrawable(el);
    const handle = running.get(el);
    running.delete(el);
    if (handle) safeRevert(handle);
    releaseLineSplit(el);
    clearFxAttrs(el, false);
  };

  /** Plays a batch of elements as one cascade in reading order. */
  const playCascade = (elements: HTMLElement[]): void => {
    // 1. Batch layout reads before writes (Audit finding 17)
    const panelRect = panel.getBoundingClientRect();
    const pw = panelRect.width;
    const pcx = panelRect.left + pw / 2;

    const ordered = elements
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

    const step =
      ordered.length > 1 ? Math.min(STAGGER_MS, MAX_SPREAD_MS / (ordered.length - 1)) : 0;
    const slots = ordered.map((_, i) => Math.round(i * step));

    const entries: PlanEntry[] = ordered.map(({ el, rect }) => ({
      el,
      rect,
      type: parseType(el.dataset.reveal)
    }));

    const cascadePlan = planCascade(entries, slots, rolls);

    const compact = profile.compact;
    const accentRgb =
      getComputedStyle(panel).getPropertyValue("--planet-rgb").trim() || "255, 255, 255";

    // Cluster hosts read their items' rects too: read them now, before any write dirties layout.
    for (const { el } of ordered) {
      if (el.hasAttribute("data-reveal-items")) itemsOf(el).forEach(primeRect);
      primeRect(el);
      // Builders that place decorative parts (the hero lens) read layout sizes too.
      if (el.querySelector("[data-reveal-part]")) {
        primeSize(el);
        el.querySelectorAll<HTMLElement>("[data-reveal-part]").forEach(primeSize);
      }
    }

    // 2. Writes
    ordered.forEach(({ el, rect }, i) => {
      const plannedSlot = cascadePlan[i];
      const extra = Number(el.dataset.revealDelay) || 0;
      const baseDelay = plannedSlot?.slot ?? slots[i] ?? 0;
      const delay = Math.min(baseDelay + extra, MAX_START_MS);

      el.style.setProperty("--reveal-delay", `${delay}ms`);
      el.classList.add(REVEALED_CLASS);

      const cx = rect.left + rect.width / 2;
      const side: -1 | 0 | 1 =
        pw === 0 ? 0 : cx < pcx - 0.12 * pw ? -1 : cx > pcx + 0.12 * pw ? 1 : 0;

      const type = entries[i]?.type ?? null;
      let handle: Handle | null = null;

      try {
        if (type) {
          const itemId = el.id || `rv-${items.indexOf(el)}`;
          const plannedItem = currentPlan?.byId.get(itemId);
          const roll = rolls.get(type);
          const playedName = plannedItem?.played ?? roll?.effect ?? el.dataset.reveal ?? "fade";

          el.setAttribute(FX_ATTR, playedName);
          if (plannedItem?.forcedFrom) {
            el.setAttribute("data-reveal-fx-forced", plannedItem.forcedFrom);
          }

          const ctx: EffectContext = {
            delay,
            compact,
            tier: profile.tier,
            lowFx: profile.lowFx,
            frame: currentPlan?.frame,
            accentRgb,
            side,
            pattern:
              roll?.pattern ??
              (currentPlan?.frame.origin === "edge"
                ? "first"
                : (currentPlan?.frame.origin ?? "first")),
            seed: roll?.seed ?? currentPlan?.seed,
            index: plannedSlot?.index ?? i,
            count: plannedSlot?.count ?? ordered.length,
            vec: plannedSlot?.vec
          };
          handle = runEffect(el, ctx, playedName);
        } else {
          handle = runEffect(el, { delay, compact, accentRgb, side });
        }
      } catch (err) {
        console.warn("[reveal] effect failed", err);
      }

      if (!handle) {
        finish(el);
        return;
      }
      running.set(el, handle);

      // Timelines run on the frame-capped clock and finish when they truly end.
      // The timer is a backstop: for handles the clock cannot drive it is the
      // finish itself. A driven timeline is finished by the backstop only while
      // the page is hidden (no frames run, so nothing visible snaps). On a
      // visible page a main-thread stall only delays the clock, which resumes
      // where it stopped, so the backstop re-arms instead of reverting it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending = true;
      let waited = 0;
      const driven = drive(handle, delay, () => {
        pending = false;
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(timer);
        }
        finish(el);
      });
      const armBackstop = (wait: number): void => {
        waited += wait;
        const t = setTimeout(() => {
          timers.delete(t);
          if (!pending) return;
          if (
            driven &&
            document.visibilityState === "visible" &&
            waited < delay + HARD_CEILING_MS
          ) {
            armBackstop(STALL_GRACE_MS);
            return;
          }
          pending = false;
          finish(el);
        }, wait);
        timer = t;
        timers.add(t);
      };
      armBackstop(delay + DURATION_MS + (driven ? STALL_GRACE_MS : 0));
    });
    clearPrimedRects();
  };

  /** Reverts running timelines newest-first, so no mid-frame value is restored. */
  const revertRunning = (): void => {
    Array.from(running.values()).reverse().forEach(safeRevert);
    running.clear();
  };

  const reset = (): void => {
    revertRunning();
    for (const el of items) {
      el.classList.remove(REVEALED_CLASS);
      el.removeAttribute(DONE_ATTR);
      el.removeAttribute(FX_ATTR);
      el.removeAttribute("data-reveal-fx-forced");
      el.style.removeProperty("--reveal-delay");
      clearDrawable(el);
      clearFxAttrs(el, true);
    }
    needsPlan = true;
  };

  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            const entering = entries
              .filter((e) => e.isIntersecting)
              .map((e) => e.target as HTMLElement)
              .filter((el) => !el.classList.contains(REVEALED_CLASS));
            entering.forEach((el) => io?.unobserve(el));
            if (entering.length) playCascade(entering);
          },
          { root: panel, threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        )
      : null;

  const activate = (): void => {
    if (active) return;
    active = true;
    if (resetTimer) clearTimeout(resetTimer);

    // Dynamic tier resolve on every activation (not frozen)
    profile = resolveTier(readTierEnv());

    // Every completed entry rerolls on re-entry, even after a bounce shorter
    // than realEntryMs. A running entry is left alone so a bounce never restarts it.
    if (leftSincePlan && !needsPlan && items.every((el) => el.hasAttribute(DONE_ATTR))) {
      reset();
    }
    leftSincePlan = false;

    if (needsPlan) {
      entryNo++;
      rolls = roller.roll(types, profile.compact);

      const planItems: PlanItem[] = items.map((el, domRank) => {
        const type = parseType(el.dataset.reveal);
        const geometry = measureHost(el, type ?? "text");
        const extraDelayMs = Number(el.dataset.revealDelay) || 0;
        return {
          id: el.id || `rv-${domRank}`,
          type,
          geometry,
          domRank,
          extraDelayMs
        };
      });

      currentPlan = planEntry({
        loadSeed,
        panelKey,
        entryNo,
        history,
        tier: profile,
        items: planItems,
        forced: getForcedMap()
      });

      plansByPanel.set(panelKey, currentPlan);
      history.frames.push(currentPlan.frame);
      if (history.frames.length > 5) history.frames.shift();

      // History records one member per type per entry, under the item's own type.
      // Fallbacks such as "fade" are not members of that type and are skipped.
      const typeById = new Map(planItems.map((pi) => [pi.id, pi.type]));
      const recorded = new Set<string>();
      for (const [id, item] of currentPlan.byId) {
        const type = typeById.get(id);
        if (!type) continue;
        const p = profileOf(item.played);
        if (!p || p.type !== type) continue;
        if (recorded.has(p.name)) continue;
        recorded.add(p.name);
        const list = history.members[type] ?? [];
        history.members[type] = [...list, p.name].slice(-5);
        const roll = rolls.get(type);
        if (roll) {
          (roll as { effect: string }).effect = p.name;
        }
      }
      needsPlan = false;
    }

    const pending = items.filter((el) => !el.classList.contains(REVEALED_CLASS));
    if (io) {
      pending.forEach((el) => io.observe(el));
    } else if (pending.length) {
      playCascade(pending);
    }
  };

  const deactivate = (): void => {
    if (!active) return;
    active = false;
    leftSincePlan = true;
    io?.disconnect();
    if (resetTimer) clearTimeout(resetTimer);

    const delay = realEntryMs(profile);
    resetTimer = setTimeout(() => {
      if (isReady(panel)) return;
      timers.forEach(clearTimeout);
      timers.clear();
      reset();
    }, delay);
  };

  /** Keyboard focus landing in an unplayed element shows it at once. */
  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.getAttribute("tabindex") === "-1") return;
    // A gated panel still hides its content until the gate class lands; focus must not finish it early.
    const gate = panel.dataset.revealGate;
    if (gate && !panel.classList.contains(gate)) return;
    let el = target?.closest<HTMLElement>("[data-reveal]") ?? null;
    while (el && panel.contains(el)) {
      if (!el.hasAttribute(DONE_ATTR)) {
        io?.unobserve(el);
        el.classList.add(REVEALED_CLASS);
        finish(el);
      }
      el = el.parentElement?.closest<HTMLElement>("[data-reveal]") ?? null;
    }
  };

  /** Another script (project filter) needs an element at rest now. */
  const onSettle = (e: Event): void => {
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (!el || !el.matches("[data-reveal]") || !panel.contains(el)) return;
    if (el.hasAttribute(DONE_ATTR)) return;
    io?.unobserve(el);
    el.classList.add(REVEALED_CLASS);
    finish(el);
  };

  const sync = (): void => (isReady(panel) ? activate() : deactivate());

  const mo = new MutationObserver(sync);
  mo.observe(panel, { attributes: true, attributeFilter: ["class"] });
  panel.addEventListener("focusin", onFocusIn);
  panel.addEventListener("reveal:settle", onSettle);
  sync();

  return () => {
    mo.disconnect();
    io?.disconnect();
    panel.removeEventListener("focusin", onFocusIn);
    panel.removeEventListener("reveal:settle", onSettle);
    if (resetTimer) clearTimeout(resetTimer);
    timers.forEach(clearTimeout);
    timers.clear();
    revertRunning();
  };
}

/**
 * Starts the reveal system for every panel in `root`. Under reduced motion
 * everything is shown immediately. Returns a cleanup function.
 */
export function initReveal(root: ParentNode = document, options: RevealOptions = {}): () => void {
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-planet-panel]"));

  const loadSeed =
    options.loadSeed ??
    (options.rng
      ? 42
      : typeof crypto !== "undefined" && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint32Array(1))[0]!
        : Math.floor(Math.random() * 2 ** 31));

  if (typeof window !== "undefined") {
    window.__reveal = {
      force: forceEffect,
      clear: clearForced,
      pools: POOLS,
      plan: (key: string) =>
        plansByPanel.get(key.toLowerCase()) ??
        plansByPanel.get(
          key.toLowerCase() === "hero" ? "overview" : key.toLowerCase() === "overview" ? "hero" : ""
        ),
      loadSeed
    };
  }

  if (prefersReducedMotion()) {
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach(revealNow);
    return () => {};
  }

  const cleanups = panels.map((panel) => watchPanel(panel, loadSeed, options));
  cleanups.push(initAmbient(root));

  // Listen to prefers-reduced-motion media query changes
  let motionMql: MediaQueryList | null = null;
  const onMotionChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach(revealNow);
    }
  };

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionMql.addEventListener?.("change", onMotionChange);
  }

  return () => {
    cleanups.forEach((fn) => fn());
    motionMql?.removeEventListener?.("change", onMotionChange);
    revertAllSplits();
  };
}
