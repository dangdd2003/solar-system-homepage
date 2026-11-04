/**
 * Timing for the texture reveal: easing curves and a small clock that tweens reveal
 * values off the scene clock. Pure logic with no three.js import; SolarSystem decides
 * what each tween writes.
 */

/** Exponential ease-out, normalised so both ends are exact. */
export function easeOutExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);
}

/** Cubic ease-out. Input is clamped to [0, 1]; exact 0 at the start and 1 at the end. */
export function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}

/** Sine ease-out (a quarter sine). Input is clamped to [0, 1]; exact 0 and 1 at the ends. */
export function easeOutSine(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.sin((t * Math.PI) / 2);
}

/** One tween: moves `write` from `from` to `to` over `durationMs`, after `delayMs`. */
export interface RevealTween {
  /** Identity. Scheduling an id that is already running replaces that tween. */
  readonly id: string;
  /** Scene time to wait after the tween starts, in milliseconds. Defaults to 0. */
  readonly delayMs?: number | undefined;
  /** Scene time the movement takes, in milliseconds. Zero or less finishes at once. */
  readonly durationMs: number;
  readonly ease: (t: number) => number;
  readonly from: number;
  readonly to: number;
  /** Receives each eased value, and the final value once. */
  readonly write: (value: number) => void;
}

interface ActiveTween {
  readonly tween: RevealTween;
  /** Scene time of the first update after scheduling. Null until that update runs. */
  startedAt: number | null;
}

/**
 * Tweens reveal values from the scene clock. A tween's start is captured on the first
 * `update` after it is scheduled, as the entrance animator does, so a tween scheduled
 * while the loop is paused does not jump. `update` is the only place time is read,
 * and it writes the final value once and then drops the tween. With nothing scheduled,
 * `update` does no work.
 */
export class RevealClock {
  private readonly active = new Map<string, ActiveTween>();

  /** Tweens still running (or waiting to start). */
  get activeCount(): number {
    return this.active.size;
  }

  schedule(tween: RevealTween): void {
    this.active.set(tween.id, { tween, startedAt: null });
  }

  /** Advances every tween to scene time `elapsedMs`. */
  update(elapsedMs: number): void {
    if (this.active.size === 0) return;
    for (const entry of this.active.values()) {
      const { tween } = entry;
      if (entry.startedAt === null) entry.startedAt = elapsedMs;
      const local = elapsedMs - entry.startedAt - (tween.delayMs ?? 0);
      if (local < 0) continue;
      if (tween.durationMs <= 0 || local >= tween.durationMs) {
        tween.write(tween.to);
        this.active.delete(tween.id);
        continue;
      }
      const eased = tween.ease(local / tween.durationMs);
      tween.write(tween.from + (tween.to - tween.from) * eased);
    }
  }

  /** Lands every tween on its final value at once (reduced motion switched on mid-reveal). */
  finishAll(): void {
    for (const { tween } of this.active.values()) tween.write(tween.to);
    this.active.clear();
  }

  /** Drops every tween without writing its final value. */
  clear(): void {
    this.active.clear();
  }
}

/** What a texture's reveal does when its job settles. */
export type RevealMode = "none" | "snap" | "dissolve";

/**
 * The reveal decision for a settled texture job. A job that failed (or was never
 * applied) reveals nothing, so its body stays flat. Reduced motion, and a body still
 * growing in on a return visit, take the final values at once. Otherwise the texture
 * dissolves in from the flat colour.
 */
export function revealModeFor(input: {
  readonly applied: boolean;
  readonly reducedMotion: boolean;
  /** True while the job's owning body is still waiting for or growing through its entrance. */
  readonly entranceHolds: boolean;
}): RevealMode {
  if (!input.applied) return "none";
  if (input.reducedMotion || input.entranceHolds) return "snap";
  return "dissolve";
}
