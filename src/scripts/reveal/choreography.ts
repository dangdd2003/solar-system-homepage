/**
 * Deterministic frame-first reveal choreography engine.
 *
 * Each panel entry rolls a Frame (motif x origin x tempo) from the panel key,
 * entry number and load seed. A greedy admit-then-score planner picks catalog
 * members conforming to device tier, content geometry and budgets without
 * layout reads or persisted storage.
 */

import { CATALOG, profileOf, type EffectProfile, type Family } from "./catalog";
import type { HostGeometry } from "./geometry";
import type { TierProfile } from "./tiers";
import type { RevealType } from "./pools";

export type Motif =
  "arrival" | "orbit" | "eclipse" | "flare" | "signal" | "drift" | "constellation" | "coda";

export type Origin = "first" | "last" | "center" | "edge";
export type Tempo = "calm" | "lively";

export interface Frame {
  readonly motif: Motif;
  readonly origin: Origin;
  readonly tempo: Tempo;
  readonly axis: "x" | "y";
}

export const PANEL_MOTIFS: Record<string, readonly Motif[]> = Object.freeze({
  overview: ["arrival", "flare"],
  hero: ["arrival", "flare"],
  sun: ["orbit", "drift"],
  about: ["orbit", "drift"],
  mars: ["drift", "constellation"],
  projects: ["drift", "constellation"],
  earth: ["constellation", "orbit"],
  more: ["constellation", "orbit"],
  saturn: ["signal", "eclipse"],
  contact: ["signal", "eclipse"],
  footer: ["coda"]
});

export const MOTIF_FAMILIES: Record<Motif, readonly Family[]> = Object.freeze({
  arrival: ["rise", "fold", "roll"],
  orbit: ["arc", "roll", "wave"],
  eclipse: ["iris", "fold", "glow"],
  flare: ["glow", "roll", "arc"],
  signal: ["draw", "wave", "rise"],
  drift: ["arc", "rise", "wave"],
  constellation: ["wave", "draw", "glow"],
  coda: ["coda", "rise"]
});

/** FNV-1a 32-bit hash over string and number components. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** Simple mulberry32 deterministic pseudo-random number generator. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalized 0..1 hash from seed and slot indices. */
export function hash01(seed: number, i: number, j = 0): number {
  return mulberry32(hashSeed(seed, i, j))();
}

/** Chooses a frame for the panel entry avoiding recent motifs if alternatives exist. */
export function chooseFrame(seed: number, panelKey: string, recent: readonly Frame[] = []): Frame {
  const normKey = panelKey.toLowerCase();
  const motifs = PANEL_MOTIFS[normKey] ?? ["drift", "orbit"];
  const recentMotifs = new Set(recent.slice(-2).map((f) => f.motif));

  let available = motifs.filter((m) => !recentMotifs.has(m));
  if (available.length === 0) available = [...motifs];

  const rng = mulberry32(seed);
  const motif = available[Math.floor(rng() * available.length)]!;

  const origins: readonly Origin[] = ["first", "last", "center", "edge"];
  const origin = origins[Math.floor(rng() * origins.length)]!;
  const tempo: Tempo = rng() > 0.5 ? "calm" : "lively";
  const axis = origin === "edge" || motif === "orbit" || motif === "drift" ? "x" : "y";

  return { motif, origin, tempo, axis };
}

