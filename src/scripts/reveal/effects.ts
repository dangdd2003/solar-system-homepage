/** Synchronous reveal dispatcher backed by lazily loaded role/generation pools. */
import type { EffectBuilder, EffectContext } from "./kit";
import { POOLS, isRevealType } from "./pools";
import { POOL_MODULES } from "./pool-modules";

export { D, SPRING_GRAVITY, SPRING_POP, SPRING_SOFT } from "./kit";
export type { EffectBuilder, EffectContext } from "./kit";

type Registry = Readonly<Record<string, EffectBuilder>>;
type EffectModule = Record<string, Registry>;
const modules = import.meta.glob<EffectModule>(["./pools/*.ts", "!./pools/glass.ts"]);
modules["./legacy-effects.ts"] = () => import("./legacy-effects");

/** Only populated when the corresponding lazy module has finished loading. */
export const EFFECTS: Record<string, EffectBuilder> = Object.create(null);
const pending = new Map<string, Promise<void>>();
const ready = new Set<string>();
type ResolvedEffect = (...args: Parameters<EffectBuilder>) => ReturnType<EffectBuilder> | null;
const noEffect: ResolvedEffect = () => null;

/** Retired effect names, kept so older markup still resolves. */
export const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  pop: "twinkle",
  "flip-up": "orbit-in",
  "tilt-in": "orbit-in",
  "grow-x": "comet",
  "grow-y": "comet",
  "hero-name": "supernova",
  "more-slide-left": "orbit-in",
  "more-slide-right": "orbit-in",
  "contact-draw": "draw"
});

function keyOf(name: string | undefined): string {
  if (name?.startsWith("@")) {
    const type = name.slice(1);
    return isRevealType(type) ? POOLS[type][0].name : "";
  }
  return name ? (ALIASES[name] ?? name) : "fade";
}

function loadModule(path: string): Promise<void> {
  if (ready.has(path)) return Promise.resolve();
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const load = modules[path];
  if (!load) return Promise.resolve();
  const promise = load()
    .then((module) => {
      // Pool modules export their registry; legacy also re-exports kit helpers.
      for (const [key, registry] of Object.entries(module)) {
        if (key === "LEGACY" || key.endsWith("_EFFECTS")) Object.assign(EFFECTS, registry);
      }
      ready.add(path);
    })
    .catch((err: unknown) => {
      // The synchronous fallback already revealed this entry. Never replay it
      // late, and allow a later entry to retry a failed network request.
      console.warn("[reveal] effect pool could not load", err);
    })
    .finally(() => pending.delete(path));
  pending.set(path, promise);
  return promise;
}

/** Warm exactly the modules selected by the unchanged choreography and tier. */
export async function preloadEffects(names: Iterable<string | undefined>): Promise<void> {
  const paths = new Set<string>();
  for (const name of names) paths.add(POOL_MODULES.get(keyOf(name)) ?? "./legacy-effects.ts");
  await Promise.all([...paths].map(loadModule));
}

const warned = new Set<string>();

/** Known but cold effects show content immediately, with no asynchronous replay. */
export function resolveEffect(name: string | undefined): ResolvedEffect {
  const key = keyOf(name);
  const builder = EFFECTS[key];
  if (builder) return builder;
  if (POOL_MODULES.has(key)) return noEffect;
  if (name && !warned.has(name)) {
    warned.add(name);
    console.warn(`[reveal] unknown effect "${name}", falling back to "fade"`);
  }
  return EFFECTS.fade ?? noEffect;
}

/** Builds synchronously; a loading pool cannot retain or later animate its host. */
export function runEffect(
  el: HTMLElement,
  ctx: EffectContext,
  name?: string
): { revert(): unknown } | null {
  return resolveEffect(name ?? el.dataset.reveal)(el, ctx) ?? null;
}
