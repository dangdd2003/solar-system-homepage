import type { BodyConfig } from "./bodies";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraTarget {
  position: Vec3;
  lookAt: Vec3;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function cameraTargetForInto(
  body: BodyConfig,
  bodyPos: Readonly<{ x: number; y?: number | undefined; z: number }>,
  out: CameraTarget
): CameraTarget {
  const d = body.framingDistance;
  // The body may sit above/below the ecliptic on its inclined orbit; frame it
  // at its real height so the camera looks straight at it, not at y=0.
  const bodyY = bodyPos.y ?? 0;
  // Offset the camera toward +z and slightly +y, framing the body from a
  // consistent, slightly-elevated angle. Split across z and y so the
  // magnitude equals framingDistance exactly.
  const zPart = d * Math.cos(Math.PI / 6);
  const yPart = d * Math.sin(Math.PI / 6);
  out.position.x = bodyPos.x;
  out.position.y = bodyY + yPart;
  out.position.z = bodyPos.z + zPart;
  out.lookAt.x = bodyPos.x;
  out.lookAt.y = bodyY;
  out.lookAt.z = bodyPos.z;
  return out;
}

export function cameraTargetFor(
  body: BodyConfig,
  bodyPos: Readonly<{ x: number; y?: number | undefined; z: number }>
): CameraTarget {
  return cameraTargetForInto(body, bodyPos, {
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 }
  });
}

// Framed to fit the whole system in view (outermost orbit ≈ 70 scene units).
// Read-only: callers copy these coordinates rather than holding the objects.
export const OVERVIEW_TARGET: {
  readonly position: Readonly<Vec3>;
  readonly lookAt: Readonly<Vec3>;
} = {
  position: { x: 0, y: 82, z: 98 },
  lookAt: { x: 0, y: 0, z: 0 }
};

/** Half-width (scene units) the overview must keep in view: outermost orbit plus a body-size margin. */
const OVERVIEW_HALF_WIDTH = 77;
/** Vertical field of view of the rig camera (camera-rig.ts), in degrees. */
const RIG_FOV_DEG = 55;

/**
 * Overview camera position for a viewport aspect (width / height). Wide screens
 * keep OVERVIEW_TARGET exactly. Narrow ones (portrait phones, very tall
 * windows) move the camera back just far enough that the outermost orbit still
 * fits horizontally, since the vertical field of view alone leaves it cropped.
 * Never moves the camera closer than the target.
 */
export function overviewPositionFor(aspect: number): Vec3 {
  const base = OVERVIEW_TARGET.position;
  if (!Number.isFinite(aspect) || aspect <= 0) return { x: base.x, y: base.y, z: base.z };
  const halfTanH = Math.tan((RIG_FOV_DEG * Math.PI) / 360) * aspect;
  const baseDist = Math.hypot(base.x, base.y, base.z);
  const k = Math.max(1, OVERVIEW_HALF_WIDTH / halfTanH / baseDist);
  return { x: base.x * k, y: base.y * k, z: base.z * k };
}
