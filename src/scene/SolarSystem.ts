import * as THREE from "three";
import { BODIES, type BodyId, getBody, isBodyId } from "./bodies";
import { ellipsePositionInto } from "./ellipse";
import { defaultOrbitRadii } from "./layout";
import { cameraTargetFor, type Vec3 } from "./camera-path";
import { orbitPointInto } from "./orbital-plane";
import { detectQuality } from "./device";
import {
  buildBodies,
  buildOrbitLines,
  buildStarfield,
  type BuiltBodies,
  CLOUD_OPACITY,
  MOON_ORBIT_RADIUS,
  MOON_COS_INCL,
  MOON_ORBIT_SPEED,
  MOON_SIN_INCL,
  MOON_SIZE,
  RING_FLAT_OPACITY
} from "./scene-builder";
import { buildGalacticSkybox } from "./galactic-plane";
import { type AnimatedSun, SUN_SURFACE_COLOR } from "./sun";
import { CameraRig, type FocusState } from "./camera-rig";
import { CameraControls } from "./camera-controls";
import { bodyRadiusOf, createHoverGlow, type HoverGlow } from "./hover-glow";
import { RenderLoop } from "./render-loop";
import { stageBleedPx } from "../scripts/viewport-chrome";
import { buildJobs, loadAndApplyTextures, type TextureJobId } from "./texture-loader";
import type { EclipseShadowHandle } from "./eclipse-shadow";
import { ENTRANCE_MAX_WAIT_MS, EntranceAnimator, ownerOf, releaseJob } from "./entrance";
import { NIGHT_LIGHTS_INTENSITY } from "./earth-material";
import {
  easeOutCubic,
  easeOutExpo,
  easeOutSine,
  RevealClock,
  type RevealMode,
  type RevealTween,
  revealModeFor
} from "./reveal-timeline";

export type { FocusState };

export interface SolarSystemOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  onFocusChange: (state: FocusState) => void;
  onBodyTap?: ((id: BodyId) => void) | undefined;
  /** Optional: texture streaming progress, for a loading indicator. */
  onTextureProgress?: ((loaded: number, total: number) => void) | undefined;
  /** Stream textures in orbit order (Sun outward) so `revealLimitPx` can advance. See loadAndApplyTextures. */
  prioritizeTextures?: boolean | undefined;
  /**
   * Called once the scene can be shown: the Sun texture has settled (applied or failed)
   * and a frame has been drawn with it, so its shader is compiled. Fires even while
   * rendering is held.
   */
  onReady?: (() => void) | undefined;
  /**
   * Return-visit entrance: each body stays hidden until its own textures are applied,
   * then grows to full size. Off by default; the first-visit startup does not use it.
   */
  entrance?: boolean | undefined;
  /**
   * Surfaces dissolve in with a noise front (default true). False gives a plain crossfade,
   * for the low-effects tier. Fixed at build: the shaders do not change afterwards.
   */
  revealSweep?: boolean | undefined;
}

/** Clearance kept between the reveal limit and a body's visible edge, in CSS px. */
const REVEAL_SAFETY_PX = 8;

/** A body (or group of bodies) whose textures must be applied before the aperture covers it. */
interface RevealGate {
  readonly mesh: THREE.Object3D;
  /** Bounding-sphere radius in world units, including child rings or clouds. */
  readonly worldRadius: number;
  readonly jobs: readonly TextureJobId[];
}

/** Scene radius the outermost orbit (Neptune) reaches; fits the overview frame. */
const MAX_ORBIT_RADIUS = 70;
/** Extra clearance reserved around Earth so the Moon's orbit can't reach a neighbour. */
const EARTH_MOON_CLEARANCE = MOON_ORBIT_RADIUS + MOON_SIZE;
/** Axial spin (radians/sec) so textured surfaces visibly turn. Gentle. */
const AXIAL_SPIN = 0.12;
/** Earth's clouds drift a little faster than the surface turns. */
const CLOUD_SPIN = 0.16;
/**
 * Starting phase for the Moon's orbit (radians). At angle 0 the Moon sits on
 * +X, collinear behind Earth on the Sun→Earth axis — a permanent total eclipse
 * at rest (and under reduced motion, where the scene starts paused at t=0). A quarter
 * turn puts it off to the side at t=0, so the rest pose shows an ordinary lit
 * Moon; eclipses then occur only as it swings through alignment.
 */
const MOON_START_PHASE = Math.PI / 2;

