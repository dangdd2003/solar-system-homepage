/**
 * Link-preview card images, rendered from source at build time (see src/pages/[card].jpg.ts).
 *
 * Pipeline: satori lays out the card (flexbox) and turns every glyph into an SVG path using the
 * bundled .woff fonts, so the result never depends on fonts installed on the build machine;
 * sharp then rasterizes that SVG and encodes a progressive mozjpeg well under WhatsApp's 300 KB cap.
 * Editing the name, tagline, photo crop or colors below and rebuilding is the whole workflow.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";
import type { SocialImage } from "./social";

const ROOT = process.cwd();
const FONT_DIR = join(ROOT, "node_modules/@fontsource");
/** Preview card only; the site itself keeps src/assets/avatar.jpg. */
const AVATAR_PATH = join(ROOT, "src/assets/og-wolf.jpg");
/** Head square inside src/assets/og-wolf.jpg. */
const AVATAR_CROP = { left: 620, top: 90, width: 1120, height: 1120 };

const CONTENT = {
  name: "Doan Dinh Dang",
  tagline: "System & Cloud Engineer · Hanoi",
  domain: "dangdd.dev"
};

const COLOR = {
  bg: "#08080c",
  text: "#f2efe8",
  muted: "rgba(242, 239, 232, 0.78)",
  gold: "#f4c04e",
  goldDeep: "#b8862b"
};

interface Layout {
  width: number;
  height: number;
  /** Avatar diameter, ring included. */
  avatar: number;
  name: number;
  tagline: number;
  domain: number;
  /** Vertical center of the text-and-avatar stack, as a fraction of the height. */
  centerY: number;
}

export type OgCardId = "og-image";

/**
 * One wide 1.91:1 card. A second og:image makes Discord render a cropped two-tile gallery.
 * Square-thumbnail apps (WhatsApp, Zalo, iMessage) center-crop it, so the name stays inside the middle 630px.
 */
export const OG_CARDS = {
  "og-image": {
    layout: {
      width: 1200,
      height: 630,
      avatar: 172,
      name: 76,
      tagline: 30,
      domain: 26,
      centerY: 0.5
    },
    alt: "Doan Dinh Dang (Đ-Dev), System & Cloud Engineer in Hanoi, over a 3D solar system"
  }
} as const satisfies Record<OgCardId, { layout: Layout; alt: string }>;

/**
 * The cards as og:image entries. `?v=` is a hash of the rendered bytes: Facebook, LinkedIn and Zalo
 * cache previews per image URL, so a changed card gets a new URL and is re-fetched on the next share.
 */
let ogImagesPromise: Promise<[SocialImage, ...SocialImage[]]> | undefined;

export function ogImages(): Promise<[SocialImage, ...SocialImage[]]> {
  ogImagesPromise ??= Promise.all(
    (Object.keys(OG_CARDS) as OgCardId[]).map(async (id): Promise<SocialImage> => {
      const hash = createHash("sha256")
        .update(await renderOgCard(id))
        .digest("hex")
        .slice(0, 10);
      return {
        src: `/${id}.jpg?v=${hash}`,
        width: OG_CARDS[id].layout.width,
        height: OG_CARDS[id].layout.height,
        alt: OG_CARDS[id].alt
      };
    })
  ) as Promise<[SocialImage, ...SocialImage[]]>;
  return ogImagesPromise;
}

type Node = { type: string; props: Record<string, unknown> };

function h(type: string, style: Record<string, unknown>, children?: unknown, extra = {}): Node {
  return { type, props: { style: { display: "flex", ...style }, children, ...extra } };
}

