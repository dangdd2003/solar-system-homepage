/**
 * Publishes how much of the full-bleed stage (scene canvas + panel shell) sits
 * under the bottom browser toolbar.
 *
 * In iOS Safari tabs (iOS 26+) page content shows through the floating
 * toolbar, but a box sized to 100lvh stops short of the screen's bottom edge.
 * So on iOS Safari the stage bleeds below the viewport by --bleed-bottom, set
 * before first paint by the inline head script in BaseLayout.astro. The document
 * never scrolls (panels.css locks it), so the bleed only adds pixels under the
 * toolbar, and the camera frames the visible part only (CameraRig.setFrame), so
 * the bleed does not zoom the scene.
 *
 * --chrome-bottom is the part of the stage below the fixed containing block,
 * where the corner controls live. Panels pad by it so their last line and
 * footer stay above the toolbar.
 */

// Fixed elements at the screen edges make iOS Safari paint solid bars; keep the probe clear.
const PROBE_INSET_PX = 12;

let cachedBleed: number | undefined;

/** Stage bleed below the visible viewport, in CSS px (0 outside iOS Safari tabs). */
export function stageBleedPx(): number {
  if (cachedBleed === undefined) {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--bleed-bottom");
    cachedBleed = parseFloat(value) || 0;
  }
  return cachedBleed;
}

export function initViewportChrome(): void {
  const root = document.documentElement;
  const stage = document.getElementById("main-content");
  if (!stage) return;

  // Narrow and inset from both edges, so Safari never samples it for toolbar tinting.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = `position:fixed;top:${PROBE_INSET_PX}px;bottom:${PROBE_INSET_PX}px;left:0;width:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);

  const measure = (): void => {
    const fixedBottom = probe.getBoundingClientRect().bottom + PROBE_INSET_PX;
    const hidden = Math.max(0, Math.round(stage.getBoundingClientRect().bottom - fixedBottom));
    root.style.setProperty("--chrome-bottom", `${hidden}px`);
  };

  let frame = 0;
  const update = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };

  update();
  window.addEventListener("resize", update, { passive: true });
  window.visualViewport?.addEventListener("resize", update, { passive: true });
  window.addEventListener("pageshow", update);
}
