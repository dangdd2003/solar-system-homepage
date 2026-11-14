/**
 * Cached text splitting for the reveal effects.
 *
 * Splits a reveal host's text (or its `[data-reveal-split]` child) into
 * `.rv-word` / `.rv-char` / `.rv-line` spans with anime's `splitText`, once, while
 * the host is still hidden by reveal.css. Word and character splits are kept across
 * panel resets. Line splits are restored after the reveal finishes so visible
 * text reflows naturally; replays measure and group the lines again.
 *
 * Lines mode groups synchronously-split words by their rect.top into `span.rv-line`
 * wrappers, because anime's native lines mode is promise-gated on fonts.ready.
 * If document.fonts is not loaded yet, lines mode falls back to returning words
 * with an empty lines array.
 *
 * Gradient text (`background-clip: text`) is re-sliced onto the animated pieces
 * on every call; see text-clip.ts.
 *
 * Text containing links or other focusable elements is never split, because
 * the accessible copy splitText adds would duplicate those tab stops; callers
 * get empty part lists and animate the host alone.
 */

import { splitText } from "animejs/text";
import type { TextSplitter } from "animejs";
import { paintTextClip } from "./text-clip";
import { sizeOf } from "./kit";

export type SplitMode = "chars" | "words" | "lines";

export interface SplitParts {
  readonly chars: HTMLElement[];
  readonly words: HTMLElement[];
  readonly lines: HTMLElement[];
}

/** Anything focusable or interactive inside the text makes it unsplittable. */
const FOCUSABLE = "a, button, input, select, textarea, [tabindex]";

const EMPTY: SplitParts = Object.freeze({ chars: [], words: [], lines: [] }) as SplitParts;

interface CacheEntry {
  readonly splitter: TextSplitter;
  readonly mode: SplitMode;
  readonly lines: HTMLElement[];
  readonly width: number;
}

/** One splitter per split target, with the mode it was split in. */
const cache = new Map<HTMLElement, CacheEntry>();
const splitters = new Set<TextSplitter>();

/** Restores one splitter's markup and forgets it. */
function revertSplitter(splitter: TextSplitter): void {
  try {
    splitter.revert();
  } catch {
    // A target removed from the DOM has nothing left to restore.
  }
  splitters.delete(splitter);
}

function partsOf(splitter: TextSplitter, lines: HTMLElement[] = []): SplitParts {
  return {
    chars: splitter.chars.filter((n): n is HTMLElement => n instanceof HTMLElement),
    words: splitter.words.filter((n): n is HTMLElement => n instanceof HTMLElement),
    lines
  };
}

/** Groups word spans by vertical line position into span.rv-line wrappers. */
function groupWordsIntoLines(words: HTMLElement[]): HTMLElement[] {
  if (words.length === 0) return [];

  const lineGroups: HTMLElement[][] = [];
  let currentGroup: HTMLElement[] = [];
  let currentTop = -Infinity;
  let lineTolerance = 10;

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const r = w.getBoundingClientRect();
    const top = r.top;
    const height = r.height || 20;
    const tol = height / 2;

    if (currentGroup.length === 0) {
      currentGroup.push(w);
      currentTop = top;
      lineTolerance = tol;
    } else if (Math.abs(top - currentTop) <= lineTolerance) {
      currentGroup.push(w);
    } else {
      lineGroups.push(currentGroup);
      currentGroup = [w];
      currentTop = top;
      lineTolerance = tol;
    }
  }
  if (currentGroup.length > 0) {
    lineGroups.push(currentGroup);
  }

  const lineSpans: HTMLElement[] = [];
  for (const grp of lineGroups) {
    const startNode = grp[0]!;
    const endNode = grp[grp.length - 1]!;
    const parent = startNode.parentNode;
    if (!parent) continue;
    const lineSpan = document.createElement("span");
    lineSpan.className = "rv-line";
    parent.insertBefore(lineSpan, startNode);

    let cur: Node | null = startNode;
    while (cur) {
      const next: Node | null = cur.nextSibling;
      lineSpan.appendChild(cur);
      if (cur === endNode) break;
      cur = next;
    }
    lineSpans.push(lineSpan);
  }

  return lineSpans;
}

