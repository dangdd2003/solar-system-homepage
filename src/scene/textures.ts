import type { BodyId } from "./bodies";

/**
 * Surface texture URL for each body, served from our own `public/textures/`
 * (vendored locally — see public/textures/CREDITS.md for attribution). Keeping
 * this a plain record keyed by BodyId means the compiler enforces that every
 * body has a texture.
 */
export const PLANET_TEXTURE_URLS: Record<Exclude<BodyId, "moon">, string> = {
  sun: "/textures/planets/sun.webp",
  mercury: "/textures/planets/mercury.webp",
  venus: "/textures/planets/venus.webp",
  earth: "/textures/planets/earth.webp",
  mars: "/textures/planets/mars.webp",
  jupiter: "/textures/planets/jupiter.webp",
  saturn: "/textures/planets/saturn.webp",
  uranus: "/textures/planets/uranus.webp",
  neptune: "/textures/planets/neptune.webp"
};

/** Extra (non-body) textures. */
export const MOON_TEXTURE_URL = "/textures/planets/moon.webp";
export const EARTH_CLOUDS_TEXTURE_URL = "/textures/planets/earth_clouds.webp";
/**
 * Earth's night side: city lights (Solar System Scope 2k_earth_nightmap). The
 * daymap (PLANET_TEXTURE_URLS.earth) lights the Sun-facing hemisphere; this map
 * glows on the hemisphere turned away from the Sun. See earth-material.ts.
 */
export const EARTH_NIGHT_TEXTURE_URL = "/textures/planets/earth_night.webp";
export const SATURN_RING_TEXTURE_URL = "/textures/planets/saturn_ring.webp";

export function textureUrlFor(id: BodyId): string {
  // The Moon's surface map lives outside the Sun-orbit body table.
  if (id === "moon") return MOON_TEXTURE_URL;
  return PLANET_TEXTURE_URLS[id];
}
