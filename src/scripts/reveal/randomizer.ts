import { isTouchInput, resolveTier, type TierEnv, type TierProfile } from "./tiers";
/**
 * Randomized effect choice for typed reveals (`data-reveal="@<type>"`).
 *
 * A roller is created per panel. Each time the panel is entered it picks one
 * pool member and one cascade pattern per type present in the panel, never
 * repeating the previous pick of that type. Forced picks (debugging and the
 * browser sweep) are module-level and win over the roller.
 *
 * planCascade() turns a panel's cascade into per-element slots, indices and
 * direction vectors, so the same roll drives every element of one entry.
 */

import { POOLS, PATTERNS, isRevealType, type PoolEntry, type RevealType } from "./pools";
import { clamp } from "../../utils/math";
import { hash01, type StaggerPattern, type Vec } from "./kit";

/** Returns a number in [0, 1). */
export type Rng = () => number;

/** Device class used to choose effects without making the pools device-aware. */
export type DeviceTier = "compact-phone" | "landscape-phone" | "touch-tablet" | "desktop";

export interface DeviceProfile {
  readonly tier: DeviceTier;
  readonly compact: boolean;
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
  readonly reducedTransparency: boolean;
}

export interface DeviceEnvironment {
  readonly width?: number;
  readonly height?: number;
  readonly maxTouchPoints?: number;
  readonly matchMedia?: (query: string) => { matches: boolean };
  readonly saveData?: boolean;
}

function mediaMatches(
  query: string,
  matchMedia: DeviceEnvironment["matchMedia"] = typeof window !== "undefined" &&
  typeof window.matchMedia === "function"
    ? window.matchMedia.bind(window)
    : undefined
): boolean {
  try {
    return matchMedia?.(query).matches ?? false;
  } catch {
    return false;
  }
}

function viewportDimension(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readSaveData(): boolean {
  try {
    return Boolean(
      typeof navigator !== "undefined" &&
      "connection" in navigator &&
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    );
  } catch {
    return false;
  }
}

/** Resolves the effective reveal profile from viewport, input and media preferences. */
export function resolveDeviceTier(environment: DeviceEnvironment = {}): DeviceProfile {
  const width = viewportDimension(
    environment.width,
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const height = viewportDimension(
    environment.height,
    typeof window !== "undefined" ? window.innerHeight : 768
  );
  const touchPoints =
    environment.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const media = environment.matchMedia;
  const touch = isTouchInput((query) => mediaMatches(query, media), touchPoints);

  const env: TierEnv = {
    width,
    height,
    touch,
    reducedMotion: mediaMatches("(prefers-reduced-motion: reduce)", media),
    reducedTransparency: mediaMatches("(prefers-reduced-transparency: reduce)", media),
    forcedColors: mediaMatches("(forced-colors: active)", media),
    saveData: environment.saveData ?? readSaveData(),
    zoomScale: 1
  };

  const profile: TierProfile = resolveTier(env);

  return {
    tier: profile.tier,
    compact: profile.compact,
    reducedMotion: profile.reducedMotion,
    saveData: profile.saveData,
    reducedTransparency: profile.reducedTransparency
  };
}

/** Returns whether a tier should receive only pool members marked compact-safe. */
export function isCompactTier(tier: DeviceTier): boolean {
  return tier === "compact-phone" || tier === "landscape-phone";
}

export interface Roll {
  /** Pool member name. */
  readonly effect: string;
  /** Cascade order for this type. */
  readonly pattern: StaggerPattern;
  /** uint31; drives hash01 and the seeded stagger. */
  readonly seed: number;
  /** Origin for "grid-corner": TL, TR, BL, BR. */
  readonly corner: 0 | 1 | 2 | 3;
}

export interface Roller {
  roll(types: Iterable<RevealType>, compact: boolean): ReadonlyMap<RevealType, Roll>;
  last(type: RevealType): Roll | undefined;
}

interface Forced {
  readonly effect: string | null;
  readonly pattern: StaggerPattern | null;
}

/** Forced picks shared by every panel; keyed by type. */
const forced = new Map<RevealType, Forced>();

/** Forces the effect (and optionally the pattern) for a type. Bypasses no-repeat. */
export function forceEffect(
  type: RevealType,
  effect: string | null,
  pattern?: StaggerPattern | null
): void {
  const next = pattern ?? null;
  if (effect === null && next === null) forced.delete(type);
  else forced.set(type, { effect, pattern: next });
}

/** Drops every forced pick. */
export function getForcedMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of forced) {
    if (v.effect) map.set(k, v.effect);
  }
  return map;
}

export function clearForced(): void {
  forced.clear();
}

/**
 * Creates a roller with its own no-repeat memory. Types are visited in
 * alphabetical order so the number of RNG draws is deterministic.
 */
