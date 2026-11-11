/**
 * Frame-capped clock for the reveal timelines.
 *
 * anime's own engine advances a timeline by the real time since the last
 * frame, so a long main-thread stall (first load: shader compiles, texture
 * uploads, the startup aperture) jumps a reveal straight to its end. Split
 * text then shows its first glyph, freezes, and pops in whole. Reveal
 * timelines are built paused and stepped here instead: every frame advances
 * them by at most MAX_STEP_MS, so after a stall the motion resumes where it
 * stopped rather than skipping.
 */

import type { Timeline } from "animejs";

/** Longest one frame may advance a reveal (a 20 fps frame); longer frames are treated as a stall. */
export const MAX_STEP_MS = 50;

interface Driven {
  readonly tl: Timeline;
  readonly delay: number;
  readonly onEnd: () => void;
  elapsed: number;
}

const driven = new Set<Driven>();
/** Per-frame snapshot of `driven`, reused so a frame does not allocate; a timeline added mid-frame waits for the next one. */
const snapshot: Driven[] = [];
let rafId = 0;
let lastTime = 0;

function isTimeline(handle: unknown): handle is Timeline {
  const tl = handle as Partial<Timeline> | null;
  return typeof tl?.seek === "function" && typeof tl.duration === "number";
}

function frame(now: number): void {
  const step = Math.min(Math.max(now - lastTime, 0), MAX_STEP_MS);
  lastTime = now;
  // Each timeline is isolated: one that throws must not end the shared loop,
  // or every other reveal would wait for its backstop and then snap.
  snapshot.length = 0;
  for (const d of driven) snapshot.push(d);
  for (const d of snapshot) {
    try {
      // A reverted timeline is cancelled; seeking would revive it.
      if (d.tl.cancelled) {
        driven.delete(d);
        continue;
      }
      d.elapsed += step;
      if (d.elapsed < d.delay) continue;
      const time = Math.min(d.elapsed - d.delay, d.tl.duration);
      d.tl.seek(time);
      if (time >= d.tl.duration) {
        driven.delete(d);
        d.onEnd();
      }
    } catch (err) {
      driven.delete(d);
      console.warn("[reveal] clock step failed", err);
      try {
        d.onEnd();
      } catch {
        // The element is already finished by the caller's own guards.
      }
    }
  }
  snapshot.length = 0;
  rafId = driven.size > 0 ? requestAnimationFrame(frame) : 0;
}

/**
 * Plays a paused reveal timeline on the capped clock, starting after `delay`
 * ms, and calls `onEnd` once it has rendered its last frame. Returns false
 * (and does nothing) for handles that are not anime timelines or when there
 * is no requestAnimationFrame; the caller keeps its own timer then.
 */
export function drive(handle: unknown, delay: number, onEnd: () => void): boolean {
  if (!isTimeline(handle) || typeof requestAnimationFrame !== "function") return false;
  driven.add({ tl: handle, delay: Math.max(0, delay), onEnd, elapsed: 0 });
  if (rafId === 0) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  return true;
}