/** Checks whether a candidate effect profile is admitted under current environment and geometry. */
export function admit(
  profile: EffectProfile,
  geometry: HostGeometry,
  tier: TierProfile
): { ok: boolean; reason?: string } {
  // Forced colors: remove mask, clip, filter, textShadow, halo, glow
  if (tier.forcedColors) {
    if (
      profile.flags.mask ||
      profile.flags.clip ||
      profile.flags.filter ||
      profile.flags.textShadow ||
      profile.flags.halo ||
      profile.family === "glow"
    ) {
      return { ok: false, reason: "forced-colors-incompatible" };
    }
  }

  // Reduced transparency / saveData: plain cost only, no filter / mask
  if (tier.reducedTransparency || tier.saveData) {
    if (profile.cost !== "plain" || profile.flags.filter || profile.flags.mask) {
      return { ok: false, reason: "transparency-or-data-budget" };
    }
  }

  // LowFx or compact: compactSafe members only, no premium
  if (tier.lowFx || tier.compact) {
    if (!profile.compactSafe || profile.cost === "premium") {
      return { ok: false, reason: "compact-or-lowfx-incompatible" };
    }
  }

  // Check prerequisites against HostGeometry
  for (const req of profile.requires) {
    if (req === "split-words" && (!geometry.splittable || geometry.words === 0)) {
      return { ok: false, reason: "requires-split-words" };
    }
    if (req === "split-chars" && (!geometry.splittable || geometry.textLength > 40)) {
      return { ok: false, reason: "requires-split-chars" };
    }
    if (req === "split-lines" && !geometry.splittable) {
      return { ok: false, reason: "requires-split-lines" };
    }
    if (req === "stroke" && !geometry.hasStroke) {
      return { ok: false, reason: "requires-stroke" };
    }
    if (req === "numeric" && !geometry.numeric) {
      return { ok: false, reason: "requires-numeric" };
    }
    if (req === "items2" && geometry.items < 2) {
      return { ok: false, reason: "requires-items2" };
    }
    if (req === "no-focusable-host" && geometry.focusable) {
      return { ok: false, reason: "requires-no-focusable-host" };
    }
    if (req === "image-not-link" && geometry.isLink) {
      return { ok: false, reason: "requires-image-not-link" };
    }
    if (req.startsWith("part:")) {
      const partName = req.slice(5);
      if (!geometry.parts.has(partName)) {
        return { ok: false, reason: `requires-part-${partName}` };
      }
    }
  }

  return { ok: true };
}

export interface PlanItem {
  readonly id: string;
  readonly type: RevealType | null;
  readonly geometry: HostGeometry;
  readonly domRank: number;
  readonly extraDelayMs: number;
}

export interface PlanInput {
  readonly loadSeed: number;
  readonly panelKey: string;
  readonly entryNo: number;
  readonly history?: {
    readonly frames?: readonly Frame[];
    readonly members?: Partial<Record<RevealType, readonly string[]>>;
  };
  readonly tier: TierProfile;
  readonly items: readonly PlanItem[];
  readonly forced?: ReadonlyMap<string, string>;
  readonly rng?: () => number;
}

export interface PlannedItem {
  readonly name: string;
  readonly played: string;
  readonly fallback?: string | undefined;
  readonly forcedFrom?: string | undefined;
  readonly rank: number;
  readonly slotMs: number;
}

export interface EntryPlan {
  readonly frame: Frame;
  readonly entryNo: number;
  readonly seed: number;
  readonly stepMs: number;
  readonly byId: Map<string, PlannedItem>;
}

