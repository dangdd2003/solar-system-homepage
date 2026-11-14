/**
 * Glass surfaces for the card, chip and button pools.
 *
 * A host that paints a backdrop-filter re-blurs whatever sits behind it on every
 * frame. Animating `filter` on such a host repaints that blur for the whole tween,
 * so the pools skip their filter tweens on glass and keep the transform and opacity
 * motion, which the compositor runs without repainting.
 */

const primedGlass = new Map<HTMLElement, boolean>();

function computeIsGlass(el: HTMLElement, style: CSSStyleDeclaration): boolean {
  const value = style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
  return value !== "" && value !== "none";
}

/** Reads and remembers whether `el` paints a backdrop-filter for the current cascade. */
export function primeGlass(
  el: HTMLElement,
  style: CSSStyleDeclaration = getComputedStyle(el)
): void {
  primedGlass.set(el, computeIsGlass(el, style));
}

/** Drops primed glass flags once the cascade's writes are done. */
export function clearPrimedGlass(): void {
  primedGlass.clear();
}

/** Whether the host paints a backdrop-filter (its glass surface). */
export function isGlass(el: HTMLElement): boolean {
  const cached = primedGlass.get(el);
  if (cached !== undefined) return cached;
  return computeIsGlass(el, getComputedStyle(el));
}
