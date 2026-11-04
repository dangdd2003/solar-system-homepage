import * as THREE from "three";
import { SIMPLEX_3D_GLSL } from "./noise-glsl";

/**
 * Dissolve-in for a body's surface texture. The material is built with a white colour
 * and its body colour in `uRevealFlat`, so progress 0 draws exactly the flat body colour
 * and progress 1 draws the texture alone. In between, a noise front (object-local, so it
 * stays on the body as it turns) decides which fragments show the texture, and a thin
 * warm band marks the front. Everything is uniforms: the GLSL is fixed at the first
 * compile, so progress and the sweep switch never recompile.
 */
export interface RevealOptions {
  /** Body colour shown while the texture is still flat (progress 0). */
  readonly flatColor: number;
  /** True: noise dissolve. False: plain crossfade (low-effects tier, or a material with no noise). */
  readonly sweep: boolean;
  /**
   * Radius of the body's sphere geometry, in scene units. The noise is sampled at
   * position / radius, so every body dissolves in blobs of the same size on its surface.
   * Defaults to 1 (a unit sphere).
   */
  readonly radius?: number | undefined;
  /**
   * Names the onBeforeCompile hooks installed around this reveal, for example "day-night+eclipse".
   * Required when the material already has a hook, so the cache key names the whole chain.
   */
  readonly chain?: string | undefined;
}

export interface RevealHandle {
  /** Sets progress: 0 = flat body colour, 1 = texture alone. Clamped. Uniform write only. */
  setProgress: (progress: number) => void;
}

/** Warm colour of the dissolve front (0xfff1d0). */
export const REVEAL_EDGE_COLOR = 0xfff1d0;
/** Emissive strength of the front band: visible on the lit side, not blown out. */
export const EDGE_STRENGTH = 0.8;

/** Identifies the reveal GLSL. Bump it if the patched shader source changes. */
const REVEAL_KEY_VERSION = "reveal-v3";

/** The edge strength as a GLSL float literal, baked into the shader. */
const EDGE_GLSL = EDGE_STRENGTH.toFixed(2);

const VERT_DECLARE = `#include <common>
uniform float uRevealInvRadius;
varying vec3 vRevealLocal;`;
const VERT_ASSIGN = `#include <begin_vertex>
  vRevealLocal = position * uRevealInvRadius;`;

const FRAG_DECLARE = `#include <common>
uniform float uReveal;
uniform float uRevealSweep;
uniform vec3 uRevealFlat;
uniform vec3 uRevealEdgeColor;
varying vec3 vRevealLocal;
${SIMPLEX_3D_GLSL}`;

// Runs after the texture and vertex colour multiply, so `diffuseColor` is the texture.
// Progress 0 gives mix(flat, x, 0) = flat exactly; progress 1 skips the block entirely.
const FRAG_DIFFUSE = `#include <color_fragment>
  // Dissolve from the flat body colour to the texture (uReveal 0 = flat, 1 = texture).
  float revealEdge = 0.0;
  if (uReveal < 1.0) {
    float keep = uReveal;
    if (uRevealSweep > 0.5) {
      // Object-local noise mapped to 0..1; the front sweeps across the body as uReveal rises.
      float n = clamp(0.5 + 0.5 * snoise(vRevealLocal * 2.5), 0.0, 1.0);
      float front = uReveal * 1.25 - 0.125;
      keep = 1.0 - smoothstep(front - 0.05, front + 0.05, n);
      revealEdge = (1.0 - smoothstep(0.0, 0.06, abs(n - front))) * sin(PI * uReveal);
    }
    diffuseColor.rgb = mix(uRevealFlat, diffuseColor.rgb, keep);
  }`;

// Standard materials only: the basic (ring) material has no emissive stage.
const FRAG_EMISSIVE = `#include <emissivemap_fragment>
  if (uReveal < 1.0) {
    totalEmissiveRadiance += uRevealEdgeColor * (revealEdge * ${EDGE_GLSL});
  }`;

// Materials with an alpha map (the ring) crossfade its alpha with the colour. Flat keeps the
// material's own opacity (the ring's 0.6), and the gaps open up as the tint lands instead of the
// whole pattern popping in when the texture is applied. The capture runs before the alpha map
// chunk multiplies in, so it is the material opacity alone. Only the crossfade reveals have an
// alpha map, so `uReveal` is the keep.
const FRAG_ALPHA = `float revealOpacity = diffuseColor.a;
  #include <alphamap_fragment>
  if (uReveal < 1.0) diffuseColor.a = mix(revealOpacity, diffuseColor.a, uReveal);`;

/**
 * Replace the first `anchor` in `source`. A missing anchor warns and leaves the source
 * alone, so a three.js upgrade that renames a chunk shows up instead of failing silently.
 */
function anchored(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) {
    console.warn(`[reveal-material] shader anchor "${anchor}" not found; reveal will not apply`);
    return source;
  }
  return source.replace(anchor, replacement);
}

/**
 * Patch a material so its surface dissolves from `flatColor` to its texture as progress
 * rises. Chains any onBeforeCompile already set (Earth's day/night hook), and must run
 * before the material's first compile. Materials with the same `customProgramCacheKey`
 * share one GL program and keep their own uniform objects, so each body gets its own
 * progress. The sweep switch is a uniform, so both modes share a key.
 */
export function installReveal(
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
  opts: RevealOptions
): RevealHandle {
  // A material without a hook inherits three's no-op, so only an own hook counts as prior.
  const prior =
    material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
      ? material.onBeforeCompile
      : undefined;
  if (prior && opts.chain === undefined) {
    throw new Error("installReveal: a material with a prior onBeforeCompile needs a chain name");
  }
  const radius = opts.radius ?? 1;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("installReveal: radius must be a positive number");
  }
  // Fixed at install: the alpha map is a placeholder from the first compile, so its
  // presence (not the streamed texture) decides the variant.
  const foldAlpha = material.alphaMap !== null;
  const key = `${REVEAL_KEY_VERSION}|${material.type}|${opts.chain ?? "plain"}|${foldAlpha ? "alpha" : "opaque"}`;

  const uReveal = { value: 0 };
  const uRevealSweep = { value: opts.sweep ? 1 : 0 };
  const uRevealFlat = { value: new THREE.Color(opts.flatColor) };
  const uRevealInvRadius = { value: 1 / radius };
  const uRevealEdgeColor = { value: new THREE.Color(REVEAL_EDGE_COLOR) };

  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior.call(material, shader, renderer);

    shader.uniforms.uReveal = uReveal;
    shader.uniforms.uRevealSweep = uRevealSweep;
    shader.uniforms.uRevealFlat = uRevealFlat;
    shader.uniforms.uRevealInvRadius = uRevealInvRadius;
    shader.uniforms.uRevealEdgeColor = uRevealEdgeColor;

    shader.vertexShader = anchored(
      anchored(shader.vertexShader, "#include <common>", VERT_DECLARE),
      "#include <begin_vertex>",
      VERT_ASSIGN
    );

    let fragment = anchored(
      anchored(shader.fragmentShader, "#include <common>", FRAG_DECLARE),
      "#include <color_fragment>",
      FRAG_DIFFUSE
    );
    if (fragment.includes("#include <emissivemap_fragment>")) {
      fragment = anchored(fragment, "#include <emissivemap_fragment>", FRAG_EMISSIVE);
    }
    if (foldAlpha) {
      fragment = anchored(fragment, "#include <alphamap_fragment>", FRAG_ALPHA);
    }
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => key;

  return {
    setProgress(progress) {
      uReveal.value = Math.min(1, Math.max(0, progress));
    }
  };
}
