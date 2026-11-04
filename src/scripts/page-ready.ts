/**
 * Runs `init` once the DOM is ready. The site has no <ClientRouter />, so
 * `astro:page-load` never fires; if one is added, switch to that event alone
 * (it also fires on first load) to avoid running `init` twice.
 */
export function onPageReady(init: () => void): void {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(), { once: true });
  } else {
    init();
  }
}
