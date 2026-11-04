import { SolarSystem, type FocusState } from "../scene/SolarSystem";
import { getBody, isBodyId, type BodyId } from "../scene/bodies";
import { PanelPresenter } from "../scene/panel-presenter";
import { applyPlanetTheme, planetTheme, type PlanetTheme } from "../scene/planet-theme";
import { ModeController, bodyIdToSectionId, type InteractionMode } from "../scene/mode-controller";
import { NavigationSync, type NavigationTarget } from "../scene/navigation-sync";
import { StartupController } from "./startup-controller";
import { readTierEnv, resolveTier } from "./reveal/tiers";
import { markSceneReady, noteRevealProgress, setRevealLimitProvider } from "./startup/reveal-gate";

/**
 * Where the startup welcome is when the scene boots. The scene is built during the intro
 * ("pending" holds rendering until the aperture opens), after the aperture opens ("opening"),
 * or after the startup has fully finished ("complete").
 */
export type StartupPhase = "pending" | "opening" | "complete";

/** Idle time before the expanded speed slider collapses itself. */
const SLIDER_AUTO_COLLAPSE_MS = 5000;

function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(max-width: 600px)").matches || window.innerWidth <= 600)
  );
}

function getInput(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

/**
 * Builds the solar system and wires its UI. Lives in its own chunk (loaded by
 * solar-system-ui.ts) so three.js and the scene stay off the startup's critical path.
 * Throws if the scene cannot be built; the caller is responsible for markSceneReady().
 */
export function initSolarSystemUI(startupPhase: StartupPhase): () => void {
  const canvas = document.getElementById("solar-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    // No scene will ever render, so the startup must not wait for one.
    markSceneReady();
    return () => {};
  }

  // The OS motion setting can change while the page is open, so this value is live.
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  const panels = new Map<string, HTMLElement>();
  // Planet sections take their body's color; the hero (overview) stays neutral
  // and has no entry here.
  const panelThemes = new Map<string, PlanetTheme>();
  document.querySelectorAll<HTMLElement>("[data-planet-panel]").forEach((el) => {
    const key = el.dataset.planetPanel ?? "";
    panels.set(key, el);
    if (isBodyId(key)) {
      const theme = planetTheme(getBody(key).color);
      panelThemes.set(key, theme);
      el.dataset.planetTheme = key;
      applyPlanetTheme(el, theme);
    }
  });

  const navLinks = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-link]"));

  const factCard = document.getElementById("fact-card");
  const infoBtnWrapper = document.getElementById("info-btn-wrapper");
  const btnToggleInfo = document.getElementById("btn-toggle-info");
  const factName = document.getElementById("fact-name");
  const factLabel = document.getElementById("fact-label");
  const factRadius = document.getElementById("fact-radius");
  const factDistance = document.getElementById("fact-distance");
  const factPeriod = document.getElementById("fact-period");

  const modeController = new ModeController();
  const navigationSync = new NavigationSync();

  // Every DOM listener registered below is bound to this signal so cleanup
  // can remove them all at once.
  const listeners = new AbortController();
  const { signal } = listeners;

  let isFactsVisible = !isMobileViewport();

  const km = new Intl.NumberFormat("en-US");

  function formatPeriod(days: number): string {
    if (days === 0) return "—";
    if (days < 365) return `${days.toLocaleString("en-US")} days`;
    const years = days / 365.256;
    return `${years.toFixed(1)} years (${km.format(Math.round(days))} days)`;
  }

  function showFacts(id: BodyId): void {
    if (!factCard) return;
    if (infoBtnWrapper) {
      infoBtnWrapper.classList.remove("collapsed");
    }

    const body = getBody(id);
    const theme = planetTheme(body.color);
    applyPlanetTheme(factCard, theme);
    if (btnToggleInfo) applyPlanetTheme(btnToggleInfo, theme);

    if (factName) factName.textContent = body.name;
    if (factLabel) factLabel.textContent = body.label;
    if (factRadius) factRadius.textContent = `${km.format(body.facts.radiusKm)} km`;
    if (factDistance) {
      factDistance.textContent = body.facts.distanceAu === 0 ? "—" : `${body.facts.distanceAu} AU`;
    }
    if (factPeriod) factPeriod.textContent = formatPeriod(body.facts.orbitalPeriodDays);

    // Respect user disable/enable state: keep card hidden if user closed it
    factCard.hidden = !isFactsVisible;
    if (btnToggleInfo) {
      btnToggleInfo.classList.toggle("active", isFactsVisible);
      btnToggleInfo.setAttribute("aria-expanded", String(isFactsVisible));
    }
  }

  function showPanel(key: string | null): void {
    panels.forEach((el, panelKey) => {
      el.classList.toggle("is-visible", panelKey === key);
    });
    // Arrival attaches the section (theme + reading-mode dim), so the
    // zoom-in itself plays neutral and at full brightness.
    setActiveSection(key !== null && panelThemes.has(key) ? key : undefined);
  }

  function hideAllPanels(): void {
    panels.forEach((el) => el.classList.remove("is-visible"));
  }

  /**
   * Attach a themed section to <html>, or detach to neutral with undefined.
   * This is the single source of truth for "a section is attached":
   * data-active-planet plus the --active-planet-* tokens. The chrome theme
   * (Nav.astro) and the reading-mode scene dim (panels.css) both derive from
   * it in CSS, so they always switch together: off from the moment navigation
   * leaves a section until the next one arrives.
   */
  function setActiveSection(id: string | undefined): void {
    const root = document.documentElement;
    if (root.dataset.activePlanet === id) return;
    const theme = id === undefined ? undefined : panelThemes.get(id);
    applyPlanetTheme(root, theme ?? null, "active-planet");
    if (id !== undefined && theme) root.dataset.activePlanet = id;
    else delete root.dataset.activePlanet;
  }

  function updateNav(activeId: string | null): void {
    // Write only on change: nav-indicator observes aria-current, and every
    // write (even of the same value) would re-run its layout measurement on
    // each arrival and settle.
    navLinks.forEach((link) => {
      const current = String(link.dataset.navLink === activeId);
      if (link.getAttribute("aria-current") !== current) link.setAttribute("aria-current", current);
    });
    // Leaving for another destination detaches the section, so the chrome
    // stays neutral and the scene bright for the whole flight; showPanel
    // attaches the new one on arrival. Re-selecting the current section (and
    // the arrival's own updateNav call) keeps it.
    if (document.documentElement.dataset.activePlanet !== (activeId ?? undefined)) {
      setActiveSection(undefined);
    }
  }

  function collapseInfoButton(): void {
    // Hidden until the next arrival's showFacts re-expands it in the new
    // planet's colors.
    infoBtnWrapper?.classList.add("collapsed");
  }

  function hideFacts(isOverview = false): void {
    if (factCard) factCard.hidden = true;
    if (isOverview) {
      if (infoBtnWrapper) {
        infoBtnWrapper.classList.add("collapsed");
      }
      isFactsVisible = !isMobileViewport();
    }
  }

  if (btnToggleInfo && factCard) {
    btnToggleInfo.setAttribute("aria-controls", "fact-card");
    btnToggleInfo.setAttribute("aria-expanded", String(isFactsVisible));
    btnToggleInfo.addEventListener(
      "click",
      () => {
        isFactsVisible = !isFactsVisible;
        factCard.hidden = !isFactsVisible;
        btnToggleInfo.classList.toggle("active", isFactsVisible);
        btnToggleInfo.setAttribute("aria-expanded", String(isFactsVisible));
      },
      { signal }
    );
  }

  const presenter = new PanelPresenter({
    get reducedMotion() {
      return reducedMotion;
    },
    showPanel,
    hideAllPanels,
    updateNav,
    showFacts,
    hideFacts,
    collapseInfoButton
  });

  // A switch to reduced motion (or back) reaches the built scene; a switch before the
  // scene exists is picked up when it is constructed, since it reads the live value.
  motionQuery.addEventListener(
    "change",
    (e) => {
      reducedMotion = e.matches;
      created?.setReducedMotion(reducedMotion);
    },
    { signal }
  );

  function render(state: FocusState): void {
    presenter.present(state);
  }

  // Hoisted so the catch below can release whatever was built before a failure.
  let created: SolarSystem | undefined;
  let unsubscribePopState: (() => void) | undefined;

  try {
    const loadingPill = document.getElementById("texture-loading");
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    function onTextureProgress(loaded: number, total: number): void {
      if (loaded > 0) noteRevealProgress();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("texture:progress", {
            detail: { loaded, total }
          })
        );
      }
      if (!loadingPill) return;
      loadingPill.dataset.progress = String(total > 0 ? loaded / total : 1);
      if (loaded < total) {
        clearTimeout(hideTimer);
        loadingPill.hidden = false;
        loadingPill.classList.remove("is-done");
      } else {
        // The presentation controller finishes the progress line and quietly dismisses the tag.
        loadingPill.classList.add("is-done");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          loadingPill.hidden = true;
        }, 900);
      }
    }

    // First visit: textures stream in during the startup, in orbit order, and the
    // aperture is paced by the scene's reveal limit. Returning visitors load normally.
    const hasSeenStartup = StartupController.hasSeenStartup();

    const system = new SolarSystem({
      canvas,
      reducedMotion,
      prioritizeTextures: !hasSeenStartup,
      // Returning visitors: each body grows in as its own textures arrive.
      entrance: hasSeenStartup,
      // Low-effects tiers (phones, save-data, zoomed pages) crossfade the textures instead of dissolving them.
      revealSweep: !resolveTier(readTierEnv()).lowFx,
      onReady: markSceneReady,
      onFocusChange: render,
      onBodyTap: (id) => {
        presenter.beginNavigation(id);
        updateNav(id);
        const sectionId = bodyIdToSectionId(id);
        navigationSync.navigateTo(sectionId);
      },
      onTextureProgress
    });
    created = system;

    // First visit only: the aperture may open no further than the scene has textured.
    if (!hasSeenStartup && startupPhase !== "complete") {
      setRevealLimitProvider(() => system.revealLimitPx());
      document.addEventListener("startup:complete", () => setRevealLimitProvider(null), {
        once: true,
        signal
      });
    }

    unsubscribePopState = navigationSync.onPopState((target: NavigationTarget) => {
      if (target.bodyId === "overview") {
        presenter.beginNavigation(null);
        updateNav(null);
        system.overview();
      } else if (isBodyId(target.bodyId)) {
        presenter.beginNavigation(target.bodyId);
        updateNav(target.bodyId);
        system.focus(target.bodyId);
      }
      const targetEl = document.getElementById(target.sectionId);
      if (targetEl) targetEl.scrollTop = 0;
    });

    const btnToggleMode = document.getElementById("btn-toggle-mode");

    function applyMode(mode: InteractionMode): void {
      updateModeUI(mode);
      system.setControlsEnabled(mode === "orbit");
    }

    function updateModeUI(mode: InteractionMode): void {
      if (!btnToggleMode) return;
      btnToggleMode.setAttribute("data-mode", mode);
      if (mode === "reading") {
        btnToggleMode.setAttribute("data-tooltip", "Switch to 3D Orbit Mode");
        btnToggleMode.setAttribute("title", "Switch to 3D Orbit Mode");
        btnToggleMode.classList.remove("active");
      } else {
        btnToggleMode.setAttribute("data-tooltip", "Switch to Text Mode");
        btnToggleMode.setAttribute("title", "Switch to Text Mode");
        btnToggleMode.classList.add("active");
      }
    }

    modeController.subscribe(applyMode);

    if (btnToggleMode) {
      btnToggleMode.addEventListener(
        "click",
        () => {
          modeController.toggle();
        },
        { signal }
      );
    }

    applyMode(modeController.getMode());

    const btnPlayPause = document.getElementById("btn-play-pause");
    const iconPlayPause = document.getElementById("icon-play-pause");
    const btnToggleSlider = document.getElementById("btn-toggle-slider");
    const sliderContainer = document.getElementById("slider-container");
    const speedSlider = getInput("speed-slider");
    const speedInput = getInput("speed-input");
    // The play/pause icon's path is static markup; look it up once.
    const iconPathEl = iconPlayPause?.querySelector("path") ?? null;

    // The scene starts paused under reduced motion; the controls mirror it from the start.
    let isPaused = system.isPaused();
    let currentSpeed = 1;
    // True while the pause came from the OS reduced-motion setting rather than the
    // visitor, so switching the setting off may resume. Any speed control use clears it.
    let pausedForMotion = isPaused;
    const iconPathPlay = "M8 5v14l11-7z";
    const iconPathPause = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
    // Pending icon-swap timers; each fires independently (rapid toggles keep
    // their original behavior), tracked only so cleanup can cancel them.
    const iconTimers = new Set<ReturnType<typeof setTimeout>>();

    function updatePlayPauseIcon(animate = true): void {
      if (!btnPlayPause || !iconPlayPause) return;
      const pathEl = iconPathEl;
      if (!pathEl) return;
      btnPlayPause.classList.toggle("active", !isPaused);
      btnPlayPause.setAttribute("aria-label", isPaused ? "Play" : "Pause");
      btnPlayPause.setAttribute("title", isPaused ? "Play simulation" : "Pause simulation");
      if (animate) {
        iconPlayPause.style.transform = "scale(0)";
        const iconTimer = setTimeout(() => {
          iconTimers.delete(iconTimer);
          pathEl.setAttribute("d", isPaused ? iconPathPlay : iconPathPause);
          iconPlayPause.style.transform = "scale(1)";
        }, 120);
        iconTimers.add(iconTimer);
      } else {
        pathEl.setAttribute("d", isPaused ? iconPathPlay : iconPathPause);
        iconPlayPause.style.transform = "scale(1)";
      }
    }

    function updateSpeed(val: number, isFromSlider = false): void {
      if (typeof val !== "number" || Number.isNaN(val) || !Number.isFinite(val)) return;
      const clamped = Math.min(20, Math.max(0, val));
      currentSpeed = clamped;
      system.setSpeed(clamped);
      if (!isFromSlider && speedSlider) {
        speedSlider.value = clamped.toString();
      }
      if (speedInput) {
        speedInput.value = clamped.toFixed(1);
      }

      const newIsPaused = clamped === 0;
      if (newIsPaused !== isPaused) {
        isPaused = newIsPaused;
        updatePlayPauseIcon(!isFromSlider);
      }
    }

    /** Stop the orbit clock, keeping `currentSpeed` so play resumes at the chosen rate. */
    function pauseSimulation(animate: boolean): void {
      system.pause();
      isPaused = true;
      if (speedSlider) speedSlider.value = "0";
      if (speedInput) speedInput.value = "0.0";
      updatePlayPauseIcon(animate);
    }

    function resumeSimulation(): void {
      updateSpeed(currentSpeed === 0 ? 1 : currentSpeed);
    }

    // Sync the static markup (which shows "playing") with a scene that starts paused.
    if (isPaused) pauseSimulation(false);

    // Reduced motion switched on mid-visit pauses; switched off, it resumes only a
    // pause it caused itself, never one the visitor chose.
    motionQuery.addEventListener(
      "change",
      (e) => {
        if (e.matches) {
          if (isPaused) return;
          pausedForMotion = true;
          pauseSimulation(false);
        } else if (pausedForMotion) {
          pausedForMotion = false;
          if (isPaused) resumeSimulation();
        }
      },
      { signal }
    );

    if (btnPlayPause) {
      btnPlayPause.addEventListener(
        "click",
        () => {
          pausedForMotion = false;
          if (!isPaused) {
            pauseSimulation(true);
          } else {
            resumeSimulation();
          }
        },
        { signal }
      );
    }

    let sliderTimeout: ReturnType<typeof setTimeout> | undefined;
    function resetSliderTimeout(): void {
      clearTimeout(sliderTimeout);
      if (sliderContainer && !sliderContainer.classList.contains("collapsed")) {
        sliderTimeout = setTimeout(() => {
          if (document.activeElement !== speedInput) {
            sliderContainer.classList.add("collapsed");
            btnToggleSlider?.classList.remove("active");
            btnToggleSlider?.setAttribute("aria-expanded", "false");
          }
        }, SLIDER_AUTO_COLLAPSE_MS);
      }
    }

    speedSlider?.addEventListener(
      "input",
      () => {
        const val = parseFloat(speedSlider.value);
        pausedForMotion = false;
        updateSpeed(val, true);
        resetSliderTimeout();
      },
      { signal }
    );

    speedInput?.addEventListener(
      "change",
      () => {
        const raw = parseFloat(speedInput.value);
        if (!isNaN(raw)) {
          pausedForMotion = false;
          updateSpeed(raw);
        }
        resetSliderTimeout();
      },
      { signal }
    );

    speedInput?.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") speedInput.blur();
        resetSliderTimeout();
      },
      { signal }
    );

    speedInput?.addEventListener("blur", resetSliderTimeout, { signal });

    if (btnToggleSlider && sliderContainer) {
      btnToggleSlider.setAttribute("aria-controls", "slider-container");
      btnToggleSlider.setAttribute(
        "aria-expanded",
        String(!sliderContainer.classList.contains("collapsed"))
      );
      btnToggleSlider.addEventListener(
        "click",
        () => {
          const isCollapsed = sliderContainer.classList.toggle("collapsed");
          btnToggleSlider.classList.toggle("active", !isCollapsed);
          btnToggleSlider.setAttribute("aria-expanded", String(!isCollapsed));
          resetSliderTimeout();
        },
        { signal }
      );
    }

    navLinks.forEach((link) => {
      link.addEventListener(
        "click",
        (e) => {
          const id = link.dataset.navLink;
          if (!id || !isBodyId(id)) return;
          e.preventDefault();
          const sectionId = bodyIdToSectionId(id);
          navigationSync.navigateTo(sectionId);
          presenter.beginNavigation(id);
          updateNav(id);
          system.focus(id);
          const targetEl = document.getElementById(sectionId);
          if (targetEl) targetEl.scrollTop = 0;
        },
        { signal }
      );
    });

    // The brand zooms back out to the overview (the landing / brief intro).
    document.querySelectorAll<HTMLElement>("[data-nav-overview]").forEach((el) => {
      el.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          navigationSync.navigateTo("hero");
          presenter.beginNavigation(null);
          updateNav(null);
          system.overview();
          const targetEl = document.getElementById("hero");
          if (targetEl) targetEl.scrollTop = 0;
        },
        { signal }
      );
    });

    // Render initial target based on URL hash or default to overview.
    const initialTarget = navigationSync.getInitialTarget();
    if (hasSeenStartup) {
      if (initialTarget.bodyId === "overview") {
        updateNav(null);
        render({ kind: "overview" });
      } else if (isBodyId(initialTarget.bodyId)) {
        updateNav(initialTarget.bodyId);
        system.focus(initialTarget.bodyId);
        render({ kind: "focused", id: initialTarget.bodyId });
      }
    } else {
      // First visit: keep camera centered on the Sun/Overview during the startup reveal
      updateNav(null);

      // Draw one frame (compiling shaders), then stay idle behind the startup
      // screen until its aperture starts revealing the scene. If the aperture already
      // opened before the scene was built, there is nothing to hold.
      if (startupPhase === "pending") {
        system.holdRendering(true);
        const releaseRendering = (): void => system.holdRendering(false);
        document.addEventListener("startup:opening", releaseRendering, { once: true, signal });
        document.addEventListener("startup:complete", releaseRendering, { once: true, signal });
      }

      const applyInitialTarget = (): void => {
        if (initialTarget.bodyId === "overview") {
          updateNav(null);
          render({ kind: "overview" });
        } else if (isBodyId(initialTarget.bodyId)) {
          updateNav(initialTarget.bodyId);
          system.focus(initialTarget.bodyId);
          const targetEl = document.getElementById(initialTarget.sectionId);
          if (targetEl) targetEl.scrollTop = 0;
        }
      };

      if (startupPhase === "complete") {
        // Startup already finished while the scene was loading: apply the target now.
        applyInitialTarget();
      } else {
        document.addEventListener("startup:complete", applyInitialTarget, { once: true, signal });
      }
    }

    return () => {
      // Removes every listener above, including a pending startup:complete.
      listeners.abort();
      unsubscribePopState?.();
      clearTimeout(hideTimer);
      clearTimeout(sliderTimeout);
      iconTimers.forEach((t) => clearTimeout(t));
      iconTimers.clear();
      setActiveSection(undefined);
      setRevealLimitProvider(null);
      system.dispose();
    };
  } catch (err) {
    // WebGL unavailable or scene failed to build — restore the stacked fallback.
    console.error(err);
    // A stale provider would hold the startup aperture closed with no scene behind it.
    setRevealLimitProvider(null);
    markSceneReady();
    unsubscribePopState?.();
    created?.dispose();
    document.documentElement.classList.remove("js");
    // Drop any listeners that were registered before the failure.
    return () => {
      listeners.abort();
    };
  }
}
