import * as THREE from "three";
import { SIMPLEX_3D_GLSL } from "./noise-glsl";
import { releasePlaceholder, solidTexture } from "./solid-texture";
import { SUN_CONVECTION_GLSL } from "./sun-convection-glsl";
import { SUN_OPTICS_GLSL } from "./sun-optics-glsl";
import { haloReachesViewport, type SunHaloMetrics, sunHaloMetrics } from "./sun-halo";

/**
 * The Sun as a living star rather than a flat sphere, plus the light it scatters into the sky.
 * Two layers. The photosphere is a ShaderMaterial built from two chunks. Convection draws a few
 * broad, slow swirls of glowing plasma, with the equator turning faster than the poles; optics
 * maps that heat through a warm blackbody-like ramp whose white-gold crest matches the startup
 * glare, then applies a softened, wavelength-dependent limb darkening. Real physics, tuned a
 * little past real: warmer, smoother and more luminous, with no spots or fine grain. When the
 * installed sun texture loads it is multiplied in at full strength, as before.
 *
 * The photosphere's animation stays strictly ON its own surface; the disc never pulses as a whole,
 * only the surface itself evolves. The halo is a separate additive shell (`haloMesh`) that draws
 * the light scattered beyond the limb. It is a sibling of the group, not a child, so the group's
 * entrance scale does not leak into it. Its width and brightness follow the camera's zoom (see
 * sun-halo.ts), so the Sun keeps a steady, premium glow from the framing distance out to the
 * whole-system view. Depth does the occlusion: planets in front of the Sun hide it, and it veils
 * bodies behind the Sun on purpose, since the light it scatters lies between the camera and them.
 * During a solar eclipse the Moon's disc hides the photosphere the same way, while the halo beyond
 * the Moon stays at full strength, like the corona in totality. That is deliberate, so eclipses do
 * not dim it. The halo is hidden whenever it cannot reach the screen, such as when the disc fills the
 * view and the glow lies wholly off-screen.
 *
 * Unlit (self-luminous), so the scene's lights never touch it — matching the old MeshBasicMaterial
 * sun, just alive. Motion is driven by a single `update(time)`; freezing time (reduced motion)
 * leaves a static star. The halo has no time dependence of its own.
 */
export interface AnimatedSun {
  /** Add THIS to the scene. Wraps the photosphere so callers add one object. */
  group: THREE.Group;
  /** The photosphere mesh — carries userData.bodyId for picking/focus. */
  mesh: THREE.Mesh;
  /**
   * The halo shell: additive light scattered past the limb. A sibling of `group`, not a child, so
   * the caller adds it to the scene beside the group. Decoration only: never picked.
   */
  haloMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  /** Advance all animated uniforms to scene time `t` (seconds). */
  update: (t: number) => void;
  /**
   * Per-frame halo update: size the halo for the camera's distance and the viewport, follow the
   * Sun's entrance scale and reveal, and hide the shell while the halo cannot reach the screen.
   * Call after the rig has moved the camera.
   */
  updateHalo: (camera: THREE.PerspectiveCamera, viewportHeightCss: number) => void;
  /** Feed the streamed NASA surface map into the photosphere shader. Does not change the reveal. */
  setSurfaceMap: (tex: THREE.Texture) => void;
  /** How much of the surface map is in: 0 leaves the procedural colour as it is, 1 multiplies the map in fully. */
  setReveal: (progress: number) => void;
  /**
   * Light the halo fully without touching the surface reveal: the glow belongs to the star, not to
   * its map, so a Sun whose map never arrives still shines. Called when the surface will not reveal.
   */
  igniteHalo: () => void;
}

/**
 * The photosphere's dominant rendered tone (the hot ramp's mid orange below).
 * Its config colour is a paler yellow, so UI accents that should match what
 * the visitor sees (the hover glow) use this instead.
 */
export const SUN_SURFACE_COLOR = 0xff6b0d;

