import {
  ImageBitmapLoader,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer
} from "three";
import type { BodyId } from "./bodies";
import type { BuiltBodies } from "./scene-builder";
import { releasePlaceholder } from "./solid-texture";
import {
  EARTH_CLOUDS_TEXTURE_URL,
  EARTH_NIGHT_TEXTURE_URL,
  MOON_TEXTURE_URL,
  PLANET_TEXTURE_URLS,
  SATURN_RING_TEXTURE_URL,
  textureUrlFor
} from "./textures";

declare global {
  interface Window {
    __SUN_TEXTURE_READY__?: boolean;
  }
}

/**
 * Anything that loads a texture by URL. TextureLoader satisfies it; so does
 * the bitmap source below. `onLoad` always receives a Texture.
 */
export interface TextureSource {
  load(
    url: string,
    onLoad: (tex: Texture) => void,
    onProgress?: unknown,
    onError?: (err?: unknown) => void
  ): void;
}

/**
 * Loads textures through ImageBitmapLoader (fetch + createImageBitmap). The
 * browser decodes the image off the main thread; a TextureLoader instead decodes
 * synchronously inside the first upload. The bitmap backs its texture until the
 * texture is disposed.
 */
class BitmapTextureSource implements TextureSource {
  // WebGL ignores UNPACK_FLIP_Y for ImageBitmap sources, so the flip happens at decode
  // and the texture must not ask for another one.
  private readonly bitmaps = new ImageBitmapLoader().setOptions({
    imageOrientation: "flipY",
    premultiplyAlpha: "none"
  });

  load(
    url: string,
    onLoad: (tex: Texture) => void,
    _onProgress?: unknown,
    onError?: (err?: unknown) => void
  ): void {
    this.bitmaps.load(
      url,
      (bitmap) => {
        const tex = new Texture(bitmap);
        tex.flipY = false;
        tex.addEventListener("dispose", () => bitmap.close());
        tex.needsUpdate = true;
        onLoad(tex);
      },
      undefined,
      (err) => onError?.(err)
    );
  }
}

/** Default texture source: bitmaps where the browser supports them, TextureLoader otherwise. */
export function createTextureSource(): TextureSource {
  const bitmapsSupported = typeof createImageBitmap === "function" && typeof fetch === "function";
  return bitmapsSupported ? new BitmapTextureSource() : new TextureLoader();
}

/** Downloads in flight at once when textures are prioritized. */
const PRIORITIZED_CONCURRENCY = 6;
/** Highest anisotropic filtering level requested; the GPU's own maximum caps it lower. */
const MAX_TEXTURE_ANISOTROPY = 8;

export type TextureJobId = BodyId | "earth_night" | "earth_clouds" | "saturn_ring";

interface TextureLoadOptions {
  /** Called after each texture resolves (loaded, total). Fires on error too. */
  onProgress?: ((loaded: number, total: number) => void) | undefined;
  /**
   * Jobs from `buildJobs(built)`, for callers that already built them. Defaults to
   * building them here, so a caller that also needs the job ids builds the list once.
   */
  jobs?: readonly TextureJob[] | undefined;
  /**
   * Called once per job when it is finished, in the same turn as its apply: `applied`
   * is true when the texture went onto its surface, false when it failed or threw and
   * the body stays flat. Not called for jobs abandoned through `signal`.
   */
  onJobSettled?: ((id: TextureJobId, applied: boolean) => void) | undefined;
  /**
   * Optional custom source (useful for testing and dependency injection). Defaults to
   * createTextureSource(): off-thread ImageBitmap decoding when available.
   */
  loader?: TextureSource | undefined;
  /**
   * Aborting this signal stops applying textures: downloads already in flight
   * still finish, but textures that arrive afterwards are disposed instead of
   * being applied to (possibly dead) materials.
   */
  signal?: AbortSignal | undefined;
  /**
   * Stream in orbit order (Sun, Mercury, Venus, Earth, Mars, ...) through a small
   * download pool. Without it, every download starts at once in `buildJobs` order.
   * Uploads are throttled to one per animation frame in both modes, so they never
   * stack into one main-thread stall.
   */
  prioritized?: boolean | undefined;
}

/**
 * Run queued GPU uploads one per animation frame (synchronously without rAF).
 * Used for every load, so textures arriving together (e.g. a returning visitor's
 * whole set) never upload in the same frame as the hero reveal.
 */
