/**
 * The ordered pools contain legacy, first-, second-, then third-generation members.
 * Keep the three boundaries beside the loader rather than importing builder code
 * just to discover its names. The coverage test checks every boundary against the
 * real modules, including members implemented in the legacy registry.
 */
import { POOLS, REVEAL_TYPES, type RevealType } from "./pools";

const COUNTS: Record<RevealType, readonly [legacy: number, first: number, second: number]> = {
  heading: [2, 6, 5],
  card: [3, 5, 6],
  "hero-name": [1, 5, 5],
  text: [3, 3, 5],
  chip: [0, 6, 5],
  image: [2, 3, 4],
  button: [2, 3, 5],
  icon: [2, 3, 5],
  eyebrow: [3, 2, 4],
  timeline: [1, 3, 4],
  line: [0, 4, 4],
  footer: [1, 2, 3]
};

/** Maps an effect name to one lazy module, never an entire device's effect set. */
export const POOL_MODULES = new Map<string, string>();
for (const name of ["fade-down", "zoom-out", "comet", "cluster", "draw"]) {
  POOL_MODULES.set(name, "./legacy-effects.ts");
}
for (const type of REVEAL_TYPES) {
  const [legacy, first, second] = COUNTS[type];
  POOLS[type].forEach(({ name }, i) => {
    const path =
      i < legacy
        ? "./legacy-effects.ts"
        : `./pools/${i < legacy + first ? "" : i < legacy + first + second ? "gen2-" : "gen3-"}${type}.ts`;
    POOL_MODULES.set(name, path);
  });
}
