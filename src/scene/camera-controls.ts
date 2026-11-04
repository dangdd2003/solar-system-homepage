import type { CameraRig } from "./camera-rig";
import { VelocityTracker } from "./camera-motion";

/** A live pointer tracked for pinch detection. */
interface PointerState {
  x: number;
  y: number;
  moved: boolean;
}

/** Midpoint, distance and the two pointers of a two-finger touch. */
interface PinchGeometry {
  dist: number;
  midX: number;
  midY: number;
  p1: PointerState;
  p2: PointerState;
}

export interface CameraControlsOptions {
  canvas: HTMLCanvasElement;
  rig: CameraRig;
  /** Called on a click that did NOT drag (movement under the threshold). */
  onTap?: ((clientX: number, clientY: number) => void) | undefined;
  /** Called on pointer move so the caller can update the hover cursor. */
  onHover?: ((clientX: number, clientY: number) => void) | undefined;
  /** Called when hovering stops: the pointer leaves, a drag starts, or controls are disabled. */
  onHoverEnd?: (() => void) | undefined;
}

/**
 * Pointer/wheel/touch input for the camera. Lives on the canvas element only,
 * so page content (which sits above the fixed canvas) keeps its own events.
 *
 * Gestures:
 *   - left-button drag        → orbit (rig.orbit) with momentum fling on release
 *   - right-button drag       → pan   (rig.pan) — moves the look center with momentum fling
 *   - wheel                   → zoom  (rig.zoom) with deltaMode normalization
 *   - two-finger pinch        → zoom  (rig.zoom)
 *   - two-finger pan          → pan   (rig.pan) with momentum fling on release
 * A left press that never crosses the drag threshold is treated as a tap and
 * passed to onTap (click-to-focus); a right-button drag never taps. Hover moves
 * (no button) go to onHover for the cursor; onHoverEnd fires when hovering
 * stops (pointer leaves, a drag starts, controls disabled). Wheel events are
 * normalized for deltaMode: 1 (lines) multiplied by WHEEL_LINE_PX, 2 (pages) by
 * WHEEL_PAGE_PX, and clamped to ±WHEEL_MAX_DELTA per event. All math lives in the rig — this is a thin adapter.
 */
export class CameraControls {
  private readonly canvas: HTMLCanvasElement;
  private readonly rig: CameraRig;
  private readonly onTap: CameraControlsOptions["onTap"];
  private readonly onHover: CameraControlsOptions["onHover"];
  private readonly onHoverEnd: CameraControlsOptions["onHoverEnd"];
  private enabled = true;

  // Active single-pointer drag state.
  private dragPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  // Whether this press has moved far enough to count as a drag (vs a tap).
  private moved = false;
  private downX = 0;
  private downY = 0;
  // Which gesture the active drag performs: "orbit" (left button / touch) or
  // "pan" (right button). Panning moves the look center instead of rotating.
  private dragMode: "orbit" | "pan" = "orbit";

  // Live pointers, for pinch detection (touch). Keyed by pointerId.
  private readonly pointers = new Map<number, PointerState>();
  // Reused every pointer move so pinch detection doesn't allocate per event.
  private readonly pinchScratch: PinchGeometry = {
    dist: 0,
    midX: 0,
    midY: 0,
    p1: { x: 0, y: 0, moved: false },
    p2: { x: 0, y: 0, moved: false }
  };
  private pinchDistance = 0;
  private pinchMidX = 0;
  private pinchMidY = 0;
  private startPinchDistance = 0;
  private startPinchMidX = 0;
  private startPinchMidY = 0;
  private startP1 = { x: 0, y: 0 };
  private startP2 = { x: 0, y: 0 };
  // Disambiguates whether a 2-finger touch gesture is zooming or panning.
  // Only 1 action is permitted per two-finger touch interaction.
  private twoFingerMode: "undecided" | "zoom" | "pan" = "undecided";

  // Hover animation frame throttle so high-frequency mouse polling doesn't thrash raycasting.
  private hoverRafId: number | null = null;
  private pendingHoverX = 0;
  private pendingHoverY = 0;
  private readonly flushHover = (): void => {
    this.hoverRafId = null;
    this.onHover?.(this.pendingHoverX, this.pendingHoverY);
  };

