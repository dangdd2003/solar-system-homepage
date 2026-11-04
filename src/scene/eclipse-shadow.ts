import * as THREE from "three";
import { SHADOW_MIN } from "./eclipse";

/**
 * Per-fragment eclipse shadow. This is the GPU port of the disc-overlap
 * coverage math in eclipse.ts: instead of dimming a whole body by the coverage
 * fraction seen from its centre, we evaluate the coverage from EACH surface
 * fragment's world position. Because nearer and farther points on the disc see
 * the Sun and caster at slightly different angles, the shadow gains a real edge
 * that sweeps across the surface — a moving patch, not a uniform dim.
 *
 * The coverage term MUST stay identical to eclipse.ts (the unit-tested source
 * of truth): circle-overlap area of the Sun's and caster's angular discs,
 * divided by the Sun disc area. The shader adds two things eclipse.ts does not
 * have: a terminator gate (sunLit) so only sun-facing fragments darken, and a
 * uniform mix from 1 down to the per-body SHADOW_MIN floor. eclipse.ts returns
 * the raw [0,1] coverage, so the CPU and GPU agree on coverage, not on the
 * final mapped value.
 *
 * Scope is Earth <-> Moon only, so each material has a single caster uniform.
 */
export interface EclipseShadowHandle {
  /** Point the shadow at its caster this frame. `enabled=false` -> no shadow. */
  updateEclipse: (casterWorldPos: THREE.Vector3, casterRadius: number, enabled: boolean) => void;
}

/** GLSL port of the coverage term in eclipse.ts, plus the terminator gate and
 *  SHADOW_MIN mix described above. `eclipseShadowFactor` reads the injected uniforms
 *  (declared in the fragment preamble by injectEclipseShadow). */
export const ECLIPSE_SHADOW_GLSL = /* glsl */ `
float eclipseCircleOverlap(float r1, float r2, float d) {
  if (d >= r1 + r2) return 0.0;
  if (d <= abs(r1 - r2)) {
    float m = min(r1, r2);
    return 3.14159265359 * m * m;
  }
  float r1sq = r1 * r1;
  float r2sq = r2 * r2;
  float a = acos(clamp((d*d + r1sq - r2sq) / (2.0 * d * r1), -1.0, 1.0));
  float b = acos(clamp((d*d + r2sq - r1sq) / (2.0 * d * r2), -1.0, 1.0));
  float term = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);
  return r1sq * a + r2sq * b - 0.5 * sqrt(max(0.0, term));
}

float eclipseShadowFactor(vec3 P, vec3 N) {
  if (uEclEnabled < 0.5) return 1.0;
  vec3 toSun = uEclSunPos - P;
  vec3 toCaster = uEclCasterPos - P;
  float dSun = length(toSun);
  float dCaster = length(toCaster);
  if (dSun <= 0.0 || dCaster <= 0.0) return 1.0;
  // Only a fragment that actually faces the Sun has direct light to lose. Fade
  // this smoothly across the terminator (NOT a hard step, and keyed on the Sun
  // — not the caster) so the shadow can never paint a hard dark/lit seam across
  // the disc. This is what keeps the darkening confined to the lit side.
  float sunLit = smoothstep(-0.05, 0.25, dot(toSun / dSun, N));
  if (sunLit <= 0.0) return 1.0;
  float sunAng = asin(clamp(uEclSunRadius / dSun, -1.0, 1.0));
  float casterAng = asin(clamp(uEclCasterRadius / dCaster, -1.0, 1.0));
  float angSep = acos(clamp(dot(toSun, toCaster) / (dSun * dCaster), -1.0, 1.0));
  float sunDisc = 3.14159265359 * sunAng * sunAng;
  if (sunDisc <= 0.0) return 1.0;
  float covered = clamp(eclipseCircleOverlap(sunAng, casterAng, angSep) / sunDisc, 0.0, 1.0);
  // Darken by coverage, gated by how sunlit the fragment is. darken=0 -> fully
  // lit; darken=1 -> uEclShadowMin (the per-body floor).
  float darken = covered * sunLit;
  return mix(1.0, uEclShadowMin, darken);
}
`;

