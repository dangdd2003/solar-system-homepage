# Performance Optimization Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox tracking.

**Goal:** Reduce download, parse, and texture costs without redesigning the site or changing existing interactions.

**Architecture:** Keep choreography metadata synchronous and load the selected builder's role/generation on demand. Inject the actual emitted scene-module URL into built HTML, without executing or initializing the scene early. Re-encode existing WebP assets in place.

**Tech Stack:** Astro 7, Vite, TypeScript, three.js, animejs, sharp, Node's test runner.

**Spec:** User-provided optimization plan A–E in this conversation; questions waived by “just proceed, implement all suggested”.

## Global Constraints

- No UI redesign, content changes, changed navigation, or altered animation builders/timing.
- Run `npm run verify && npm run build` after each code item (via `cmd /c` on Windows PowerShell).
- Preserve unrelated deleted `.vscode` files and untracked `.claude` files.
- Hosting dashboard changes require the owner; retain the existing www canonical URL rather than silently changing routing.
- Optional KTX2 and conditional Safari/older-iPhone rewrites require evidence before increasing complexity.

## Review Focus

- Cold/failed effect imports must never leave content hidden or replay effects late.
- Aliases, pinned effects, typed effects, and all three generations must still resolve to the original builders.
- Fast panel changes, keyboard focus, reduced motion, and cleanup must not start stale asynchronous animations.
- Scene preload must match a real emitted JavaScript chunk and must not initialize WebGL early.
- Cloud texture alpha/green-channel opacity must survive recompression; texture URLs and preloads must still match.

---

### Task 1: Baseline and texture assets

- [x] Run baseline verify/build and record bundle sizes.
- [x] Record source texture dimensions/channels and byte sizes; save originals outside the repository for comparison.
- [x] Re-encode planet textures at WebP quality 75 where smaller; reject variants with visible focus-detail loss.
- [x] Verify dimensions, decode, opacity, byte savings, and run verify/build (initial candidate); rerun final assets with integrated verification.

### Task 2: Lazy reveal builders

Files: `src/scripts/reveal/effects.ts`, `legacy-effects.ts`, `pool-modules.ts`, `engine.ts`; tests in `tests/reveal-loading.test.mjs`.

Interfaces: `preloadEffects(names: Iterable<string>): Promise<void>` warms selected role/generation modules; `resolveEffect(name)` and `runEffect` remain synchronous, returning a no-effect fallback while loading. No promise callback starts an animation.

- [x] Write/run failing tests for cold fallback, selected generation resolution, aliases, unknown names, concurrent loading, complete pool coverage, and lowFx guards.
- [x] Move legacy builders into a lazy module; replace eager pool imports with role/generation loaders and deduplicated promises, retrying failed loads on later entries.
- [x] Warm selected names before observing the entry; keep the existing plan, randomizer, timing, reset, focus and completion logic.
- [x] Run tests, verify/build; measure layout chunk against the approximately 60 KB raw target.

### Task 3: Scene preload and tree-shaking audit

Files: `astro.config.mjs`, `src/build/scene-preload.mjs`; tests in `tests/scene-preload.test.mjs`.

Interfaces: Astro integration captures the emitted boot chunk through Vite's output hook and adds a modulepreload to generated HTML. Boot initializer and dynamic import stay unchanged.

- [x] Write/run failing tests for emitted URLs, nested paths, base/CDN paths and duplicate preload handling.
- [x] Implement build-time integration, retaining dev behavior.
- [x] Run verify/build and inspect built HTML/preload target.
- [x] Audit actual rendered module sizes using output metadata; retain namespace imports because unused loaders/extras are tree-shaken.

### Task 4: Runtime and housekeeping

- [x] Audit lowFx blur guards and menu styles; fix only proven lowFx violations with a regression test. Do not change gesture/menu choreography without target-device evidence.
- [x] Add `endOfLine: auto` to `.prettierrc`; run format check and verify/build.
- [x] Keep harmless production `?vpbleed` hook per allowed option.
- [x] Document owner dashboard actions and conditional/optional items, including already generated/optimized OG images.
- [x] Run complete tests, verify/build, inspect browser behavior/network where available, and obtain independent code review.

