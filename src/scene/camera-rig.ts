import * as THREE from "three";
import { type BodyId, getBody } from "./bodies";
import { easeInOutCubic, OVERVIEW_TARGET, overviewPositionFor, type Vec3 } from "./camera-path";
import {
  coast,
  flightDuration,
  flightLift,
  shortestAngle,
  type SpringState,
  stepSpring
} from "./camera-motion";
import { framingPosition, framingProgress } from "./resize-framing";
import {
  applyOrbitDrag,
  applyZoom,
  cartesianToSpherical,
  clampPanTarget,
  MAX_RADIUS,
  minRadiusForSize,
  panDelta,
  PITCH_LIMIT,
  type Spherical
} from "./orbit-math";

/**
 * What the UI should display, kept distinct so a mid-flight "transition" never
 * gets confused with arriving at the overview:
 *   - transition: camera is moving — hide every panel and the fact card.
 *   - settled:    a free interaction (orbit/zoom/pan) has stopped and the camera
 *                 has fixed its coordinates — restore whatever content is
 *                 resting (the last-clicked body, or the intro). Emitted by the
 *                 rig the moment motion ends, so the text reappears on the same
 *                 beat a click's flight arrives, not on a timer from the drag.
 *   - overview:   arrived at the whole-system view — show the brief intro.
 *   - focused:    arrived at a body — show that body's panel and fact card.
 */
export type FocusState =
  | { kind: "transition" }
  | { kind: "settled" }
  | { kind: "overview" }
  | { kind: "focused"; id: BodyId };

export interface CameraRigOptions {
  reducedMotion: boolean;
  onFocusChange: (state: FocusState) => void;
  /** Live camera destination for a body at its current orbital position. */
  resolveDestination: (id: BodyId) => { position: Vec3; lookAt: Vec3 } | null;
  /**
   * Optional: the camera was just given something to animate (a gesture, flight, fling
   * or re-framing). A render loop that idles at rest uses it to wake up.
   */
  onActivity?: (() => void) | undefined;
}

/**
 * A focus()/overview() flight. The look target glides from `fromLook` to
 * `toLook` while the camera's offset from it is interpolated in spherical
 * terms (radius in log space, yaw along the shortest arc), plus a mid-flight
 * `lift` — so the camera swings around and pulls up like a Google Earth
 * fly-to instead of cutting a straight line that can graze the Sun.
 */
interface Tween {
  fromLook: Vec3;
  /** Tween-owned storage (never aliased to a caller's object), so it can be
   *  rewritten in place when the target is re-aimed each frame. */
  toLook: Vec3;
  fromOffset: Spherical;
  toOffset: Spherical;
  /** Extra radius at mid-flight (scene units); 0 for short hops. */
  lift: number;
  /** Captured on the first update frame (from caller-supplied elapsed). */
  start: number | null;
  /** Seconds, scaled to the trip by flightDuration(). On arrival the rig emits
   *  the focused/overview state; a free interaction reappears via the separate
   *  `settled` signal, so both paths show content when the camera fixes its
   *  coordinates rather than on a delay. */
  duration: number;
  target: BodyId | null;
}

/** Momentum left over from a released drag, in screen pixels per second. */
interface Fling {
  mode: "orbit" | "pan";
  vx: number;
  vy: number;
}

/** How long after the camera comes to rest it is considered to have "fixed its
 *  coordinates", at which point the resting content reappears. Short — the
 *  springs already ease the motion to a stop, so this only debounces. */
const SETTLE_IDLE_SECONDS = 0.15;

/** Spring stiffness (rad/s) carrying orbit and pan: the camera trails the
 *  pointer by a few frames, easing in and out instead of jumping per event. */
const DRAG_OMEGA = 22;
/** Softer spring for zoom, so a wheel notch glides in over ~0.4 s and fast
 *  scrolling builds up speed — the gentle acceleration of Google Earth. */
const ZOOM_OMEGA = 11;
/** Friction time constant for fling momentum (s). A release at speed v coasts
 *  a further v × FLING_TAU pixels' worth of motion. */
