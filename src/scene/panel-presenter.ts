import type { FocusState } from "./camera-rig";
import type { BodyId } from "./bodies";

/** Only arrived states are ever stored as resting content. */
type RestingState = Extract<FocusState, { kind: "overview" | "focused" }>;

/** Callbacks the presenter uses to drive the DOM. Injected so the presenter
 *  itself stays pure and unit-testable. */
export interface PanelPresenterDeps {
  reducedMotion: boolean;
  /** Show the panel whose data-planet-panel === key and hide the rest. A key
   *  that matches no panel — a panel-less body id, or null — leaves every panel
   *  hidden, which is how "blank if none" is achieved. */
  showPanel(key: BodyId | "overview" | null): void;
  /** Hide every panel (used while interacting). */
  hideAllPanels(): void;
  /** Mark the active nav link (null clears all). */
  updateNav(activeId: BodyId | null): void;
  showFacts(id: BodyId): void;
  hideFacts(isOverview?: boolean | undefined): void;
  /** Collapse the info button until the next arrival re-shows it. */
  collapseInfoButton(): void;
}

/**
 * Decides what content is visible as FocusStates arrive.
 *
 * - overview/focused ("arrived") states show immediately and become the
 *   "resting" content (sticky until the next arrival).
 * - transition (user interacting / camera flying) hides the content.
 * - settled (a free interaction has stopped and the camera has fixed its
 *   coordinates) restores the resting content immediately. The rig decides WHEN
 *   the camera has settled and emits this, so the text reappears on the same
 *   beat a click's flight arrives — no timer lives here.
 * - Under reduced motion the transition-hide is skipped entirely, so the
 *   resting content never blinks (and the matching `settled` is a harmless
 *   re-show of what's already visible).
 */
export class PanelPresenter {
  private resting: RestingState = { kind: "overview" };

  constructor(private readonly deps: PanelPresenterDeps) {}

  /**
   * A navigation to `target` (null = overview) has just started: a nav click,
   * planet tap or history pop. The flight's own transition already hides the
   * panel and card; this additionally collapses the info button, which would
   * otherwise keep the previous planet's colors until arrival (on the hero path
   * it is already collapsed). Re-selecting the resting content is a no-op.
   */
  beginNavigation(target: BodyId | null): void {
    if (this.deps.reducedMotion) return;
    const restingId = this.resting.kind === "focused" ? this.resting.id : null;
    if (target === restingId) return;
    this.deps.collapseInfoButton();
  }

  present(state: FocusState): void {
    if (state.kind === "transition") {
      if (this.deps.reducedMotion) return; // keep resting content visible
      this.deps.hideAllPanels();
      this.deps.hideFacts(false);
      return;
    }
    if (state.kind === "settled") {
      // The camera has fixed its coordinates after a free interaction — bring
      // the resting content back now (it may be the intro or the last body).
      this.apply(this.resting);
      return;
    }
    // Arrived at a body/overview: remember it as resting and show it now.
    this.resting = state;
    this.apply(state);
  }

  /** Render an arrived/resting state. */
  private apply(state: FocusState): void {
    switch (state.kind) {
      case "focused":
        this.deps.showPanel(state.id);
        this.deps.updateNav(state.id);
        this.deps.showFacts(state.id);
        break;
      case "overview":
        this.deps.showPanel("overview");
        this.deps.updateNav(null);
        this.deps.hideFacts(true);
        break;
      case "transition":
      case "settled":
        break;
      default: {
        const _exhaustive: never = state;
        throw new Error(`Unhandled FocusState kind: ${_exhaustive}`);
      }
    }
  }
}
