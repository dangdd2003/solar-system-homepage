import { StartupController } from "./startup-controller";
import { INTRO_STARTED_CLASS, INTRO_STARTED_EVENT } from "./startup/intro-signal";
import { markSceneReady, setRevealLimitProvider } from "./startup/reveal-gate";
import { onPageReady } from "./page-ready";
import type { StartupPhase } from "./solar-system-boot";

/**
 * Lightweight entry for the solar system. The page loads only this module; the scene
 * (three.js, shaders, UI wiring) lives in ./solar-system-boot and is fetched with a
 * dynamic import, so its download starts at once but its construction waits until the
 * startup intro is painting. Returning visitors boot straight away.
 */

/** Safety net: the scene boots even if the intro never announces itself. */
const BOOT_FALLBACK_MS = 600;

/**
 * The scene could not load or build. The startup must never wait on it, and the stacked
 * fallback layout is restored, as for a WebGL failure.
 */
function failScene(err: unknown): void {
  console.error(err);
  setRevealLimitProvider(null);
  markSceneReady();
  document.documentElement.classList.remove("js");
}

function init(): void {
  const canvas = document.getElementById("solar-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    // No scene will ever render, so the startup must not wait for one.
    markSceneReady();
    return;
  }

  // Start the download now. The chunk's top level only defines classes; nothing is built
  // until boot() calls its initializer.
  const scene = import("./solar-system-boot").then(
    (mod) => mod.initSolarSystemUI,
    (err: unknown) => {
      failScene(err);
      return undefined;
    }
  );

  // Completion can precede this initializer when reduced motion skips the intro.
  // The document signal survives even when session storage is unavailable.
  let phase: StartupPhase = document.documentElement.classList.contains("startup-ready")
    ? "complete"
    : "pending";
  let booted = false;

  const boot = (): void => {
    if (booted) return;
    booted = true;
    document.removeEventListener(INTRO_STARTED_EVENT, boot);
    void scene.then((initSolarSystemUI) => {
      if (!initSolarSystemUI) return;
      try {
        initSolarSystemUI(phase);
      } catch (err) {
        failScene(err);
      }
    });
  };

  if (phase === "complete" || StartupController.hasSeenStartup()) {
    // Returning visitor: no intro to wait for, so the scene builds as soon as it loads.
    boot();
    return;
  }

  // Until the scene exists the aperture may not open past any body: a limit of 0 holds it
  // at the centre. The scene replaces this provider once it is built.
  setRevealLimitProvider(() => 0);
  document.addEventListener(
    "startup:opening",
    () => {
      if (phase === "pending") phase = "opening";
    },
    { once: true }
  );
  document.addEventListener(
    "startup:complete",
    () => {
      phase = "complete";
      setRevealLimitProvider(null);
    },
    { once: true }
  );

  if (document.documentElement.classList.contains(INTRO_STARTED_CLASS)) {
    boot();
    return;
  }
  document.addEventListener(INTRO_STARTED_EVENT, boot, { once: true });
  setTimeout(boot, BOOT_FALLBACK_MS);
}

onPageReady(init);
