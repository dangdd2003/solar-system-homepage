/**
 * Pure geometry for the viewport motion engine: jump detection, translate-only FLIP offsets,
 * nested delta compensation, timing and easing. No DOM access, so it is unit-testable in isolation.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Offset {
  dx: number;
  dy: number;
}

/** Attribute that turns a container into a flip group: each box-like visible element child becomes a flip item. */
export const GROUP_ATTRIBUTE = "data-resize-flip-group";
/** Attribute that marks an element (or a flip root) as a flip item. Only box-like elements qualify. */
export const FLIP_ATTRIBUTE = "data-resize-flip";

/** Glide for a same-orientation reflow (wrap to a new row, column count change). */
export const FLIP_DURATION_MS = 200;
/** Glide for an orientation change, which moves items further. */
export const ROTATION_FLIP_DURATION_MS = 260;
/** Decelerating ease-out with no overshoot. */
export const FLIP_EASING = "cubic-bezier(0.2, 0, 0, 1)";
/** Offsets below this many px (on either axis) are not animated. */
export const MIN_FLIP_PX = 1;
/** Smallest distance (px) a layout move must exceed to count as a jump... */
export const JUMP_MIN_PX = 24;
/** ...or exceed this fraction of the item's smaller dimension, whichever is larger. */
export const JUMP_RATIO = 0.25;
export const URL_BAR_JITTER_PX = 120;
/** Per-frame cap on flip items measured and considered for a jump. */
export const MAX_FLIP_ELEMENTS = 120;

/** True when the viewport is landscape (width at least height). */
export function isLandscape(width: number, height: number): boolean {
  return width >= height;
}

/** Mobile URL-bar show/hide: width unchanged and only a small height change on a coarse pointer. */
export function isUrlBarJitter(
  prevWidth: number,
  prevHeight: number,
  width: number,
  height: number,
  coarsePointer: boolean
): boolean {
  return (
    coarsePointer &&
    Math.abs(width - prevWidth) < 1 &&
    Math.abs(height - prevHeight) < URL_BAR_JITTER_PX
  );
}

/** Rect is entirely beyond one viewport away from the visible area. */
export function isOffscreen(box: Box, viewportWidth: number, viewportHeight: number): boolean {
  return (
    box.left + box.width < -viewportWidth ||
    box.left > 2 * viewportWidth ||
    box.top + box.height < -viewportHeight ||
    box.top > 2 * viewportHeight
  );
}

/** Distance (px) a layout position must move in one frame to count as a jump for an item of this size. */
export function jumpThresholdPx(box: Box): number {
  return Math.max(JUMP_MIN_PX, JUMP_RATIO * Math.min(box.width, box.height));
}

/**
 * True when the layout position moved from `prev` to `next` by more than the item's jump threshold.
 * Continuous drift (a few px per frame as the window narrows) never clears it; a reflow does.
 */
export function isJump(prev: Box, next: Box): boolean {
  const dx = next.left - prev.left;
  const dy = next.top - prev.top;
  return Math.hypot(dx, dy) > jumpThresholdPx(next);
}

/**
 * Nested delta compensation. `nodes` are in document order (an ancestor always precedes its
 * descendants) and `parent` is the index of the nearest flipping ancestor in the same frame, or -1.
 *
 * Each node's `raw` offset is its full visual change including every flipping ancestor's motion,
 * so the animated part of a node is its raw offset minus its nearest flipping ancestor's raw offset.
 */
export function nestedOffsets(nodes: ReadonlyArray<{ raw: Offset; parent: number }>): Offset[] {
  return nodes.map((node) => {
    const base = node.parent >= 0 ? nodes[node.parent]!.raw : { dx: 0, dy: 0 };
    return { dx: node.raw.dx - base.dx, dy: node.raw.dy - base.dy };
  });
}

/** True when the offset is at least MIN_FLIP_PX on either axis. */
export function isMoved(offset: Offset): boolean {
  return Math.abs(offset.dx) >= MIN_FLIP_PX || Math.abs(offset.dy) >= MIN_FLIP_PX;
}

/** Translate-only keyframes from the offset back to identity; composite "add" keeps other transforms. */
export function flipKeyframes(offset: Offset): Keyframe[] {
  return [{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }, { transform: "none" }];
}