const FLING_TAU = 0.3;
/** Release speeds below this (px/s) just stop — no drift after a slow drag. */
const MIN_FLING_SPEED = 60;
/** Cap on release speed (px/s) so a violent flick can't spin the system away. */
const MAX_FLING_SPEED = 3000;
/** A coast ends once it has bled off below this speed (px/s). */
const FLING_STOP_SPEED = 4;
/** Longest step fed to the springs (s), so a stalled frame can't lurch. */
const MAX_STEP = 0.1;
/** Springs within this of their goal (rad, log-radius, or radius-scaled scene
 *  units) are snapped onto it and the camera counts as at rest. */
const REST_EPSILON = 1e-4;
/** Velocity tolerance relative to the position tolerance: a spring also needs
 *  |velocity| < REST_EPSILON × this to count as at rest. Velocity and position
 *  units differ, so this factor is tuned rather than derived. */
const REST_VELOCITY_FACTOR = 10;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly currentLook: THREE.Vector3;
  // Scratch vectors for deriving the camera's screen axes during a pan, reused
  // so a drag doesn't allocate a Vector3 per pointer move.
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3();
  private readonly scratchFwd = new THREE.Vector3();
  private reducedMotion: boolean;
  private readonly onFocusChange: (state: FocusState) => void;
  private readonly resolveDestination: CameraRigOptions["resolveDestination"];
  private readonly onActivity: () => void;
  private focused: BodyId | null = null;
  private tween: Tween | null = null;
  // Overview camera position for the current aspect (see setAspect), and the
  // zoom ceiling raised to fit it: a narrow viewport needs a farther overview.
  private overviewPos: Vec3 = { ...OVERVIEW_TARGET.position };
  private zoomCeiling: number = MAX_RADIUS;
  // When the user grabs the scene, we switch to manual orbit: the camera is
  // parked at a spherical offset from currentLook that the user drags/zooms.
  // Null means "not manually controlled" — tween / ride-along drive instead.
  // Any focus()/overview() command clears this to reclaim automatic control.
  // Gestures never move the camera directly: they move `goal` (and
  // `lookGoal` for a pan), and update() springs `manual`/`currentLook` toward
  // them each frame, so every orbit, zoom and pan eases in and out.
  private manual: Spherical | null = null;
  private goal: Spherical = { radius: 1, yaw: 0, pitch: 0 };
  private readonly lookGoal = new THREE.Vector3();
  // Spring velocities: yaw/pitch in rad/s, radius in log-units/s (so zoom
  // feels the same at any distance), look target in scene units/s.
  private readonly vel = { yaw: 0, pitch: 0, logRadius: 0 };
  private readonly lookVel = new THREE.Vector3();
  private readonly scratchSpring: SpringState = { value: 0, velocity: 0 };
  // Per-frame cartesian offset (camera minus look target), reused by the tween
  // and manual paths so update() doesn't allocate. Only ever read immediately
  // after being written; never stored or handed out.
  private readonly scratchOffset: Vec3 = { x: 0, y: 0, z: 0 };
  // Momentum from the last released drag, coasting down under friction.
  private fling: Fling | null = null;
  // Elapsed time of the previous update(), for the per-frame step.
  private lastElapsed: number | null = null;
  // Settle tracking for free interaction. orbit/zoom/pan set `manualDirty` on
  // every event; update() (which has the frame `elapsed`) stamps the time of the
  // latest event and, once no new event has arrived for SETTLE_IDLE_SECONDS,
  // emits `settled` exactly once so the resting content reappears the moment the
  // camera has fixed its coordinates — not on a timer counted from the drag.
  private manualDirty = false;
  private lastManualEvent = 0;
  private settleEmitted = false;
  // Eased re-framing after a viewport resize or rotation. Every resize restarts
  // a short ease from wherever the camera is now (`from`), timed from the last
  // frame's elapsed time (`start`), so a continuous drag tracks the window
  // tightly and the first step moves on the very next frame. Null when idle.
  private framing: { from: Vec3; start: number | null } | null = null;
  // False until the first setAspect: the initial fit snaps rather than eases.
  private hasFramed = false;

  constructor(opts: CameraRigOptions) {
    this.reducedMotion = opts.reducedMotion;
    this.onFocusChange = opts.onFocusChange;
    this.resolveDestination = opts.resolveDestination;
    this.onActivity = opts.onActivity ?? (() => {});

    // Far plane must comfortably exceed the Milky Way skybox radius (400) plus
    // the camera's max distance from origin, or the skybox's far hemisphere gets
    // clipped — showing the transparent canvas (page background) through a
    // camera-following circular seam. 2000 leaves generous headroom.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.camera.position.set(
      OVERVIEW_TARGET.position.x,
      OVERVIEW_TARGET.position.y,
      OVERVIEW_TARGET.position.z
    );
    this.currentLook = new THREE.Vector3(
      OVERVIEW_TARGET.lookAt.x,
      OVERVIEW_TARGET.lookAt.y,
      OVERVIEW_TARGET.lookAt.z
    );
    this.camera.lookAt(this.currentLook);
  }

  focus(id: BodyId): void {
    const dest = this.resolveDestination(id);
    if (!dest) return;
    this.startTween(dest.position, dest.lookAt, id);
  }

  overview(): void {
    // Already settled at the overview — do nothing. Re-running the transition
    // would hide every panel and replay the fly-back from overview to overview,
    // which flashes the intro away and back and reads as a full page reload.
    // But if the user has manually orbited/zoomed away, we DO want to fly back.
    if (this.focused === null && this.tween === null && this.manual === null) {
      return;
    }
    this.startTween(this.overviewPos, OVERVIEW_TARGET.lookAt, null);
  }

  /**
   * Manual orbit drag (pixels). Seeds the spherical offset from the live camera
   * on the first gesture so control is picked up with no jump, then rotates.
   */
  orbit(dxPixels: number, dyPixels: number): void {
    this.beginManual();
    this.goal = applyOrbitDrag(this.goal, dxPixels, dyPixels);
    this.afterGesture();
  }

  /** Manual zoom (wheel deltaY or inverted pinch). Negative = closer. */
  zoom(delta: number): void {
    this.beginManual();
    this.goal = applyZoom(this.goal, delta, this.minZoomRadius(), this.zoomCeiling);
    this.afterGesture();
  }

  /**
   * The pointer went down on the scene: stop any coasting fling dead, like
   * catching a spinning globe. Doesn't enter manual mode or emit anything, so
   * a plain tap stays a tap.
   */
  grab(): void {
    this.fling = null;
  }

  /**
   * A drag was released at (vx, vy) screen pixels per second. Hand that speed
   * to a coast that bleeds off under friction, so the view glides on and
   * eases to a stop. Slow releases stop dead; reduced motion never coasts.
   */
  release(mode: "orbit" | "pan", vxPixels: number, vyPixels: number): void {
    if (this.reducedMotion || this.manual === null) return;
    const speed = Math.hypot(vxPixels, vyPixels);
    // `!(>=)` also rejects NaN.
    if (!(speed >= MIN_FLING_SPEED)) return;
    const scale = Math.min(1, MAX_FLING_SPEED / speed);
    this.fling = { mode, vx: vxPixels * scale, vy: vyPixels * scale };
    // Moving again: keep the resting content hidden until the coast is over.
    this.manualDirty = true;
    this.settleEmitted = false;
    this.onActivity();
  }

  /**
   * Closest the camera may zoom, based on the body currently at the look
   * center. Focused on a body → clear that body's surface. Otherwise the look
   * center sits on the Sun (overview, or after focusing it), which is the one
   * body big enough (size 3.2) to exceed the flat MIN_RADIUS floor — so clear
   * the Sun there too. Planets are all smaller than the floor, so this only
   * ever raises the limit for the Sun; everything else keeps MIN_RADIUS.
   */
  private minZoomRadius(): number {
    const id = this.focused ?? "sun";
    return minRadiusForSize(getBody(id).size);
  }

  /**
   * Manual pan drag (pixels): slide the look target across the view plane so
   * the camera's center is no longer locked to the sun. Moves the target along
   * the camera's screen right/up axes, clamped to a max distance from origin,
   * then re-parks the camera at the same spherical offset so only the center
   * shifts (orientation and zoom unchanged). A focus()/overview() snaps home.
   */
  pan(dxPixels: number, dyPixels: number): void {
    // Panning is the one gesture that breaks a planet lock: it slides the center
    // off the body into free space, so drop the anchor. beginManual() emits the
    // transition (which temp-hides the panel) for us.
    this.focused = null;
    this.beginManual();
    this.panGoal(dxPixels, dyPixels);
    this.afterGesture();
  }

  /** Slide the look goal across the view plane by a pixel delta (pan/fling). */
  private panGoal(dxPixels: number, dyPixels: number): void {
    if (this.manual === null) return;
    // Camera screen axes in world space: right = column 0 of the world matrix,
    // up = column 1. extractBasis fills them from the current orientation.
    // Invariant: advanceManual always ends with applyManual (which calls lookAt),
    // so the world matrix here is from the latest frame. Don't reorder that.
    this.camera.updateMatrixWorld();
    this.camera.matrixWorld.extractBasis(this.scratchRight, this.scratchUp, this.scratchFwd);
    const d = panDelta(dxPixels, dyPixels, this.scratchRight, this.scratchUp, this.manual.radius);
    const moved = clampPanTarget({
      x: this.lookGoal.x + d.x,
      y: this.lookGoal.y + d.y,
      z: this.lookGoal.z + d.z
    });
    this.lookGoal.set(moved.x, moved.y, moved.z);
  }

  /**
   * Follow a live change to the OS reduced-motion setting. Turning motion off
   * settles whatever is in flight: a fling is dropped, springs jump to their
   * goals, a tween lands on its target and an overview fit lands in place.
   */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    this.onActivity();
    if (!reduced) return;
    this.fling = null;
    if (this.manual !== null) {
      this.snapToGoal();
      this.applyManual();
    }
    if (
      this.framing !== null &&
      this.focused === null &&
      this.tween === null &&
      this.manual === null
    ) {
      this.framing = null;
      const p = this.overviewPos;
      this.camera.position.set(p.x, p.y, p.z);
      this.camera.lookAt(this.currentLook);
    }
  }

  /** Reduced motion skips the springs: a gesture lands on its goal at once. */
  private afterGesture(): void {
    if (!this.reducedMotion) return;
    this.snapToGoal();
    this.applyManual();
  }

  /**
   * Enter manual mode if not already in it. Cancels any in-flight tween and
   * captures the current camera offset from currentLook as the starting
   * spherical so the first drag continues from exactly where we are.
   *
   * Crucially this does NOT clear `focused`: orbiting or zooming a locked planet
   * keeps the lock, so update() goes on recomputing the planet's live center
   * each frame and the camera rides along at the new offset. Only pan() (right
   * drag) detaches the anchor. The content panel temp-hides during interaction
   * (via the emitted transition); update() emits `settled` once the gesture
   * stops and the camera has fixed its coordinates, and the presenter then
   * restores the resting content — the lock itself is unaffected.
   */
  private beginManual(): void {
    // Seed the spherical offset from the live camera only on the FIRST event of
    // a gesture (so control picks up with no jump); later events keep rotating.
    if (this.manual === null) {
      this.tween = null;
      this.fling = null;
      this.manual = cartesianToSpherical({
        x: this.camera.position.x - this.currentLook.x,
        y: this.camera.position.y - this.currentLook.y,
        z: this.camera.position.z - this.currentLook.z
      });
      this.goal = { ...this.manual };
      this.lookGoal.copy(this.currentLook);
      this.vel.yaw = 0;
      this.vel.pitch = 0;
      this.vel.logRadius = 0;
      this.lookVel.set(0, 0, 0);
    }
    // Mark this frame's interaction: reset the settle latch and flag that a new
    // event landed (update() timestamps it). Emit `transition` so the content
    // panel temp-hides — for a FOCUSED (locked) body too, not just a free look.
    // `this.focused` is deliberately left untouched so the lock and its
    // ride-along survive; only pan() detaches the anchor.
    this.manualDirty = true;
    this.settleEmitted = false;
    this.onFocusChange({ kind: "transition" });
    // The settle detector needs frames even when a reduced-motion gesture snaps.
    this.onActivity();
  }

  /** Jump the manual state onto its goals and stop the springs. */
  private snapToGoal(): void {
    const m = this.manual;
    if (m === null) return;
    // Copy in place: this runs every idle frame, so don't allocate a new object.
    m.yaw = this.goal.yaw;
    m.pitch = this.goal.pitch;
    m.radius = this.goal.radius;
    this.currentLook.copy(this.lookGoal);
    this.vel.yaw = 0;
    this.vel.pitch = 0;
    this.vel.logRadius = 0;
    this.lookVel.set(0, 0, 0);
  }

  /** Step one spring-driven scalar and return the shared scratch result. */
  private spring(
    value: number,
    velocity: number,
    goal: number,
    omega: number,
    dt: number
  ): SpringState {
    this.scratchSpring.value = value;
    this.scratchSpring.velocity = velocity;
    stepSpring(this.scratchSpring, goal, omega, dt);
    return this.scratchSpring;
  }

  /**
   * Advance manual control by `dt` seconds: feed any fling into the goals,
   * spring the camera toward them, and re-park it. Returns whether anything is
   * still moving, so the settle detector waits for the glide to finish.
   */
  private advanceManual(dt: number): boolean {
    const m = this.manual;
    if (m === null) return false;

    // Fling: coast the goal onward under friction, through the same pixel
    // conversions a live drag uses, so the glide continues the gesture exactly.
    const f = this.fling;
    if (f !== null) {
      const cx = coast(f.vx, FLING_TAU, dt);
      const cy = coast(f.vy, FLING_TAU, dt);
      f.vx = cx.velocity;
      f.vy = cy.velocity;
      if (f.mode === "pan") this.panGoal(cx.distance, cy.distance);
      else this.goal = applyOrbitDrag(this.goal, cx.distance, cy.distance);
      if (Math.hypot(f.vx, f.vy) < FLING_STOP_SPEED) this.fling = null;
    }

    // Locked on a planet: the look center rides along with it exactly (it
    // moves smoothly on its own), so only the offset around it is sprung.
    if (this.focused !== null) {
      const dest = this.resolveDestination(this.focused);
      if (dest) {
        this.lookGoal.set(dest.lookAt.x, dest.lookAt.y, dest.lookAt.z);
        this.currentLook.copy(this.lookGoal);
        this.lookVel.set(0, 0, 0);
      }
    }

    const g = this.goal;
    let s = this.spring(m.yaw, this.vel.yaw, g.yaw, DRAG_OMEGA, dt);
    m.yaw = s.value;
    this.vel.yaw = s.velocity;

    // A spring racing into a limit can overshoot it slightly; hold the line
    // there (only if it started inside, so a seed outside eases back in).
    s = this.spring(m.pitch, this.vel.pitch, g.pitch, DRAG_OMEGA, dt);
    const pitch = holdLimit(m.pitch, s.value, -PITCH_LIMIT, PITCH_LIMIT);
    this.vel.pitch = pitch === s.value ? s.velocity : 0;
    m.pitch = pitch;

    const logR = Math.log(Math.max(m.radius, 1e-6));
    const logGoal = Math.log(Math.max(g.radius, 1e-6));
    s = this.spring(logR, this.vel.logRadius, logGoal, ZOOM_OMEGA, dt);
    const radius = holdLimit(m.radius, Math.exp(s.value), this.minZoomRadius(), this.zoomCeiling);
    this.vel.logRadius = radius === Math.exp(s.value) ? s.velocity : 0;
    m.radius = radius;

    for (const axis of LOOK_AXES) {
      const look = this.spring(
        this.currentLook[axis],
        this.lookVel[axis],
        this.lookGoal[axis],
        DRAG_OMEGA,
        dt
      );
      this.currentLook[axis] = look.value;
      this.lookVel[axis] = look.velocity;
    }

    const lookEps = REST_EPSILON * m.radius;
    const atRest =
      settled(m.yaw, g.yaw, this.vel.yaw, REST_EPSILON) &&
      settled(m.pitch, g.pitch, this.vel.pitch, REST_EPSILON) &&
      settled(Math.log(m.radius), logGoal, this.vel.logRadius, REST_EPSILON) &&
      this.currentLook.distanceTo(this.lookGoal) < lookEps &&
      this.lookVel.length() < lookEps * REST_VELOCITY_FACTOR;
    if (atRest) this.snapToGoal();

    this.applyManual();
    return !atRest || this.fling !== null;
  }

  /** Place the camera at the current manual spherical offset from currentLook. */
  private applyManual(): void {
    if (this.manual === null) return;
    const m = this.manual;
    const off = sphericalToCartesianInto(m.radius, m.yaw, m.pitch, this.scratchOffset);
    this.camera.position.set(
      this.currentLook.x + off.x,
      this.currentLook.y + off.y,
      this.currentLook.z + off.z
    );
    this.camera.lookAt(this.currentLook);
  }

  /**
   * Canvas size from the render loop. `bleed` is the strip of canvas below the
   * visible viewport (under the iOS Safari toolbar). The projection frames only
   * the visible width x (height - bleed) area, anchored at the top, and the bleed
   * rows just extend the view downward, so the bleed never zooms or shifts the scene.
   */
  setFrame(width: number, height: number, bleed: number): void {
    const frameHeight = Math.max(1, height - Math.max(0, bleed));
    if (frameHeight < height) {
      this.camera.setViewOffset(width, frameHeight, 0, 0, width, height);
    } else {
      this.camera.clearViewOffset();
    }
    this.setAspect(width / frameHeight);
  }

  /**
   * Viewport aspect (width / height) from the render loop. Re-fits the overview
   * distance, retargets overview flights, and eases a resting overview onto its
   * new framing (the first fit and reduced motion snap immediately).
   */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.overviewPos = overviewPositionFor(aspect);
    this.zoomCeiling = Math.max(
      MAX_RADIUS,
      Math.hypot(this.overviewPos.x, this.overviewPos.y, this.overviewPos.z)
    );
    const wasFramed = this.hasFramed;
    this.hasFramed = true;
    if (this.tween !== null && this.tween.target === null) {
      offsetInto(this.overviewPos, OVERVIEW_TARGET.lookAt, this.tween.toOffset);
    }
    if (this.focused === null && this.tween === null && this.manual === null) {
      // Resting on the overview: ease onto the new framing over FRAMING_DURATION
      // (a rotation or window resize reads as a settle, not a jump). The first
      // fit, and reduced motion, place the camera immediately.
      if (!wasFramed || this.reducedMotion) {
        this.framing = null;
        const p = this.overviewPos;
        this.camera.position.set(p.x, p.y, p.z);
        this.camera.lookAt(this.currentLook);
      } else {
        // Retarget from where the camera is now and restart the short ease. Timing
        // from the last frame (not a null start) means the next update already moves,
        // so a drag that resizes every frame never stalls at progress 0.
        const c = this.camera.position;
        this.framing = {
          from: { x: c.x, y: c.y, z: c.z },
          start: this.lastElapsed
        };
      }
    }
    this.onActivity();
  }

  /**
   * Advance the resize re-framing ease by one frame. Any gesture, flight or
   * focus takes over the camera, so the ease is dropped rather than fought.
   */
  private advanceFraming(elapsed: number): void {
    const f = this.framing;
    if (f === null) return;
    if (this.manual !== null || this.tween !== null || this.focused !== null) {
      this.framing = null;
      return;
    }
    if (f.start === null) f.start = elapsed;
    const k = framingProgress(elapsed, f.start);
    framingPosition(f.from, this.overviewPos, k, this.camera.position);
    this.camera.lookAt(this.currentLook);
    if (k >= 1) this.framing = null;
  }

  private startTween(toPos: Readonly<Vec3>, toLook: Readonly<Vec3>, target: BodyId | null): void {
    // A focus/overview command reclaims automatic control from manual orbit.
    // Clear any pending settle so a stale gesture can't emit after this click.
    this.framing = null;
    this.manual = null;
    this.fling = null;
    this.manualDirty = false;
    this.settleEmitted = false;
    this.onActivity();
    if (this.reducedMotion) {
      this.camera.position.set(toPos.x, toPos.y, toPos.z);
      this.currentLook.set(toLook.x, toLook.y, toLook.z);
      this.camera.lookAt(this.currentLook);
      this.setFocused(target);
      return;
    }
    // Re-clicking the body the camera is already anchored on: the flight only
    // re-centres a planet that is already in view, so keep its panel up.
    const alreadyThere = target !== null && target === this.focused;
    const fromLook = {
      x: this.currentLook.x,
      y: this.currentLook.y,
      z: this.currentLook.z
    };
    const fromOffset = cartesianToSpherical({
      x: this.camera.position.x - fromLook.x,
      y: this.camera.position.y - fromLook.y,
      z: this.camera.position.z - fromLook.z
    });
    const toOffset = offsetInto(toPos, toLook, { radius: 0, yaw: 0, pitch: 0 });
    const travel = Math.hypot(toLook.x - fromLook.x, toLook.y - fromLook.y, toLook.z - fromLook.z);
    this.tween = {
      fromLook,
      toLook: { x: toLook.x, y: toLook.y, z: toLook.z },
      fromOffset,
      toOffset,
      lift: flightLift(travel, fromOffset.radius, toOffset.radius),
      start: null,
      duration: flightDuration(travel, fromOffset.radius, toOffset.radius),
      target
    };
    // While the camera is flying, hide everything — no panel and no intro —
    // so nothing flashes mid-transition. The arrival handler shows the
    // destination's UI once the flight completes.
    this.focused = null;
    if (!alreadyThere) this.onFocusChange({ kind: "transition" });
  }

  /**
   * Whether update() still has camera motion to play out: a flight, a resize
   * re-framing, a fling, or a free gesture whose `settled` signal is still due.
   * Ride-along with a focused body moves only while the bodies do, which the
   * caller tracks. A render loop may stop drawing while this is false.
   */
  isAnimating(): boolean {
    return (
      this.tween !== null ||
      this.framing !== null ||
      this.fling !== null ||
      (this.manual !== null && !this.settleEmitted)
    );
  }

  /** Emit the arrived state for a destination (null target = the overview). */
  private setFocused(id: BodyId | null): void {
    this.focused = id;
    this.onFocusChange(id === null ? { kind: "overview" } : { kind: "focused", id });
  }

  /**
   * While in manual mode, watch for the gesture to stop. Each orbit/zoom/pan
   * event sets `manualDirty`, and `moving` is true while the springs or a
   * fling are still carrying the camera; either stamps the time. Once the
   * camera has held still for SETTLE_IDLE_SECONDS we emit `settled` exactly
   * once. The presenter restores the resting content on that signal — so the
   * text reappears when the camera fixes its coordinates, matching a click's
   * arrival.
   */
  private maybeSettle(elapsed: number, moving: boolean): void {
    if (this.manualDirty || moving) {
      this.lastManualEvent = elapsed;
      this.manualDirty = false;
      return;
    }
    if (!this.settleEmitted && elapsed - this.lastManualEvent >= SETTLE_IDLE_SECONDS) {
      this.settleEmitted = true;
      this.onFocusChange({ kind: "settled" });
    }
  }

  /**
   * Advance the camera for one frame. Call AFTER the caller has repositioned
   * bodies for this `elapsed`, so tween re-aim and ride-along use fresh
   * positions.
   */
  update(elapsed: number): void {
    const dt =
      this.lastElapsed === null ? 0 : Math.min(Math.max(elapsed - this.lastElapsed, 0), MAX_STEP);
    this.lastElapsed = elapsed;
    this.advanceFraming(elapsed);

    // Manual control: spring toward the gesture goals (and coast any fling).
    // Locked on a focused planet, the look center tracks the planet's live
    // position each frame, so the camera follows it from the user's chosen
    // angle/distance instead of freezing while the planet drifts off. Then
    // detect the end of the interaction: once the camera has fixed its
    // coordinates, emit `settled` so the resting content reappears on the
    // same beat a click's flight arrives — not on a timer started from the drag.
    if (this.manual !== null) {
      const moving = this.advanceManual(dt);
      this.maybeSettle(elapsed, moving);
      return;
    }
    const tw = this.tween;
    if (tw) {
      if (tw.start === null) tw.start = elapsed;
      // Re-aim the tween's end at the target's LIVE position so it keeps
      // orbiting during the fly-to and the camera arrives on the moving planet.
      const live = tw.target !== null ? this.resolveDestination(tw.target) : null;
      if (live) {
        // tw.toLook and tw.toOffset are tween-owned (created in startTween), so
        // both are overwritten in place rather than allocating every frame.
        tw.toLook.x = live.lookAt.x;
        tw.toLook.y = live.lookAt.y;
        tw.toLook.z = live.lookAt.z;
        offsetInto(live.position, live.lookAt, tw.toOffset);
      }
      // Reduced motion (or a switch to it mid-flight) lands the flight on its target at once.
      const raw = this.reducedMotion ? 1 : (elapsed - tw.start) / tw.duration;
      const t = Math.min(raw, 1);
      const k = easeInOutCubic(t);
      this.currentLook.set(
        lerp(tw.fromLook.x, tw.toLook.x, k),
        lerp(tw.fromLook.y, tw.toLook.y, k),
        lerp(tw.fromLook.z, tw.toLook.z, k)
      );
      // Radius eases in log space so a big zoom change reads as steady
      // travel, not a rush at one end; the lift arcs up and back mid-flight.
      const from = tw.fromOffset;
      const to = tw.toOffset;
      const off = sphericalToCartesianInto(
        Math.exp(
          lerp(Math.log(Math.max(from.radius, 1e-6)), Math.log(Math.max(to.radius, 1e-6)), k)
        ) +
          tw.lift * Math.sin(Math.PI * k),
        from.yaw + shortestAngle(from.yaw, to.yaw) * k,
        lerp(from.pitch, to.pitch, k),
        this.scratchOffset
      );
      this.camera.position.set(
        this.currentLook.x + off.x,
        this.currentLook.y + off.y,
        this.currentLook.z + off.z
      );
      this.camera.lookAt(this.currentLook);
      if (t >= 1) {
        this.tween = null;
        this.setFocused(tw.target);
      }
    } else if (this.focused !== null) {
      // Locked on a focused planet: ride along with it as it orbits, keeping
      // the same framing offset so the viewing window stays fixed on it.
      const dest = this.resolveDestination(this.focused);
      if (dest) {
        this.camera.position.set(dest.position.x, dest.position.y, dest.position.z);
        this.currentLook.set(dest.lookAt.x, dest.lookAt.y, dest.lookAt.z);
        this.camera.lookAt(this.currentLook);
      }
    }
  }
}

