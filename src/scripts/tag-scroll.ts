/**
 * Lets the mouse wheel scroll a card's single-row tag strip horizontally.
 * Vertical wheel deltas are redirected to scrollLeft only while the strip can
 * still move in that direction, so the page scrolls normally at either end.
 */
export function initTagScroll(root: HTMLElement): () => void {
  const onWheel = (event: WheelEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const strip = target.closest(".card__tags");
    if (!(strip instanceof HTMLElement) || !root.contains(strip)) return;

    const maxScroll = strip.scrollWidth - strip.clientWidth;
    if (maxScroll <= 0) return;

    // Trackpads already send horizontal deltas; only remap vertical intent.
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const atStart = strip.scrollLeft <= 0;
    const atEnd = strip.scrollLeft >= maxScroll - 1;
    if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    strip.scrollLeft += delta * unit;
  };

  // Non-passive only on the strips this handler can scroll, so wheel events elsewhere in the section stay passive.
  // Cards are rendered once and only re-ordered or hidden later (project-filter.ts), so these listeners stay valid.
  const strips = Array.from(root.querySelectorAll<HTMLElement>(".card__tags"));
  for (const strip of strips) strip.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    for (const strip of strips) strip.removeEventListener("wheel", onWheel);
  };
}
