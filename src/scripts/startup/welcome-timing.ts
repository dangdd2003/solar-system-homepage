/**
 * Text-length timing for the welcome intro. Pure functions, no DOM access, so the
 * hold before the solar aperture scales with what is on screen and stays testable.
 *
 * Split lines (the eyebrow and subtitle) rise character by character. Long lines get a
 * capped per-character step, so their spread stays bounded. Whole-unit lines (the title,
 * a single clip-path wipe) advance the cursor by their fixed span instead of a letter count.
 * Lines overlap slightly so the copy reads as one phrase. There is no reading dwell: the
 * startup opens as soon as the scene is ready and the last glyph has landed.
 */

/** Duration of one character's rise. */
export const CHAR_DUR_MS = 420;
/** Preferred delay between neighbouring characters on a line. */
export const CHAR_STEP_MS = 14;
/** A split line never spreads its characters over more than this. */
export const MAX_SPREAD_MS = 512;
/** Span of a whole-unit line (the title's wipe). Matches the title's motion duration. */
export const WHOLE_LINE_SPAN_MS = 520;
/** Index of the whole-unit line within the welcome copy (eyebrow, title, subtitle). */
export const WHOLE_LINE_INDEX = 1;
/** Gap between one line's start and the next line starting. */
export const LINE_GAP_MS = 24;
export interface WelcomeTiming {
  /** Start time in ms of each line, relative to the intro's zero. */
  readonly lineStarts: readonly number[];
  /** Time at which the last glyph has landed. */
  readonly landMs: number;
}

/** Non-space character count for a line. */
export function countLetters(line: string): number {
  return line.replace(/\s+/g, "").length;
}

/** Per-character step for a line of `n` letters, capped so the line spread stays bounded. */
export function charStepMs(n: number): number {
  return n > 1 ? Math.min(CHAR_STEP_MS, MAX_SPREAD_MS / (n - 1)) : 0;
}

/** Time from the first to the last character's start on a line of `n` letters. */
export function lineSpreadMs(n: number): number {
  return Math.max(0, n - 1) * charStepMs(n);
}

/** Total time from a line's start until its last character has landed. */
export function lineSpanMs(n: number): number {
  return lineSpreadMs(n) + CHAR_DUR_MS;
}

/** Time a line occupies on the timeline: a fixed span for a whole-unit line, else its character spread. */
function lineAdvanceMs(text: string, whole: boolean): number {
  return whole ? WHOLE_LINE_SPAN_MS : lineSpreadMs(countLetters(text));
}

/** Time from a line's start until it has fully landed. */
function lineLandMs(text: string, whole: boolean): number {
  return whole ? WHOLE_LINE_SPAN_MS : lineSpanMs(countLetters(text));
}

/**
 * Derives the intro's line starts and landing time from the text itself.
 * `wholeLines` lists the indexes of lines that animate as one unit (see WHOLE_LINE_INDEX).
 */
export function computeWelcomeTiming(
  lines: readonly string[],
  wholeLines: readonly number[] = [WHOLE_LINE_INDEX]
): WelcomeTiming {
  const whole = (i: number): boolean => wholeLines.includes(i);
  const lineStarts: number[] = [];
  lines.forEach((_text, i) => {
    if (i === 0) {
      lineStarts.push(0);
    } else {
      const prevStart = lineStarts[i - 1] ?? 0;
      lineStarts.push(prevStart + lineAdvanceMs(lines[i - 1] ?? "", whole(i - 1)) + LINE_GAP_MS);
    }
  });

  let landMs = 0;
  lines.forEach((text, i) => {
    landMs = Math.max(landMs, (lineStarts[i] ?? 0) + lineLandMs(text, whole(i)));
  });

  return { lineStarts, landMs: Math.round(landMs) };
}
