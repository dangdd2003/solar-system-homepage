/**
 * Device tiers for the in-section reveal system.
 *
 * One breakpoint table (TIER_TOKENS) is shared with reveal.css, which mirrors
 * the same values in its compact guard and mask media queries. A tier is
 * resolved on every activation, so a resize or rotation takes effect at the
 * next entry. The functions here are pure, except readTierEnv(), which only
 * reads from the window it is given.
 */

/** Breakpoint and zoom values. reveal.css must use the same numbers. */
export const TIER_TOKENS = {
  /** Portrait phones: width at or below this is compact. */
  compactMaxWidthPx: 480,
  /** Landscape phones: height at or below this, with width above height. */
  landscapeMaxHeightPx: 500,
  /** Landscape phones are never wider than this. */
  landscapeMaxWidthPx: 932,
  /** Pinch or browser zoom above this scale selects the low-effects tier. */
  zoomScale: 1.01
} as const;

export type Tier = "compact-phone" | "landscape-phone" | "touch-tablet" | "desktop";

/** Raw inputs for tier resolution. Kept plain so tests can pass any values. */
export interface TierEnv {
  readonly width: number;
  readonly height: number;
  readonly touch: boolean;
  readonly reducedMotion: boolean;
  readonly reducedTransparency: boolean;
  readonly forcedColors: boolean;
  readonly saveData: boolean;
  readonly zoomScale: number;
}

/** Resolved tier and the flags the reveal engine branches on. */
export interface TierProfile {
  readonly tier: Tier;
  /** True for both phone tiers (portrait and landscape). */
  readonly compact: boolean;
  /** True when the page is zoomed beyond TIER_TOKENS.zoomScale. */
  readonly zoomed: boolean;
  /** True when effects must avoid filters, masks and text shadows. */
  readonly lowFx: boolean;
  /** Number of premium-cost members allowed per entry. */
  readonly premiumBudget: 0 | 1 | 2;
  readonly reducedMotion: boolean;
  readonly reducedTransparency: boolean;
  readonly forcedColors: boolean;
  readonly saveData: boolean;
}

/** Real panel entry durations: compact phones get longer, so the page settles later. */
export const REAL_ENTRY_MS = { compact: 1500, other: 450 } as const;

/** Maps a raw environment to a tier. Pure. */
export function resolveTier(env: TierEnv): TierProfile {
  const landscapePhone =
    env.width > env.height &&
    env.height <= TIER_TOKENS.landscapeMaxHeightPx &&
    env.width <= TIER_TOKENS.landscapeMaxWidthPx;
  const compactPhone = !landscapePhone && env.width <= TIER_TOKENS.compactMaxWidthPx;

  let tier: Tier;
  if (landscapePhone) {
    tier = "landscape-phone";
  } else if (compactPhone) {
    tier = "compact-phone";
  } else if (env.touch) {
    tier = "touch-tablet";
  } else {
    tier = "desktop";
  }

  const compact = tier === "compact-phone" || tier === "landscape-phone";
  const zoomed = env.zoomScale > TIER_TOKENS.zoomScale;
  const lowFx = compact || env.saveData || env.reducedTransparency || env.forcedColors || zoomed;

  let premiumBudget: 0 | 1 | 2 = 0;
  if (!lowFx) {
    premiumBudget = tier === "touch-tablet" ? 1 : 2;
  }

  return {
    tier,
    compact,
    zoomed,
    lowFx,
    premiumBudget,
    reducedMotion: env.reducedMotion,
    reducedTransparency: env.reducedTransparency,
    forcedColors: env.forcedColors,
    saveData: env.saveData
  };
}

/** Real entry duration for a resolved profile. */
export function realEntryMs(profile: TierProfile): number {
  return profile.compact ? REAL_ENTRY_MS.compact : REAL_ENTRY_MS.other;
}

/**
 * Whether the input in use is touch. Any-pointer queries follow the hardware
 * attached right now, so a touch laptop or tablet with a mouse or trackpad reads as
 * a fine-pointer device. maxTouchPoints is only a fallback when no pointer query
 * answers, since it reports hardware and never changes.
 */
export function isTouchInput(matches: (query: string) => boolean, touchPoints: number): boolean {
  if (matches("(any-pointer: fine)")) return false;
  if (matches("(any-pointer: coarse)")) return true;
  return touchPoints > 0;
}

/** The subset of the window that readTierEnv() uses. */
export type TierWindow = Pick<Window, "innerWidth" | "innerHeight" | "matchMedia" | "navigator"> & {
  readonly visualViewport?: { readonly scale: number } | null;
};

/**
 * Reads the current environment from the window. Only DOM reads happen here;
 * every missing API falls back to the least restrictive value.
 */
export function readTierEnv(win: TierWindow = window): TierEnv {
  const matches = (query: string): boolean => {
    try {
      return typeof win.matchMedia === "function" && win.matchMedia(query).matches;
    } catch {
      return false;
    }
  };

  const nav = win.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined;
  const touch = isTouchInput(matches, nav?.maxTouchPoints ?? 0);
  const saveData = nav?.connection?.saveData === true;
  const scale = win.visualViewport?.scale ?? 1;

  return {
    width: win.innerWidth,
    height: win.innerHeight,
    touch,
    reducedMotion: matches("(prefers-reduced-motion: reduce)"),
    reducedTransparency: matches("(prefers-reduced-transparency: reduce)"),
    forcedColors: matches("(forced-colors: active)"),
    saveData,
    zoomScale: Number.isFinite(scale) ? scale : 1
  };
}
