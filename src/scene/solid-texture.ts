import * as THREE from "three";

/**
 * A 1x1 texture of a single RGBA colour, used as a pre-load placeholder.
 *
 * Placeholders matter for frame time: a material's shader program depends on
 * whether it HAS a map (and alphaMap). Seeding a placeholder at build time keeps
 * those defines fixed from the first compile, so the streamed texture only swaps
 * a sampler uniform. Assigning a map later would force a synchronous shader
 * recompile mid-animation.
 */
export function solidTexture(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  // Marks textures that stand in for a real map, so they can be freed on swap.
  tex.userData.placeholder = true;
  return tex;
}

/** Free a placeholder that a streamed texture is about to replace. No-op otherwise. */
export function releasePlaceholder(prev: THREE.Texture | null | undefined): void {
  if (prev?.userData.placeholder === true) prev.dispose();
}
