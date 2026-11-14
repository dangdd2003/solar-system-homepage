import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3
} from "three";
import { BODIES, type BodyId, getBody } from "./bodies";
import { ellipsePosition } from "./ellipse";
import { orbitPointFor } from "./orbital-plane";
import type { QualityProfile } from "./device";
import { type AnimatedSun, buildSun } from "./sun";
import { buildEarthMaterial, type EarthMaterial } from "./earth-material";
import { installReveal, type RevealHandle } from "./reveal-material";
import { solidTexture } from "./solid-texture";
import { attachPlanetHalo } from "./planet-halo";

/** The Moon's local orbit around Earth (scene units / radians per second). */
export const MOON_ORBIT_RADIUS = 2.2;
export const MOON_ORBIT_SPEED = 1.6;
/** ~0.27 of Earth's radius, matching the real ratio. */
export const MOON_SIZE = 0.27;
/**
 * Moon orbit tilt from the ecliptic (radians), taken from its facts. Shared by the
 * drawn orbit ring here and the per-frame Moon position in SolarSystem, so the two
 * can never disagree. The sin/cos are precomputed once, since both are constant.
 */
const MOON_INCLINATION_RAD = getBody("moon").facts.inclinationDeg * (Math.PI / 180);
export const MOON_SIN_INCL = Math.sin(MOON_INCLINATION_RAD);
export const MOON_COS_INCL = Math.cos(MOON_INCLINATION_RAD);
/** Earth's cloud layer opacity once its texture has revealed. */
export const CLOUD_OPACITY = 0.5;
/** Saturn ring opacity while its texture is still flat (the final value is 1). */
export const RING_FLAT_OPACITY = 0.6;

/** Starfield point size in CSS px, and the opacity that matches it at pixel ratio 1. */
const STAR_CSS_SIZE = 1.2;
const STAR_BASE_OPACITY = 0.9;

/**
 * Point size and opacity for the starfield at a given renderer pixel ratio.
 *
 * WebGL rasterises a point as whole device pixels, so a size that is fractional in device pixels
 * (1.2 * 1.5 = 1.8) jumps between 1 and 2 pixels as the ratio moves. The renderer lowers the ratio
 * continuously while a large window is resized (its drawing-buffer budget), so the stars would
 * flicker. Here the size is snapped to whole device pixels and the opacity is set so the light per
 * star (opacity * device px area) equals 0.9 * ratio^2, which is continuous within each whole-pixel
 * size. A 1 px star cannot exceed full opacity, so above ratio ~1.05 it saturates; the remaining
 * step (1 px to 2 px) is the one visible jump and happens only at ratio ~1.25 and up.
 *
 * `size` is what the material needs to hold: three.js multiplies it by the pixel ratio itself.
 */
export function starfieldPointStyle(pixelRatio: number): { size: number; opacity: number } {
  const pr = Math.max(1e-6, pixelRatio);
  const devicePx = Math.max(1, Math.round(STAR_CSS_SIZE * pr));
  return {
    size: devicePx / pr,
    opacity: Math.min(1, (STAR_BASE_OPACITY * pr * pr) / (devicePx * devicePx))
  };
}

/**
 * Procedural starfield: multi-tier stars scattered on a sphere of radius 380 —
 * inside the Milky Way skybox (400) but far beyond the camera's max distance
 * from origin (~180), so it always reads as a distant backdrop.
 * Tier 1: Distant micro-stars with uniform spherical distribution and power-law brightness.
 * Tier 2: Prominent focal stars with density biased toward the galactic equator.
 */