/**
 * Lighting. A single Sun PointLight is the only real source; ambient is kept
 * low so the hemisphere facing away from the Sun falls into a dim-but-readable
 * terminator instead of being flooded flat. Falloff is COMPRESSED, not physical
 * (decay 0.2): real solar irradiance spans ~5,900:1 Mercury->Neptune, which
 * true inverse-square would blow out / black out — this keeps the honest
 * ordering while all planets stay visible.
 */
const AMBIENT_INTENSITY = 0.45;
const SUN_LIGHT_INTENSITY = 5.0;
const SUN_LIGHT_DECAY = 0.35;

/** Disposes a material, its texture properties, and any shader texture uniforms. */
function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform.value instanceof THREE.Texture) uniform.value.dispose();
    }
  }
  material.dispose();
}

/** Extra texture jobs owned by a body's gate, beyond its own surface (Earth's night and cloud layers, Saturn's rings). */
const EXTRA_TEXTURE_JOBS: Partial<Record<BodyId, readonly TextureJobId[]>> = {
  earth: ["earth_night", "earth_clouds"],
  saturn: ["saturn_ring"]
};

/** Scene-time length of each texture reveal, in milliseconds (the dissolve or crossfade). */
const REVEAL_MS = {
  sun: 600,
  surface: 700,
  ring: 700,
  clouds: 800,
  nightLights: 900
} as const;
/** The night lights follow their daymap by this much, so the city glow appears after the land. */
const NIGHT_LIGHTS_DELAY_MS = 150;

/** A reveal tween without its identity or start value: `startReveal` supplies those. */
type RevealSpec = Omit<RevealTween, "id" | "from">;

/** Scene-time length of each body's return-visit grow, in milliseconds. Bigger bodies take longer. */
const ENTRANCE_DURATION_MS: Record<BodyId, number> = {
  sun: 1000,
  mercury: 700,
  venus: 700,
  earth: 800,
  mars: 700,
  jupiter: 900,
  saturn: 900,
  uranus: 900,
  neptune: 900,
  moon: 650
};

const scratchWorldScale = new THREE.Vector3();

/**
 * World-space bounding radius of a body: its own sphere, widened to cover any
 * child mesh (Saturn's ring, Earth's cloud shell). Computed once at construction.
 */
function worldBoundingRadius(root: THREE.Mesh): number {
  root.updateWorldMatrix(true, false);
  // Not getWorldScale: since three 0.187 it reports a zero-scaled body as scale 1.
  scratchWorldScale.setFromMatrixScale(root.matrixWorld);
  const scale = Math.max(scratchWorldScale.x, scratchWorldScale.y, scratchWorldScale.z);
  let radius = 0;
  for (const obj of [root, ...root.children]) {
    if (!(obj instanceof THREE.Mesh)) continue;
    const geo = obj.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const local = (geo.boundingSphere?.radius ?? 0) + obj.position.length();
    radius = Math.max(radius, local);
  }
  return radius * scale;
}

// Module-level scratch for the Moon's in-plane point; consumed immediately, never stored.
const moonFlatScratch = { x: 0, z: 0 };

/**
 * Computes the Moon's local position relative to Earth. The orbit is inclined
 * by 5.14 degrees (true to life) relative to the ecliptic plane.
 */
export function computeMoonPosition(
  moonAngle: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): { x: number; y: number; z: number } {
  const m = ellipsePositionInto(MOON_ORBIT_RADIUS, 0, moonAngle, moonFlatScratch);
  out.x = m.x;
  out.y = m.z * MOON_SIN_INCL;
  out.z = m.z * MOON_COS_INCL;
  return out;
}

