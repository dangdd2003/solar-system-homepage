import * as THREE from "three";
import type { BodyId } from "./bodies";
import type { RevealHandle } from "./reveal-material";
import { discRadiusPx, smoothstep } from "./sun-halo";

type PlanetId = Exclude<BodyId, "sun">;

/** Reflected-light spill, deliberately much dimmer and broader than pointer feedback. */
export const PLANET_HALO_STYLES: Readonly<Record<PlanetId, { color: number; gain: number }>> = {
  mercury: { color: 0xd5c4a8, gain: 0.18 },
  venus: { color: 0xf6dba2, gain: 0.27 },
  earth: { color: 0x8dbbff, gain: 0.29 },
  mars: { color: 0xe8a078, gain: 0.23 },
  jupiter: { color: 0xeac39b, gain: 0.26 },
  saturn: { color: 0xf1d49c, gain: 0.27 },
  uranus: { color: 0xa4e1e6, gain: 0.27 },
  neptune: { color: 0x8caeff, gain: 0.29 },
  moon: { color: 0xd7d9e4, gain: 0.18 }
};

/** Distance is measured in body radii so the Moon and gas giants share the same zoom curve. */
const NEAR_DISTANCE_RADII = 4;
const FAR_DISTANCE_RADII = 80;
const NEAR_WIDTH_FRACTION = 0.22;
const FAR_WIDTH_FRACTION = 0.38;
const WIDTH_CAP_PX = 28;
const WIDTH_FLOOR_PX = 4.5;

export interface PlanetHaloMetrics {
  widthPx: number;
  widthWorld: number;
  visibility: number;
  gainScale: number;
}

/**
 * Like the Sun: gentle logarithmic distance gain, a screen-space width floor/cap,
 * and large-disc dimming. Exact perspective inversion keeps close views thin.
 */
export function planetHaloMetrics(
  radius: number,
  distance: number,
  viewportHeight: number,
  fov: number,
  out: PlanetHaloMetrics = { widthPx: 0, widthWorld: 0, visibility: 0, gainScale: 0 }
): PlanetHaloMetrics {
  if (radius <= 0 || distance <= radius || viewportHeight <= 0) {
    out.widthPx = 0;
    out.widthWorld = 0;
    out.visibility = 0;
    out.gainScale = 0;
    return out;
  }
  const discPx = discRadiusPx(radius, distance, viewportHeight, fov);
  const far = smoothstep(
    Math.log(NEAR_DISTANCE_RADII),
    Math.log(FAR_DISTANCE_RADII),
    Math.log(distance / radius)
  );
  const widthFraction = THREE.MathUtils.lerp(NEAR_WIDTH_FRACTION, FAR_WIDTH_FRACTION, far);
  const floor = WIDTH_FLOOR_PX * smoothstep(0, 8, discPx);
  const widthPx = Math.min(
    WIDTH_CAP_PX,
    viewportHeight * 0.08,
    Math.max(floor, discPx * widthFraction)
  );
  const focalPx = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  const outerRadius = distance * Math.sin(Math.atan((discPx + widthPx) / focalPx));
  out.widthPx = widthPx;
  out.widthWorld = Math.max(0, outerRadius - radius);
  // Only subpixel bodies fade away; ordinary overview planets keep their light.
  out.visibility = smoothstep(0, 3.5, discPx);
  const largeDiscDim = 0.4 * smoothstep(viewportHeight * 0.35, viewportHeight * 0.8, discPx);
  out.gainScale = THREE.MathUtils.lerp(0.62, 1, far) * (1 - largeDiscDim);
  return out;
}

/** Broad shoulder plus a longer, fainter tail; no narrow bright edge component. */
export function planetHaloFalloff(height: number): number {
  const h = Math.max(0, height);
  return (0.78 * Math.exp(-5 * h * h) + 0.22 * Math.exp(-2.8 * h)) * (1 - smoothstep(0.65, 1, h));
}