export function buildStarfield(microCount: number, focalCount = 350): Points {
  const RADIUS = 380;
  const totalCount = microCount + focalCount;
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const color = new Color();

  let idx = 0;

  // Tier 1: Distant micro-stars (uniform spherical distribution)
  for (let i = 0; i < microCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinPhi = Math.sin(phi);

    positions[idx * 3] = RADIUS * sinPhi * Math.cos(theta);
    positions[idx * 3 + 1] = RADIUS * Math.cos(phi);
    positions[idx * 3 + 2] = RADIUS * sinPhi * Math.sin(theta);

    // Power-law magnitude distribution (mostly faint, few moderate)
    const p = Math.random();
    const brightness = p < 0.8 ? 0.15 + p * 0.3 : 0.4 + (p - 0.8) * 1.5;
    color.setHSL(0, 0, brightness * 0.7);

    colors[idx * 3] = color.r;
    colors[idx * 3 + 1] = color.g;
    colors[idx * 3 + 2] = color.b;
    idx++;
  }

  // Tier 2: Prominent focal stars (density-biased toward galactic equator)
  for (let i = 0; i < focalCount; i++) {
    const u = Math.random();
    // Bias phi toward equator (phi = pi/2)
    const rawV = Math.random();
    const v = Math.random() < 0.6 ? 0.5 + (rawV - 0.5) * 0.45 : rawV;
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sinPhi = Math.sin(phi);

    positions[idx * 3] = RADIUS * sinPhi * Math.cos(theta);
    positions[idx * 3 + 1] = RADIUS * Math.cos(phi);
    positions[idx * 3 + 2] = RADIUS * sinPhi * Math.sin(theta);

    const brightness = 0.7 + Math.random() * 0.3;
    color.setHSL(0, 0, brightness);

    colors[idx * 3] = color.r;
    colors[idx * 3 + 1] = color.g;
    colors[idx * 3 + 2] = color.b;
    idx++;
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: STAR_CSS_SIZE,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: STAR_BASE_OPACITY,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false
  });

  const points = new Points(geo, material);
  points.matrixAutoUpdate = false;
  points.updateMatrix();
  points.renderOrder = 0;
  // Runs right before this object is drawn, with the ratio the drawing buffer uses in that frame,
  // so the stars always match the buffer (no stale ratio, no extra render hook).
  let lastPixelRatio = -1;
  points.onBeforeRender = (renderer) => {
    const pr = renderer.getPixelRatio();
    if (pr === lastPixelRatio) return;
    lastPixelRatio = pr;
    const style = starfieldPointStyle(pr);
    material.size = style.size;
    material.opacity = style.opacity;
  };
  return points;
}

export function buildOrbitLines(radii: Map<BodyId, number>): LineLoop[] {
  const segments = 160;
  const lines: LineLoop[] = [];
  let mat: LineBasicMaterial | null = null;
  for (const body of BODIES) {
    const orbitRadius = radii.get(body.id) ?? 0;
    if (orbitRadius === 0) continue;
    const e = body.facts.eccentricity;
    // Packed xyz straight into the attribute (no per-point Vector3 objects).
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const flat = ellipsePosition(orbitRadius, e, angle);
      // Tip the flat ecliptic ellipse into the body's real (inclined) plane.
      const p = orbitPointFor(body, flat);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    mat ??= new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15
    });
    const line = new LineLoop(geo, mat);
    line.matrixAutoUpdate = false;
    line.updateMatrix();
    lines.push(line);
  }
  return lines;
}

export interface BuiltBodies {
  meshes: Map<BodyId, Mesh>;
  /** The animated Sun (photosphere + halo). Its group is what the scene adds;
   *  its photosphere mesh is also in `meshes` for picking and the orbit loop. */
  sun: AnimatedSun;
  moon: Mesh;
  /** Transparent cloud layer parented to Earth; rotates slightly faster. */
  earthClouds: Mesh;
  /** Earth's day/night material; its night-lights map is streamed in later. */
  earthMaterial: EarthMaterial;
  moonOrbitLine: LineLoop;
  /** Saturn's ring mesh (a child of Saturn), or null when the body list has none. */
  ring: Mesh | null;
  /**
   * Dissolve handles for the surfaces that reveal when their texture lands, keyed by
   * texture job. The Sun reveals through `sun.setReveal` and Earth's lights and clouds
   * through `earthMaterial` and `earthClouds`, so those are not listed here.
   */
  reveals: ReadonlyMap<BodyId | "saturn_ring", RevealHandle>;
}

