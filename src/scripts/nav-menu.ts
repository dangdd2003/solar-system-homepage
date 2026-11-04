import { onPageReady } from "./page-ready";

/** Media query under which the floating nav collapses into a hamburger menu. */
export const NAV_MENU_QUERY = "(max-width: 640px)";

/** Window event fired on every real open/close change. `detail.open` is the new state. */
const NAV_MENU_CHANGE_EVENT = "nav-menu:change";

/**
 * Disclosure-pattern state for the compact nav. The script only manages state and ARIA;
 * all motion is driven in CSS from `data-menu` on the header.
 */
export function setupNavMenu(): () => void {
  const header = document.querySelector<HTMLElement>("header.nav");
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const menu = document.querySelector<HTMLElement>("[data-nav-menu]");
  const brand = document.querySelector<HTMLElement>("[data-nav-overview]");

  if (!header || !toggle || !menu) return () => {};

  const mql: MediaQueryList | null =
    typeof window.matchMedia === "function" ? window.matchMedia(NAV_MENU_QUERY) : null;
  // Without matchMedia (e.g. jsdom) assume the compact layout is active.
  let compact = mql ? mql.matches : true;
  let open = false;

  /** Writes the open/closed state to the header and toggle. Does not move focus. */
  const render = (): void => {
    header.dataset.menu = open ? "open" : "closed";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  /** Applies a state change and announces it only when the state actually changes. */
  function setOpen(next: boolean): void {
    const target = next && compact;
    if (target === open) return;
    open = target;
    render();
    window.dispatchEvent(new CustomEvent(NAV_MENU_CHANGE_EVENT, { detail: { open } }));
  }

  const onToggleClick = (): void => {
    setOpen(!open);
  };

  // Escape closes and returns focus to the toggle, so keyboard users are not stranded.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !open) return;
    setOpen(false);
    toggle.focus({ preventScroll: true });
  };

  // Pointer outside the header dismisses the menu; focus is left where the user put it.
  const onPointerDown = (e: PointerEvent): void => {
    if (!open) return;
    const target = e.target;
    if (target instanceof Node && header.contains(target)) return;
    setOpen(false);
  };

  // Choosing a link (or the brand) closes the menu. No preventDefault: navigation is handled elsewhere.
  const onMenuClick = (e: Event): void => {
    const target = e.target;
    if (target instanceof Element && target.closest("a")) setOpen(false);
  };

  const onBrandClick = (): void => {
    setOpen(false);
  };

  // Keyboard tabbing out of the header closes the menu. A null relatedTarget (e.g. window blur) does not.
  const onFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget;
    if (next instanceof Node && !header.contains(next)) setOpen(false);
  };

  const onMediaChange = (e: MediaQueryListEvent): void => {
    compact = e.matches;
    if (!compact) setOpen(false);
  };

  toggle.addEventListener("click", onToggleClick);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown);
  menu.addEventListener("click", onMenuClick);
  brand?.addEventListener("click", onBrandClick);
  header.addEventListener("focusout", onFocusOut);
  mql?.addEventListener("change", onMediaChange);

  // Start closed. Set silently: initial render is not a state change.
  render();

  return () => {
    setOpen(false);
    toggle.removeEventListener("click", onToggleClick);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown);
    menu.removeEventListener("click", onMenuClick);
    brand?.removeEventListener("click", onBrandClick);
    header.removeEventListener("focusout", onFocusOut);
    mql?.removeEventListener("change", onMediaChange);
  };
}

let cleanupCurrentInstance: (() => void) | null = null;

/** Single-instance wrapper: re-running replaces the previous listeners instead of stacking them. */
export function initNavMenu(): () => void {
  if (cleanupCurrentInstance) {
    cleanupCurrentInstance();
    cleanupCurrentInstance = null;
  }
  cleanupCurrentInstance = setupNavMenu();
  return cleanupCurrentInstance;
}

// Auto-run on DOM load
onPageReady(initNavMenu);
