# Report — 08-dashboard-compare-plate — 2026-11-15

## Branch / PR / SHAs

- Branch: `arena/dfb5a5a0-centrale`. The brief names `feat/dashboard-compare-plate`; this session is pinned to the Arena branch and cannot rename it.
- PR: https://github.com/aleforfab/Centrale/pull/20 (draft, into `main`, not merged).
- Base SHA: `013a241` (`main` after PR #19, slice 07). The brief names `7333923`; `main` has since gained PR #17 (docs only) and PR #19 (07). The branch was started on `c412916` and rebased onto `013a241` when 07 merged.
- HEAD SHA (code): `2848e9c`. This report is one docs-only commit on top of it.
- Not yet rebased onto 09 (PR #18, still open). Merge order stays 07 → 09 → 08.

## Scope done

1. **`app/page.tsx` — Observation Plate.**
   - Grid `minmax(0,1fr) / 380px` from `lg` up; single column below.
   - Left: `.plate` around the Map. Header `FIG. 01 — <SITE TITLE> · <pol> · <kind> · <date | pre → post>` with maturity (`PROVISIONAL`) at the right. Caption is the site caveat, verbatim.
   - HUD date block is a mono caption in a dark on-imagery chip, placed below the Map's view toggle.
   - Right rail, four sections with mono tags and hairline separators:
     - **SITE**: title, description, caveat as `.colophon`, source chips (mission, band, product, maturity, CRID).
     - **LAYERS**: the single radio + "Visible" checkbox list as `.index-row`s (date · pol · kind chip · title). The active legend sits directly under the list as `.footnote`, verbatim.
     - **ACQUISITIONS**: numbered rows, `date · cycle · CRID`, granule in mono, truncated; a click selects that observation and expands the full granule. "View at ASF" kept. The granule appears nowhere else on the page.
     - **MEASURED CHANGE**: `.rule-table` (lower / higher return in km² and %, valid coverage, noise σ), the ink-bar histogram (`.tm-spark`), and the verbatim footnote.
   - Errors and the "No precomputed products yet" empty state use `.colophon`. Map-footer CTA stays deleted.
2. **`app/compare/page.tsx` — Diptych.**
   - Header row: two cells, mono `BEFORE` / `AFTER` tag over the date in Archivo 900.
   - Selection row: `.field` site, before date, after date, polarization. One mono line `Available <pol> dates: …`. No chips row.
   - Closing `.colophon`: site caveat + `No substitute date, polarization or difference layer is used.`
   - Empty state "No installed products to compare": paper plate, `.colophon`, CLI hint verbatim.
3. **`components/ComparisonViewer.tsx` — visual only.**
   - `.plate` frame, 1px reveal hairline, paper `REVEAL` tab (display only, `pointer-events-none`), dark BEFORE / AFTER date chips, `.plate__caption` with both dates and pol.
   - Stats as `.rule-table`. Refusal copy and "What this does not show" as `.colophon`, verbatim.
   - `resolveExactComparison` use, map effects, tile sync and the range input (`aria-label="Reveal before and after imagery"`) are unchanged.
4. **`components/Map.tsx` — chrome only.**
   - View toggle, legend, attribution and no-token notice are dark chips: `rgba(13,12,10,.88)` background, `#F5F3EC` text.
   - The component draws no border or radius; the page owns the plate.
   - Props (`bbox, layers, activeLayerId, view, setView`), `syncProductLayers`, `syncSiteFootprint`, footprint `#ff8a3d`, ScaleControl and all effects are untouched.
5. **Rebase onto 07.** Second commit swaps my restated utilities for 07's real primitives by name (`.plate__header`, `.plate__meta`, `.plate__body`, `.field__label`, `.field__input`, `.index-row[data-active]`).

## Scope not done (and why)

- **Rebase onto 09**: PR #18 is still open. No file overlap is expected (09 owns `app/time-machine/**`, `WorldviewReview.tsx`, `TimeReview.tsx`).
- **`.imagery-chip` not adopted.** 07 exports it, but its fixed `6px 10px` padding does not fit the segmented view toggle. Map and viewer chips keep the guide's literal values (same colours, same border alpha as 07). Follow-up, not a visual difference.
- **No new tests.** The brief asks for none; `tests/pages.test.tsx` is untouched.

## Files changed (`git diff --stat origin/main...HEAD`, at `2848e9c`)

```
 .../app/compare/page.tsx                           | 185 ++++++--
 dancing-with-the-sars-frontend/app/page.tsx        | 519 +++++++++++++++------
 .../components/ComparisonViewer.tsx                | 273 ++++++-----
 dancing-with-the-sars-frontend/components/Map.tsx  |  43 +-
 4 files changed, 701 insertions(+), 319 deletions(-)
```

Plus this report (`agent-team/reports/08-dashboard-compare-plate.md`).

## Shared files touched (ANNOUNCE list)

None. No edits to 07's or 09's files, the backend, package files, the lockfile, `next.config.mjs` or tests. No new dependencies. No font files.

## Checks run

Run on the rebased tree (`2848e9c` content), in `dancing-with-the-sars-frontend/`. Exit code 0.

```
$ npm ci && npm run typecheck && npm test && npm run build

added 190 packages, and audited 191 packages in 10s

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

 ✓ tests/comparison.test.ts (30 tests) 11ms
 ✓ tests/time-machine.test.ts (11 tests) 27ms
 ✓ tests/scan-frames.test.ts (8 tests) 13ms
 ✓ tests/source-register.test.ts (10 tests) 7ms
 ✓ tests/live-fetch.test.ts (3 tests) 9ms
 ✓ tests/calendar-review.test.tsx (2 tests) 10ms
 ✓ tests/tile-url.test.ts (5 tests) 4ms
 ✓ tests/mapbox-token.test.ts (3 tests) 3ms
 ✓ tests/live-scan-panel.test.tsx (1 test) 8ms
 ✓ tests/pages.test.tsx (2 tests) 3ms

 Test Files  10 passed (10)
      Tests  75 passed (75)
   Start at  10:57:04
   Duration  2.59s (transform 269ms, setup 0ms, collect 519ms, tests 95ms, environment 2ms, prepare 657ms)


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
┌ ○ /                                    7.52 kB         619 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /compare                             3.04 kB         618 kB
├ ○ /time-machine                        8.06 kB         623 kB
├ ƒ /tm/frames/[date]                    0 B                0 B
└ ƒ /tm/scan                             0 B                0 B
+ First Load JS shared by all            87.3 kB
  ├ chunks/117-9776bcfde68b9ed6.js       31.7 kB
  ├ chunks/fd9d1056-88c8a1669018f964.js  53.6 kB
  └ other shared chunks (total)          1.97 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Baseline before my changes (on `c412916`): typecheck clean, 10 files / 75 tests passed. Same counts after.

Backend gates were not run: no backend file is touched.

### Local rendering check (not deployed verification)

Run in the sandbox with headless Chromium (software WebGL), the backend serving the synthetic fixture built by `scripts/make_demo_site.py`, and `next dev` on a copy of the frontend. Two things differ from production and limit what this proves:

- **Fonts**: the sandbox cannot reach Google Fonts, so the copy loaded Archivo and IBM Plex Mono from local files. The repo's runtime `@import` was not exercised.
- **Basemap**: the Mapbox token is URL-restricted and style requests fail from the sandbox. `/` was checked with NISAR tiles over the black fallback canvas. `/compare` imagery was checked with style requests answered by an empty mock style.

Viewed against 07's real CSS (after the rebase):

| View | Viewport | Result |
|---|---|---|
| `/`, difference + ±2 dB mask active | 1440×900 | Plate header, HUD chip, legend, rail, active-row marker, rule-table, histogram, footnote render as intended. |
| `/`, default layer | 390×844 | Single column. Legend clears the attribution chip and the Mapbox wordmark. |
| `/compare`, exact pair | 1440×900 | Diptych header, fields, plate, hairline, REVEAL tab, captions, rule-table, colophons render as intended. |
| `/compare`, empty catalogue (`/api/sites` → `[]`) | 1440×900 | Paper plate, colophon, CLI hint. |

Viewed before the rebase only, against my stand-in for 07's CSS: `/` empty catalogue, `/compare` with a non-installed date (viewer does not mount; refusal colophon shows), `/compare` mobile.

One defect was found and fixed this way: `.rule-table th` uppercases row labels, which rendered "Noise estimate σ" as "NOISE ESTIMATE Σ". The symbol is now exempt from the transform.

## Honesty invariants

Kept. Specifically:

- **Dates, pol, kind**: in the plate header, the HUD chip, every layer row and the Diptych header. Pair products show the exact `pre → post` window, never a single date.
- **Source, CRID, maturity**: source chips in SITE; `PROVISIONAL` also in the plate header; CRID repeated per acquisition; "Processing identity" row in the viewer.
- **Granules**: in ACQUISITIONS (truncated, full name one click away) and in the viewer's "Acquisition IDs" row (full).
- **No substitution**: `/compare` still mounts the viewer only for two exact installed dates. Date choices come from `backscatter` layers only; difference and change-mask layers are not selectable as frames. No playback code is touched.
- **Verbatim copy, unchanged**: site caveat (incl. the synthetic caveat); `Satellite basemap is visual context only, not a matched-date observation.`; `Backscatter change does not determine its cause. These are measured outputs, not a validated scientific result.`; `No substitute date, polarization or difference layer is used.`; `No substitute date, polarization or difference product is used to fill the gap.`; `Two dates show a measured difference in radar brightness. They do not by themselves identify the cause, the extent of an event, or damage.`; `python -m nisar.cli build-site --config sites/<site>.yaml`.
- **Not hidden**: no honesty copy sits behind a toggle. The only disclosure widgets are the live-fetch panel (as before) and the granule expander (the truncated granule is always visible).
- **Stats wording**: section is "Measured change"; rows are "Lower return" / "Higher return". No "validated", no cause.

Copy changes that are not honesty copy, for review:

| Where | Before | After |
|---|---|---|
| `/` eyebrow | Map-first explorer | Observation plate |
| `/` subtitle | …measured change products in a cinematic radar workspace. | …measured change products. |
| `/` intro line | Explore installed dated radar products and their provenance. | Installed dated radar products and their provenance. |
| `/` rail tags | Site record · Change statistics | Site · Measured change |
| `/` stats row | Noise estimate | Noise estimate σ |
| `/compare` eyebrow | Exact-pair viewer | Diptych · exact-pair viewer |

New copy:

- `/` MEASURED CHANGE, when no pair layer is active: "No pair product is active. Select a difference or change-mask layer under Layers to read its measured statistics."
- `/compare` header cell, under a date that is not installed: "No <pol> backscatter observation is installed on this date. No substitute date is used."
- `/compare` header cell, under an installed date: "<pol> · backscatter · exact installed date".

## Known gaps, follow-ups, TODOs left in code

1. **`Map` chrome inside 09's surfaces is unchecked.** `CalendarReview.tsx` and `WorldviewReview.tsx` render `Map` in `h-[28rem] overflow-hidden rounded-lg` wrappers. `Map` no longer draws its own border or radius, so those wrappers now supply the frame. Not viewed.
2. **Fallback canvas colour changed** in `Map.tsx` and `ComparisonViewer.tsx` (`#071018` / `#0b1720` → `#0D0C0A` / `#14120F`). Visual only; it is the background behind tiles when no Mapbox style loads.
3. **Sticky plate.** The left plate is `position: sticky` from `lg` up when the viewport is at least 640px tall, so the map stays in view while the rail scrolls. Full-page screenshots taken after scrolling show it displaced; that is a capture artefact.
4. **`!` modifier.** `redesign.css` is imported from `AppShell` and loads after Tailwind, so a utility cannot beat a primitive's reset at equal specificity. Ten local margins (nine on `.footnote`, one on `.tm-panel__title`) and one font size use Tailwind's `!` modifier. A `--spaced` variant in 07's stylesheet would remove the need.
5. **`/favicon.ico` returns 404.** Pre-existing; the repo ships no favicon. Not in my lane.
6. No TODOs left in code.

## What the supervisor must verify manually

1. **Deployed browser check on https://dancing-sars.duckdns.org/** after merging 07 → 09 → 08. Nothing above replaces it. On `/`: plate header and dark chips over real `satellite-streets-v12`; legend clear of the Mapbox wordmark; HUD chip clear of the view toggle. On `/compare`: real `dark-v11` under the imagery; drag the slider and confirm the hairline and REVEAL tab track it.
2. **Fonts**: Archivo 900 on the Diptych dates and IBM Plex Mono on tags load from Google Fonts at runtime.
3. **Real data**: a real site has longer titles and more layers than the fixture (12 layers, 2 scenes). Check the plate header wraps cleanly and the LAYERS list stays usable.
4. **Time Machine after 09 merges**: `Map` and `ComparisonViewer` inside the calendar and Worldview panels (gap 1).
5. **Copy table above**: confirm or edit the reworded eyebrows, subtitle and the new sentences.
6. **CI** on PR #20 is green before merge.
