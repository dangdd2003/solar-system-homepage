/**
 * Contract between the 3D scene and the startup aperture.
 *
 * Readiness: the scene marks itself ready once it can be shown, meaning the Sun texture
 * has settled and a frame has been drawn with it (shaders compiled). The startup
 * waits on that signal instead of a fixed timer, so the reveal starts the moment the
 * scene can actually be seen.
 *
 * Reveal limit: the scene registers a provider that reports the largest aperture radius
 * (CSS px, measured from the viewport centre, where the aperture is drawn) inside which
 * every visible body already has its texture applied. The startup controller paces the
 * aperture so it never opens past that radius, which means the reveal itself hides
 * texture streaming: the circle grows outward as the Sun, then the inner planets, then
 * the outer ones finish loading.
 *
 * Progress: the scene notes each settled texture, so the controller can tell a slow
 * network (still progressing, keep pacing) from a stalled one (release the gate).
 *
 * `Infinity` means nothing is pending (or no scene registered), so the aperture
 * may open freely.
 */

export type RevealLimitProvider = () => number;

/**
 * Failure guard, not a pacing timer: if no texture settles for this long, loading is
 * treated as stalled (dead network) and the startup stops waiting on it. A slow but
 * progressing network never reaches it.
 */
import { nowMs } from "../../utils/clock";

export const REVEAL_STALL_MS = 2500;

let provider: RevealLimitProvider | null = null;
let sceneReady = false;
const readyListeners = new Set<() => void>();
let lastProgressMs: number | null = null;

export function setRevealLimitProvider(fn: RevealLimitProvider | null): void {
  provider = fn;
}

export function revealLimitPx(): number {
  if (!provider) return Infinity;
  try {
    const limit = provider();
    return Number.isNaN(limit) ? Infinity : limit;
  } catch {
    return Infinity;
  }
}

/** The scene can be shown (or will never be: a failed scene marks ready so nothing waits on it). */
export function markSceneReady(): void {
  if (sceneReady) return;
  sceneReady = true;
  const listeners = [...readyListeners];
  readyListeners.clear();
  for (const cb of listeners) cb();
}

export function isSceneReady(): boolean {
  return sceneReady;
}

/** Calls `cb` once the scene is ready (immediately if it already is). Returns an unsubscribe. */
export function onSceneReady(cb: () => void): () => void {
  if (sceneReady) {
    cb();
    return () => {};
  }
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

/** Record that a texture just settled (applied or failed). */
export function noteRevealProgress(): void {
  lastProgressMs = nowMs();
}

/** Clock time of the last settled texture, or null if none has settled yet. */
export function lastRevealProgressMs(): number | null {
  return lastProgressMs;
}

/** Test-only: return the module to its initial state. */
export function resetRevealGate(): void {
  provider = null;
  sceneReady = false;
  readyListeners.clear();
  lastProgressMs = null;
}
