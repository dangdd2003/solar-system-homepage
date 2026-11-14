import { MeshStandardMaterial, SRGBColorSpace, Texture } from "three";
import { type EclipseShadowHandle, injectEclipseShadow } from "./eclipse-shadow";
import { installReveal, type RevealHandle } from "./reveal-material";
import { solidTexture } from "./solid-texture";

/** Night-lights intensity once the lights have revealed (the value the shader was tuned at). */
export const NIGHT_LIGHTS_INTENSITY = 1.6;

/**
 * Earth needs two maps, not one: the daymap lights the hemisphere facing the
 * Sun, and a nightmap (city lights) glows on the hemisphere turned away. A plain
 * MeshStandardMaterial only has the daymap, so Earth's night side just falls to
 * ambient — no lights, no terminator. Here we keep the standard material (so the
 * day side is lit by the same Sun point light + ambient as every other planet)
 * and only PATCH it, via onBeforeCompile, to add the nightmap as emissive light
 * that fades in across the terminator.
 *
 * The Sun sits at the world origin, so the direction from any surface point to
 * the Sun is simply normalize(-worldPos). We compute that per fragment (rather
 * than threading a light position in each frame), take its dot with the world
 * normal, and blend: >0 = day (no city lights), <0 = night (lights on), with a
 * soft band between for the twilight terminator.
 *
 * We reuse three's own `vMapUv` varying (the daymap's UV) to sample the night
 * map, so the two maps line up exactly. That varying only exists when the
 * material has a map, and the real daymap streams in later — so we seed a 1x1
 * white placeholder map at construction. USE_MAP is then set from the first
 * compile, and the daymap just swaps in later. The material is white and the
 * base colour is the reveal's flat colour, so before the daymap arrives Earth
 * shows exactly the flat blue the other planets do.
 */
export interface EarthMaterial {
  material: MeshStandardMaterial;
  /** Feed the streamed night-lights map in once it loads (live uniform swap). */
  setNightMap: (tex: Texture) => void;
  /** Night-lights strength: 0 is dark, NIGHT_LIGHTS_INTENSITY is the full glow. */
  setNightIntensity: (intensity: number) => void;
  /** Dissolve of the daymap from the flat base colour. */
  reveal: RevealHandle;
  /** Per-fragment eclipse shadow cast by the Moon; driven each frame. */
  eclipse: EclipseShadowHandle;
  /** Disposes the placeholder and streamed night-lights textures. Idempotent. */
  disposeTextures: () => void;
}

export function buildEarthMaterial(
  baseColor: number,
  sunRadius: number,
  opts: { revealSweep?: boolean | undefined; radius?: number | undefined } = {}
): EarthMaterial {
  // White daymap placeholder: keeps USE_MAP (and so `vMapUv`) defined from the
  // first compile, and white passes the base color through unchanged until the
  // real daymap loads. The texture loader swaps `material.map` in later.
  const dayPlaceholder = solidTexture(255, 255, 255);
  dayPlaceholder.colorSpace = SRGBColorSpace;

  // White, so the daymap shows in its own colours. The base colour is the reveal's flat colour.
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    map: dayPlaceholder
  });

  // Black night placeholder keeps the `nightMap` sampler bound to something
  // valid before the real map streams in (sampling an unbound sampler is
  // undefined). Black means zero city lights, so the night side stays unlit.
  const nightPlaceholder = solidTexture(0, 0, 0);

  // Held outside onBeforeCompile so we can swap the night texture in later:
  // onBeforeCompile assigns THESE uniform objects onto the compiled shader, so
  // mutating .value here reaches the GPU without a recompile. Starts dark: the
  // lights fade up once their map has been applied.
  const nightMap: { value: Texture } = { value: nightPlaceholder };
  const nightIntensity = { value: 0 };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.nightMap = nightMap;
    shader.uniforms.nightIntensity = nightIntensity;

    // Vertex: carry world position + world normal so the fragment shader can
    // work out where the Sun (origin) is relative to each surface point. Both
    // are computed from always-defined values (no dependence on map defines).
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vEarthWorldPos;
varying vec3 vEarthWorldNormal;`
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
  vEarthWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    // Fragment: add the night lights to emissive, gated by the terminator. We
    // sample with vMapUv (three's daymap UV) so day and night line up exactly.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D nightMap;
uniform float nightIntensity;
varying vec3 vEarthWorldPos;
varying vec3 vEarthWorldNormal;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  {
    // Sun is at the world origin: direction to it is -worldPos, normalized.
    vec3 sunDir = normalize(-vEarthWorldPos);
    float ndl = dot(normalize(vEarthWorldNormal), sunDir);
    // 0 on the lit side, ramping to 1 once well past the terminator into night.
    float nightAmount = 1.0 - smoothstep(-0.15, 0.10, ndl);
    vec3 cityLights = texture2D(nightMap, vMapUv).rgb;
    totalEmissiveRadiance += cityLights * nightAmount * nightIntensity;
  }`
      );
  };

  // The daymap dissolves in from the base colour. It chains onto the day/night hook
  // above, and the eclipse layer below chains onto it, so the cache key names all three.
  const reveal = installReveal(material, {
    flatColor: baseColor,
    sweep: opts.revealSweep ?? true,
    radius: opts.radius,
    chain: "day-night+eclipse"
  });

  // Layer the per-fragment eclipse shadow on top of the day/night patch. Its
  // injection chains onto the onBeforeCompile set just above, so both compose.
  const eclipse = injectEclipseShadow(material, { sunRadius, shadowMin: 0.08 });

  let disposed = false;
  return {
    material,
    setNightMap(tex: Texture) {
      // Colour space is set by the loader's upload, before this runs (the one writer for streamed
      // textures). Sampler-only swap: the placeholder already fixed the program, so no needsUpdate.
      nightMap.value = tex;
    },
    setNightIntensity(intensity: number) {
      nightIntensity.value = intensity;
    },
    reveal,
    eclipse,
    disposeTextures() {
      if (disposed) return;
      disposed = true;
      // The night placeholder and any streamed night map are not reachable via
      // material properties (they live in the shader uniform), so free them here.
      // The day placeholder is freed too: once the real daymap has been swapped
      // in it is no longer referenced by the material at all.
      nightPlaceholder.dispose();
      if (nightMap.value !== nightPlaceholder) nightMap.value.dispose();
      dayPlaceholder.dispose();
    }
  };
}
