/**
 * Glass surfaces for the card, chip and button pools.
 *
 * A host that paints a backdrop-filter re-blurs whatever sits behind it on every
 * frame. Animating `filter` on such a host repaints that blur for the whole tween,
 * so the pools skip their filter tweens on glass and keep the transform and opacity
 * motion, which the compositor runs without repainting.
 */

/** Whether the host paints a backdrop-filter (its glass surface). */
export function isGlass(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  const value = style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
  return value !== "" && value !== "none";
}