export class SolarSystem {
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly controls: CameraControls;
  private readonly loop: RenderLoop;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  // Reused for reading a body's world position each frame
  private readonly scratchWorldPos = new THREE.Vector3();
  private readonly scratchEarthWorldPos = new THREE.Vector3();
  // Reused per-frame Moon offset from Earth; only read within onFrame, never stored.
  private readonly scratchMoonOffset = { x: 0, y: 0, z: 0 };
  // Reused per-body in the frame loop; each value is copied into mesh.position before the next body.
  private readonly scratchFlat = { x: 0, z: 0 };
  private readonly scratchPoint = { x: 0, y: 0, z: 0 };
  // Reused pick buffers: a body's bounding sphere and its hit point on the ray. Never returned.
  private readonly scratchPickSphere = new THREE.Sphere();
  private readonly scratchPickPoint = new THREE.Vector3();
  // Reused hit list for one pick, nearest first; cleared before each pick and never returned.
  private readonly scratchHits: Array<{ mesh: THREE.Mesh; distance: number }> = [];
  // Eclipse handles: Earth is shadowed by the Moon (Solar Eclipse) and the Moon is shadowed by Earth (Lunar Eclipse).
  private readonly earthEclipse: EclipseShadowHandle;
  private readonly moonRadius: number;
  private readonly meshes: Map<BodyId, THREE.Mesh>;
  private readonly sun: AnimatedSun;
  private readonly sunLight: THREE.PointLight;
  private readonly built: BuiltBodies;
  private readonly moon: THREE.Mesh;
  private readonly moonOrbitLine: THREE.LineLoop;
  private readonly earthClouds: THREE.Mesh;
  // Pick proxies: each body is tested as its bounding sphere (see pickAt). `radius` is local.
  private readonly pickTargets: Array<{ readonly mesh: THREE.Mesh; readonly radius: number }>;
  private readonly hoverGlow: HoverGlow;
  // Body under the pointer, so a pointer move over the same body does not wake an idle loop.
  private hoveredId: BodyId | null = null;
  private reducedMotion: boolean;
  // Cancels in-flight texture streaming when the scene is torn down.
  private readonly textureAbort = new AbortController();
  private disposed = false;
  private lastElapsed = 0;
  private activeOrbitTime = 0;
  // Orbit clock rate. Reduced motion starts at 0 (paused); play()/setSpeed() opt in.
  private timeScale: number;
  // Orbit radii auto-computed from real distances (layout.ts): outermost orbit
  // reaches MAX_ORBIT_RADIUS, inner planets pushed apart so none overlap.
  private readonly radii = defaultOrbitRadii(MAX_ORBIT_RADIUS, EARTH_MOON_CLEARANCE);
  // Texture jobs not yet applied, and the bodies that must wait for them (see revealLimitPx).
  private readonly pendingTextureJobs: Set<TextureJobId>;
  private readonly revealGates: RevealGate[];
  private readonly scratchRevealPos = new THREE.Vector3();
  private readonly scratchRevealNdc = new THREE.Vector3();
  // Return-visit entrance (null on the first visit) and the texture jobs each body still waits on.
  private readonly entrance: EntranceAnimator<BodyId> | null;
  private readonly entranceWaits = new Map<BodyId, Set<TextureJobId>>();
  // Texture reveals in flight: each dissolve or crossfade is a tween on the scene clock.
  private readonly reveals = new RevealClock();
  // Earth's night lights wait on the day texture: whether the day applied, and a night map held for it.
  private earthDayApplied = false;
  private nightAwaitingDay = false;

