/**
 * Return-visit entrance: each body is held at a scale floor until its own texture
 * jobs have settled, then grows to full size. Pure logic with no three.js import;
 * SolarSystem applies the scale through the callbacks it registers.
 */

/**
 * Scale a body is held at before its entrance starts. Not 0: a zero scale gives a
 * singular normal matrix.
 */
export const ENTRANCE_HIDDEN_SCALE = 1e-3;

/** Overshoot of the entrance curve: s = 1.2 peaks about 5% past full size. */
export const ENTRANCE_OVERSHOOT = 1.2;

/**
 * Scene time a body may wait for its textures before it is revealed anyway, so a
 * stalled network request cannot keep a body hidden forever. Cache hits settle in
 * well under a second, so this bound is only reached by a hung download, and each
 * force-reveal is reported through `onStalled`. A texture that arrives after a
 * force-reveal swaps in with no further grow (documented trade-off).
 */
export const ENTRANCE_MAX_WAIT_MS = 15_000;

/**
 * Texture jobs owned by a body other than their own id. Keep in sync with
 * EXTRA_TEXTURE_JOBS in SolarSystem.ts.
 */
const JOB_OWNERS: ReadonlyMap<string, string> = new Map([
  ["earth_night", "earth"],
  ["earth_clouds", "earth"],
  ["saturn_ring", "saturn"]
]);

/**
 * Ease-out with a small overshoot. Input is clamped to [0, 1]; returns 0 at t=0
 * and 1 at t=1.
 */
export function easeOutBack(t: number, s = ENTRANCE_OVERSHOOT): number {
  // Exact endpoints: the polynomial alone leaves a -2e-16 residue at t = 0.
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/**
 * Fraction of an entrance completed at `elapsed`, clamped to [0, 1]. A zero
 * duration is already complete.
 */
export function entranceProgress(elapsed: number, startedAt: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (elapsed - startedAt) / durationMs));
}

/**
 * The body that owns a texture job: Earth's night and cloud layers, Saturn's
 * ring, otherwise the job itself.
 */
export function ownerOf(jobId: string): string {
  return JOB_OWNERS.get(jobId) ?? jobId;
}

/**
 * Removes `job` from `owner`'s pending set. Returns true only on the call that
 * empties the set, so a body with several texture jobs is armed exactly once,
 * after its last job settles. Unknown owners or jobs return false.
 */
export function releaseJob<K, J>(waits: Map<K, Set<J>>, owner: K, job: J): boolean {
  const pending = waits.get(owner);
  if (!pending || !pending.delete(job)) return false;
  return pending.size === 0;
}

/** How a body is written to the scene. `apply` receives the scale to show. */
export interface EntranceRegistration {
  readonly apply: (scale: number) => void;
  /** Scene-time length of the grow, in milliseconds. */
  readonly durationMs: number;
}

type Phase = "waiting" | "entering" | "done";

interface Slot<Id extends string> {
  readonly id: Id;
  readonly reg: EntranceRegistration;
  phase: Phase;
  /** Scene time of the first update while waiting. Null until that update runs. */
  waitStartedAt: number | null;
  /** Scene time of the first update after trigger. Null until that update runs. */
  startedAt: number | null;
  /** Last scale written through `apply`. */
  scale: number;
}

export interface EntranceAnimatorOptions<Id extends string> {
  readonly reducedMotion: boolean;
  /** Scene time a waiting body may spend before it is revealed without its textures. */
  readonly maxWaitMs: number;
  /** Called once for each body that is force-revealed while still waiting for textures. */
  readonly onStalled?: ((id: Id) => void) | undefined;
}

/**
 * Per-body entrance state machine: waiting -> entering -> done.
 *
 * - `register` hides a body at ENTRANCE_HIDDEN_SCALE.
 * - `trigger` arms a body. It reads no time, so a body triggered while the tab is
 *   hidden does not jump when the clock resumes.
 * - `update(elapsed)` is the only place scene time is read. It starts each triggered
 *   body on its first update and grows every entering body in parallel. Finished
 *   bodies leave the walk, so once every body is done an update does no work.
 *
 * Under reduced motion, `trigger` shows the body at full scale at once.
 */
