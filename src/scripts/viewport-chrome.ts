/**
 * Measures how much of the full-bleed stage sits behind the bottom browser
 * toolbar and publishes it as --chrome-bottom on <html>.
 *
 * The stage (canvas + panel shell) is sized to the large viewport so it paints
 * behind the status bar and Safari's floating toolbar. Fixed controls, by
 * contrast, are laid out in the fixed containing block, which ends above the
 * toolbar. The difference between the two is the strip a panel must keep clear
 * so its last line and footer land beside the controls, not under the toolbar.
 * CSS carries an lvh - svh estimate; this replaces it with the real value.
 */
export function initViewportChrome(): void {
  const root = document.documentElement;
  const stage = document.getElementById("main-content");
  if (!stage) return;

  // Zero width: Safari ignores narrow fixed elements when tinting its toolbars.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);

  let frame = 0;
  const measure = (): void => {
    frame = 0;
    const hidden = Math.max(0, Math.round(stage.clientHeight - probe.clientHeight));
    root.style.setProperty("--chrome-bottom", `${hidden}px`);
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  measure();
  window.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
}