// --- Photosphere. Vertex passes the local position (for solid 3D noise, so the
// pattern wraps the sphere seamlessly) plus data for limb darkening.
const PHOTOSPHERE_VERT = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vLocalPos = position;
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// Convection gives the heat field, optics turns heat into colour and darkens
// the limb. `detail` fades the plasma's inner octave once its bands span only
// a few pixels, so a distant Sun never shimmers and skips that cost.
const PHOTOSPHERE_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uMap;
uniform float uReveal;
varying vec3 vLocalPos;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec3 dir = normalize(vLocalPos);
  float mu = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
  // Size of the plasma's inner bands on screen, with the limb's foreshortening
  // taken out of the pixel footprint, so the whole disc shares one level of
  // detail; it is 1 from ~6px up.
  float footprint = length(fwidth(vLocalPos)) * max(mu, 0.2);
  float bandPx = length(vLocalPos) / (SUN_CONV_PLASMA_SCALE * 6.0) / max(footprint, 1e-6);
  float detail = smoothstep(1.5, 6.0, bandPx);

  // Biased warm: the disc sits in amber-gold rather than deep orange.
  float heat = sunConvection(dir, uTime, detail) + 0.08;

  vec3 color = sunTemperature(clamp(heat, 0.0, 1.0));
  // The installed sun texture is the surface: multiplied in at full strength
  // (as before), so its real detail rides on the live plasma. uReveal scales
  // the multiply in: 0 leaves the procedural colour untouched.
  vec3 tex = texture2D(uMap, vUv).rgb;
  color *= mix(vec3(1.0), 0.55 + 0.9 * tex, uReveal);
  // A soft inner radiance toward the disc centre: a touch beyond real.
  color += vec3(1.0, 0.78, 0.42) * 0.1 * pow(mu, 2.5);
  // Softened limb darkening: the rim stays a warm glowing orange.
  color = mix(color, sunLimb(color, mu), 0.72);

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Headroom so the tessellated halo shell never clips its faint outer tail (facets sit inside the sphere). */
const HALO_SHELL_MARGIN = 1.03;

// --- Halo. A BackSide shell around the Sun. For each pixel the shader measures how close the view
// ray passes to the Sun's centre (b), so the halo traces the true projected limb under perspective.
// Fragments inside the disc are hidden by the photosphere's depth, but they still run this shader:
// the discard turns off early depth rejection, so the shell costs fill across its whole projection.
// updateHalo hides the shell whenever the halo cannot reach the screen, which bounds that cost.
const HALO_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vCenter;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vCenter = modelMatrix[3].xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Output is premultiplied (colour * I, alpha I) and blended ONE, ONE, so overlapping light adds
// up like real scattering. Display-space colours with no colourspace include, as the photosphere
// writes them, so uMid is the photosphere's own tone.
const HALO_FRAG = /* glsl */ `
uniform float uR;
uniform float uW;
uniform float uGain;
uniform vec3 uHot;
uniform vec3 uMid;
varying vec3 vWorldPos;
varying vec3 vCenter;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec3 toC = vCenter - cameraPosition;
  float along = dot(toC, dir);
  // Behind the camera the Sun is not in this pixel's view, so nothing is drawn there.
  if (along <= 0.0) discard;
  float b = length(toC - dir * along);             // view-ray closest approach to the centre
  float x = (b - uR) / uW;                          // 0 at the limb, 1 at the outer edge
  if (x >= 1.0 || uGain <= 0.0) discard;
  x = max(x, 0.0);
  float e = 1.0 - x;
  float rim = exp(-8.0 * x);                        // hot inner rim
  float cor = exp(-2.5 * x);                        // warm corona
  float bloom = e * e * e;                          // soft outer veil
  // The e*e window makes the falloff reach zero exactly at the outer edge, with no visible ring.
  float I = uGain * e * e * (0.50 * rim + 0.30 * cor + 0.20 * bloom);
  // Light under half an 8-bit step rounds away anyway, so it is dropped before the dither is added.
  if (I < 0.5 / 255.0) discard;
  I += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;    // dither against 8-bit banding
  vec3 col = mix(uMid, uHot, rim);
  gl_FragColor = vec4(col * I, I);
}
`;

/**
 * Build the animated Sun. `radius` is the photosphere radius (scene units);
 * `segments` is the sphere tessellation (from the quality profile) — the noise
 * is per-fragment, so even a coarse sphere still churns smoothly.
 */