/** Splits `target` in `mode` and records the splitter for later reuse and revert. */
function splitInto(target: HTMLElement, mode: SplitMode): SplitParts {
  const splitter = splitText(
    target,
    mode === "chars"
      ? { words: { class: "rv-word" }, chars: { class: "rv-char" }, accessible: true }
      : { words: { class: "rv-word" }, accessible: true }
  );

  // Keep animated pieces stable; completed line splits are restored by the engine.
  try {
    splitter.resizeObserver?.disconnect();
    if (splitter.resizeTimeout) {
      clearTimeout(splitter.resizeTimeout);
    }
  } catch {
    // Ignore environments lacking ResizeObserver
  }

  const width = target.offsetWidth || splitter.width || 0;
  let lines: HTMLElement[] = [];

  if (mode === "lines") {
    // Fonts guard: if fonts API exists and fonts are not yet loaded, return lines []
    const fontsReady =
      typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded";
    if (fontsReady) {
      lines = groupWordsIntoLines(partsOf(splitter).words);
    }
  }

  cache.set(target, { splitter, mode, lines, width });
  splitters.add(splitter);
  return partsOf(splitter, lines);
}

/**
 * Returns the split pieces of `host`, splitting on first use. Returns empty
 * lists for hosts or text marked `data-reveal-nosplit`, for text that holds
 * focusable elements, and when splitting fails.
 */
export function getSplit(host: HTMLElement, mode: SplitMode): SplitParts {
  if (host.hasAttribute("data-reveal-nosplit")) return EMPTY;

  const target = host.querySelector<HTMLElement>("[data-reveal-split]") ?? host;
  if (target.hasAttribute("data-reveal-nosplit") || target.querySelector("[data-reveal-nosplit]")) {
    return EMPTY;
  }

  const cached = cache.get(target);
  if (cached) {
    const currentWidth = cached.width > 0 ? sizeOf(target).w : 0;
    const widthChanged = cached.width > 0 && currentWidth > 0 && currentWidth !== cached.width;
    if (!widthChanged) {
      if (
        cached.mode === mode ||
        (mode === "words" && (cached.mode === "chars" || cached.mode === "lines"))
      ) {
        return painted(target, partsOf(cached.splitter, cached.lines), mode);
      }
    }
    revertSplitter(cached.splitter);
    cache.delete(target);
  }

  if (target.querySelector(FOCUSABLE)) return EMPTY;

  try {
    return painted(target, splitInto(target, mode), mode);
  } catch {
    return EMPTY;
  }
}

/** The pieces an effect animates in `mode`: chars, words, or lines (words when no lines). */
function animatedPieces(parts: SplitParts, mode: SplitMode): HTMLElement[] {
  if (mode === "chars") return parts.chars.length > 0 ? parts.chars : parts.words;
  if (mode === "lines" && parts.lines.length > 0) return parts.lines;
  return parts.words;
}

/** Re-slices gradient text for this play (layout may have moved since the split). */
function painted(target: HTMLElement, parts: SplitParts, mode: SplitMode): SplitParts {
  try {
    paintTextClip(target, animatedPieces(parts, mode));
  } catch {
    // Painting is cosmetic; the split stays usable without it.
  }
  return parts;
}

/** Restores completed line reveals so their old line boundaries cannot constrain reflow. */
export function releaseLineSplit(host: HTMLElement): void {
  const target = host.querySelector<HTMLElement>("[data-reveal-split]") ?? host;
  const entry = cache.get(target);
  if (entry?.mode !== "lines") return;
  revertSplitter(entry.splitter);
  cache.delete(target);
}

/** Restores every split target's original markup. */
export function revertAllSplits(): void {
  for (const splitter of splitters) revertSplitter(splitter);
  splitters.clear();
  cache.clear();
}