function createUploadQueue(): (upload: () => void) => void {
  const pending: Array<() => void> = [];
  let scheduled = false;
  const drain = (): void => {
    // Reschedule in `finally` so one throwing upload cannot stall the rest of the queue.
    try {
      pending.shift()?.();
    } finally {
      if (pending.length > 0) requestAnimationFrame(drain);
      else scheduled = false;
    }
  };
  return (upload) => {
    if (typeof requestAnimationFrame !== "function") {
      upload();
      return;
    }
    pending.push(upload);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(drain);
    }
  };
}

interface Job {
  readonly id: TextureJobId;
  readonly url: string;
  readonly apply: (tex: Texture) => void;
}

/** One surface texture to stream: what `buildJobs` returns. */
export type TextureJob = Job;

/**
 * Anisotropy to request for a streamed texture. Sampling stays sharp at grazing
 * angles, which is where the planets' limbs and the ring are seen. Renderers
 * without the capability query (test doubles) keep the default of 1.
 */
function textureAnisotropy(renderer: WebGLRenderer | undefined): number {
  const gpuMax = renderer?.capabilities?.getMaxAnisotropy?.();
  if (typeof gpuMax !== "number" || gpuMax <= 1) return 1;
  return Math.min(MAX_TEXTURE_ANISOTROPY, gpuMax);
}

/** Position of each job in the orbit walk outward from the Sun; moons share their planet's rank. */
const ORBIT_RANK: Record<TextureJobId, number> = {
  sun: 0,
  mercury: 1,
  venus: 2,
  earth: 3,
  earth_night: 3,
  earth_clouds: 3,
  moon: 3,
  mars: 4,
  jupiter: 5,
  saturn: 6,
  saturn_ring: 6,
  uranus: 7,
  neptune: 8
};

/** Collect every surface-texture job the built scene needs, Sun first. */
export function buildJobs(built: BuiltBodies): Job[] {
  const jobs: Job[] = [];

  jobs.push({
    id: "sun",
    url: PLANET_TEXTURE_URLS.sun,
    apply: (tex) => {
      built.sun.setSurfaceMap(tex);
      if (typeof window !== "undefined") {
        window.__SUN_TEXTURE_READY__ = true;
        if (typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("sun:loaded"));
        }
      }
    }
  });

  const earthMesh = built.meshes.get("earth");
  if (earthMesh) {
    jobs.push({
      id: "earth",
      url: textureUrlFor("earth"),
      apply: (tex) => applySurface(earthMesh, tex)
    });
  }

  jobs.push({
    id: "moon",
    url: MOON_TEXTURE_URL,
    apply: (tex) => applySurface(built.moon, tex)
  });

  jobs.push({
    id: "earth_night",
    url: EARTH_NIGHT_TEXTURE_URL,
    apply: (tex) => built.earthMaterial.setNightMap(tex)
  });

  jobs.push({
    id: "earth_clouds",
    url: EARTH_CLOUDS_TEXTURE_URL,
    apply: (tex) => {
      const mat = built.earthClouds.material;
      if (!(mat instanceof MeshStandardMaterial)) return;
      releasePlaceholder(mat.map);
      releasePlaceholder(mat.alphaMap);
      // Same map presence and colour space as the placeholders, so no program change.
      // Opacity and visibility belong to the reveal (SolarSystem), not to the swap.
      mat.map = tex;
      mat.alphaMap = tex;
    }
  });

  const bodyIds: BodyId[] = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"];
  for (const id of bodyIds) {
    const mesh = built.meshes.get(id);
    if (mesh) {
      jobs.push({
        id,
        url: textureUrlFor(id),
        apply: (tex) => applySurface(mesh, tex)
      });
    }
  }

  const saturn = built.meshes.get("saturn");
  if (saturn) {
    const ring = saturn.children.find(
      (c): c is Mesh => c instanceof Mesh && c.geometry instanceof RingGeometry
    );
    if (ring) {
      jobs.push({
        id: "saturn_ring",
        url: SATURN_RING_TEXTURE_URL,
        apply: (tex) => {
          const mat = ring.material;
          if (!(mat instanceof MeshBasicMaterial)) return;
          releasePlaceholder(mat.map);
          releasePlaceholder(mat.alphaMap);
          mat.map = tex;
          mat.alphaMap = tex;
          // Tint and opacity belong to the reveal (SolarSystem), not to the swap.
          mat.transparent = true;
        }
      });
    }
  }

  return jobs;
}

