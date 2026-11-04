/**
 * Upper bound on how long the welcome intro waits for web fonts. The welcome text is
 * primed invisible until the intro starts, so an uncapped `document.fonts.ready` on a
 * cold load would leave the screen black for as long as a font download takes. After
 * this cap the intro starts with whatever face is available; the text is then
 * measured as-is, and the intro never waits on the network for fonts.
 */
export const FONT_WAIT_MS = 300;

/**
 * Resolves when `ready` settles or after `capMs`, whichever comes first. Never rejects,
 * and the timer is cleared as soon as `ready` wins so nothing lingers.
 */
export function capFontWait(
  ready: PromiseLike<unknown>,
  capMs: number = FONT_WAIT_MS
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, capMs));
    ready.then(finish, finish);
  });
}