const VERTEX = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vCenter;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vCenter = modelMatrix[3].xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
uniform float uRadius;
uniform float uWidth;
varying vec3 vWorldPosition;
varying vec3 vCenter;
void main() {
  vec3 ray = normalize(vWorldPosition - cameraPosition);
  vec3 toCenter = vCenter - cameraPosition;
  vec3 closest = ray * dot(toCenter, ray) - toCenter;
  float impact = length(closest);
  float height = max(0.0, (impact - uRadius) / max(uWidth, 0.000001));
  if (height >= 1.0 || uGain <= 0.0) discard;

  // A broad optical veil rather than a thin atmosphere: light wraps softly around the body.
  vec3 sunDirection = -vCenter / max(length(vCenter), 0.000001);
  float sunFacing = dot(closest / max(impact, 0.000001), sunDirection);
  float illumination = 0.74 + 0.26 * smoothstep(-0.65, 0.65, sunFacing);
  float profile = (0.78 * exp(-5.0 * height * height) + 0.22 * exp(-2.8 * height))
    * (1.0 - smoothstep(0.65, 1.0, height));
  gl_FragColor = vec4(uColor, profile * illumination * uGain);
  #include <colorspace_fragment>
}
`;

/**
 * A soft world-anchored halo hidden by the opaque surface, with no motion or hover coupling.
 * The shell follows its parent's orbit, spin and entrance; normal scene disposal frees it.
 */
export function attachPlanetHalo(
  body: THREE.Mesh,
  id: PlanetId,
  radius: number,
  segments: number,
  reveal: RevealHandle
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const style = PLANET_HALO_STYLES[id];
  const uniforms = {
    uColor: { value: new THREE.Color(style.color) },
    uRadius: { value: radius },
    uWidth: { value: 0 },
    uGain: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, Math.max(32, segments), Math.max(24, segments)),
    material
  );
  shell.name = `${id}-halo`;
  shell.raycast = () => {};
  // Size is updated after frustum traversal and immediately before the object is drawn.
  shell.frustumCulled = false;
  body.add(shell);

  let progress = 0;
  const setProgress = reveal.setProgress;
  reveal.setProgress = (value) => {
    setProgress(value);
    progress = THREE.MathUtils.clamp(value, 0, 1);
  };
  const size = new THREE.Vector2();
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const metrics: PlanetHaloMetrics = { widthPx: 0, widthWorld: 0, visibility: 0, gainScale: 0 };
  shell.onBeforeRender = (renderer, _scene, camera) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      uniforms.uGain.value = 0;
      return;
    }
    renderer.getSize(size);
    body.getWorldPosition(center);
    // Not getWorldScale: since three 0.187 it reports a zero-scaled body as scale 1.
    body.updateWorldMatrix(true, false);
    scale.setFromMatrixScale(body.matrixWorld);
    const worldRadius = radius * Math.max(scale.x, scale.y, scale.z);
    const distance = camera.getWorldPosition(cameraPosition).distanceTo(center);
    // Frame height, not canvas height: the canvas may bleed below the frame (CameraRig.setFrame).
    const frameHeight = camera.view?.enabled
      ? (camera.view.fullHeight * size.y) / camera.view.height
      : size.y;
    planetHaloMetrics(worldRadius, distance, frameHeight, camera.getEffectiveFOV(), metrics);
    uniforms.uRadius.value = worldRadius;
    uniforms.uWidth.value = metrics.widthWorld;
    // Flat bodies retain a faint halo if their texture is pending or unavailable.
    // Entrance growth must not brighten an unfinished body by making distance/radius read farther.
    const entrance = Math.min(1, worldRadius / radius);
    uniforms.uGain.value =
      style.gain * (0.25 + 0.75 * progress) * metrics.visibility * metrics.gainScale * entrance;
    shell.scale.setScalar(worldRadius > 0 ? (1 + metrics.widthWorld / worldRadius) * 1.015 : 1);
    shell.updateMatrixWorld(true);
  };
  return shell;
}