/** Stable sort of jobs into orbit order (inner bodies first, moons with their planet). */
export function orbitOrder(jobs: readonly Job[]): Job[] {
  return [...jobs].sort((a, b) => ORBIT_RANK[a.id] - ORBIT_RANK[b.id]);
}

/** Run `run` over `items` with at most `width` in flight, starting items in order. */
async function runPool<T>(
  items: readonly T[],
  width: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined) await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
}

/**
 * Stream every surface texture in and apply each one as it arrives. Resolves
 * when all textures finish loading or as soon as `opts.signal` aborts (whichever
 * comes first). A texture that never arrives keeps the promise pending until abort.
 */
export function loadAndApplyTextures(
  built: BuiltBodies,
  opts: TextureLoadOptions = {},
  renderer?: WebGLRenderer
): Promise<void> {
  const signal = opts.signal;
  const loader = opts.loader ?? createTextureSource();
  const jobs = opts.jobs ?? buildJobs(built);
  const anisotropy = textureAnisotropy(renderer);
  const total = jobs.length;

  let loaded = 0;
  const settle = (id: TextureJobId, applied: boolean): void => {
    loaded += 1;
    opts.onProgress?.(loaded, total);
    opts.onJobSettled?.(id, applied);
  };

  // Report the starting 0/total so the UI can show the pill immediately.
  opts.onProgress?.(0, total);

  // Already cancelled: start nothing.
  if (signal?.aborted) return Promise.resolve();

  const prioritized = opts.prioritized === true;
  const enqueueUpload = createUploadQueue();

  const runJob = (job: Job): Promise<void> =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const onFailure = (): void => {
        // Count failures as done so flat colors remain and unblocks promise
        if (!signal?.aborted) settle(job.id, false);
        resolve();
      };
      try {
        loader.load(
          job.url,
          (tex) => {
            const upload = (): void => {
              if (signal?.aborted) {
                // Late arrival after cancellation: free it rather than apply it.
                tex.dispose();
                resolve();
                return;
              }
              let applied = false;
              try {
                // The one colour-space writer for streamed surfaces. Every apply helper runs after
                // this, so none of them sets it again.
                tex.colorSpace = SRGBColorSpace;
                // Read by the texture parameters set during this first upload.
                tex.anisotropy = anisotropy;
                tex.needsUpdate = true;
                if (renderer && typeof renderer.initTexture === "function") {
                  renderer.initTexture(tex);
                }
                job.apply(tex);
                applied = true;
              } catch (err) {
                // Keep the progress counter and the job promise consistent even if
                // the upload or the apply throws, then surface the error. A texture that
                // threw never reached a surface, so free it now rather than at GC.
                tex.dispose();
                console.error(err);
              } finally {
                settle(job.id, applied);
                resolve();
              }
            };
            enqueueUpload(upload);
          },
          undefined,
          onFailure
        );
      } catch (err) {
        // A loader that throws synchronously (e.g. bad URL) is handled like a load error.
        // Without this, the executor rejects and the job never settles.
        console.error(err);
        onFailure();
      }
    });

  const promises = prioritized
    ? [runPool(orbitOrder(jobs), PRIORITIZED_CONCURRENCY, runJob)]
    : jobs.map(runJob);

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<void>((resolve) => {
    if (!signal) return;
    onAbort = () => resolve();
    signal.addEventListener("abort", onAbort, { once: true });
  });

  return Promise.race([Promise.all(promises).then(() => {}), abortPromise]).finally(() => {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  });
}

/** Apply a surface map to a body and reset its tint color to white so the
 *  texture displays its true colours at full brightness. */
export function applySurface(mesh: Mesh, tex: Texture): void {
  const mat = mesh.material;
  if (!(mat instanceof MeshBasicMaterial) && !(mat instanceof MeshStandardMaterial)) {
    return;
  }
  releasePlaceholder(mat.map);
  mat.map = tex;
  mat.color.set(0xffffff);
  // No needsUpdate: the placeholder already fixed USE_MAP, and the map and colour are
  // uniforms that the renderer re-uploads on the next draw. A version bump would only
  // re-run the program lookup.
}