  // Velocity tracking for fling momentum on drag release.
  private readonly tracker = new VelocityTracker();

  /** Pixels of movement before a press becomes a drag rather than a tap. */
  private static readonly DRAG_THRESHOLD = 6;

  /** Pixels per wheel line (deltaMode 1), used to normalize line-based wheel deltas. */
  private static readonly WHEEL_LINE_PX = 33;
  /** Pixels per wheel page (deltaMode 2), used to normalize page-based wheel deltas. */
  private static readonly WHEEL_PAGE_PX = 800;
  /** Maximum absolute zoom delta applied from a single wheel event. */
  private static readonly WHEEL_MAX_DELTA = 250;

  /** Extract event time in seconds, falling back to performance.now() if timeStamp is missing. */
  private getEventTimeSeconds(e: { timeStamp?: number }): number {
    const ts = typeof e.timeStamp === "number" && e.timeStamp > 0 ? e.timeStamp : performance.now();
    return ts / 1000;
  }

  constructor(opts: CameraControlsOptions) {
    this.canvas = opts.canvas;
    this.rig = opts.rig;
    this.onTap = opts.onTap;
    this.onHover = opts.onHover;
    this.onHoverEnd = opts.onHoverEnd;

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    // Suppress the browser context menu so a right-drag pan isn't interrupted.
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.endHover();
      this.dragPointerId = null;
      this.pointers.clear();
      this.resetTwoFingerState();
      this.moved = false;
      this.tracker.reset(this.getEventTimeSeconds({}));
      if (this.canvas.style) {
        this.canvas.style.cursor = "default";
      }
    }
  }

  /** Drop any pending hover callback and tell the caller hovering has stopped. */
  private endHover(): void {
    this.cancelHoverFrame();
    this.onHoverEnd?.();
  }

  private cancelHoverFrame(): void {
    if (this.hoverRafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.hoverRafId);
    }
    this.hoverRafId = null;
  }

  private resetTwoFingerState(): void {
    this.pinchDistance = 0;
    this.pinchMidX = 0;
    this.pinchMidY = 0;
    this.startPinchDistance = 0;
    this.startPinchMidX = 0;
    this.startPinchMidY = 0;
    this.startP1 = { x: 0, y: 0 };
    this.startP2 = { x: 0, y: 0 };
    this.twoFingerMode = "undecided";
  }

  /** Seed the pinch baseline from the pointers down now: a new two-finger gesture starts here. */
  private beginTwoFingerGesture(e: PointerEvent): void {
    this.tracker.reset(this.getEventTimeSeconds(e));
    const geom = this.getPinchGeometry();
    if (geom) {
      this.pinchDistance = geom.dist;
      this.startPinchDistance = geom.dist;
      this.pinchMidX = geom.midX;
      this.pinchMidY = geom.midY;
      this.startPinchMidX = geom.midX;
      this.startPinchMidY = geom.midY;
      this.startP1 = { x: geom.p1.x, y: geom.p1.y };
      this.startP2 = { x: geom.p2.x, y: geom.p2.y };
    }
    this.twoFingerMode = "undecided";
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });

    if (this.pointers.size === 2) {
      // Second finger down: begin two-finger gesture detection, end any single-pointer drag.
      this.dragPointerId = null;
      this.beginTwoFingerGesture(e);
      return;
    }

    // A third or later contact (a resting palm, a stray finger) neither drags nor
    // taps. It is ignored until it lifts, and the pinch in progress carries on.
    if (this.pointers.size > 2) {
      this.dragPointerId = null;
      return;
    }

    // First pointer: start a potential drag / tap. The right button pans; every
    // other button (and touch, where button is 0) orbits.
    this.rig.grab();
    this.tracker.reset(this.getEventTimeSeconds(e));
    this.dragPointerId = e.pointerId;
    this.dragMode = e.button === 2 ? "pan" : "orbit";
    this.downX = e.clientX;
    this.lastX = e.clientX;
    this.downY = e.clientY;
    this.lastY = e.clientY;
    this.moved = false;
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const tracked = this.pointers.get(e.pointerId);
    if (tracked) {
      tracked.x = e.clientX;
      tracked.y = e.clientY;
      tracked.moved = true;
    }

    // Two-finger gesture: detect intent (zoom vs pan), then execute ONLY that action.
    if (this.pointers.size >= 2) {
      const geom = this.getPinchGeometry();
      if (!geom) return;

      const dist = geom.dist;
      const midX = geom.midX;
      const midY = geom.midY;

      // Wait until both pointers have had a move event before classifying
      let allPointersMoved = true;
      for (const p of this.pointers.values()) {
        if (!p.moved) {
          allPointersMoved = false;
          break;
        }
      }

      if (this.twoFingerMode === "undecided" && allPointersMoved) {
        const v1 = { x: geom.p1.x - this.startP1.x, y: geom.p1.y - this.startP1.y };
        const v2 = { x: geom.p2.x - this.startP2.x, y: geom.p2.y - this.startP2.y };
        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        const pinchDelta = Math.abs(dist - this.startPinchDistance);

        if (len1 >= CameraControls.DRAG_THRESHOLD && len2 >= CameraControls.DRAG_THRESHOLD) {
          const dot = v1.x * v2.x + v1.y * v2.y;
          this.twoFingerMode = dot > 0 ? "pan" : "zoom";
        } else if (
          (len1 >= CameraControls.DRAG_THRESHOLD || len2 >= CameraControls.DRAG_THRESHOLD) &&
          pinchDelta >= CameraControls.DRAG_THRESHOLD
        ) {
          // Symmetric anchored pinch: either finger moved past threshold while other stayed stationary
          this.twoFingerMode = "zoom";
        }

        if (this.twoFingerMode === "pan") {
          const dx = midX - this.startPinchMidX;
          const dy = midY - this.startPinchMidY;
          if (dx !== 0 || dy !== 0) {
            this.rig.pan(dx, dy);
            this.tracker.add(this.getEventTimeSeconds(e), dx, dy);
          }
        } else if (this.twoFingerMode === "zoom") {
          const deltaDist = this.startPinchDistance - dist;
          if (deltaDist !== 0) {
            this.rig.zoom(deltaDist);
          }
        }
      } else if (this.twoFingerMode === "pan") {
        const dx = midX - this.pinchMidX;
        const dy = midY - this.pinchMidY;
        if (dx !== 0 || dy !== 0) {
          this.rig.pan(dx, dy);
          this.tracker.add(this.getEventTimeSeconds(e), dx, dy);
        }
      } else if (this.twoFingerMode === "zoom") {
        const deltaDist = this.pinchDistance - dist;
        if (deltaDist !== 0) {
          this.rig.zoom(deltaDist);
        }
      }

      this.pinchDistance = dist;
      this.pinchMidX = midX;
      this.pinchMidY = midY;
      return;
    }

    // Single-pointer drag → orbit.
    if (this.dragPointerId === e.pointerId) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (
        !this.moved &&
        Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > CameraControls.DRAG_THRESHOLD
      ) {
        this.moved = true;
        this.endHover();
      }
      if (this.moved) {
        if (this.dragMode === "pan") this.rig.pan(dx, dy);
        else this.rig.orbit(dx, dy);
        this.tracker.add(this.getEventTimeSeconds(e), dx, dy);
      }
      return;
    }

    // No button held: throttle hover via requestAnimationFrame so high polling rates don't thrash raycasting.
    if (this.onHover) {
      this.pendingHoverX = e.clientX;
      this.pendingHoverY = e.clientY;
      if (this.hoverRafId === null && typeof window !== "undefined") {
        this.hoverRafId = window.requestAnimationFrame(this.flushHover);
      }
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.enabled) {
      // Disabled: drop the pointer and its drag state without emitting any
      // camera motion, tap, or hover, so nothing is left stuck for re-enable.
      this.pointers.delete(e.pointerId);
      this.canvas.releasePointerCapture?.(e.pointerId);
      if (this.dragPointerId === e.pointerId) {
        this.dragPointerId = null;
        this.moved = false;
      }
      if (this.pointers.size < 2) this.resetTwoFingerState();
      return;
    }
    const wasDrag = this.dragPointerId === e.pointerId;
    const sizeBefore = this.pointers.size;
    // getPinchGeometry() pinches the first two pointers in insertion order. Removing
    // one of them swaps the pair, so the pinch must re-baseline or the new pair's
    // distance and midpoint would read as a jump.
    const removedPinchMember = this.isPinchPointer(e.pointerId);
    // A cancelled gesture (the browser took the pointer) stops dead: no fling
    // and no tap.
    const completed = e.type !== "pointercancel";
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);

    if (this.pointers.size < 2) {
      this.resetTwoFingerState();
      // One finger of a two-finger gesture lifted and the other is still down: that
      // finger takes over as an orbit drag. It starts from where it is, so it neither
      // freezes nor becomes a tap. The survivor's grab() below cancels any coast, so a
      // two-finger pan does not release momentum when one finger lifts.
      const next = this.pointers.entries().next();
      if (!next.done) {
        const [survivorId, survivor] = next.value;
        this.dragPointerId = survivorId;
        this.dragMode = "orbit";
        this.rig.grab();
        this.tracker.reset(this.getEventTimeSeconds(e));
        this.downX = survivor.x;
        this.lastX = survivor.x;
        this.downY = survivor.y;
        this.lastY = survivor.y;
        this.moved = true;
        this.canvas.setPointerCapture?.(survivorId);
      }
    } else if ((completed && sizeBefore === 3) || removedPinchMember) {
      // A contact lifted and the pinch goes on with the remaining fingers: from a fresh
      // baseline, so the change in geometry (a third finger leaving, or the pinched pair
      // swapping) does not read as a zoom or pan.
      this.beginTwoFingerGesture(e);
    }

    if (wasDrag) {
      this.dragPointerId = null;
      if (this.moved) {
        // Release momentum from single-pointer drag.
        if (completed) {
          const vel = this.tracker.velocity(this.getEventTimeSeconds(e));
          this.rig.release(this.dragMode, vel.vx, vel.vy);
        }
      } else {
        // A left press that never crossed the threshold is a tap → click-to-focus.
        // A right-button press is a pan gesture and never focuses, even if still.
        if (completed && this.dragMode === "orbit") this.onTap?.(e.clientX, e.clientY);
      }
    }
  };

  private readonly onPointerLeave = (): void => {
    if (!this.enabled) return;
    this.endHover();
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    if (!this.enabled) return;
    // The right button is our pan gesture; keep the native menu from popping up.
    e.preventDefault();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    // The canvas is a fixed full-screen background with no scrollable content,
    // so the wheel is ours to consume for zoom.
    e.preventDefault();
    // Normalize deltaMode: 1 (lines) → ×WHEEL_LINE_PX, 2 (pages) → ×WHEEL_PAGE_PX, 0/undefined → unchanged.
    const scale =
      e.deltaMode === 1
        ? CameraControls.WHEEL_LINE_PX
        : e.deltaMode === 2
          ? CameraControls.WHEEL_PAGE_PX
          : 1;
    // Clamp per-event delta to ±WHEEL_MAX_DELTA so large wheel notches don't jump too far.
    const max = CameraControls.WHEEL_MAX_DELTA;
    const delta = Math.max(-max, Math.min(max, e.deltaY * scale));
    this.rig.zoom(delta);
  };

  /** True when the pointer is one of the two that getPinchGeometry() measures. */
  private isPinchPointer(pointerId: number): boolean {
    const iter = this.pointers.keys();
    const first = iter.next();
    const second = iter.next();
    return first.value === pointerId || (!second.done && second.value === pointerId);
  }

  /** Returns the shared scratch geometry; valid only until the next call. */
  private getPinchGeometry(): PinchGeometry | null {
    const iter = this.pointers.values();
    const p1 = iter.next().value;
    const p2 = iter.next().value;
    if (!p1 || !p2) return null;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const geom = this.pinchScratch;
    geom.dist = Math.hypot(dx, dy);
    geom.midX = (p1.x + p2.x) * 0.5;
    geom.midY = (p1.y + p2.y) * 0.5;
    geom.p1 = p1;
    geom.p2 = p2;
    return geom;
  }

  dispose(): void {
    this.cancelHoverFrame();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }
}
