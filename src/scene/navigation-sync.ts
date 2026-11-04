import {
  type ActiveBodyOrOverview,
  type SectionId,
  isSectionId,
  sectionIdToBodyId
} from "./mode-controller";

export interface NavigationTarget {
  sectionId: SectionId;
  bodyId: ActiveBodyOrOverview;
  hash: string;
}

/** Shape of the state object we push via history.pushState. */
interface NavState {
  readonly sectionId: SectionId;
}

function isNavState(s: unknown): s is NavState {
  if (typeof s !== "object" || s === null || !("sectionId" in s)) {
    return false;
  }
  const id: unknown = s.sectionId;
  return typeof id === "string" && isSectionId(id);
}

/** Extract a section id from a PopStateEvent, falling back to the URL hash. */
function sectionIdFromPopState(e: PopStateEvent): SectionId {
  if (isNavState(e.state)) return e.state.sectionId;
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  return hashToSectionId(hash);
}

export function hashToSectionId(hash: string): SectionId {
  const clean = hash.replace(/^#/, "").toLowerCase();
  return isSectionId(clean) ? clean : "hero";
}

export function sectionIdToHash(sectionId: string): string {
  return `#${isSectionId(sectionId) ? sectionId : "hero"}`;
}

export interface NavigationSyncOptions {
  onNavigate?: ((target: NavigationTarget) => void) | undefined;
}

export class NavigationSync {
  private readonly onNavigate?: ((target: NavigationTarget) => void) | undefined;

  /** Unsubscribe functions for popstate listeners still attached, so destroy() can remove them. */
  private readonly popStateUnsubscribers = new Set<() => void>();

  constructor(options: NavigationSyncOptions = {}) {
    this.onNavigate = options.onNavigate;
  }

  getInitialTarget(customHash?: string | undefined): NavigationTarget {
    const rawHash =
      customHash !== undefined
        ? customHash
        : typeof window !== "undefined"
          ? window.location.hash
          : "";
    const sectionId = hashToSectionId(rawHash);
    return this.resolveTarget(sectionId);
  }

  navigateTo(
    sectionId: string,
    options: { pushHistory?: boolean | undefined; focusHeading?: boolean | undefined } = {}
  ): NavigationTarget {
    const { pushHistory = true, focusHeading = true } = options;
    const target = this.resolveTarget(sectionId);

    if (typeof window !== "undefined") {
      const state: NavState = { sectionId: target.sectionId };
      if (pushHistory) {
        window.history.pushState(state, "", target.hash);
      } else {
        window.history.replaceState(state, "", target.hash);
      }

      this.updateA11yStatus(target.sectionId);
      if (focusHeading) {
        this.focusSectionHeading(target.sectionId);
      }
    }

    return target;
  }

  onPopState(handler: (target: NavigationTarget) => void): () => void {
    const listener = (e: PopStateEvent): void => {
      const sectionId = sectionIdFromPopState(e);
      const target = this.resolveTarget(sectionId);
      if (this.onNavigate) this.onNavigate(target);
      handler(target);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", listener);
      const unsubscribe = (): void => {
        window.removeEventListener("popstate", listener);
        this.popStateUnsubscribers.delete(unsubscribe);
      };
      this.popStateUnsubscribers.add(unsubscribe);
      return unsubscribe;
    }
    return () => {};
  }

  focusSectionHeading(sectionId: string): void {
    if (typeof document === "undefined") return;
    const section = document.getElementById(sectionId);
    if (!section) return;
    const heading = section.querySelector<HTMLElement>("h1, h2, h3");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  private updateA11yStatus(sectionId: SectionId): void {
    if (typeof document === "undefined") return;
    const statusEl = document.getElementById("a11y-status");
    if (statusEl) {
      const label = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
      statusEl.textContent = `Navigated to ${label} section`;
    }
  }

  private resolveTarget(sectionId: string): NavigationTarget {
    const validSection: SectionId = isSectionId(sectionId) ? sectionId : "hero";
    const bodyId = validSection === "hero" ? "overview" : sectionIdToBodyId(validSection);
    return {
      sectionId: validSection,
      bodyId,
      hash: sectionIdToHash(validSection)
    };
  }

  destroy(): void {
    for (const unsubscribe of [...this.popStateUnsubscribers]) {
      unsubscribe();
    }
    this.popStateUnsubscribers.clear();
  }
}
