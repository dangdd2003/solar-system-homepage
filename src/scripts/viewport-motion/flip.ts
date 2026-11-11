/**
 * Translate-only, jump-only FLIP runner for resize-flip items. An item is a box-like element that
 * is either an explicit `[data-resize-flip]` element or a visible child of a `[data-resize-flip-group]`.
 * Text, images and nav are never items, even when marked.
 *
 * Layout is measured from offsets (immune to hover, reveal and flip transforms) and remembered per
 * item, frame to frame. An item animates only when its layout position jumps between consecutive
 * measured frames by more than its jump threshold (a reflow: wrap, column change, orientation flip).
 * Continuous drift is never animated and never cancels a running glide: the glide's end state is the
 * live layout, so the drift is already followed.
 *
 * On a jump, the item's own running glide (if any) is read, cancelled and replaced once:
 *   glide    = rect before cancel - rect after cancel     the glide currently applied
 *   raw      = glide + (previous layout - current layout) the visual start that keeps the item in place
 * Nested items subtract their nearest flipping ancestor's raw offset (see nestedOffsets). Every glide
 * of a frame shares one duration, so the composition stays exact.
 *
 * Per frame: one read phase (layouts; rects only for items that jumped and are running a glide),
 * one write phase (cancel those glides), one read phase (rects after cancel), one write phase (start).
 */
import {
  FLIP_ATTRIBUTE,
  FLIP_DURATION_MS,
  FLIP_EASING,
  GROUP_ATTRIBUTE,
  MAX_FLIP_ELEMENTS,
  ROTATION_FLIP_DURATION_MS,
  isJump,
  isMoved,
  isOffscreen,
  nestedOffsets,
  flipKeyframes,
  type Box,
  type Offset
} from "./geometry";

export const FLIP_ANIMATION_ID = "viewport-flip";
const FLIP_SELECTOR = `[${FLIP_ATTRIBUTE}]`;
const GROUP_SELECTOR = `[${GROUP_ATTRIBUTE}]`;
/** Items live in an open planet panel or are flip roots (fixed glass controls). The nav is never in scope. */
const SCOPE_ROOTS = "[data-planet-panel].is-visible, [data-resize-flip-root]";
const NAV_SELECTOR = "nav, .nav";
const SURFACE_CLASS = "surface-card";
/** Text and media elements are never boxes, even when marked. */
const NON_BOX_TAGS = new Set([
  "IMG",
  "PICTURE",
  "VIDEO",
  "CANVAS",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "P",
  "SPAN",
  "LABEL"
]);

export interface FlipRunner {
  /** Records the idle layout of in-scope items. Items with a foreign animation keep their previous record. */
  snapshot(): void;
  /**
   * Runs one FLIP pass: animates items whose layout jumped since the last measured frame.
   * `rotated` marks an orientation burst and lengthens the glide (260ms instead of 200ms).
   */
  animate(rotated?: boolean): void;
  /** Cancels every flip animation this runner started. */
  cancelAll(): void;
}

/** Running animations on `el` that belong to this engine. */
function animationsOf(el: HTMLElement): Animation[] {
  return typeof el.getAnimations === "function" ? el.getAnimations() : [];
}

function flipAnimationsOf(el: HTMLElement): Animation[] {
  return animationsOf(el).filter((a) => a.id === FLIP_ANIMATION_ID);
}

/** CSS transitions (hover lifts and similar) move the rect but not the layout, so they never block. */
function hasForeignAnimation(el: HTMLElement): boolean {
  return animationsOf(el).some((a) => a.id !== FLIP_ANIMATION_ID && !("transitionProperty" in a));
}

function isInScope(el: HTMLElement): boolean {
  return el.closest(SCOPE_ROOTS) !== null && el.closest(NAV_SELECTOR) === null;
}

/** Only box-like elements are flip items: text, media and bare links never are. */
export function isBoxLike(el: HTMLElement): boolean {
  if (NON_BOX_TAGS.has(el.tagName)) return false;
  if (el.tagName === "A") return el.classList.contains(SURFACE_CLASS);
  return true;
}

/** Visible, in-flow element child of a group. Hidden, aria-hidden and out-of-flow children are decoration or absent. */
function isGroupChild(win: Window, el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  const style = win.getComputedStyle(el);
  return style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
}

/** Every in-scope, box-like flip item in document order. */
function collectItems(win: Window, doc: Document): HTMLElement[] {
  // One selector list returns each candidate once, already in document order, so no dedupe or sort is needed.
  // Each group's scope is tested once, not once per child.
  const groupInScope = new Map<HTMLElement, boolean>();
  const scopeOf = (group: HTMLElement): boolean => {
    let inScope = groupInScope.get(group);
    if (inScope === undefined) {
      inScope = isInScope(group);
      groupInScope.set(group, inScope);
    }
    return inScope;
  };
  const items: HTMLElement[] = [];
  for (const el of Array.from(
    doc.querySelectorAll<HTMLElement>(`${GROUP_SELECTOR} > *, ${FLIP_SELECTOR}`)
  )) {
    if (!isBoxLike(el)) continue;
    const parent = el.parentElement;
    const fromGroup =
      parent !== null && parent.matches(GROUP_SELECTOR) && scopeOf(parent) && isGroupChild(win, el);
    const flip = el.matches(FLIP_SELECTOR) && isInScope(el);
    if (fromGroup || flip) items.push(el);
  }
  return items;
}