export function buildSun(radius: number, segments: number): AnimatedSun {
  const group = new THREE.Group();

  // Photosphere.
  // A white placeholder keeps uMap bound from the first compile. At reveal 0 it has no
  // effect, since the multiply is mix(1, ...).
  const uniforms: {
    uTime: { value: number };
    uMap: { value: THREE.Texture };
    uReveal: { value: number };
  } = {
    uTime: { value: 0 },
    uMap: { value: solidTexture(255, 255, 255) },
    uReveal: { value: 0 }
  };
  const photMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PHOTOSPHERE_VERT,
    fragmentShader: SIMPLEX_3D_GLSL + SUN_CONVECTION_GLSL + SUN_OPTICS_GLSL + PHOTOSPHERE_FRAG
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), photMat);
  mesh.userData.bodyId = "sun";
  group.add(mesh);

  // Halo. Uniforms are world-space, refreshed every frame by updateHalo. uGain starts at 0, so the
  // first frames draw nothing until the sun reveals.
  const haloUniforms: {
    uR: { value: number };
    uW: { value: number };
    uGain: { value: number };
    uHot: { value: THREE.Vector3 };
    uMid: { value: THREE.Vector3 };
  } = {
    uR: { value: radius },
    uW: { value: 1 },
    uGain: { value: 0 },
    // Display-space: uMid is the photosphere's dominant orange (SUN_SURFACE_COLOR), uHot its white-gold rim.
    uHot: { value: new THREE.Vector3(1.0, 0.78, 0.42) },
    uMid: { value: new THREE.Vector3(1.0, 0.42, 0.05) }
  };
  const haloMat = new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor
  });
  const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments), haloMat);
  // Drawn after the opaque photosphere and planets, so its depth test sees them.
  haloMesh.renderOrder = 2;
  // Decoration only: never intercept picking.
  haloMesh.raycast = () => {};
  // Moved and scaled every frame, so its cached bounds are stale; always submit it.
  haloMesh.frustumCulled = false;

  // Per-frame scratch, reused so updateHalo allocates nothing.
  const sunPos = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const toSun = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camBack = new THREE.Vector3();
  const sunInCamera = { x: 0, y: 0, z: 0 };
  const haloMetrics: SunHaloMetrics = { discPx: 0, widthPx: 0, widthWorld: 0, peakGain: 0 };
  // Set once the surface will never reveal (its map failed): the halo then stands at full strength.
  let haloIgnited = false;

  return {
    group,
    mesh,
    haloMesh,
    update(t: number) {
      uniforms.uTime.value = t;
    },
    updateHalo(camera: THREE.PerspectiveCamera, viewportHeightCss: number) {
      // The entrance grow-in scales the group from 0 to 1; the halo follows that scale and the reveal.
      const s = Math.min(1, Math.max(0, group.scale.x));
      const R = radius * s;
      group.getWorldPosition(sunPos);
      // getWorldPosition also brings the camera's world matrix up to date for the axes below.
      camera.getWorldPosition(cameraPos);
      const d = cameraPos.distanceTo(sunPos);
      const H = Math.max(1, viewportHeightCss);
      const m = sunHaloMetrics(R, d, H, camera.fov, haloMetrics);
      const gain = m.peakGain * (haloIgnited ? 1 : uniforms.uReveal.value) * s;
      haloUniforms.uR.value = R;
      haloUniforms.uW.value = m.widthWorld;
      haloUniforms.uGain.value = gain;
      haloMesh.position.copy(sunPos);
      haloMesh.scale.setScalar((R + m.widthWorld) * HALO_SHELL_MARGIN);

      // The Sun's centre in camera axes, for the on-screen test.
      toSun.subVectors(sunPos, cameraPos);
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      camBack.setFromMatrixColumn(camera.matrixWorld, 2);
      sunInCamera.x = toSun.dot(camRight);
      sunInCamera.y = toSun.dot(camUp);
      sunInCamera.z = -toSun.dot(camBack);
      // Hide the shell when the halo cannot show: no light yet, or its band lies wholly off-screen
      // (the disc fills the view). The shell is per-pixel fill, so this is the cheap way out there.
      haloMesh.visible =
        gain > 0 &&
        haloReachesViewport(sunInCamera, R, R + m.widthWorld, camera.fov, H * camera.aspect, H);
    },
    setSurfaceMap(tex: THREE.Texture) {
      // Colour space is set by the loader's upload, before this runs (the one writer for streamed textures).
      releasePlaceholder(uniforms.uMap.value);
      uniforms.uMap.value = tex;
      // Uniform-only swap: the placeholder already bound uMap, so no needsUpdate and no program lookup.
    },
    setReveal(progress: number) {
      uniforms.uReveal.value = Math.min(1, Math.max(0, progress));
    },
    igniteHalo() {
      haloIgnited = true;
    }
  };
}
