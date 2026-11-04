/**
 * Split pieces of gradient text (`background-clip: text`).
 *
 * Chrome clips a text-clipped background to the glyphs painted in the clipping
 * element's own layer. A split piece with its own opacity or transform paints in
 * a separate layer, so it is left out of the clip; with a transparent text fill
 * it shows nothing until its tween ends (the hero name showed "D", then popped
 * to the full name), and under GPU pressure it can paint every glyph at the
 * root's origin. While a split host plays, each animated piece therefore carries
 * its own slice of the root's background and the root's own is switched off
 * (reveal.css). The markers are cleared when the host finishes or resets
 * (kit.ts clearFxAttrs), after which the root paints the whole text again.
 */

export const PAINT_ROOT_ATTR = "data-rv-paint-root";
export const PAINT_ATTR = "data-rv-paint";

/** Whether any background layer is clipped to text (computed values list one entry per layer). */
function isTextClipped(el: Element): boolean {
  const cs = getComputedStyle(el);
  const clips = `${cs.backgroundClip},${cs.getPropertyValue("-webkit-background-clip")}`;
  return clips.split(",").some((clip) => clip.trim() === "text");
}

/** Splits a computed list value on its top-level commas (gradients hold commas too). */
function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

/** A computed size token in px; `auto` (gradients have no intrinsic size) is the box. */
function sizePx(token: string | undefined, box: number): number {
  if (!token || token === "auto") return box;
  if (token.endsWith("%")) return (parseFloat(token) / 100) * box;
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : box;
}

/** A computed position token in px; percentages align the image inside the box. */
function positionPx(token: string | undefined, box: number, image: number): number {
  if (!token) return 0;
  if (token.endsWith("%")) return (parseFloat(token) / 100) * (box - image);
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : 0;
}

/** Layout offset from the page origin, ignoring transforms (backgrounds are laid out before them). */
function layoutOffset(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

/** Removes the paint markers inside `host` (and their variables). */
export function clearTextClip(host: Element): void {
  host.querySelectorAll<HTMLElement>(`[${PAINT_ATTR}]`).forEach((piece) => {
    piece.removeAttribute(PAINT_ATTR);
    piece.style.removeProperty("--rv-paint-pos");
  });
  host.querySelectorAll<HTMLElement>(`[${PAINT_ROOT_ATTR}]`).forEach((root) => {
    root.removeAttribute(PAINT_ROOT_ATTR);
    for (const name of ["--rv-paint-img", "--rv-paint-size", "--rv-paint-repeat"]) {
      root.style.removeProperty(name);
    }
  });
}

/**
 * Gives every piece inside a text-clipped element under `target` (the target
 * included) its own slice of that element's background. Pieces outside any
 * text-clipped element are left alone. Reads all layout first, then writes.
 */
export function paintTextClip(target: HTMLElement, pieces: readonly HTMLElement[]): void {
  clearTextClip(target);
  if (pieces.length === 0) return;

  const rootOf = new Map<Element, HTMLElement | null>();
  const findRoot = (piece: HTMLElement): HTMLElement | null => {
    for (let n = piece.parentElement; n; n = n.parentElement) {
      let hit = rootOf.get(n);
      if (hit === undefined) {
        hit = isTextClipped(n) ? (n as HTMLElement) : null;
        rootOf.set(n, hit);
      }
      if (hit) return hit;
      if (n === target) return null;
    }
    return null;
  };

  // Reads.
  const roots = new Map<
    HTMLElement,
    {
      x: number;
      y: number;
      image: string;
      repeat: string;
      layers: { w: number; h: number; x: number; y: number }[];
    }
  >();
  const placed: { piece: HTMLElement; root: HTMLElement; x: number; y: number }[] = [];
  for (const piece of pieces) {
    const root = findRoot(piece);
    if (!root) continue;
    let box = roots.get(root);
    if (!box) {
      const cs = getComputedStyle(root);
      const w = root.clientWidth;
      const h = root.clientHeight;
      const sizes = splitLayers(cs.backgroundSize);
      const positions = splitLayers(cs.backgroundPosition);
      const layers = splitLayers(cs.backgroundImage).map((_, i) => {
        const size = (sizes[i % sizes.length] ?? "auto").split(/\s+/);
        const cover = size[0] === "cover" || size[0] === "contain";
        const lw = cover ? w : sizePx(size[0], w);
        const lh = cover ? h : sizePx(size[1], h);
        const pos = (positions[i % positions.length] ?? "0% 0%").split(/\s+/);
        return { w: lw, h: lh, x: positionPx(pos[0], w, lw), y: positionPx(pos[1], h, lh) };
      });
      const origin = layoutOffset(root);
      box = {
        x: origin.x + root.clientLeft,
        y: origin.y + root.clientTop,
        image: cs.backgroundImage,
        repeat: cs.backgroundRepeat,
        layers
      };
      roots.set(root, box);
    }
    const at = layoutOffset(piece);
    placed.push({
      piece,
      root,
      x: at.x + piece.clientLeft - box.x,
      y: at.y + piece.clientTop - box.y
    });
  }

  // Writes.
  for (const [root, box] of roots) {
    root.setAttribute(PAINT_ROOT_ATTR, "");
    root.style.setProperty("--rv-paint-img", box.image);
    root.style.setProperty("--rv-paint-repeat", box.repeat);
    root.style.setProperty(
      "--rv-paint-size",
      box.layers.map((l) => `${l.w}px ${l.h}px`).join(", ")
    );
  }
  for (const { piece, root, x, y } of placed) {
    const box = roots.get(root)!;
    piece.setAttribute(PAINT_ATTR, "");
    piece.style.setProperty(
      "--rv-paint-pos",
      box.layers.map((l) => `${l.x - x}px ${l.y - y}px`).join(", ")
    );
  }
}
