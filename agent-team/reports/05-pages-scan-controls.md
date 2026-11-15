# Report — 05-pages-scan-controls — 2026-11-15

## Branch / PR / SHAs

- Branch: `arena/9eeafa5e-centrale`, session-pinned; base `3a956874142f8cdadd3ff991dc8461b6ddce94ce`. The brief names `feat/pages-scan-controls` from `94e12f0`; neither switching branch nor changing the session base is permitted.
- Implementation and verification HEAD: `c3215b0149ede4bcce2c26c4290d7357ccdaa810`; this report is a subsequent commit.
- Draft PR: **not opened**. CONTRACT §0 prohibits pushing to `arena/*`, while the session requires all work on the fixed `arena/9eeafa5e-centrale` branch. The branch is not present on origin and a GitHub PR cannot be created without publishing it. Supervisor/user must resolve this restriction; no push or merge attempted.

## Scope done

- Extracted one live scan component: bbox, date window, disabled/availability checks, backend status, explicit submit, polling/backoff, backend progress, cancellation and error states. Start/end required, validated, defaults retained, selected values sent with PROVISIONAL, HH/HV, max six granules. The UI explicitly explains operator-side multi-GB costs and the backend limit.
- Dashboard and Before/After contain collapsed live fetch panels, refresh the catalog and select the built site. Time Machine loads the built site manifest directly. Each uses the same post-build banner with exact backscatter dates by polarization, the site caveat and missing/derived-product policy. No new routes or backend changes.
- Dashboard uses a single active/visible layer state, one fieldset with radios, visibility toggles, date/pol/kind badges and active legend. Selecting a radio or acquisition makes that layer visible; toggling the active layer off keeps it active and explicitly marks it “(hidden)”. Map receives only visible layers, with active first when visible.
- Removed the dashboard hero rather than retain another CTA; navigation is the sole Time Machine entry. Removed duplicated acquisition CRID (source chip retained) and extra map-footer CTA. HUD uses active observation/product date; pair label fallback is limited to difference layers. Replaced compare date chips with a subordinate text readout; invalid compare dates do not mount the viewer.
- Additional duplication: caveat remains both by the map and in Site record for accessibility/context; map-side legend intentionally remains alongside the new selector legend, as requested. No redesign or shared-file changes.

## Scope not done / known gaps

- The existing out-of-lane `lib/scanFrames.ts` deliberately restricts Time Machine playback to five fixed Anak Krakatau dates. A custom scan can build other exact dates, listed in the banner and accessible in Dashboard/Before / after, but they do not appear in Time Machine playback. UI discloses this limitation; worker 04/supervisor must address the adapter/review if arbitrary-date playback is required. No substitutions are made.
- No live ASF/Earthdata fetch or VM build was performed: it requires operator authorization, credentials and potentially multi-GB downloads. No claim that Anak Krakatau was processed.
- Existing demo path remains independent of live scan; no `/tm/scan` refusal rules or WorldviewReview/Map changes.

## Files changed

Implementation diff (`git diff --stat 3a956874142f8cdadd3ff991dc8461b6ddce94ce..c3215b0149ede4bcce2c26c4290d7357ccdaa810`):

```text
 .../app/compare/page.tsx                           |  21 +-
 dancing-with-the-sars-frontend/app/page.tsx        | 142 +++++---------
 .../app/time-machine/page.tsx                      | 211 ++-------------------
 .../components/LiveScanPanel.tsx                   | 113 +++++++++++
 .../tests/live-scan-panel.test.tsx                 |  39 ++++
 5 files changed, 227 insertions(+), 299 deletions(-)
```

Plus this report. Shared files touched: **none**; no ANNOUNCE needed.

## Verification

`cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build` — exit 0. Exact output (terminal color escapes removed):

```text

added 190 packages, and audited 191 packages in 11s

43 packages are looking for funding
  run `npm fund` for details

10 vulnerabilities (4 moderate, 3 high, 3 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> typecheck
> tsc --noEmit


> test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 /home/user/Centrale/dancing-with-the-sars-frontend

 ✓ tests/comparison.test.ts (30 tests) 18ms
 ✓ tests/time-machine.test.ts (11 tests) 43ms
 ✓ tests/source-register.test.ts (10 tests) 8ms
 ✓ tests/scan-frames.test.ts (2 tests) 21ms
 ✓ tests/applications.test.ts (9 tests) 7ms
 ✓ tests/live-fetch.test.ts (3 tests) 9ms
 ✓ tests/tile-url.test.ts (5 tests) 4ms
 ✓ tests/mapbox-token.test.ts (3 tests) 3ms
 ✓ tests/pages.test.tsx (2 tests) 3ms
 ✓ tests/live-scan-panel.test.tsx (1 test) 124ms

 Test Files  10 passed (10)
      Tests  76 passed (76)
   Start at  08:08:43
   Duration  3.52s (transform 313ms, setup 0ms, collect 688ms, tests 240ms, environment 516ms, prepare 711ms)


> build
> next build

  ▲ Next.js 14.2.35

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/7) ...
   Generating static pages (1/7)
   Generating static pages (3/7)
   Generating static pages (5/7)
 ✓ Generating static pages (7/7)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    5.61 kB         617 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /compare                             2.37 kB         617 kB
├ ○ /time-machine                        8.32 kB         623 kB
├ ƒ /tm/frames/[date]                    0 B                0 B
└ ƒ /tm/scan                             0 B                0 B
+ First Load JS shared by all            87.3 kB
  ├ chunks/117-9776bcfde68b9ed6.js       31.7 kB
  ├ chunks/fd9d1056-88c8a1669018f964.js  53.6 kB
  └ other shared chunks (total)          1.97 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

## Honesty invariants

Kept: synthetic site caveats preserved and included in handoff; no unverified real build claimed; exact backscatter-only comparison and playback enforced by existing adapters; no interpolation or substitute dates/polarizations; derived products excluded from playback/comparison; stats remain measured outputs; provenance and PROVISIONAL remain visible; no InSAR output changes.

## Interaction checklist / supervisor manual verification

1. Invalid/missing window disables scan: automated component test passes, including request payload and no implicit fetch. Verify date-picker pixels in browser.
2. Dropdown/overlay redundancy removed: code inspection; confirm one Layers fieldset, radio/toggle and hidden-active rule, acquisition selection and legend in browser.
3. Same panel/state machine on all pages: code inspection; verify disabled, credential, size-limit, queued/running/cancel/failed terminal states on deployed backend.
4. Post-build auto-select/catalog refresh: implemented for Dashboard and Before/After, manifest handoff for Time Machine; mock cache-hit callback tested. Actual backend/job-to-catalog handoff and same-site rebuild require VM verification.
5. No substitute-date path: existing comparison tests pass and viewer is gated on exact chronological dates; verify both pickers manually.

Browser interaction/pixel verification was not performed in this sandbox. Supervisor should verify on the deployed URL, including real-vs-synthetic caveats, all requested dates, live job cancellation and small-screen layout. Resolve the five-date playback limitation and PR publication restriction before hand-in.
