/**
 * Solar convection in GLSL: the broad plasma flow and differential rotation of
 * the Sun's photosphere. Prepend AFTER SIMPLEX_3D_GLSL (it calls `snoise`).
 * Every global is `sun`-prefixed so it cannot collide with the noise helpers
 * or the photosphere shader that includes it.
 *
 * Entry point: `float sunConvection(vec3 dir, float t, float detail)`
 * - dir: unit vector on the sphere in the mesh's local space (y = solar axis).
 * - t: scene seconds. Holding it at 0 (reduced motion) still gives a full,
 *   static surface.
 * - detail: 0..1 level of detail. The inner octave of the plasma fades to its
 *   mean as detail drops, so a tiny Sun never aliases, and its cost is skipped
 *   below ~0.02.
 * Returns heat in 0..1 with a mean near 0.55 that does not oscillate with t:
 * the plasma evolves locally, the disc as a whole never pulses.
 *
 * The look is deliberately broad and cinematic rather than microscopic: a
 * handful of large, slow, domain-warped swirls of hotter and cooler gas, with
 * wide soft bands of light where the warped field folds. No cells, lanes or
 * small grain, so a close zoom reads as glowing plasma, not a textured skin.
 *
 * Differential rotation: the poles lag the equator (rate 1 - 0.19 sin²lat -
 * 0.15 sin⁴lat). Unbounded shear would smear the swirls into stripes over
 * time, so the shear runs as a dual-phase flow: two samples a half period
 * apart, each reset while its weight is zero, crossfaded by a triangle weight.
 * The look is the same after hours as after seconds. The mesh group spins
 * rigidly, so only this relative lag lives here.
 *
 * Cost at detail = 1: per phase 4 snoise for the plasma plus 1 for the churn,
 * two phases, so about 10 snoise. A frozen clock evaluates one phase only.
 */
export const SUN_CONVECTION_GLSL = /* glsl */ `
// Plasma scale: a handful of broad swirls across the disc (dir spans 2 units).
const float SUN_CONV_PLASMA_SCALE = 2.2;
// Flow period and shear rate: over one period the poles slip a little.
const float SUN_CONV_FLOW_PERIOD = 48.0;
const float SUN_CONV_SHEAR = 0.0015;

// Domain-warped plasma, roughly zero-mean: broad, soft swirls of hotter and
// cooler gas with wide glowing bands where the warped field folds. The inner
// octave fades with detail, so a distant Sun stays smooth.
float sunConvPlasma(vec3 p, float t, float detail) {
  vec3 drift = vec3(t * 0.02, -t * 0.015, t * 0.018);
  vec2 w = vec2(snoise(p * 0.6 + drift), snoise(p * 0.6 + vec3(5.2, 1.3, 7.7) - drift));
  vec3 warped = p + 1.1 * vec3(w, w.x - w.y);
  float body = snoise(warped + drift * 1.3);
  float glow = 0.0;
  if (detail > 0.0) {
    float inner = snoise(warped * 1.7 + vec3(body) * 0.5 - drift * 1.5);
    // 1 - |n| peaks along zero crossings: wide, soft bands of light.
    glow = (pow(1.0 - abs(inner), 1.6) - 0.55) * detail;
  }
  return 0.75 * body + 0.6 * glow;
}

// Rotate dir about the solar axis by its latitude's lag after tau seconds.
vec3 sunConvShear(vec3 dir, float tau) {
  float s2 = dir.y * dir.y;
  float lag = -(0.19 * s2 + 0.15 * s2 * s2);
  float a = SUN_CONV_SHEAR * lag * tau;
  float c = cos(a);
  float s = sin(a);
  return vec3(c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z);
}

// One flow phase, zero-mean: broad plasma swirls over a slow churn.
float sunConvPhase(vec3 q, float t, float detail) {
  float plasma = sunConvPlasma(q * SUN_CONV_PLASMA_SCALE, t, detail);
  float churn = snoise(q * 0.9 + vec3(t * 0.008, 0.0, t * 0.006) + 17.0);
  return 0.17 * plasma + 0.08 * churn;
}

float sunConvection(vec3 dir, float t, float detail) {
  float fine = smoothstep(0.02, 0.45, detail);
  float fa = fract(t / SUN_CONV_FLOW_PERIOD);
  float fb = fract(t / SUN_CONV_FLOW_PERIOD + 0.5);
  float wa = 1.0 - abs(2.0 * fa - 1.0);
  float va = 0.0;
  float vb = 0.0;
  if (wa > 0.0) va = sunConvPhase(sunConvShear(dir, fa * SUN_CONV_FLOW_PERIOD), t, fine);
  if (wa < 1.0) vb = sunConvPhase(sunConvShear(dir, fb * SUN_CONV_FLOW_PERIOD), t, fine);
  return clamp(0.55 + mix(vb, va, wa), 0.0, 1.0);
}
`;
