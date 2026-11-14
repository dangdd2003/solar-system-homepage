import { animate, createTimeline, type JSAnimation, type Timeline } from "animejs";

type Motion = "surface" | "progress" | "spinner";

/** Presentation only: the scene owns progress, visibility and the final removal timer. */
export function initTextureLoading(pill = document.getElementById("texture-loading")): () => void {
  if (!(pill instanceof HTMLElement)) return () => {};
  const surface = pill.querySelector<HTMLElement>(".texture-loading__surface");
  const text = pill.querySelector<HTMLElement>("#texture-loading-text");
  const spinner = pill.querySelector<HTMLElement>(".spinner");
  const progress = pill.querySelector<HTMLElement>(".texture-loading__progress");
  const check = pill.querySelector<SVGElement>(".texture-loading__check");
  const checkPath = check?.querySelector("path");
  if (!surface || !text || !spinner || !progress || !check || !checkPath) return () => {};

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Map<Motion, JSAnimation | Timeline>();
  let phase: "hidden" | "pending" | "loading" | "done" = "hidden";
  let entranceTimer: ReturnType<typeof setTimeout> | undefined;
  let fraction = 0;
  let lastFraction = -1;
  let disposed = false;

  function stop(key: Motion): void {
    animations.get(key)?.cancel();
    animations.delete(key);
  }

  function stopAll(): void {
    clearTimeout(entranceTimer);
    entranceTimer = undefined;
    for (const key of animations.keys()) stop(key);
  }

  function loop(): void {
    if (motion.matches || document.hidden || phase !== "loading") return;
    if (!animations.has("spinner")) {
      animations.set(
        "spinner",
        animate(spinner!, { rotate: [0, 360], duration: 1200, ease: "linear", loop: true })
      );
    }
  }

  function settle(): void {
    surface!.style.opacity = "1";
    surface!.style.transform = "none";
    text!.style.opacity = "1";
    text!.style.transform = "none";
    spinner!.style.opacity = phase === "done" ? "0" : "1";
    check!.style.opacity = phase === "done" ? "1" : "0";
    checkPath!.style.strokeDashoffset = phase === "done" ? "0" : "1";
    progress!.style.transform = `scaleX(${fraction})`;
  }

  function enter(): void {
    stopAll();
    phase = "loading";
    settle();
    if (!motion.matches) {
      animations.set(
        "surface",
        animate(surface!, {
          opacity: [0, 1],
          translateY: [-4, 0],
          duration: 380,
          ease: "cubicBezier(0.25, 1, 0.5, 1)"
        })
      );
    }
    loop();
  }

  function complete(): void {
    stopAll();
    phase = "done";
    fraction = 1;
    // Continue from the current entrance frame instead of snapping to full opacity.
    if (motion.matches) progress!.style.transform = "scaleX(1)";
    else
      animations.set(
        "progress",
        animate(progress!, { scaleX: 1, duration: 240, ease: "outQuart" })
      );
    // Fits inside the existing 900ms completion window; never delays texture loading or dismissal.
    const timeline = createTimeline();
    animations.set("surface", timeline);
    if (motion.matches) {
      timeline.add(surface!, { opacity: 0, duration: 180, ease: "outSine" }, 360);
      return;
    }
    timeline
      .add(spinner!, { opacity: [1, 0], duration: 140, ease: "outSine" }, 0)
      .add(check!, { opacity: [0, 1], duration: 140, ease: "outSine" }, 60)
      .add(checkPath!, { strokeDashoffset: [1, 0], duration: 300, ease: "outQuart" }, 80)
      .add(
        surface!,
        {
          opacity: 0,
          translateY: -3,
          duration: 240,
          ease: "inOutCubic"
        },
        360
      );
  }

  function sync(): void {
    if (disposed) return;
    const root = document.documentElement;
    const ready =
      !root.classList.contains("js") ||
      root.classList.contains("startup-seen") ||
      root.classList.contains("startup-ready");
    if (pill!.hidden || !ready || document.hidden) {
      stopAll();
      phase = "hidden";
      surface!.style.opacity = "0";
      lastFraction = -1;
      return;
    }
    const nextFraction = Number(pill!.dataset.progress ?? 0);
    fraction = Number.isFinite(nextFraction) ? Math.max(0, Math.min(1, nextFraction)) : 0;
    if (pill!.classList.contains("is-done")) {
      if (phase === "loading") complete();
      else if (phase !== "done") {
        stopAll();
        phase = "done";
        surface!.style.opacity = "0";
      }
      return;
    }
    if (phase === "hidden") {
      phase = "pending";
      surface!.style.opacity = "0";
      // Cached reloads finish silently. Only a load lasting beyond this gate earns a tag.
      entranceTimer = setTimeout(() => {
        entranceTimer = undefined;
        if (disposed || phase !== "pending") return;
        enter();
        sync();
      }, 180);
      return;
    }
    if (phase === "pending") return;
    if (fraction !== lastFraction) {
      stop("progress");
      if (motion.matches) progress!.style.transform = `scaleX(${fraction})`;
      else
        animations.set(
          "progress",
          animate(progress!, { scaleX: fraction, duration: 420, ease: "outQuart" })
        );
    }
    lastFraction = fraction;
    loop();
  }

  const observer = new MutationObserver(sync);
  observer.observe(pill, {
    attributes: true,
    attributeFilter: ["hidden", "class", "data-progress"]
  });
  const startupObserver = new MutationObserver(sync);
  startupObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });

  const onMotion = (): void => {
    stopAll();
    if (phase === "pending") phase = "hidden";
    if (phase === "loading") settle();
    if (phase === "done" && surface!.style.opacity !== "0") complete();
    else sync();
  };
  motion.addEventListener("change", onMotion);
  document.addEventListener("visibilitychange", sync);

  const cleanup = (): void => {
    disposed = true;
    stopAll();
    observer.disconnect();
    startupObserver.disconnect();
    motion.removeEventListener("change", onMotion);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pagehide", onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) cleanup();
  };
  window.addEventListener("pagehide", onPageHide);
  sync();
  return cleanup;
}
