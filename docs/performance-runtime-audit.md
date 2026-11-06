# Runtime performance audit (items 10–12)

## Item 12: low-effects reveal filters

Audited all 36 pool registry modules (171 builders across three generations).
`lowFx` is independent of viewport size: desktop save-data, zoom, forced-colour,
and reduced-transparency profiles must not run blur/drop-shadow tweens either.

Eight first-generation builders still emitted those filters:

| File | Builders | Correction |
| --- | --- | --- |
| `src/scripts/reveal/pools/heading.ts` | `meteor-shower`, `deep-space-signal`, `redshift` | Strip blur under `lowFx`; keep brightness when present. |
| `src/scripts/reveal/pools/hero-name.ts` | `event-horizon` | Keep brightness without blur under `lowFx`. |
| `src/scripts/reveal/pools/footer.ts` | `heartbeat-pulsar` | Keep heart scale beats without drop-shadow under `lowFx`. |
| `src/scripts/reveal/pools/line.ts` | `comet-trail`, `light-speed` | Keep brightness without drop-shadow/blur under `lowFx`. |
| `src/scripts/reveal/pools/text.ts` | `solar-wind` | Guard both word and unsplit-host blur paths. |

Other pool filter paths already guard `lowFx`, including synchronous `.set()`
initial states and glass-host paths. No catalog eligibility flags, random choices,
split granularity, geometry, easing, stagger, or duration were changed. Regular
desktop filter values remain unchanged. No central timeline interception was needed.
Brightness-only effects, masks, CSS halos, and text shadows are outside the specific
blur/drop-shadow filter guarantee; this is not a claim of zero painting/GPU work.

### Runtime regression coverage

Run `node --test tests/lowfx.test.mjs` (or include it in `node --test tests/*.test.mjs`).
The dependency-free browser driver uses installed Edge/Chrome; set `LOWFX_BROWSER`
to another Chromium executable if necessary. Vite serves the actual TypeScript
modules, and a fresh headless browser runs real DOM splitting and real Anime.js
timelines. No builder, splitter, timeline, or animation parameter is mocked.

The matrix covers 1,568 cases: 171 pool builders plus 25 legacy builders ×
compact/desktop × lowFx on/off × populated/unsplit-fallback fixtures. It checks inline filter writes at
construction, every 32 ms via `seek()`, and completion. Timelines are intentionally
paused: `kit.ts` creates them with `autoplay: false`, and production drives them
externally. Waiting for autoplay would silently miss the actual filter work.

For all eight patched builders and legacy `warp` it also compares every sampled non-filter inline
style and total duration between normal and lowFx profiles. Rich desktop filters
must actually appear for those builders, preventing false positives from broken
splitting or fallback-only fixtures. The test first failed on the eight affected
builders, then passed after the guards. Existing guarded generation-two and
generation-three skeletons remain available; no pool narrowing is required.

Limitations: this is a Chromium behavior regression test, not a GPU benchmark or
Safari rendering test. It samples inline writes rather than every possible tween
boundary, and does not exercise every role-specific SVG/glass/orientation fixture.

### Legacy finding and correction

`src/scripts/reveal/legacy-effects.ts` (`warp`) also emitted `blur(6px)` in
its split-word path without a `lowFx` guard. The integration pass guarded only
the filter, preserving word transforms and timing. `LEGACY` is included in the
regression test: 1,568 cases complete, with exactly one failing case before that fix:
`warp compact=false lowFx=true fallback=false: forbidden filter blur(6px)`.
The pool-only matrix passed all 1,368 cases before extending coverage.

Verification: `cmd /c "npm run verify && npm run build"` passed (0 errors,
0 warnings, 2 async-function hints from Astro check; Vite reports the existing
large-chunk advisory). This command does not itself run the Node regression tests.
The integrated 13-test run passed, including all 1,568 browser timeline cases
and the restored full-resolution texture checks. The browser test uses an isolated
temporary Vite cache to avoid optimizer collisions with concurrent test servers.

## Items 10/11: device evidence pending

Inspected `src/components/Nav.astro`: mobile menu rows animate `blur(6px)` to
`blur(0)` alongside opacity and transform (roughly lines 572–595). The glass
platter separately animates bounds, shadow and backdrop-filter. Reduced-motion
rules already remove row filtering. This identifies potential paint costs, not
evidence of a Safari defect or an old-iPhone bottleneck.

No menu-row CSS, resize FLIP, or nav pull behavior was rewritten. Items 10/11
remain pending real Safari/older-iPhone evidence. Before deciding on a change,
capture opening/closing the menu, portrait/landscape resize FLIP, and nav-pull
refresh on representative devices; record device/iOS/Safari versions, frame
times, paint/layer activity, and before/after recordings. Chromium emulation
cannot establish WebKit compositing or physical-device performance.