  constructor(opts: SolarSystemOptions) {
    this.reducedMotion = opts.reducedMotion;
    // A visitor who asked for reduced motion gets a still scene until they press play.
    this.timeScale = opts.reducedMotion ? 0 : 1;
    const profile = detectQuality();

    // Camera rig: owns the camera, tween, ride-along, and overview guard.
    this.rig = new CameraRig({
      reducedMotion: opts.reducedMotion,
      onFocusChange: opts.onFocusChange,
      resolveDestination: (id) => this.destinationFor(id),
      // The rig runs only after the loop exists (its first call is the loop's resize).
      onActivity: () => this.loop.wake()
    });

    // Lights: one Sun point light + low ambient. Falloff is compressed rather
    // than physical inverse-square (see the lighting constants above).
    this.sunLight = new THREE.PointLight(0xffffff, SUN_LIGHT_INTENSITY, 0, SUN_LIGHT_DECAY);
    this.scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
    this.scene.add(this.sunLight);

    // Build the scene graph. Galactic skybox wraps everything as a background.
    const sky = buildGalacticSkybox();
    sky.mesh.matrixAutoUpdate = false;
    sky.mesh.updateMatrix();
    this.scene.add(sky.mesh);
    this.scene.add(buildStarfield(profile.starCount, profile.focalStarCount));
    for (const line of buildOrbitLines(this.radii)) this.scene.add(line);
    const built = buildBodies(profile, { revealSweep: opts.revealSweep ?? true });
    this.built = built;
    this.meshes = built.meshes;
    this.sun = built.sun;
    this.moon = built.moon;
    this.moonOrbitLine = built.moonOrbitLine;
    this.earthClouds = built.earthClouds;
    this.earthEclipse = built.earthMaterial.eclipse;
    if (!(built.moon.geometry instanceof THREE.SphereGeometry)) {
      throw new Error("SolarSystem: the Moon mesh must use a SphereGeometry");
    }
    this.moonRadius = built.moon.geometry.parameters.radius;
    // Add every body. The Sun is a group (photosphere), so add its group in place of
    // the bare photosphere mesh that lives in `meshes`. Its halo is a sibling of the
    // group, not a child, so it is added beside the group.
    this.scene.add(this.moon);
    this.scene.add(this.moonOrbitLine);
    for (const [id, mesh] of this.meshes) {
      this.scene.add(id === "sun" ? this.sun.group : mesh);
    }
    this.scene.add(this.sun.haloMesh);

    // Cache the pick proxies once so hover does not rebuild them every frame
    this.pickTargets = [...this.meshes.values(), this.moon].map((mesh) => {
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      return { mesh, radius: geo.boundingSphere?.radius ?? 0 };
    });

    // Every texture job this scene will run, and the bodies gated on them.
    const textureJobs = buildJobs(built);
    this.pendingTextureJobs = new Set(textureJobs.map((job) => job.id));
    this.revealGates = this.buildRevealGates();
    // After the reveal gates: they read the unscaled geometry, and the entrance writes scale.
    this.entrance = opts.entrance ? this.buildEntrance() : null;

    // Render loop + lifecycle. onFrame advances the scene; render() draws it.
    this.loop = new RenderLoop({
      canvas: opts.canvas,
      pixelRatioCap: profile.pixelRatioCap,
      onFrame: (elapsed) => this.onFrame(elapsed),
      render: () => this.loop.renderer.render(this.scene, this.rig.camera),
      // A scene at rest (paused orbits, settled camera, no fades) stops drawing until woken.
      isAnimating: () => this.isAnimating(),
      // Compile every program up front (in parallel where the GPU supports it), so the
      // first draw does not stall the main thread compiling them one by one.
      compile: () => this.compileScene()
    });
    try {
      // The canvas may run past the visible viewport under the iOS Safari toolbar
      // (--bleed-bottom); frame the visible part only.
      this.loop.onResize((w, h) => this.rig.setFrame(w, h, stageBleedPx()));

      // Soft glow hugging the body under the pointer. Hover only fires while
      // the controls are enabled, so it appears in orbit mode alone.
      this.hoverGlow = createHoverGlow({ reducedMotion: opts.reducedMotion });
      this.scene.add(this.hoverGlow.mesh);

      // Stream surface textures in; the scene is already visible in flat color.
      // Per-job failures settle inside loadAndApplyTextures; this only guards against
      // an unexpected rejection so it is logged rather than left unhandled.
      void loadAndApplyTextures(
        built,
        {
          signal: this.textureAbort.signal,
          jobs: textureJobs,
          ...(opts.onTextureProgress ? { onProgress: opts.onTextureProgress } : {}),
          onJobSettled: (id, applied) => {
            this.pendingTextureJobs.delete(id);
            this.beginRevealFor(id, applied);
            if (this.entrance) this.settleEntranceJob(id);
            // A new texture (snapped or dissolving) must reach the screen of an idle scene.
            this.loop.wake();
            if (id === "sun" && opts.onReady) {
              const onReady = opts.onReady;
              this.loop.renderOnce(() => {
                if (!this.disposed) onReady();
              });
            }
          },
          prioritized: opts.prioritizeTextures === true
        },
        this.loop.renderer
      ).catch((err: unknown) => {
        console.warn("SolarSystem: texture loading failed", err);
      });

      // Camera controls: drag-to-orbit, wheel/pinch-zoom. A tap (no drag) still
      // focuses a body; hover updates the cursor and glow. Picking stays here
      // (needs the raycaster); the controls layer just tells us where the pointer is.
      this.controls = new CameraControls({
        canvas: opts.canvas,
        rig: this.rig,
        onTap: (x, y) => {
          const hit = this.pickAt(x, y);
          if (hit) {
            opts.onBodyTap?.(hit);
            this.focus(hit);
          }
        },
        onHover: (x, y) => {
          const hit = this.pickAt(x, y);
          const style = this.loop.renderer.domElement.style;
          const cursor = hit ? "pointer" : "grab";
          // Hover fires every frame while the pointer moves; skip redundant style writes.
          if (style.cursor !== cursor) style.cursor = cursor;
          this.setHovered(hit);
        },
        onHoverEnd: () => this.setHovered(null)
      });

      this.loop.start();
    } catch (error) {
      // A constructor throw never reaches dispose(), so release what was built so far.
      this.textureAbort.abort();
      this.loop.dispose();
      throw error;
    }
  }

  focus(id: BodyId): void {
    this.rig.focus(id);
  }

  overview(): void {
    this.rig.overview();
  }

  play(): void {
    this.setSpeed(1);
  }

  pause(): void {
    this.setSpeed(0);
  }

  setSpeed(multiplier: number): void {
    this.timeScale = multiplier;
    this.loop.wake();
  }

  /** True while the orbit clock is stopped (paused, or speed 0). */
  isPaused(): boolean {
    return this.timeScale === 0;
  }