export function createRoller(rng: Rng = Math.random): Roller {
  const last = new Map<RevealType, Roll>();

  /** Picks an option; a single option takes no draw. */
  const choose = <T>(options: readonly T[]): T => {
    const index = options.length > 1 ? Math.floor(rng() * options.length) : 0;
    return options[index] as T;
  };

  /** Drops the previous pick when another option remains. */
  const withoutLast = <T>(options: readonly T[], previous: T | undefined): readonly T[] => {
    if (options.length <= 1 || previous === undefined) return options;
    return options.filter((option) => option !== previous);
  };

  const rollType = (type: RevealType, compact: boolean): Roll | undefined => {
    const previous = last.get(type);
    const pins = forced.get(type);

    const members: readonly PoolEntry[] = POOLS[type];
    const candidates = members
      .filter((entry) => !compact || entry.compact !== false)
      .map((entry) => entry.name);
    if (!pins?.effect && candidates.length === 0) return undefined;
    const effect = pins?.effect ?? choose(withoutLast(candidates, previous?.effect));

    const patterns = PATTERNS[type];
    const pattern = pins?.pattern ?? choose(withoutLast(patterns, previous?.pattern));

    const seed = Math.floor(rng() * 2 ** 31);
    const corner = Math.floor(rng() * 4) as 0 | 1 | 2 | 3;
    const roll: Roll = { effect, pattern, seed, corner };
    last.set(type, roll);
    return roll;
  };

  return {
    roll(types, compact) {
      const rolls = new Map<RevealType, Roll>();
      for (const type of [...new Set(types)].sort()) {
        const roll = rollType(type, compact);
        if (roll) rolls.set(type, roll);
      }
      return rolls;
    },
    last: (type) => last.get(type)
  };
}

/** The reveal type of a `data-reveal` value ("@card" → "card"), or null for pinned names. */
export function parseType(value: string | undefined): RevealType | null {
  if (!value?.startsWith("@")) return null;
  const type = value.slice(1);
  return isRevealType(type) ? type : null;
}

/** One element of a batch: its reading-order index is its position in `entries`. */
export interface PlanEntry {
  readonly el: HTMLElement;
  readonly rect: DOMRect;
  readonly type: RevealType | null;
}

export interface PlanSlot {
  readonly slot: number;
  readonly index: number;
  readonly count: number;
  readonly vec: Vec;
}

const ZERO: Vec = Object.freeze({ x: 0, y: 0 });

/** Rounds to three decimals and folds -0 into 0. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000 + 0;

interface Member {
  readonly i: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * Pure cascade plan. `entries` are in reading order and `slots[i]` is entry
 * i's reading-order slot. Typed members of one type reuse only their own
 * slots, so types stay interleaved and the maximum slot never grows. Pinned
 * entries (no type, or no roll) keep their slot.
 */
export function planCascade(
  entries: readonly PlanEntry[],
  slots: readonly number[],
  rolls: ReadonlyMap<RevealType, Roll>,
  rankOf?: (el: HTMLElement) => number
): PlanSlot[] {
  const effectiveSlots = rankOf ? entries.map((e) => slots[rankOf(e.el)] ?? 0) : slots;
  const plan: PlanSlot[] = entries.map((_, i) => ({
    slot: effectiveSlots[i] ?? 0,
    index: 0,
    count: 1,
    vec: ZERO
  }));

  const groups = new Map<RevealType, Member[]>();
  entries.forEach((entry, i) => {
    if (!entry.type || !rolls.has(entry.type)) return;
    const { left, top, width, height } = entry.rect;
    const members = groups.get(entry.type) ?? [];
    members.push({ i, cx: left + width / 2, cy: top + height / 2 });
    groups.set(entry.type, members);
  });

  for (const [type, members] of groups) {
    const roll = rolls.get(type);
    if (roll) planGroup(members, roll, effectiveSlots, plan);
  }
  return plan;
}

/** Writes the plan for one type's members into `plan`. */
function planGroup(
  members: readonly Member[],
  roll: Roll,
  slots: readonly number[],
  plan: PlanSlot[]
): void {
  const count = members.length;
  const own = members.map((m) => slots[m.i] ?? 0).sort((a, b) => a - b);

  const xs = members.map((m) => m.cx);
  const ys = members.map((m) => m.cy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const halfW = Math.max((maxX - minX) / 2, 1);
  const halfH = Math.max((maxY - minY) / 2, 1);
  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY }
  ];
  const origin = roll.pattern === "grid-corner" ? (corners[roll.corner] ?? centre) : centre;

  const keyOf = (rank: number, m: Member): number => {
    switch (roll.pattern) {
      case "first":
        return rank;
      case "last":
        return count - 1 - rank;
      case "center":
        return Math.abs(rank - (count - 1) / 2);
      case "random":
        return hash01(roll.seed, rank);
      default:
        return Math.round(Math.hypot(m.cx - origin.x, m.cy - origin.y) / 8);
    }
  };

  const ranked = members
    .map((m, rank) => ({ m, rank, key: keyOf(rank, m) }))
    .sort((a, b) => a.key - b.key || a.rank - b.rank);

  let groupStart = 0;
  ranked.forEach(({ m, key }, j) => {
    const previous = ranked[j - 1];
    if (!previous || previous.key !== key) groupStart = j;

    const vec: Vec =
      count === 1
        ? ZERO
        : {
            x: round3(clamp((m.cx - origin.x) / halfW, -1, 1)),
            y: round3(clamp((m.cy - origin.y) / halfH, -1, 1))
          };
    plan[m.i] = { slot: own[groupStart] ?? 0, index: j, count, vec };
  });
}

import type { EntryPlan } from "./choreography";

export interface RevealDebug {
  force: typeof forceEffect;
  clear: typeof clearForced;
  pools: typeof POOLS;
  plan?: ((panelKey: string) => EntryPlan | undefined) | undefined;
  loadSeed?: number | undefined;
}

declare global {
  interface Window {
    __reveal?: RevealDebug;
  }
}

/** Exposes forcing and the pools on `window.__reveal` (DEV builds only; the engine calls it). */
export function installDebugHook(): void {
  window.__reveal = { force: forceEffect, clear: clearForced, pools: POOLS };
}