export class EntranceAnimator<Id extends string> {
  private reducedMotion: boolean;
  private readonly maxWaitMs: number;
  private readonly onStalled: ((id: Id) => void) | undefined;
  private readonly slots = new Map<Id, Slot<Id>>();
  /** Slots that are not done yet, in registration order. Compacted by update(). */
  private live: Slot<Id>[] = [];
  private disposed = false;

  constructor(opts: EntranceAnimatorOptions<Id>) {
    this.reducedMotion = opts.reducedMotion;
    this.maxWaitMs = opts.maxWaitMs;
    this.onStalled = opts.onStalled;
  }

  /** Registers a body and hides it. Each id may be registered once. */
  register(id: Id, reg: EntranceRegistration): void {
    if (this.disposed) return;
    if (this.slots.has(id)) throw new Error(`EntranceAnimator: "${id}" is already registered`);
    const slot: Slot<Id> = {
      id,
      reg,
      phase: "waiting",
      waitStartedAt: null,
      startedAt: null,
      scale: ENTRANCE_HIDDEN_SCALE
    };
    this.slots.set(id, slot);
    this.live.push(slot);
    this.write(slot, ENTRANCE_HIDDEN_SCALE);
  }

  /** Arms a waiting body. Idempotent: does nothing once the body has been triggered. */
  trigger(id: Id): void {
    if (this.disposed) return;
    const slot = this.slots.get(id);
    if (!slot || slot.phase !== "waiting") return;
    if (this.reducedMotion) {
      this.write(slot, 1);
      slot.phase = "done";
      return;
    }
    slot.phase = "entering";
  }

  /**
   * Follow a live change to the reduced-motion setting. Switching motion off
   * finishes every body already entering at full scale. Bodies still waiting
   * stay armed, so `trigger` reveals them as before.
   */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    if (!reduced) return;
    for (const slot of this.live) {
      if (slot.phase !== "entering") continue;
      this.write(slot, 1);
      slot.phase = "done";
    }
  }

  /**
   * Advances every unfinished body by scene time `elapsed`. A waiting body that has
   * waited `maxWaitMs` is force-triggered, so it is revealed even if its textures stall.
   */
  update(elapsed: number): void {
    if (this.disposed) return;
    const live = this.live;
    if (live.length === 0) return;
    let kept = 0;
    for (let i = 0; i < live.length; i += 1) {
      if (this.disposed) return;
      const slot = live[i];
      if (slot === undefined) continue;
      this.advance(slot, elapsed);
      if (slot.phase !== "done") {
        live[kept] = slot;
        kept += 1;
      }
    }
    live.length = kept;
  }

  /**
   * True while any body is waiting or entering: update() must keep running, both to
   * grow entering bodies and to time out a waiting body whose textures stall.
   */
  isAnimating(): boolean {
    return this.live.length > 0;
  }

  /** True only once the body has finished its entrance and is at full scale. */
  isDone(id: Id): boolean {
    return this.slots.get(id)?.phase === "done";
  }

  /** Last scale applied to a body. Unregistered bodies report 1 (not animated). */
  scaleOf(id: Id): number {
    return this.slots.get(id)?.scale ?? 1;
  }

  /** Drops all state. Every later call is a no-op. */
  dispose(): void {
    this.disposed = true;
    this.slots.clear();
    this.live = [];
  }

  private advance(slot: Slot<Id>, elapsed: number): void {
    if (slot.phase === "waiting") {
      if (slot.waitStartedAt === null) slot.waitStartedAt = elapsed;
      if (elapsed - slot.waitStartedAt >= this.maxWaitMs) {
        this.onStalled?.(slot.id);
        this.trigger(slot.id);
      }
    }
    if (slot.phase === "entering") {
      if (slot.startedAt === null) slot.startedAt = elapsed;
      const p = entranceProgress(elapsed, slot.startedAt, slot.reg.durationMs);
      if (p >= 1) {
        this.write(slot, 1);
        slot.phase = "done";
      } else {
        this.write(slot, Math.max(ENTRANCE_HIDDEN_SCALE, easeOutBack(p)));
      }
    }
  }

  private write(slot: Slot<Id>, scale: number): void {
    slot.scale = scale;
    slot.reg.apply(scale);
  }
}