export interface BuildBodiesOptions {
  /** True (default): the surface dissolves in with noise. False: a plain crossfade. */
  readonly revealSweep?: boolean | undefined;
}

export function buildBodies(profile: QualityProfile, opts: BuildBodiesOptions = {}): BuiltBodies {
  const seg = profile.sphereSegments;
  const revealSweep = opts.revealSweep ?? true;
  const meshes = new Map<BodyId, Mesh>();
  const reveals = new Map<BodyId | "saturn_ring", RevealHandle>();
  const haloGeo = new SphereGeometry(1, Math.max(32, seg), Math.max(24, seg));
  let moon: Mesh | null = null;
  let earthClouds: Mesh | null = null;
  let earthMaterial: EarthMaterial | null = null;
  let moonOrbitLine: LineLoop | null = null;
  let ring: Mesh | null = null;

  // The Sun is a living star (animated plasma + halo), not a flat sphere.
  const sunSize = getBody("sun").size;
  const sun = buildSun(sunSize, seg);
  meshes.set("sun", sun.mesh);

  for (const body of BODIES) {
    if (body.id === "sun") continue; // built above as the animated Sun
    const geo = new SphereGeometry(body.size, seg, seg);
    // Earth is special: a day/night material (city lights on the far side) vs
    // the plain lit material every other planet uses.
    let mat: MeshStandardMaterial;
    if (body.id === "earth") {
      earthMaterial = buildEarthMaterial(body.color, sunSize, {
        revealSweep,
        radius: body.size
      });
      mat = earthMaterial.material;
      reveals.set("earth", earthMaterial.reveal);
    } else {
      // White map placeholder: keeps USE_MAP set from the first compile so the
      // streamed surface texture never forces a shader recompile. The colour is
      // white, and the reveal draws the body colour as its flat look until the
      // texture dissolves in.
      mat = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        map: solidTexture(255, 255, 255)
      });
      reveals.set(
        body.id,
        installReveal(mat, { flatColor: body.color, sweep: revealSweep, radius: body.size })
      );
    }
    const mesh = new Mesh(geo, mat);
    mesh.userData.bodyId = body.id;
    meshes.set(body.id, mesh);

    if (body.id === "saturn") {
      const inner = body.size * 1.4;
      const outer = body.size * 2.2;
      const ringGeo = new RingGeometry(inner, outer, 96);
      remapRingUVsRadial(ringGeo, inner, outer);
      const ringMat = new MeshBasicMaterial({
        // White, so the streamed texture shows in its own colours. The tint is the
        // reveal's flat colour, shown until the ring texture dissolves in. White map
        // + alpha placeholders keep USE_MAP / USE_ALPHAMAP fixed so the streamed ring
        // texture does not trigger a shader recompile.
        color: 0xffffff,
        side: DoubleSide,
        transparent: true,
        opacity: RING_FLAT_OPACITY,
        map: solidTexture(255, 255, 255),
        alphaMap: solidTexture(255, 255, 255)
      });
      // The ring has no noise, so its reveal is a plain crossfade of the tint.
      reveals.set("saturn_ring", installReveal(ringMat, { flatColor: 0xd9c27a, sweep: false }));
      ring = new Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.2;
      mesh.add(ring);
    }

    if (body.id === "earth") {
      const builtMoon = buildMoon(body.size, seg, revealSweep, haloGeo);
      moon = builtMoon.mesh;
      moonOrbitLine = builtMoon.orbitLine;
      reveals.set("moon", builtMoon.reveal);
      earthClouds = buildEarthClouds(mesh, body.size, seg);
    }
    const surfaceReveal = reveals.get(body.id);
    if (surfaceReveal) attachPlanetHalo(mesh, body.id, body.size, seg, surfaceReveal, haloGeo);
  }

  if (!moon || !earthClouds || !earthMaterial || !moonOrbitLine) {
    throw new Error("buildBodies: Earth (and its Moon/clouds) missing from BODIES");
  }
  return { meshes, sun, moon, earthClouds, earthMaterial, moonOrbitLine, ring, reveals };
}

