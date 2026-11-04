/**
 * Sun photosphere optics in GLSL: the colour temperature ramp, wavelength-dependent
 * limb darkening and limb-weighted faculae. Pure colour maths with no noise, so it can
 * be prepended to the photosphere fragment shader beside the surface and activity code.
 * Every global it defines is `sun`-prefixed.
 */

/** One stop of the photosphere's temperature ramp: `heat` 0..1 and its display RGB. */
export interface SunTemperatureStop {
  readonly heat: number;
  readonly rgb: readonly [number, number, number];
}

/**
 * Blackbody-like ramp from cool intergranular red to the white-hot crest. The mid stop is
 * SUN_SURFACE_COLOR (0xff6b0d), the disc's dominant tone; the hot stops are the startup
 * glare's palette (255,140,50 / 255,186,96 / 255,232,170 / 255,253,244), so the intro's
 * sunlight hands over to the same white-gold on the Sun itself.
 */
export const SUN_TEMPERATURE_STOPS: readonly SunTemperatureStop[] = [
  { heat: 0, rgb: [0.5, 0.05, 0.0] },
  { heat: 0.25, rgb: [0.84, 0.21, 0.02] },
  { heat: 0.5, rgb: [1.0, 0.42, 0.05] },
  { heat: 0.65, rgb: [1.0, 0.549, 0.196] },
  { heat: 0.8, rgb: [1.0, 0.729, 0.376] },
  { heat: 0.91, rgb: [1.0, 0.91, 0.667] },
  { heat: 1, rgb: [1.0, 0.992, 0.957] }
];

/**
 * Quadratic limb-darkening law per channel, I(mu) / I(1) = 1 - u(1 - mu) - v(1 - mu^2).
 * Shorter wavelengths darken more (blue > green > red), so the rim warms to orange-red on
 * its own, as on the real Sun.
 */
export const SUN_LIMB_COEFFS = {
  r: { u: 0.42, v: 0.1 },
  g: { u: 0.5, v: 0.12 },
  b: { u: 0.62, v: 0.15 }
} as const;

/**
 * Disc-centre gain. Chosen so the area-averaged luminance of a mid-orange disc matches the
 * previous ad-hoc limb formula (`mix(0.55, 1.15, pow(mu, 0.55))` plus rim reddening), so the
 * Sun's overall exposure in the scene is unchanged.
 */
export const SUN_LIMB_GAIN = 1.23;

/** Width (in mu) of the thin chromospheric reddening right at the rim. */
export const SUN_CHROMOSPHERE_MU = 0.08;

/** I(mu) / I(1) for one channel's coefficients; mirrors the GLSL `sunLimb` law. */
export function sunLimbProfile(coeffs: { u: number; v: number }, mu: number): number {
  const m = Math.min(1, Math.max(0, mu));
  return 1 - coeffs.u * (1 - m) - coeffs.v * (1 - m * m);
}

/** A GLSL float literal (always with a decimal point). */
function glf(n: number): string {
  return n.toFixed(4);
}

function glVec3(rgb: readonly [number, number, number]): string {
  return `vec3(${rgb.map(glf).join(", ")})`;
}

/** Piecewise ramp: each segment eases with a Hermite curve, so the ramp has no visible kinks. */
function temperatureBody(stops: readonly SunTemperatureStop[]): string {
  const first = stops[0];
  if (!first) return "  return vec3(0.0);";
  const lines = [`  float h = clamp(heat, 0.0, 1.0);`, `  vec3 c = ${glVec3(first.rgb)};`];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    lines.push(`  c = mix(c, ${glVec3(b.rgb)}, smoothstep(${glf(a.heat)}, ${glf(b.heat)}, h));`);
  }
  lines.push("  return c;");
  return lines.join("\n");
}

const { r, g, b } = SUN_LIMB_COEFFS;

export const SUN_OPTICS_GLSL = /* glsl */ `
vec3 sunTemperature(float heat) {
${temperatureBody(SUN_TEMPERATURE_STOPS)}
}

vec3 sunLimb(vec3 color, float mu) {
  float m = clamp(mu, 0.0, 1.0);
  float a = 1.0 - m;
  float q = 1.0 - m * m;
  vec3 u = vec3(${glf(r.u)}, ${glf(g.u)}, ${glf(b.u)});
  vec3 v = vec3(${glf(r.v)}, ${glf(g.v)}, ${glf(b.v)});
  vec3 profile = max(vec3(1.0) - u * a - v * q, vec3(0.0));
  vec3 lit = color * profile * ${glf(SUN_LIMB_GAIN)};
  // A hairline of chromospheric red right at the rim, inside the sphere only.
  float rim = 1.0 - smoothstep(0.0, ${glf(SUN_CHROMOSPHERE_MU)}, m);
  return mix(lit, lit * vec3(1.0, 0.55, 0.4), rim * 0.35);
}

vec3 sunFacula(vec3 color, float facula, float mu) {
  float m = clamp(mu, 0.0, 1.0);
  // Faculae show against the darkened limb and vanish at the disc centre.
  float weight = pow(1.0 - m, 1.5) * smoothstep(0.02, 0.15, m);
  float boost = clamp(facula, 0.0, 1.0) * weight * 0.55;
  return color * (1.0 + boost) + vec3(1.0, 0.95, 0.85) * boost * 0.08;
}
`;
