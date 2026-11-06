# Scene bundle audit

## Method

Audited the Astro 7 / Vite Rolldown production build using the client
`generateBundle` hook's actual output chunks and module metadata, not import
counts or the installed dependency tree. To reproduce, set `SCENE_BUNDLE_AUDIT`
to an absolute JSON file path outside `dist`, then run `npm run build`.
The integration writes chunk names, byte lengths, and rendered module metadata.
No audit data is emitted unless that environment variable is set.

## Observations

- `solar-system-boot.DB9qskMG.js`: **632,674 bytes**, **163,129 gzip bytes**.
  This matches the supplied 632,674-byte baseline; preload adds no JavaScript.
- After reveal-pool splitting and catalog compaction, the final layout chunk is
  **58,055 bytes raw**, **17,895 gzip**, **15,950 Brotli** (baseline: 145,421 raw
  bytes). This is a **60.1% reduction in that eager chunk**, not a claim that all
  eager JavaScript totals 58 KB. Shared Anime.js/startup chunks still exist.
- Catalog tuples decode synchronously to exactly the same 191 profiles, in the
  same order. Tests compare against the original metadata and seeded plans.
  Independent review also compared directly with the original Git version.
- Only two Three.js modules appear in the client output, both in the boot chunk:
  `three/build/three.core.js` (323,861 rendered characters) and
  `three/build/three.module.js` (540,949 rendered characters). Those metadata
  lengths describe intermediate rendered code, not additive minified bytes.
- Retained loader-related exports: `TextureLoader`, `ImageLoader`,
  `ImageBitmapLoader`, `Loader`, `LoadingManager`, `DefaultLoadingManager`.
  The scene uses texture/image loading; supporting infrastructure remains.
- `ObjectLoader`, `FileLoader`, `BufferGeometryLoader`, `MaterialLoader`,
  `AnimationMixer`, `AnimationClip`, `ShapeGeometry`, and `ExtrudeGeometry` are
  absent from rendered code. No `three/examples` or addon modules ship:
  `GLTFLoader`, `DRACOLoader`, and `OrbitControls` are absent as well.
- Renderer support such as `PMREMGenerator` and `WebXRManager` remains in
  `three.module.js`; some keyframe-track infrastructure remains in core. This
  does **not** mean the whole package ships, nor does it establish that every
  retained renderer branch is exercised by this scene. No import rewrites were
  made: the major unused loaders/extras are already tree-shaken.

## Preload verification

The generated home page has exactly one head-level modulepreload pointing to
the existing hashed boot asset; `404.html` has none. The integration inserts a
link only on generated HTML containing the existing `solar-canvas` canvas.
The link fetches/parses but does not execute the module. Dynamic import and the
boot initializer are unchanged. Unit tests cover nested pages, idempotence,
base paths, omitted assetsPrefix, and string / per-extension CDN prefixes.

A local Chromium resource-timing check observed the boot request at 27.8 ms and
the lightweight UI entry at 28.1 ms after navigation: the boot fetch now starts
in parallel rather than waiting for that entry to execute. This is evidence of
request ordering on localhost, not a production latency benchmark.

This is a static-output integration; it does not rewrite on-demand SSR
responses. Alternate base/CDN paths are covered by unit fixtures, not separate
deployed builds. No runtime interaction change is made.

## Regression checks

Build before running the suite: the layout byte-budget test inspects emitted files.

```sh
npm run verify && npm run build && node --test tests/*.test.mjs
```

On Windows PowerShell 5, run that command through `cmd /c "..."`. Browser tests
use installed Edge/Chrome; set `LOWFX_BROWSER` to a Chromium executable if needed.
The suite covers catalog equivalence, effect loading and lifecycle, lowFx filters,
scene preload output, and texture dimensions/download budgets/opacity channels.