/** RingGeometry's default UVs map a quad across the ring, which smears a radial
 *  band strip (like Solar System Scope's ring texture, where colour varies from
 *  inner to outer edge along the image's width). Remap so U = normalized radial
 *  distance (inner edge -> 0, outer edge -> 1) and V is centred, so each ring
 *  band samples the correct column of the strip. */
function remapRingUVsRadial(geo: RingGeometry, inner: number, outer: number): void {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  if (!pos || !uv) return;
  const v3 = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    const radius = Math.hypot(v3.x, v3.y);
    const u = (radius - inner) / (outer - inner);
    uv.setXY(i, u, 0.5);
  }
  uv.needsUpdate = true;
}

/** A slightly larger, transparent sphere over Earth for the cloud layer. Its
 *  cloud texture is applied later by the texture loader, and the clouds fade
 *  in from hidden (opacity 0, not drawn) once it lands. */
function buildEarthClouds(earth: Mesh, earthSize: number, seg: number): Mesh {
  const clouds = new Mesh(
    new SphereGeometry(earthSize * 1.02, seg, seg),
    new MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Placeholders keep USE_MAP / USE_ALPHAMAP fixed from the first compile.
      // Black alpha keeps the clouds invisible (opacity 0) until the real map lands.
      map: solidTexture(255, 255, 255),
      alphaMap: solidTexture(0, 0, 0)
    })
  );
  // Not drawn at all until the cloud texture is applied (the reveal sets visible).
  clouds.visible = false;
  earth.add(clouds);
  return clouds;
}

/** The Moon orbits Earth. It is built independently and animated by the
 *  orchestrator so it isn't subjected to Earth's axial spin. */
function buildMoon(
  earthSize: number,
  seg: number,
  revealSweep: boolean,
  haloGeo: SphereGeometry
): { mesh: Mesh; orbitLine: LineLoop; reveal: RevealHandle } {
  const segments = 64;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * MOON_ORBIT_RADIUS;
    const z = Math.sin(angle) * MOON_ORBIT_RADIUS;
    positions[i * 3] = x;
    positions[i * 3 + 1] = z * MOON_SIN_INCL;
    positions[i * 3 + 2] = z * MOON_COS_INCL;
  }
  const ringGeo = new BufferGeometry();
  ringGeo.setAttribute("position", new BufferAttribute(positions, 3));
  const ringMat = new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2
  });
  const orbitLine = new LineLoop(ringGeo, ringMat);
  orbitLine.renderOrder = 0;

  const moonRadius = earthSize * MOON_SIZE;
  const moonMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    map: solidTexture(255, 255, 255)
  });
  const moonReveal = installReveal(moonMat, {
    flatColor: 0xc8c8cc,
    sweep: revealSweep,
    radius: moonRadius
  });

  const moon = new Mesh(new SphereGeometry(moonRadius, seg, seg), moonMat);
  // Tag it like the planets so the raycaster (SolarSystem.pickAt) can identify
  // a click/hover on the Moon and focus it, just like any other body.
  moon.userData.bodyId = "moon";
  attachPlanetHalo(moon, "moon", moonRadius, seg, moonReveal, haloGeo);
  // Start a quarter-turn around (+Z), off the Sun→Earth axis, so the rest pose
  // isn't a total eclipse. SolarSystem's onFrame keeps it here at orbitTime=0
  // (MOON_START_PHASE); this matches that for the first pre-frame moment.
  moon.position.set(0, 0, MOON_ORBIT_RADIUS);

  return {
    mesh: moon,
    orbitLine,
    reveal: moonReveal
  };
}