  /** Stop drawing while an opaque overlay covers the canvas; release to resume. */
  holdRendering(held: boolean): void {
    this.loop.setHeld(held);
  }

  /**
   * Height in CSS px of the camera's frame: the visible viewport. The canvas can be
   * taller (the bleed under the iOS Safari toolbar, see CameraRig.setFrame); pixel
   * sizes derived from the field of view must use this, not the canvas height.
   */
  private frameHeight(): number {
    const view = this.rig.camera.view;
    return view?.enabled ? view.fullHeight : this.loop.getRect().height;
  }

  /**
   * Largest radius, in CSS px from the viewport centre, that keeps every body
   * the camera currently shows textured. A body with pending texture jobs caps
   * the limit at its near edge (minus a small margin). Negative when a pending
   * body covers the centre (the Sun before its texture loads). Infinity when
   * nothing is pending. Reads the live orbit positions and camera each call.
   */
  revealLimitPx(): number {
    if (this.disposed || this.pendingTextureJobs.size === 0) return Infinity;
    const camera = this.rig.camera;
    // Projection needs the current view matrix; this is cheap and stays in sync with rig moves.
    camera.updateMatrixWorld();
    const rect = this.loop.getRect();
    const viewCx = window.innerWidth / 2;
    const viewCy = window.innerHeight / 2;
    // Pixels per unit of tangent at distance 1, for the vertical field of view.
    const halfTan = Math.tan((camera.fov * Math.PI) / 360);
    const pxPerTangent = this.frameHeight() / 2 / halfTan;

    let limit = Infinity;
    for (const gate of this.revealGates) {
      if (!gate.jobs.some((id) => this.pendingTextureJobs.has(id))) continue;
      const centre = gate.mesh.getWorldPosition(this.scratchRevealPos);
      const dist = centre.distanceTo(camera.position);
      const r = gate.worldRadius;
      if (dist <= r) {
        // Camera inside the body's sphere: nothing may open yet.
        limit = Math.min(limit, 0);
        continue;
      }
      const ndc = this.scratchRevealNdc.copy(centre).project(camera);
      const sx = rect.left + ((ndc.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - ndc.y) / 2) * rect.height;
      const centreDistPx = Math.hypot(sx - viewCx, sy - viewCy);
      // Angular radius of the sphere as a tangent: r / sqrt(d^2 - r^2).
      const radiusPx = (r / Math.sqrt(dist * dist - r * r)) * pxPerTangent;
      limit = Math.min(limit, centreDistPx - radiusPx - REVEAL_SAFETY_PX);
    }
    return limit;
  }

  setControlsEnabled(enabled: boolean): void {
    this.controls.setEnabled(enabled);
  }

  /** Glow around the hovered body, or fade the glow out when nothing is hovered. */
  private setHovered(id: BodyId | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    const mesh = id ? this.meshOf(id) : undefined;
    if (!id || !mesh) {
      this.hoverGlow.hide();
    } else {
      const color = id === "sun" ? SUN_SURFACE_COLOR : getBody(id).color;
      this.hoverGlow.show(mesh, bodyRadiusOf(mesh), color);
    }
    this.loop.wake();
  }

  /** One gate per visible body that owns texture jobs: the Sun, each planet, and the Moon. */
  private buildRevealGates(): RevealGate[] {
    const gates: RevealGate[] = [];
    const add = (mesh: THREE.Mesh, jobs: TextureJobId[]): void => {
      const live = jobs.filter((id) => this.pendingTextureJobs.has(id));
      if (live.length === 0) return;
      gates.push({ mesh, worldRadius: worldBoundingRadius(mesh), jobs: live });
    };
    add(this.sun.mesh, ["sun"]);
    for (const [id, mesh] of this.meshes) {
      if (id === "sun") continue;
      add(mesh, [id, ...(EXTRA_TEXTURE_JOBS[id] ?? [])]);
    }
    add(this.moon, ["moon"]);
    return gates;
  }

  /**
   * Registers every body at the hidden scale for the return-visit entrance, then
   * arms each one once its own texture jobs settle. A body with no jobs arms now.
   */
  private buildEntrance(): EntranceAnimator<BodyId> {
    const animator = new EntranceAnimator<BodyId>({
      reducedMotion: this.reducedMotion,
      maxWaitMs: ENTRANCE_MAX_WAIT_MS,
      onStalled: (id) => {
        console.warn(`SolarSystem: "${id}" was revealed before its textures settled`);
      }
    });
    const roots = new Map<BodyId, THREE.Object3D>();
    for (const [id, mesh] of this.meshes) roots.set(id, id === "sun" ? this.sun.group : mesh);
    roots.set("moon", this.moon);

    for (const id of this.pendingTextureJobs) {
      const owner = ownerOf(id);
      if (!isBodyId(owner)) continue;
      let waiting = this.entranceWaits.get(owner);
      if (!waiting) {
        waiting = new Set<TextureJobId>();
        this.entranceWaits.set(owner, waiting);
      }
      waiting.add(id);
    }

    for (const [id, root] of roots) {
      animator.register(id, {
        apply: (scale) => root.scale.setScalar(scale),
        durationMs: ENTRANCE_DURATION_MS[id]
      });
      if (!this.entranceWaits.get(id)?.size) animator.trigger(id);
    }
    return animator;
  }

