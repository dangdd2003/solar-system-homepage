/**
 * Ambient touches that run after the entrance.
 *
 * Card spotlight: a planet-tinted glow (reveal.css `[data-spotlight]::after`)
 * follows the pointer inside cards. One delegated `pointermove` listener per panel
 * writes `--mx` / `--my` on the hovered card, at most once per frame. Everything else
 * ambient is CSS.
 *
 * The pointer type is read per event rather than once at load: a mouse or pen attached
 * to a touch device works straight away, and touch input never spotlights or leaves a
 * stale glow behind. The listener is always attached because it is passive and cheap.
 */

/** Wires the spotlight for every panel in `root`; returns its cleanup. */
export function initAmbient(root: ParentNode = document): () => void {
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-planet-panel]"));
  let frame = 0;
  let pending: { card: HTMLElement; x: number; y: number } | null = null;

  const write = (): void => {
    frame = 0;
    if (!pending) return;
    const { card, x, y } = pending;
    pending = null;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${Math.round(x - rect.left)}px`);
    card.style.setProperty("--my", `${Math.round(y - rect.top)}px`);
  };

  const onMove = (e: PointerEvent): void => {
    const target = e.target instanceof Element ? e.target : null;
    const card = target?.closest<HTMLElement>("[data-spotlight]");
    if (!card) return;

    // Touch has no hover: drop any position so no glow sticks after a tap or drag.
    if (e.pointerType === "touch") {
      if (pending?.card === card) pending = null;
      card.style.removeProperty("--mx");
      card.style.removeProperty("--my");
      return;
    }

    pending = { card, x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(write);
  };

  // A tap fires no pointermove first, so place the touch press glow under the finger here;
  // otherwise it would light up wherever an earlier mouse hover left --mx / --my.
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    const target = e.target instanceof Element ? e.target : null;
    const card = target?.closest<HTMLElement>("[data-spotlight]");
    if (!card) return;
    if (pending?.card === card) pending = null;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${Math.round(e.clientX - rect.left)}px`);
    card.style.setProperty("--my", `${Math.round(e.clientY - rect.top)}px`);
  };

  panels.forEach((panel) => {
    panel.addEventListener("pointermove", onMove, { passive: true });
    panel.addEventListener("pointerdown", onDown, { passive: true });
  });

  return () => {
    panels.forEach((panel) => {
      panel.removeEventListener("pointermove", onMove);
      panel.removeEventListener("pointerdown", onDown);
    });
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
  };
}
