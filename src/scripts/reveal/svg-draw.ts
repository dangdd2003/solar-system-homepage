/**
 * SVG stroke drawing integration for gen2 reveal effects.
 *
 * Wraps SVG geometry elements with anime's `createDrawable` so they can be
 * animated with `draw: "0 0" -> "0 1"`. Cleans up inline stroke styles and
 * dash attributes on finish and reset so SVG icons and rules return to their
 * natural stylesheet rendering.
 */

import { createDrawable } from "animejs/svg";
import type { DrawableSVGGeometry } from "animejs";

const STROKE_SELECTOR = "path, line, polyline, circle, rect, polygon, [pathLength]";

/**
 * Finds SVG stroke geometry elements under `host` and proxies them with
 * `createDrawable` starting at `0 0` (undrawn). Returns an empty array when
 * no stroke elements exist. Never sets `data-reveal-stroke`.
 */
export function drawableStrokes(host: Element): DrawableSVGGeometry[] {
  const elements = Array.from(host.querySelectorAll<SVGElement>(STROKE_SELECTOR)).filter(
    (el) => el instanceof SVGElement
  );

  if (elements.length === 0) {
    if (typeof SVGGeometryElement !== "undefined" && host instanceof SVGGeometryElement) {
      return createDrawable(host, 0, 0);
    }
    return [];
  }

  return createDrawable(elements, 0, 0);
}

/**
 * Removes stroke dash attributes and inline stroke-linecap styles added by
 * createDrawable on or under `host`, leaving the element in its natural drawn state.
 */
export function clearDrawable(host: Element): void {
  const targets: Element[] = [];
  if (host instanceof SVGElement) targets.push(host);
  targets.push(
    ...Array.from(
      host.querySelectorAll(
        "path, line, polyline, circle, rect, polygon, [pathLength], [stroke-dasharray]"
      )
    )
  );

  for (const el of targets) {
    el.removeAttribute("stroke-dasharray");
    el.removeAttribute("stroke-dashoffset");
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      el.style.strokeLinecap = "";
      el.style.removeProperty("stroke-linecap");
    }
  }
}