/** Deterministic PRNG so the starfield is identical on every build. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Starfield, haze and a tilted solar system centered behind the name. */
function backgroundSvg({ width, height }: Layout, sunY: number): string {
  const rand = mulberry32(2003);
  const cx = width / 2;
  const scale = Math.min(width, height * 1.6) / 1200;
  const stars = Array.from({ length: Math.round((width * height) / 2600) }, () => {
    const r = rand() < 0.92 ? 0.5 + rand() * 0.7 : 1.2 + rand() * 0.8;
    return `<circle cx="${(rand() * width).toFixed(1)}" cy="${(rand() * height).toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.15 + rand() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const orbits = [150, 235, 320, 420, 540].map((rx) => rx * scale);
  const planets: [number, number, string, number][] = [
    [0, 0.3, "#c9b49a", 5],
    [1, 2.7, "#e8cf9a", 7],
    [2, 0.55, "#7fb2d9", 7],
    [3, 3.6, "#d97a4f", 6],
    [4, 0.2, "#4f7bd9", 9]
  ];
  const tilt = 0.32;
  const orbitPaths = orbits
    .map(
      (rx) =>
        `<ellipse cx="${cx}" cy="${sunY}" rx="${rx}" ry="${rx * tilt}" fill="none" stroke="rgba(244,192,78,0.13)" stroke-width="1.2"/>`
    )
    .join("");
  const planetDots = planets
    .map(([i, a, color, r]) => {
      const rx = orbits[i]!;
      const x = cx + Math.cos(a) * rx;
      const y = sunY + Math.sin(a) * rx * tilt;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * 3 * scale}" fill="${color}" opacity="0.18" filter="url(#blur)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r * scale}" fill="${color}" opacity="0.75"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="#14121a"/><stop offset="1" stop-color="${COLOR.bg}"/></radialGradient>
<radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.55"/><stop offset="0.35" stop-color="#f08a24" stop-opacity="0.18"/><stop offset="1" stop-color="#f08a24" stop-opacity="0"/></radialGradient>
<radialGradient id="haze" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#9aa3b8" stop-opacity="0.16"/><stop offset="1" stop-color="#9aa3b8" stop-opacity="0"/></radialGradient>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="100%" height="100%" fill="url(#vignette)"/>
<ellipse cx="${width * 0.86}" cy="${height * 0.3}" rx="${width * 0.3}" ry="${height * 0.45}" fill="url(#haze)"/>
${stars}
${orbitPaths}
<circle cx="${cx}" cy="${sunY}" r="${170 * scale}" fill="url(#sun)"/>
${planetDots}
</svg>`;
}

async function avatarDataUri(size: number): Promise<string> {
  const png = await sharp(AVATAR_PATH)
    .extract(AVATAR_CROP)
    .resize(size * 2, size * 2)
    .png({ compressionLevel: 0 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

let fontsPromise: Promise<Parameters<typeof satori>[1]["fonts"]> | undefined;

function loadFonts() {
  const font = async (file: string, name: string, weight: 400 | 500 | 700) => ({
    name,
    weight,
    style: "normal" as const,
    data: await readFile(join(FONT_DIR, file))
  });
  fontsPromise ??= Promise.all([
    font("inter/files/inter-latin-700-normal.woff", "Inter", 700),
    font("inter/files/inter-vietnamese-700-normal.woff", "Inter", 700),
    font("inter/files/inter-latin-400-normal.woff", "Inter", 400),
    font("inter/files/inter-vietnamese-400-normal.woff", "Inter", 400),
    font("fira-code/files/fira-code-latin-500-normal.woff", "Fira Code", 500)
  ]);
  return fontsPromise;
}

const rendered = new Map<OgCardId, Promise<Buffer>>();

/** Rendered once per build: the endpoint and every page's og:image hash share the same bytes. */
export function renderOgCard(id: OgCardId): Promise<Buffer> {
  let card = rendered.get(id);
  if (!card) {
    card = drawOgCard(id);
    rendered.set(id, card);
  }
  return card;
}

async function drawOgCard(id: OgCardId): Promise<Buffer> {
  const layout: Layout = OG_CARDS[id].layout;
  const { width, height, avatar } = layout;
  const ring = Math.round(avatar * 0.035);
  const photo = avatar - ring * 2;
  const [avatarSrc, fonts] = await Promise.all([avatarDataUri(photo), loadFonts()]);

  const stack = h("div", { flexDirection: "column", alignItems: "center" }, [
    h(
      "div",
      {
        width: avatar,
        height: avatar,
        borderRadius: avatar,
        padding: ring,
        backgroundImage: `linear-gradient(160deg, ${COLOR.gold}, ${COLOR.goldDeep})`,
        boxShadow: `0 0 ${avatar * 0.25}px rgba(244, 192, 78, 0.35)`,
        marginBottom: layout.name * 0.38
      },
      h("img", { width: photo, height: photo, borderRadius: photo }, undefined, {
        src: avatarSrc,
        width: photo,
        height: photo
      })
    ),
    h(
      "div",
      {
        fontSize: layout.name,
        fontWeight: 700,
        color: COLOR.text,
        letterSpacing: -1.5,
        lineHeight: 1.1
      },
      CONTENT.name
    ),
    h(
      "div",
      { fontSize: layout.tagline, color: COLOR.muted, marginTop: layout.tagline * 0.55 },
      CONTENT.tagline
    ),
    h("div", {
      width: layout.tagline * 4.5,
      height: 2,
      marginTop: layout.tagline * 0.9,
      backgroundImage: `linear-gradient(90deg, rgba(244,192,78,0), ${COLOR.gold}, rgba(244,192,78,0))`
    }),
    h(
      "div",
      {
        fontFamily: "Fira Code",
        fontWeight: 500,
        fontSize: layout.domain,
        color: COLOR.gold,
        marginTop: layout.tagline * 0.9,
        letterSpacing: 1
      },
      CONTENT.domain
    )
  ]);

  const svg = await satori(
    h(
      "div",
      {
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter"
      },
      stack
    ) as Parameters<typeof satori>[0],
    { width, height, fonts }
  );

  // Sun sits between the avatar and the name, where the original 3D scene puts it.
  const stackHeight = avatar + layout.name * 1.48 + layout.tagline * 3.4 + 2 + layout.domain * 1.2;
  const sunY = height * layout.centerY - stackHeight / 2 + avatar + layout.name * 0.2;

  return sharp(Buffer.from(backgroundSvg(layout, sunY)))
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 84, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
