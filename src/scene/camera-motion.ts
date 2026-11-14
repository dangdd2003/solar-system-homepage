/**
 * Frame-rate independent motion primitives for the camera: a critically damped
 * spring (smooth follow with a gentle ease-in and ease-out, never oscillates),
 * an exponential coast (momentum that bleeds off after a fling), and a pointer
 * velocity tracker (how fast the drag was moving when it was released).
 * Pure math, no THREE or DOM, so the feel is unit-testable.
 */

/** One spring-driven scalar: `value` chases `goal`, carrying `velocity`. */
export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * Advance a critically damped spring toward `goal` by `dt` seconds using the
 * exact closed-form solution, so a long or irregular frame never overshoots or
 * goes unstable. `omega` is the stiffness (rad/s): higher settles faster.
 * Starting from rest the value accelerates, then decelerates onto the goal —
 * the soft ease-in/ease-out that makes zoom and drag feel weighty.
 */
export function stepSpring(s: SpringState, goal: number, omega: number, dt: number): void {
  const x = s.value - goal;
  const decay = Math.exp(-omega * dt);
  const k = (s.velocity + omega * x) * dt;
  s.value = goal + (x + k) * decay;
  s.velocity = (s.velocity - omega * k) * decay;
}

/**
 * Exact displacement and remaining velocity after coasting for `dt` seconds
 * with exponential friction of time constant `tau`. Total glide from a
 * velocity v is v * tau, independent of frame rate.
 */
export interface CoastStep {
  distance: number;
  velocity: number;
}

/**
 * Allocation-free variant of `coast`: writes displacement and remaining velocity into `out`.
 */
export function coastInto(velocity: number, tau: number, dt: number, out: CoastStep): CoastStep {
  const decay = Math.exp(-dt / tau);
  out.distance = velocity * tau * (1 - decay);
  out.velocity = velocity * decay;
  return out;
}

/**
 * Exact displacement and remaining velocity after coasting for `dt` seconds
 * with exponential friction of time constant `tau`. Total glide from a
 * velocity v is v * tau, independent of frame rate.
 */
export function coast(velocity: number, tau: number, dt: number): CoastStep {
  return coastInto(velocity, tau, dt, { distance: 0, velocity: 0 });
}

/** One pointer movement: when it happened and how far it moved. */
interface VelocitySample {
  t: number;
  dx: number;
  dy: number;
}

const INITIAL_TRACKER_CAPACITY = 32;

function createSampleSlots(count: number): VelocitySample[] {
  const arr = new Array<VelocitySample>(count);
  for (let i = 0; i < count; i++) {
    arr[i] = { t: 0, dx: 0, dy: 0 };
  }
  return arr;
}

/**
 * Tracks recent pointer movement so a release can turn into a fling. Keeps a
 * short window of samples; the release velocity is their total travel over the
 * window's span. A pointer held still before release reads as zero — the drag
 * stops dead instead of lurching off on stale speed.
 */
export class VelocityTracker {
  private capacity = INITIAL_TRACKER_CAPACITY;
  private samples: VelocitySample[] = createSampleSlots(INITIAL_TRACKER_CAPACITY);
  private head = 0;
  private count = 0;
  private lastT = 0;

  /** Seconds of history that contribute to the release velocity. */
  static readonly WINDOW = 0.1;
  /** Hold the pointer still this long before release and there's no fling. */
  static readonly STALE = 0.06;

  reset(t: number): void {
    this.head = 0;
    this.count = 0;
    this.lastT = t;
  }

  add(t: number, dx: number, dy: number): void {
    this.lastT = t;
    const cutoff = t - VelocityTracker.WINDOW;
    while (this.count > 0 && this.samples[this.head]!.t < cutoff) {
      this.head = (this.head + 1) % this.capacity;
      this.count--;
    }
    if (this.count === this.capacity) {
      const nextCapacity = this.capacity * 2;
      const next = new Array<VelocitySample>(nextCapacity);
      for (let i = 0; i < this.count; i++) {
        next[i] = this.samples[(this.head + i) % this.capacity]!;
      }
      for (let i = this.count; i < nextCapacity; i++) {
        next[i] = { t: 0, dx: 0, dy: 0 };
      }
      this.samples = next;
      this.capacity = nextCapacity;
      this.head = 0;
    }
    const tail = (this.head + this.count) % this.capacity;
    const slot = this.samples[tail]!;
    slot.t = t;
    slot.dx = dx;
    slot.dy = dy;
    this.count++;
  }

  /** Pixels per second at time `t` (the release). Zero if the drag had paused. */
  velocity(t: number): { vx: number; vy: number } {
    if (this.count === 0 || t - this.lastT > VelocityTracker.STALE) {
      return { vx: 0, vy: 0 };
    }
    const cutoff = t - VelocityTracker.WINDOW;
    let dx = 0;
    let dy = 0;
    let first = t;
    for (let i = 0; i < this.count; i++) {
      const s = this.samples[(this.head + i) % this.capacity]!;
      if (s.t < cutoff) continue;
      dx += s.dx;
      dy += s.dy;
      first = Math.min(first, s.t);
    }
    // Span from the first sample to the release, floored so one event arriving
    // a hair before pointerup can't divide by ~0 into a huge velocity.
    const span = Math.max(t - first, 1 / 60);
    return { vx: dx / span, vy: dy / span };
  }
}

/** Shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function shortestAngle(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Fly-to duration (seconds) for a trip moving the look target `travel` scene
 * units while the camera goes from `fromRadius` to `toRadius` off it. Short
 * hops stay snappy; long trips (Mercury → Neptune) and big zoom changes get
 * more time so the camera never whips. Measured in log space like Google
 * Earth, so doubling the distance adds a fixed amount of time.
 */
export function flightDuration(travel: number, fromRadius: number, toRadius: number): number {
  const MIN = 1.1;
  const MAX = 2.2;
  const scale = Math.max(Math.min(fromRadius, toRadius), 1);
  const hops = Math.log2(1 + travel / scale);
  const zoom = Math.abs(Math.log2(Math.max(toRadius, 1e-6) / Math.max(fromRadius, 1e-6)));
  return Math.min(MAX, MIN + 0.1 * hops + 0.06 * zoom);
}

/**
 * Extra camera distance at mid-flight (scene units) for a trip moving the look
 * target `travel` units. When the trip is long compared with how far the
 * camera sits from either end, it rises up and out — the Google Earth arc — so
 * both ends stay in view and it never skims past the Sun. Zero for hops the
 * start/end framing already covers (overview ⇄ planet, neighbouring planets).
 */
export function flightLift(travel: number, fromRadius: number, toRadius: number): number {
  return Math.max(0, 0.5 * travel - 0.5 * (fromRadius + toRadius));
}