export interface EclipseShadowOptions {
  sunRadius: number;
  shadowMin?: number | undefined;
}

/**
 * Replace the first occurrence of `anchor` in a shader chunk. If the anchor is
 * missing (for example, after a three.js upgrade renames an include), warn
 * instead of silently skipping the patch, so the eclipse can't vanish unnoticed.
 */
export function patchShaderChunk(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) {
    console.warn(
      `[eclipse-shadow] shader anchor "${anchor}" not found; eclipse shadow will not be applied`
    );
    return source;
  }
  return source.replace(anchor, replacement);
}

/**
 * Patch a MeshStandardMaterial so it darkens per-fragment during an eclipse.
 * Chains onto any existing onBeforeCompile (e.g. Earth's day/night patch) so
 * effects compose. Returns a handle to point the shadow at its caster each
 * frame; mutating the held uniform objects reaches the GPU with no recompile.
 */
export function injectEclipseShadow(
  material: THREE.MeshStandardMaterial,
  opts: EclipseShadowOptions
): EclipseShadowHandle {
  const uSunPos = { value: new THREE.Vector3(0, 0, 0) };
  const uSunRadius = { value: opts.sunRadius };
  const uCasterPos = { value: new THREE.Vector3() };
  const uCasterRadius = { value: 0 };
  const uEnabled = { value: 0 };
  // Deepest dim during a total eclipse. Defaults to SHADOW_MIN (Earth), but the
  // Moon overrides it lighter: in-scene Earth *totally* covers the Sun from the
  // Moon, so the floor is what the whole lit side lands on — 0.15 reads as
  // near-black, wrong for a lunar eclipse (which stays a dim coppery disc).
  const uShadowMin = { value: opts.shadowMin ?? SHADOW_MIN };

  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior.call(material, shader, renderer);

    shader.uniforms.uEclSunPos = uSunPos;
    shader.uniforms.uEclSunRadius = uSunRadius;
    shader.uniforms.uEclCasterPos = uCasterPos;
    shader.uniforms.uEclCasterRadius = uCasterRadius;
    shader.uniforms.uEclEnabled = uEnabled;
    shader.uniforms.uEclShadowMin = uShadowMin;

    shader.vertexShader = patchShaderChunk(
      patchShaderChunk(
        shader.vertexShader,
        "#include <common>",
        `#include <common>
varying vec3 vEclWorldPos;
varying vec3 vEclWorldNormal;`
      ),
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
  vEclWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vEclWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
    );

    shader.fragmentShader = patchShaderChunk(
      patchShaderChunk(
        shader.fragmentShader,
        "#include <common>",
        `#include <common>
uniform vec3 uEclSunPos;
uniform float uEclSunRadius;
uniform vec3 uEclCasterPos;
uniform float uEclCasterRadius;
uniform float uEclEnabled;
uniform float uEclShadowMin;
varying vec3 vEclWorldPos;
varying vec3 vEclWorldNormal;
${ECLIPSE_SHADOW_GLSL}`
      ),
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
  {
    // An eclipse removes DIRECT sunlight only — never the ambient skylight. So
    // we scale just the direct diffuse/specular terms, leaving indirect/ambient
    // intact. A fully eclipsed fragment therefore falls to the ambient floor,
    // never below it, which guarantees the sun-facing side can never end up
    // darker than the anti-sun side (that far side keeps its full ambient).
    float eclShadow = eclipseShadowFactor(vEclWorldPos, normalize(vEclWorldNormal));
    reflectedLight.directDiffuse *= eclShadow;
    reflectedLight.directSpecular *= eclShadow;
  }`
    );
  };
  material.needsUpdate = true;

  return {
    updateEclipse(casterWorldPos, casterRadius, enabled) {
      uCasterPos.value.copy(casterWorldPos);
      uCasterRadius.value = casterRadius;
      uEnabled.value = enabled ? 1 : 0;
    }
  };
}
