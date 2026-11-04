/** Clamp `n` into `[lo, hi]`. NaN input propagates as NaN. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Clamp `value` into `[0, 1]`. NaN input propagates as NaN. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
