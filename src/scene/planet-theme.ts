/** CSS-ready form of a body's 0xRRGGBB color, for `--*-color` / `--*-rgb` custom properties. */
export interface PlanetTheme {
  /** `#rrggbb`, for plain `color`/`border-color` use. */
  readonly hex: string;
  /** `r, g, b`, for `rgba(var(--planet-rgb), alpha)` use. */
  readonly rgb: string;
  /** `#rrggbb` lifted toward white, for text that must stay readable on the dark
   *  glass even for deep colors (Mars, Neptune). */
  readonly text: string;
}

/** Share of white mixed into `text`; 0.3 is the lowest step keeping every body
 *  (Neptune is the limit) at WCAG AA 4.5:1 on the lightest panel glass. */
const TEXT_LIFT = 0.3;

const toHex = (r: number, g: number, b: number): string =>
  `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;

/** Minimal style surface so callers (and tests) needn't pass a full element. */
export interface ThemeTarget {
  readonly style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty">;
}

export function planetTheme(color: number): PlanetTheme {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const lift = (c: number): number => Math.round(c + (255 - c) * TEXT_LIFT);
  return {
    hex: toHex(r, g, b),
    rgb: `${r}, ${g}, ${b}`,
    text: toHex(lift(r), lift(g), lift(b))
  };
}

/**
 * Write `--{prefix}-color`, `--{prefix}-rgb` and `--{prefix}-text` onto the
 * target, or remove them when `theme` is null so the stylesheet fallback
 * (neutral white) applies.
 */
export function applyPlanetTheme(
  target: ThemeTarget,
  theme: PlanetTheme | null,
  prefix = "planet"
): void {
  const colorProp = `--${prefix}-color`;
  const rgbProp = `--${prefix}-rgb`;
  const textProp = `--${prefix}-text`;
  if (theme === null) {
    target.style.removeProperty(colorProp);
    target.style.removeProperty(rgbProp);
    target.style.removeProperty(textProp);
    return;
  }
  target.style.setProperty(colorProp, theme.hex);
  target.style.setProperty(rgbProp, theme.rgb);
  target.style.setProperty(textProp, theme.text);
}