/** Hidden (`display: none`) elements report an all-zero box; they have no layout to FLIP from or to. */
function isEmpty(box: Box): boolean {
  return box.width === 0 && box.height === 0;
}

function rectOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Layout position from offsets: ignores transforms, scroll and running animations, so it only
 * changes when layout does. Elements without an offsetParent (fixed, or no layout) fall back to
 * their rect.
 */
function layoutOf(el: HTMLElement): Box {
  if (el.offsetParent === null) return rectOf(el);
  let left = 0;
  let top = 0;
  let node: HTMLElement = el;
  let parent = node.offsetParent as HTMLElement | null;
  while (parent) {
    left += node.offsetLeft + parent.clientLeft;
    top += node.offsetTop + parent.clientTop;
    node = parent;
    parent = node.offsetParent as HTMLElement | null;
  }
  left += node.offsetLeft;
  top += node.offsetTop;
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

interface Jump {
  el: HTMLElement;
  own: Animation[];
  rectBefore: Box | null;
  prev: Box;
  layout: Box;
  raw: Offset;
}

/** Nearest in-frame jumped ancestor index for each jump, or -1. */
function parentIndices(jumps: Jump[]): number[] {
  const indexOf = new Map<HTMLElement, number>();
  jumps.forEach((item, index) => indexOf.set(item.el, index));
  return jumps.map((item) => {
    let node = item.el.parentElement;
    while (node) {
      const index = indexOf.get(node);
      if (index !== undefined) return index;
      node = node.parentElement;
    }
    return -1;
  });
}

/** Creates the FLIP runner for one document. */
export function createFlipRunner(win: Window, doc: Document): FlipRunner {
  const layouts = new WeakMap<HTMLElement, Box>();
  /** Every glide this runner started and has not yet finished or cancelled. */
  const active = new Set<Animation>();

  return {
    snapshot(): void {
      for (const el of collectItems(win, doc)) {
        if (hasForeignAnimation(el)) continue;
        const layout = layoutOf(el);
        if (isEmpty(layout)) {
          layouts.delete(el);
          continue;
        }
        layouts.set(el, layout);
      }
    },

    animate(rotated = false): void {
      const vw = win.innerWidth;
      const vh = win.innerHeight;
      const duration = rotated ? ROTATION_FLIP_DURATION_MS : FLIP_DURATION_MS;
      const jumps: Jump[] = [];
      const measured: Array<[HTMLElement, Box]> = [];

      // Read phase: layouts only. Rects are read just for items that jumped and may have a glide.
      for (const el of collectItems(win, doc)) {
        if (measured.length >= MAX_FLIP_ELEMENTS) break;
        const layout = layoutOf(el);
        const prev = layouts.get(el);
        measured.push([el, layout]);
        if (isEmpty(layout)) {
          layouts.delete(el);
          continue;
        }
        if (!prev || !isJump(prev, layout) || hasForeignAnimation(el)) continue;
        if (isOffscreen(layout, vw, vh)) continue;
        const own = flipAnimationsOf(el);
        jumps.push({
          el,
          own,
          rectBefore: own.length > 0 ? rectOf(el) : null,
          prev,
          layout,
          raw: { dx: 0, dy: 0 }
        });
      }

      // Write phase: retarget only the jumped items, cancelling just their own glides.
      for (const jump of jumps) {
        for (const anim of jump.own) anim.cancel();
      }

      // Read phase (only for items that had a glide): the glide each one was showing.
      for (const jump of jumps) {
        const glide = { dx: 0, dy: 0 };
        if (jump.rectBefore) {
          const after = rectOf(jump.el);
          glide.dx = jump.rectBefore.left - after.left;
          glide.dy = jump.rectBefore.top - after.top;
        }
        jump.raw = {
          dx: glide.dx + (jump.prev.left - jump.layout.left),
          dy: glide.dy + (jump.prev.top - jump.layout.top)
        };
      }

      // Math: nested compensation among this frame's jumps.
      const parents = parentIndices(jumps);
      const offsets = nestedOffsets(
        jumps.map((jump, i) => ({ raw: jump.raw, parent: parents[i]! }))
      );

      // Write phase: start the new glides, then remember every layout measured this frame.
      jumps.forEach((jump, i) => {
        const offset = offsets[i]!;
        if (!isMoved(offset) || typeof jump.el.animate !== "function") return;
        const anim = jump.el.animate(flipKeyframes(offset), {
          duration,
          delay: 0,
          easing: FLIP_EASING,
          composite: "add"
        });
        anim.id = FLIP_ANIMATION_ID;
        active.add(anim);
        if (typeof anim.addEventListener === "function") {
          const forget = (): void => {
            active.delete(anim);
          };
          anim.addEventListener("finish", forget);
          anim.addEventListener("cancel", forget);
        }
      });

      for (const [el, layout] of measured) {
        if (!isEmpty(layout)) layouts.set(el, layout);
      }
    },

    cancelAll(): void {
      for (const anim of Array.from(active)) anim.cancel();
      active.clear();
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>(FLIP_SELECTOR))) {
        for (const anim of flipAnimationsOf(el)) anim.cancel();
      }
    }
  };
}
