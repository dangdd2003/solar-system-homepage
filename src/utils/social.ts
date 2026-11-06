/**
 * Link-preview (unfurl) metadata shared by every page.
 *
 * One descriptor feeds Open Graph (Facebook, Messenger, Instagram/Threads DMs, LinkedIn,
 * Discord, Telegram, WhatsApp, Zalo, Slack, iMessage, Signal, Teams) and Twitter/X cards.
 * Crawlers do not run JavaScript, so everything here is rendered into static HTML.
 *
 * Rules every platform agrees on:
 * - URLs are absolute https (relative og:image is ignored by most scrapers).
 * - Raster images only (PNG/JPEG/WebP/GIF), never SVG; declare type + dimensions so the
 *   first share renders without the scraper having to download the image first.
 * - Keep images < 300 KB: WhatsApp silently drops larger previews.
 */

export interface SocialImage {
  /** Root-relative path (e.g. "/og-image.png") or an absolute URL. */
  src: string;
  width: number;
  height: number;
  alt: string;
  /** MIME type; inferred from the file extension when omitted. */
  type?: string;
}

export interface SocialMetaInput {
  /** Headline shown in the preview card (may differ from the browser-tab <title>). */
  title: string;
  description: string;
  /** Path of the page being described; resolved against `site` for og:url. */
  pathname: string;
  /** Primary 1.91:1 card image. Extra entries become extra og:image tags, which Discord shows as a cropped gallery. */
  images: readonly [SocialImage, ...SocialImage[]];
  type?: "website" | "article" | "profile";
  siteName?: string;
  locale?: string;
  alternateLocales?: readonly string[];
  /** X handle including "@", used for twitter:site and twitter:creator. */
  twitterHandle?: string;
}

export interface ResolvedSocialImage extends Required<SocialImage> {
  url: string;
}

export interface SocialMeta {
  title: string;
  description: string;
  url: string;
  type: NonNullable<SocialMetaInput["type"]>;
  siteName: string | undefined;
  locale: string | undefined;
  alternateLocales: readonly string[];
  twitterHandle: string | undefined;
  /** Cards need >= 300x157; anything smaller (or square) degrades to the compact summary card. */
  twitterCard: "summary_large_image" | "summary";
  images: readonly ResolvedSocialImage[];
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

/** Most scrapers truncate beyond these; trimming here keeps the cut on a word boundary. */
export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 200;

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

export function imageMimeType(src: string): string {
  const ext = new URL(src, "https://x.invalid").pathname.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXTENSION[ext];
  if (!mime) {
    throw new Error(
      `Social image "${src}" must be PNG, JPEG, WebP or GIF (SVG and unknown types are not unfurled).`
    );
  }
  return mime;
}

function toHttpsURL(pathOrURL: string, site: URL): string {
  const url = new URL(pathOrURL, site);
  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    url.protocol = "https:";
  }
  return url.href;
}

export function buildSocialMeta(input: SocialMetaInput, site: URL): SocialMeta {
  const images = input.images.map((image): ResolvedSocialImage => ({
    ...image,
    type: image.type ?? imageMimeType(image.src),
    url: toHttpsURL(image.src, site)
  }));
  const primary = images[0];
  const isWide =
    primary !== undefined && primary.width >= 300 && primary.width / primary.height >= 1.5;

  return {
    title: truncate(input.title, TITLE_MAX),
    description: truncate(input.description, DESCRIPTION_MAX),
    url: toHttpsURL(input.pathname, site),
    type: input.type ?? "website",
    siteName: input.siteName,
    locale: input.locale,
    alternateLocales: input.alternateLocales ?? [],
    twitterHandle: input.twitterHandle,
    twitterCard: isWide ? "summary_large_image" : "summary",
    images
  };
}
