/**
 * Section content reveal system (entry point; BaseLayout imports from here).
 * The engine, effect registry, pools, text splitting and ambient touches live
 * in ./reveal/*.
 */
export { initReveal, REVEALED_CLASS, DONE_ATTR } from "./reveal/engine";
export { forceEffect, clearForced } from "./reveal/randomizer";
export type { RevealType } from "./reveal/pools";
