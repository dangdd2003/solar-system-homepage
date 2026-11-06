import type { APIRoute, GetStaticPaths } from "astro";
import { OG_CARDS, renderOgCard, type OgCardId } from "../utils/og-image";

/** Link-preview card (/og-image.jpg), rendered from source on every build. */
export const getStaticPaths = (() =>
  (Object.keys(OG_CARDS) as OgCardId[]).map((card) => ({
    params: { card }
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const body = await renderOgCard(params.card as OgCardId);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "image/jpeg" }
  });
};
