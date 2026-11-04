import * as THREE from "three";

/**
 * The soft glow that hugs the body under the pointer in orbit mode.
 *
 * A real 3D shell (sphere) around the body, not a flat sprite: for each pixel
 * the shader measures how close its view ray passes to the body's surface and
 * fades the glow out over a few screen pixels beyond it. So the glow traces
 * the body's true projected outline from any angle — including the oval that
 * perspective makes of a sphere near the edge of the view. The body itself
 * hides the part of the shell behind it, leaving only the rim.
 */
export interface HoverGlow {
  /** Add THIS to the scene. Hidden while nothing is hovered. */
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /**
   * Glow around `target`, in `color`'s hue, fading in. `radius` is the body's own sphere radius
   * (unscaled); the glow follows the target's world scale, so it shrinks with a body still growing in.
   */
  show: (target: THREE.Object3D, radius: number, color: number) => void;
  /** Fade the glow out. */
  hide: () => void;
  /** Per-frame: follow the target and its scale, keep the glow's screen width, advance the fade. */
  update: (camera: THREE.PerspectiveCamera, deltaSec: number, viewportHeight: number) => void;
  /** Follow a live change to the reduced-motion setting. */
  setReducedMotion: (reduced: boolean) => void;
  /** True while a fade in or out is still running, so update() must keep being called. */
  isAnimating: () => boolean;
}

export interface HoverGlowOptions {
  reducedMotion: boolean;
}

/** How far the glow reaches past the body's edge, in CSS pixels. */
const GLOW_WIDTH_PX = 7;
/** Alpha right at the body's edge; the glow fades out from here. */
const GLOW_PEAK_ALPHA = 0.75;
const FADE_SECONDS = 0.15;
/** Headroom so the tessellated shell never clips the glow's faint outer tail. */
const SHELL_MARGIN = 1.03;

const GLOW_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vCenter;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vCenter = modelMatrix[3].xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// b = closest distance between this pixel's view ray and the body's centre.
// b == uRadius exactly on the body's silhouette, whatever the perspective.
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRadius;
uniform float uWidth;
varying vec3 vWorldPos;
varying vec3 vCenter;

void main() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec3 toCenter = vCenter - cameraPosition;
  float b = length(toCenter - dir * dot(toCenter, dir));
  float t = (b - uRadius) / uWidth;
  if (t >= 1.0) discard;
  // Full strength inside the silhouette too (the body hides it), so there is
  // no seam where the glow meets the body's antialiased edge.
  float falloff = 1.0 - clamp(t, 0.0, 1.0);
  gl_FragColor = vec4(uColor, falloff * falloff * uOpacity * ${GLOW_PEAK_ALPHA.toFixed(2)});
  #include <colorspace_fragment>
}
`;

/** World radius of a body's own sphere, ignoring children such as Saturn's rings. */
export function bodyRadiusOf(body: THREE.Mesh): number {
  const geo = body.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  return geo.boundingSphere?.radius ?? 0;
}

export function createHoverGlow(opts: HoverGlowOptions): HoverGlow {
  const uniforms = {
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0 },
    uRadius: { value: 1 },
    uWidth: { value: 1 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  mesh.visible = false;
  // Decoration only: never intercept picking.
  mesh.raycast = () => {};

  const cameraPos = new THREE.Vector3();
  const targetScale = new THREE.Vector3();
  let target: THREE.Object3D | null = null;
  let radius = 0;
  let shown = false;
  let fade = 0;
  let reducedMotion = opts.reducedMotion;

  return {
    mesh,
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    show(nextTarget, nextRadius, color) {
      target = nextTarget;
      radius = nextRadius;
      shown = true;
      // Same hue at full brightness, so dark body colours don't glow muddy.
      const tint = uniforms.uColor.value.setHex(color);
      const peak = Math.max(tint.r, tint.g, tint.b);
      if (peak > 0) tint.multiplyScalar(1 / peak);
    },
    hide() {
      shown = false;
    },
    isAnimating() {
      return fade !== (shown ? 1 : 0);
    },
    update(camera, deltaSec, viewportHeight) {
      const goal = shown ? 1 : 0;
      fade = reducedMotion
        ? goal
        : goal > fade
          ? Math.min(goal, fade + deltaSec / FADE_SECONDS)
          : Math.max(goal, fade - deltaSec / FADE_SECONDS);
      uniforms.uOpacity.value = fade;

      mesh.visible = fade > 0 && target !== null;
      if (!mesh.visible || !target) return;
      target.getWorldPosition(mesh.position);
      // The body's world radius: the sphere is scaled by its entrance grow-in (1 once grown).
      // Not getWorldScale: since three 0.187 it reports a zero-scaled body as scale 1.
      target.updateWorldMatrix(true, false);
      targetScale.setFromMatrixScale(target.matrixWorld);
      const worldRadius = radius * Math.max(targetScale.x, targetScale.y, targetScale.z);

      // Convert the pixel width to world units at the body's distance.
      const distance = camera.getWorldPosition(cameraPos).distanceTo(mesh.position);
      const worldPerPx =
        (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
        Math.max(1, viewportHeight);
      const width = GLOW_WIDTH_PX * worldPerPx;
      uniforms.uRadius.value = worldRadius;
      uniforms.uWidth.value = width;
      mesh.scale.setScalar((worldRadius + width) * SHELL_MARGIN);
    }
  };
}
