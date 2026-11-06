# Performance: hosting follow-up

These are owner actions, not completed production fixes. No Cloudflare dashboard
access, hosting changes, or deployment is included in this repository work.

## Owner actions

1. **Respect Existing Headers:** in Cloudflare's browser-cache settings, select
   **Respect Existing Headers** so the edge does not replace the origin's intended
   browser cache policy. Review cache rules for overrides and verify actual
   `Cache-Control` response headers after deployment; do not apply long-lived
   immutable caching to HTML or other unversioned resources indiscriminately.
2. **Brotli / edge compression:** enable Brotli or the equivalent supported edge
   compression setting/rule for compressible HTML, CSS, JavaScript, JSON and SVG.
   Verify a real GET response with an appropriate `Accept-Encoding` request and
   inspect `Content-Encoding` and transferred bytes. Already compressed JPEG/WebP
   assets are not expected to benefit materially. Repository changes alone cannot
   confirm that production compression is enabled.
3. **Share the canonical www URL everywhere:** use <https://www.dangdd.dev> for
   profile links, social posts and other shared links to avoid an apex-to-www
   redirect. Keep `astro.config.mjs`'s canonical site at
   `https://www.dangdd.dev`. An apex canonical migration is an alternative only if
   the owner explicitly coordinates hosting, DNS/TLS, redirect direction,
   canonical metadata and sitemap changes, then verifies the result. Do not
   silently change the repository canonical URL to the apex hostname.

The tracked-link scan found the clickable README live-site link already uses
`https://www.dangdd.dev`; the Astro site setting and robots sitemap also use www.
The `dangdd.dev` domain displayed in the generated social card is branding text,
not a clickable shared link. Off-repository profile links still require owner
review.

## Repository scope and deferred work

- Prettier uses `endOfLine: "auto"` to tolerate existing platform line endings.
  Run `npm run format:check` to see remaining formatting issues; this change is not
  permission to reformat unrelated files.
- Keep the harmless `?vpbleed` viewport diagnostic hook in
  `src/layouts/BaseLayout.astro` unchanged (the allowed keep-hook option).
- KTX2 is deferred: it requires a broader texture asset-format and loader change,
  transcoder delivery and compatibility/visual testing, not just recompressing
  existing WebP files.
- The recommendation to manually optimize a static OG JPEG is outdated. Social
  images are generated at build time by `src/utils/og-image.ts` and served through
  `src/pages/[card].jpg.ts`. The existing Sharp encoder already uses progressive
  mozjpeg (`quality: 84`, `progressive: true`, `mozjpeg: true`). Any further size or
  quality tuning belongs in that generator and should be validated against the
  generated card, rather than replacing an assumed static public image.
