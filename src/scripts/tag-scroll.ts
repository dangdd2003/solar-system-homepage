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

  root.addEventListener("wheel", onWheel, { passive: false });
  return () => root.removeEventListener("wheel", onWheel);
}