## Execution ledger

- Baseline: verify/build pass, two existing async-conversion hints. Layout JS 145421 bytes; boot JS 632674 bytes.
- Workspace: working in place as requested by “just proceed”; no commits, branch changes, dashboard changes, or deployment without a separate request.
- Pre-flight: pool loader preserves synchronous engine interface; scene preloader observes the existing dynamic chunk and does not alter its lifecycle.
- Parallel execution authorized by the user; independent agents own scene preload/audit, lowFx guards, housekeeping, texture QA, catalog compaction and lifecycle tests.
- Texture ruling: preserve original Moon/Mercury and clouds after visual QA found downscaling loses close-up craters; clouds drive color and opacity through the same map. Final set 627188 bytes versus 738318 (111130 bytes / 15.1% saved), not the approximate 300 KB target. This prioritizes the user's no-visible-loss constraint over the other agent's assumption that these bodies are always tiny.
- LowFx audit: found eight pool builders plus legacy warp missing blur guards; regular desktop geometry/timing/filter behavior retained. Real-browser regression matrix covers 1568 cases.
- Scene preload observed in Chromium resource timing at 27.8 ms, UI chunk at 28.1 ms: the waterfall is removed. Screenshot unavailable because the desktop window is not visible; no claim of full interactive/visual device QA.
- Lazy loading passes cold fallback, matching original builders across all roles/generations, aliases, unknown fallback, parallel loading and failed-import recovery tests. Layout initially 70958 bytes; catalog compaction is being evaluated against exact original metadata to reach the roughly 60 KB target without hiding eager code in another eager chunk.
- Independent production review: no actionable findings in lazy loader, engine integration, lowFx guards, scene preload or texture handling. Reviewer confirmed native browser dynamic-import retries after transient HTTP failure. Follow-up review must cover catalog compaction and gated prewarming after those settle.
- Integrated verification after texture restoration and legacy warp fix: 13 tests pass, including 1568 real-browser timeline cases; verify/build pass with only the two original async-conversion hints and original large scene-chunk advisory.
- Gated-prewarm regression observed RED before implementation, then all 9 real-browser lifecycle cases passed. Initial hero prewarming only predicts the next pure plan while the existing gate is closed; actual RNG/history/entry timing stays unchanged. Independent scoped review approved the change.
- Formatting check now flags only the preexisting untracked `.claude/optimization-plan.md`; it was deliberately left untouched.
- First full production-page smoke run passed cold startup, all four navigation destinations, brand return, project filtering and reset, deep-link reload, WebGL context health and scrolled content visibility with no request failures. A later run overlapped output replacement and saw stale hashed chunks; repeat once the final build is stable before claiming request cleanliness for the final artifact.
- Catalog compaction retains all 191 original profiles, lookup semantics, outer freezing and three seeded choreography fixtures. Independent review verified both the decoder and the golden fixture directly against `git show HEAD`, not just each other. Final layout: 58055 raw / 17895 gzip / 15950 Brotli bytes, versus 145421 raw baseline (60.1% smaller).
- Full integrated run: all 27 tests passed, including the 1568-case lowFx browser matrix and 9 lifecycle browser cases; verify/build passed with two original hints and the original large scene-chunk advisory. A parallel SSR test-server HMR-port collision was isolated to test harness setup; disable unused WebSockets in SSR-only test servers and re-run.
- Disabled unused WebSockets in SSR-only test servers: all 27 tests and verification pass without the port-collision error.
- Stable final production smoke: served HTML matches `dist/index.html` and layout hash `DU_uVi8G.js`; cold startup/hero gate completes, WebGL2 stays healthy, all four section links and brand return work. 59 responses (41 scripts), zero HTTP errors/404s, failed requests, exceptions, console errors or warnings; zero pending requests. This resolves the earlier rebuild-overlap limitation.
- Final independent reviews approve the complete production diff, gated prewarming and catalog compaction; no actionable findings or deferred code-review minors. Optional KTX2 and conditional Safari/menu changes remain explicitly unimplemented pending their stated prerequisites; hosting remains owner work, documented separately.
