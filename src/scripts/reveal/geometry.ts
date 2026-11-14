/**
 * DOM-only host geometry inspection for reveal planning.
 *
 * Measures properties of reveal host elements strictly via DOM tree and attribute
 * reads without triggering layout (no getBoundingClientRect, offsetWidth, or
 * offsetHeight). Used by choreography admit and scoring phases.
 */

import type { RevealType } from "./pools";

export interface HostGeometry {
  readonly textLength: number;
  readonly words: number;
  readonly items: number;
  readonly focusable: boolean;
  readonly splittable: boolean;
  readonly hasStroke: boolean;
  readonly numeric: boolean;
  readonly hasNum: boolean;
  readonly isLink: boolean;
  readonly parts: ReadonlySet<string>;
}

const FOCUSABLE_SELECTOR = "a, button, input, select, textarea, [tabindex]";
const STROKE_SELECTOR = "path, line, polyline, circle, rect, polygon, [pathLength]";
const NUMERIC_REGEX = /^\d{1,2}\.\s*$/;

/**
 * Measures structural DOM properties of `el` for reveal admission gates.
 * Never accesses layout properties or forces reflow.
 */
export function measureHost(el: HTMLElement, type: RevealType): HostGeometry {
  const text = el.textContent?.trim() ?? "";
  const textLength = text.length;
  const wordTokens = text ? text.split(/\s+/).filter(Boolean) : [];
  const words = wordTokens.length;

  const isLink = el.tagName === "A" || el.querySelector("a") !== null;
  const focusable =
    isLink || el.matches(FOCUSABLE_SELECTOR) || el.querySelector(FOCUSABLE_SELECTOR) !== null;

  const hasNosplit =
    el.hasAttribute("data-reveal-nosplit") || el.querySelector("[data-reveal-nosplit]") !== null;

  const splittable =
    !focusable && !hasNosplit && type !== "eyebrow" && textLength > 0 && textLength <= 500;

  const hasStroke =
    (typeof SVGElement !== "undefined" && el instanceof SVGElement) ||
    el.querySelector(STROKE_SELECTOR) !== null;

  const numEl = el.querySelector<HTMLElement>("[data-reveal-part='num'], .section__num");
  const hasNum = numEl !== null;
  const numText = numEl ? (numEl.textContent?.trim() ?? "") : text;
  const numeric = NUMERIC_REGEX.test(numText);

  const subItems = el.querySelectorAll("li, [data-reveal-item], .tag-chip, .card, dt");
  const items = subItems.length > 0 ? subItems.length : el.children.length;

  const partsSet = new Set<string>();
  const partNodes = el.querySelectorAll<HTMLElement>("[data-reveal-part]");
  for (let i = 0; i < partNodes.length; i++) {
    const p = partNodes[i]!.dataset.revealPart;
    if (p) partsSet.add(p);
  }
  if (el.dataset.revealPart) {
    partsSet.add(el.dataset.revealPart);
  }

  return {
    textLength,
    words,
    items,
    focusable,
    splittable,
    hasStroke,
    numeric,
    hasNum,
    isLink,
    parts: partsSet
  };
}