  /**
   * A texture job settled. When it was the last one its body waited on, arm the
   * body's entrance after a drawn frame: that frame uploads the texture and compiles
   * its shader while the body is still at the hidden scale. Failed jobs release too.
   */
  private settleEntranceJob(id: TextureJobId): void {
    const owner = ownerOf(id);
    if (!isBodyId(owner) || !releaseJob(this.entranceWaits, owner, id)) return;
    this.loop.renderOnce(() => {
      if (this.disposed) return;
      this.entrance?.trigger(owner);
      this.loop.wake();
    });
  }

  /**
   * A texture job settled. Decides how its surface reveals and starts it. Runs in the
   * same turn as the apply, so no frame draws the finished texture before the reveal begins.
   */
  private beginRevealFor(id: TextureJobId, applied: boolean): void {
    if (id === "earth_night") {
      // City lights belong on the day surface: a night map that lands first waits for the day.
      if (this.pendingTextureJobs.has("earth")) {
        this.nightAwaitingDay = applied;
        return;
      }
      // A failed day leaves Earth flat, so its night lights stay dark too.
      if (!this.earthDayApplied) return;
    }
    this.beginReveal(id, this.revealModeOf(id, applied));
    if (id === "earth") {
      this.earthDayApplied = applied;
      if (this.nightAwaitingDay) {
        this.nightAwaitingDay = false;
        if (applied) this.beginReveal("earth_night", this.revealModeOf("earth_night", true));
      }
    }
  }

  /** The reveal mode for a job that settled: snaps while its body is still growing in. */
  private revealModeOf(id: TextureJobId, applied: boolean): RevealMode {
    const owner = ownerOf(id);
    const entranceHolds = this.entrance !== null && isBodyId(owner) && !this.entrance.isDone(owner);
    return revealModeFor({ applied, reducedMotion: this.reducedMotion, entranceHolds });
  }

  /**
   * Compiles the programs of every drawable object before the first frame. compileAsync walks
   * only visible objects, and the cloud layer is hidden until its texture lands, so its program
   * would compile mid-reveal. Show it for the warm-up, then restore the reveal's own rule: drawn
   * exactly while its opacity is above 0.
   */
  private compileScene(): Promise<unknown> {
    const clouds = this.earthClouds;
    clouds.visible = true;
    return this.loop.renderer.compileAsync(this.scene, this.rig.camera).finally(() => {
      clouds.visible = (clouds.material as THREE.MeshStandardMaterial).opacity > 0;
    });
  }

  /**
   * Starts one texture's reveal. "snap" writes the final values now. "dissolve" writes the
   * start values and schedules the tween.
   */
  private beginReveal(id: TextureJobId, mode: RevealMode): void {
    if (mode === "none") {
      // A Sun whose map failed keeps its procedural surface, but its glow must still come in.
      if (id === "sun") this.sun.igniteHalo();
      return;
    }
    const dissolve = mode === "dissolve";
    switch (id) {
      case "sun":
        this.startReveal(id, dissolve, {
          to: 1,
          durationMs: REVEAL_MS.sun,
          ease: easeOutSine,
          write: (v) => this.sun.setReveal(v)
        });
        return;
      case "earth_night":
        this.startReveal(id, dissolve, {
          to: NIGHT_LIGHTS_INTENSITY,
          delayMs: NIGHT_LIGHTS_DELAY_MS,
          durationMs: REVEAL_MS.nightLights,
          ease: easeOutExpo,
          write: (v) => this.built.earthMaterial.setNightIntensity(v)
        });
        return;
      case "earth_clouds": {
        const clouds = this.earthClouds;
        const mat = clouds.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        this.startReveal(id, dissolve, {
          to: CLOUD_OPACITY,
          durationMs: REVEAL_MS.clouds,
          ease: easeOutCubic,
          // Not drawn at all while transparent.
          write: (v) => {
            mat.opacity = v;
            clouds.visible = v > 0;
          }
        });
        return;
      }
      case "saturn_ring": {
        // Tint and opacity: a plain crossfade of the flat colour, no noise.
        const handle = this.built.reveals.get("saturn_ring");
        const ring = this.built.ring;
        if (handle) {
          this.startReveal(id, dissolve, {
            to: 1,
            durationMs: REVEAL_MS.ring,
            ease: easeOutExpo,
            write: (v) => handle.setProgress(v)
          });
        }
        const mat = ring?.material;
        if (mat instanceof THREE.MeshBasicMaterial) {
          this.startReveal(
            `${id}:opacity`,
            dissolve,
            {
              to: 1,
              durationMs: REVEAL_MS.ring,
              ease: easeOutCubic,
              write: (v) => {
                mat.opacity = v;
              }
            },
            RING_FLAT_OPACITY
          );
        }
        return;
      }
      default: {
        // Planets and the Moon: the day surface dissolves in from its flat colour.
        const handle = this.built.reveals.get(id);
        if (!handle) return;
        this.startReveal(id, dissolve, {
          to: 1,
          durationMs: REVEAL_MS.surface,
          ease: easeOutExpo,
          write: (v) => handle.setProgress(v)
        });
      }
    }
  }