/** Plans the choreography for all elements in a panel entry. */
export function planEntry(input: PlanInput): EntryPlan {
  const seed = hashSeed(input.loadSeed, input.panelKey, input.entryNo);
  const frame = chooseFrame(seed, input.panelKey, input.history?.frames ?? []);

  const totalItems = input.items.length;
  const baseStep = frame.tempo === "calm" ? 60 : 40;
  const stepMs = totalItems > 1 ? Math.min(baseStep, Math.floor(600 / (totalItems - 1))) : baseStep;

  // Budgets
  let premiumBudget = input.tier.premiumBudget;
  let accentBudget = input.tier.compact ? 2 : Infinity;
  let svgDrawBudget = 1;
  let splitHostsBudget = 2;
  let maskQuota = 1;

  const byId = new Map<string, PlannedItem>();
  const historyMembers = input.history?.members ?? {};
  let lastFamily: Family | null = null;

  // Distinct typed roles present in this entry, processed in alphabetical order
  const presentTypes = Array.from(
    new Set(input.items.map((it) => it.type).filter((t): t is RevealType => t !== null))
  ).sort();

  interface ChosenRole {
    name: string;
    played: string;
    fallback?: string | undefined;
    forcedFrom?: string | undefined;
    /** Explicitly forced picks skip the compact accent budget (see the apply loop). */
    forced?: boolean;
  }
  const picksByType = new Map<RevealType, ChosenRole>();

  for (let tIdx = 0; tIdx < presentTypes.length; tIdx++) {
    const type = presentTypes[tIdx]!;
    const itemsOfType = input.items.filter((it) => it.type === type);
    const representative = itemsOfType[0]!;

    const forcedName = input.forced?.get(type) ?? input.forced?.get(representative.id);

    if (forcedName) {
      const p = profileOf(forcedName);
      if (p) {
        const admission = admit(p, representative.geometry, input.tier);
        if (admission.ok) {
          picksByType.set(type, { name: forcedName, played: forcedName, forced: true });
          continue;
        } else {
          const fallback = p.fallback !== "fade" ? p.fallback : "fade";
          picksByType.set(type, {
            name: fallback,
            played: fallback,
            forcedFrom: forcedName,
            fallback: admission.reason
          });
          continue;
        }
      }
    }

    const candidates = CATALOG.filter((p) => p.type === type);
    const motifFamilies = new Set(MOTIF_FAMILIES[frame.motif] ?? []);
    const recentForType = new Set(historyMembers[type]?.slice(-3) ?? []);
    // The member played last time for this type is excluded unless it is the only admitted candidate.
    const previousName = historyMembers[type]?.at(-1);

    interface ScoredCandidate {
      profile: EffectProfile;
      score: number;
    }

    const scored: ScoredCandidate[] = [];

    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const p = candidates[cIdx]!;
      const adm = admit(p, representative.geometry, input.tier);
      if (!adm.ok) continue;

      if (p.cost === "premium" && premiumBudget <= 0) continue;
      if (p.cost === "accent" && accentBudget <= 0) continue;
      if (p.flags.svgDraw && svgDrawBudget <= 0) continue;
      if (p.flags.mask && maskQuota <= 0) continue;
      const isSplit = p.requires.some((r) => r.startsWith("split-"));
      if (isSplit && splitHostsBudget <= 0) continue;

      let score = 0;
      if (motifFamilies.has(p.family)) score += 4;
      if (p.cost === "plain") score += 2;
      else if (p.cost === "accent") score += 1;

      if (lastFamily !== null && p.family !== lastFamily) score += 1;
      if (p.name === previousName) score -= 100;
      else if (recentForType.has(p.name)) score -= 6;

      score += 0.5 * hash01(seed, tIdx, cIdx);

      scored.push({ profile: p, score });
    }

    if (scored.length === 0) {
      picksByType.set(type, {
        name: "fade",
        played: "fade",
        fallback: "no-admitted-candidate"
      });
      continue;
    }

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0]!.profile;

    if (chosen.cost === "premium") premiumBudget--;
    if (chosen.cost === "accent") accentBudget--;
    if (chosen.flags.svgDraw) svgDrawBudget--;
    if (chosen.flags.mask) maskQuota--;
    if (chosen.requires.some((r) => r.startsWith("split-"))) splitHostsBudget--;

    lastFamily = chosen.family;

    picksByType.set(type, {
      name: chosen.name,
      played: chosen.name
    });
  }

  // Assign choices to elements in DOM order
  for (let idx = 0; idx < input.items.length; idx++) {
    const item = input.items[idx]!;
    const rank = item.domRank;
    const slotMs = Math.min(Math.round(rank * stepMs) + item.extraDelayMs, 600);

    if (!item.type) {
      byId.set(item.id, {
        name: "fade",
        played: "fade",
        rank,
        slotMs
      });
      continue;
    }

    const pick = picksByType.get(item.type) ?? { name: "fade", played: "fade" };
    let finalPick = pick;
    const p = profileOf(pick.name);

    // A forced pick is an explicit override, so the compact accent budget does not
    // drop it to its fallback (the budget was spent on other types before it).
    if (p?.cost === "accent" && !pick.forced) {
      if (accentBudget > 0) {
        accentBudget--;
      } else {
        const fallbackName =
          p.fallback !== "fade" && profileOf(p.fallback)?.cost === "plain" ? p.fallback : "fade";
        finalPick = {
          name: fallbackName,
          played: fallbackName,
          fallback: "accent-budget-exhausted"
        };
      }
    }

    byId.set(item.id, {
      name: finalPick.name,
      played: finalPick.played,
      fallback: finalPick.fallback,
      forcedFrom: finalPick.forcedFrom,
      rank,
      slotMs
    });
  }

  return {
    frame,
    entryNo: input.entryNo,
    seed,
    stepMs,
    byId
  };
}