/** Axes of the look-target spring, hoisted so update() doesn't allocate. */
const LOOK_AXES = ["x", "y", "z"] as const;

/**
 * Allocation-free sphericalToCartesian: same formula, written into `out`.
 * Must stay numerically identical to orbit-math's sphericalToCartesian.
 */
function sphericalToCartesianInto(radius: number, yaw: number, pitch: number, out: Vec3): Vec3 {
  const cosPitch = Math.cos(pitch);
  out.x = radius * cosPitch * Math.sin(yaw);
  out.y = radius * Math.sin(pitch);
  out.z = radius * cosPitch * Math.cos(yaw);
  return out;
}

/**
 * The camera's spherical offset from its look target, written into `out`.
 * Same arithmetic as cartesianToSpherical(position - lookAt), without the
 * intermediate object.
 */
function offsetInto(position: Readonly<Vec3>, lookAt: Readonly<Vec3>, out: Spherical): Spherical {
  const x = position.x - lookAt.x;
  const y = position.y - lookAt.y;
  const z = position.z - lookAt.z;
  const radius = Math.hypot(x, y, z);
  if (radius === 0) {
    out.radius = 0;
    out.yaw = 0;
    out.pitch = 0;
    return out;
  }
  out.radius = radius;
  out.yaw = Math.atan2(x, z);
  out.pitch = Math.asin(Math.max(-1, Math.min(1, y / radius)));
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Keep a sprung value from overshooting past [lo, hi] — but only if it started
 * inside the range. A value that began outside (seeded from a camera placed
 * beyond a limit) is left to ease back in rather than snapping.
 */
function holdLimit(before: number, after: number, lo: number, hi: number): number {
  return Math.min(Math.max(after, Math.min(lo, before)), Math.max(hi, before));
}

/** A sprung scalar is at rest when it sits within `eps` of its goal and its
 *  velocity is below `eps * REST_VELOCITY_FACTOR`. */
function settled(value: number, goal: number, velocity: number, eps: number): boolean {
  return Math.abs(value - goal) < eps && Math.abs(velocity) < eps * REST_VELOCITY_FACTOR;
}