  /**
   * Snap writes the final value. Dissolve writes `from` now (the reveal begins in this
   * turn) and tweens to the final value on the scene clock.
   */
  private startReveal(id: string, dissolve: boolean, spec: RevealSpec, from = 0): void {
    if (!dissolve) {
      spec.write(spec.to);
      return;
    }
    spec.write(from);
    this.reveals.schedule({ ...spec, id, from });
  }

  /** The Moon lives outside `meshes` (it is not a Sun-orbiting body). */
  private meshOf(id: BodyId): THREE.Mesh | undefined {
    return id === "moon" ? this.moon : this.meshes.get(id);
  }

  private orbitRadiusOf(id: BodyId): number {
    return this.radii.get(id) ?? 0;
  }

  /** Live camera destination for a body at its current orbital position. */
  private destinationFor(id: BodyId): { position: Vec3; lookAt: Vec3 } | null {
    // The Moon is a scene-level object (not parented to Earth), so its `.position`
    // is already world space. Planets are parented to the scene too, but read
    // their world position so the camera frames them wherever they are.
    const mesh = this.meshOf(id);
    if (!mesh) return null;
    const worldPos = id === "moon" ? mesh.position : mesh.getWorldPosition(this.scratchWorldPos);
    // cameraTargetFor only reads the coordinates and returns fresh objects, so
    // passing the scratch vector directly never leaks a reference to it.
    return cameraTargetFor(getBody(id), worldPos);
  }

