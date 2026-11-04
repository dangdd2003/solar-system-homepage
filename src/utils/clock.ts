/** Monotonic high-resolution time in milliseconds, falling back to `Date.now()`. */
export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