  /**
   * Follow a live change to the OS reduced-motion setting. The orbit clock, rig,
   * entrance, hover glow and panels read the flag per frame or per event, so
   * switching motion off settles any flight, spring or entrance already running.
   */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    this.rig.setReducedMotion(reduced);
    this.entrance?.setReducedMotion(reduced);
    this.hoverGlow.setReducedMotion(reduced);
    // Dissolves already running land on their final look, like the rig and entrance.
    if (reduced) this.reveals.finishAll();
    this.loop.wake();
  }

  /**
   * Whether the next frame can differ from the last one drawn. False once the orbit
   * clock is stopped and every camera move, fade, entrance and reveal has finished;
   * the render loop then idles until something wakes it.
   */
  private isAnimating(): boolean {
    return (
      this.timeScale !== 0 ||
      this.rig.isAnimating() ||
      this.reveals.activeCount > 0 ||
      (this.entrance?.isAnimating() ?? false) ||
      this.hoverGlow.isAnimating()
    );
  }

  /** Per-frame update: position bodies for `elapsed`, then advance the camera. */
  private onFrame(elapsed: number): void {
    const delta = elapsed - this.lastElapsed;
    this.lastElapsed = elapsed;

    this.activeOrbitTime += delta * this.timeScale;
    const orbitTime = this.activeOrbitTime;

    for (const body of BODIES) {
      const orbitRadius = this.orbitRadiusOf(body.id);
      if (orbitRadius === 0) continue;
      const mesh = this.meshes.get(body.id);
      if (!mesh) continue;
      // Elliptical orbit with the Sun at the focus (Kepler's first law),
      // computed flat in the ecliptic then tipped into the body's real
      // (inclined) orbital plane — the planets are NOT coplanar.
      const flat = ellipsePositionInto(
        orbitRadius,
        body.facts.eccentricity,
        body.orbitSpeed * orbitTime,
        this.scratchFlat
      );
      const p = orbitPointInto(body, flat, this.scratchPoint);
      mesh.position.set(p.x, p.y, p.z);
      // Axial spin scaled by actual relative day lengths
      mesh.rotation.y = AXIAL_SPIN * body.facts.spinSpeed * orbitTime;
    }
    // Return-visit grow-in. Scale is written only here; positions above are untouched.
    // The loop's clock is in seconds; the animator works in milliseconds.
    this.entrance?.update(elapsed * 1000);
    // Texture reveals advance on the same scene clock (zero work when none are running).
    this.reveals.update(elapsed * 1000);

    // The Moon orbits Earth independently in world space to avoid Earth's axial spin.
    // A quarter-turn start phase keeps it out of Earth's shadow at rest.
    const moonAngle = MOON_START_PHASE + MOON_ORBIT_SPEED * orbitTime;
    const m = computeMoonPosition(moonAngle, this.scratchMoonOffset);

    const earthMesh = this.meshes.get("earth");
    if (earthMesh) {
      earthMesh.getWorldPosition(this.scratchEarthWorldPos);
      this.moon.position.set(
        this.scratchEarthWorldPos.x + m.x,
        this.scratchEarthWorldPos.y + m.y,
        this.scratchEarthWorldPos.z + m.z
      );
      this.moonOrbitLine.position.copy(this.scratchEarthWorldPos);
    }
    // Add Math.PI so the 'front' of the Moon texture faces the Earth (tidal locking).
    this.moon.rotation.y = Math.atan2(m.x, m.z) + Math.PI;

    // Earth's cloud layer drifts a touch faster than the surface turns.
    this.earthClouds.rotation.y = CLOUD_SPIN * orbitTime;

    // The Sun burns: churning plasma on the photosphere surface. Frozen to a
    // static star while paused (orbitTime holds still). A slow axial spin
    // drags the surface detail across the disc on top of the shader's own churn.
    this.sun.update(orbitTime);
    this.sun.group.rotation.y = AXIAL_SPIN * 0.5 * orbitTime;

    // Eclipse: Moon casts shadow on Earth (Solar Eclipse)
    if (earthMesh) {
      // The Moon is scene-level, so its position is already world space.
      // The Moon's shadow shrinks with the Moon while it grows in.
      const moonScale = this.entrance?.scaleOf("moon") ?? 1;
      this.earthEclipse.updateEclipse(this.moon.position, this.moonRadius * 1.8 * moonScale, true);
    }

    // Advance the camera AFTER bodies are placed so ride-along / tween re-aim
    // use fresh positions.
    this.rig.update(elapsed);
    // The Sun's halo sizes itself for the camera's distance, so it follows the rig.
    this.sun.updateHalo(this.rig.camera, this.frameHeight());
    // The glow tracks its body and sizes itself for the camera, so it goes last.
    this.hoverGlow.update(this.rig.camera, delta, this.frameHeight());
  }

  /** Pick at a client-space point, returning the nearest body under it (if any). */
  private pickAt(clientX: number, clientY: number): BodyId | null {
    const rect = this.loop.getRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const ray = this.raycaster.ray;
    this.scratchHits.length = 0;
    // One sphere test per body (eleven in all) instead of a triangle test per face: a
    // body's pick proxy is its bounding sphere, which the mesh's surface never leaves.
    for (const target of this.pickTargets) {
      const { mesh } = target;
      mesh.getWorldPosition(this.scratchPickSphere.center);
      scratchWorldScale.setFromMatrixScale(mesh.matrixWorld);
      this.scratchPickSphere.radius =
        target.radius * Math.max(scratchWorldScale.x, scratchWorldScale.y, scratchWorldScale.z);
      const point = ray.intersectSphere(this.scratchPickSphere, this.scratchPickPoint);
      if (point) this.scratchHits.push({ mesh, distance: ray.origin.distanceTo(point) });
    }
    this.scratchHits.sort((a, b) => a.distance - b.distance);
    for (const hit of this.scratchHits) {
      const id = hit.mesh.userData.bodyId;
      if (typeof id !== "string" || !isBodyId(id)) return null;
      // A body still growing in is not yet pickable; look through to the bodies behind it.
      if (this.entrance && !this.entrance.isDone(id)) continue;
      return id;
    }
    return null;
  }

  /** Tear down the scene: stop all loops and streams, and free GPU resources. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureAbort.abort();
    this.entrance?.dispose();
    this.reveals.clear();
    this.controls.dispose();
    // Free textures/geometry BEFORE the renderer: renderer.dispose() resets its
    // per-texture GPU bookkeeping, after which texture.dispose() can no longer
    // reach gl.deleteTexture.
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) disposeMaterial(material);
      }
    });
    this.built.earthMaterial.disposeTextures();
    this.loop.dispose();
  }
}
