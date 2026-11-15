# Report — 07-design-foundation — 2026-11-15

> Historical report. The route/build output below predates the 2026-11-15 removal of the procedural Time Machine routes and standalone player.

## Branch / PR / SHAs

- **Branch:** `arena/6acd0611-centrale` (session-pinned active branch; switching to or creating `feat/design-foundation` is not permitted in this session).
- **PR:** https://github.com/aleforfab/Centrale/pull/19 (draft PR into `main`; not merged).
- **Base SHA:** `c412916c57983a344cbfeead29b18c4ef9726019` (`origin/main`, post-PR #17 Round 3 setup on top of `7333923`).
- **Implementation HEAD SHA:** `ffc45d4d1f73fe6896f7c279298042a491b4fb19` (subsequent commit adds only this report).

## Scope done

1. **`dancing-with-the-sars-frontend/app/globals.css` — rewritten:**
   - Line 1 sets the runtime-only browser font import (never fetched at build time):
     `@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap");`
   - Retains `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`.
   - Sets `:root { color-scheme: light; ... }` with all 16 fixed token names and values from `docs/REDESIGN_GUIDE.md` §3 (`--paper`, `--paper-2`, `--paper-3`, `--ink`, `--ink-soft`, `--ink-mute`, `--hairline`, `--hairline-strong`, `--accent`, `--accent-graphic`, `--accent-dim`, `--colophon`, `--font-display`, `--font-mono`, `--radius`, `--shadow`).
   - Adds `::selection` (`var(--accent-dim)`), `:focus-visible` (`2px solid var(--accent)`, `outline-offset: 2px`), global `prefers-reduced-motion: reduce` kill-switch, and body/heading/code defaults (`--paper`, `--ink-soft` `15px/1.55` Archivo, `--ink` headings, `--font-mono` for `code, kbd, samp, pre`).
2. **`dancing-with-the-sars-frontend/app/redesign.css` — rewritten completely:**
   - Removes all dark-slate `--tm-*` custom properties, all gradients (`linear-gradient` / `radial-gradient`), all non-`none` box shadows, and all `backdrop-filter` / glass blur rules; enforces `2px` radius (`var(--radius)`) and `160–180ms` transitions.
   - Exports all fixed-name `REDESIGN_GUIDE.md` §5 component vocabulary classes (`.masthead`, `.site-nav__link`, `.plate`, `.plate__tag`, `.plate__caption`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button` + `--primary`/`--ghost`, `.field`, `.footnote`) plus `.imagery-chip` for the dark on-imagery exception (`rgba(13, 12, 10, 0.88)` bg, `#F5F3EC` text).
   - Maps all 63 active legacy classes (`.tm-*`, `.app-shell*`, `.site-nav*`, `.redesign-content`) onto the paper-and-ink token system without renaming any active class; aliases `.tm-problem`, `.tm-notice`, and `.tm-stage__badge` onto `.colophon` styling; converts `.tm-spark i` histogram bars to solid `--ink`.
   - Deletes 12 proven-dead classes with zero `git grep` matches across the repository (see inventory & evidence below).
3. **`dancing-with-the-sars-frontend/components/AppShell.tsx` — restructured to editorial masthead:**
   - Preserves the exact `AppShellProps` API (`current`, `eyebrow`, `title`, `subtitle`, `status`, `children`).
   - Renders `<header className="masthead">` with row 1 `.app-shell__top` (persistent brand wordmark `Dancing with the SARs` in Archivo 800 + page `eyebrow` mono small-caps above + unchanged `.app-shell__status` slot on the right) and row 2 `<SiteNav current={current} />`.
   - Preserves semantic `<h1>{title}</h1>` on every route (visually displayed in `.app-shell__header` when distinct from the persistent `Dancing with the SARs` wordmark, and `sr-only` on `/` to avoid duplicating the wordmark immediately underneath).
4. **`dancing-with-the-sars-frontend/components/SiteNav.tsx` — chapter navigation:**
   - Renders numbered mono small-caps chapter links (`01 Dashboard`, `02 Before / after`, `03 Time Machine`) with hairline hover underline, `aria-current="page"` active ink + `2px` `--accent` bottom rule, and `NISAR · L-band · GCOV` right-aligned metadata.
   - Keeps `const LINKS = [{ href, label }, ...]` unchanged in shape so worker 09 can append `{ href: "/method", label: "Method" }` in one announced line. Does **not** add `/method` here.
5. **`dancing-with-the-sars-frontend/components/RegionSelector.tsx` — restyle only (classes):**
   - Updated JSX `className` hooks to `.plate`, `.plate__tag`, `.chapter-button` (`--ghost`), `.field` / `.field__input`, `.colophon`, and `.footnote` while keeping all existing `.tm-*` hooks.
   - Zero changes to Mapbox initialization, fallback style, draw/pan interaction handlers, coordinate math, validation, props, or copy.
6. **`dancing-with-the-sars-frontend/components/LiveScanPanel.tsx` — restyle only (classes):**
   - Replaced hardcoded dark `#111a24` / `border-slate-700` / `text-amber-*` Tailwind classes with `.plate`, `.plate__tag`, `.plate__caption`, `.field`, `.chapter-button` (`--primary` / `--ghost`), `.colophon`, `.footnote`, and `.tm-scan-progress`.
   - Restyled `BuiltProductsBanner` to `.colophon mb-4` with verbatim PROVISIONAL / exact-dates / caveat / exclusion copy.
   - Zero changes to state machine, date/bbox validation, `fetch("/api/data-status")`, `startLiveFetch`, polling/backoff, cancellation, props, or `tests/live-scan-panel.test.tsx` (stays green).
7. **`dancing-with-the-sars-frontend/app/layout.tsx` — metadata reword (FLAGGED FOR MAINTAINER REVIEW):**
   - `title`: `"Dancing with the SARs — exact NISAR backscatter, measured change"`
   - `description`: `"Installed NISAR L-band GCOV products with exact dates, measured change statistics and full provenance. PROVISIONAL data; not a validated scientific result."`

## Scope not done (and why)

- **Out-of-lane pages and components:** `app/page.tsx`, `app/compare/page.tsx`, `components/Map.tsx`, and `components/ComparisonViewer.tsx` (owned by worker 08); `app/time-machine/page.tsx`, `components/WorldviewReview.tsx`, `components/TimeReview.tsx`, `app/method/page.tsx`, `app/not-found.tsx`, and the `/method` entry in `SiteNav.tsx` (owned by worker 09).
- **Visual browser check:** Not possible from this sandbox (outbound network is restricted to GitHub/npm/PyPI and the Mapbox token is URL-restricted to the deployed domain). The supervisor performs the deployed-URL visual verification pass.
- **Branch name `feat/design-foundation`:** Session is pinned to `arena/6acd0611-centrale`; draft PR #19 is opened from the active session branch.

## Files changed (`git diff --stat c412916c57983a344cbfeead29b18c4ef9726019..ffc45d4d1f73fe6896f7c279298042a491b4fb19`)

```text
 dancing-with-the-sars-frontend/app/globals.css     |   75 +-
 dancing-with-the-sars-frontend/app/layout.tsx      |    5 +-
 dancing-with-the-sars-frontend/app/redesign.css    | 1611 +++++++++++---------
 .../components/AppShell.tsx                        |   75 +-
 .../components/LiveScanPanel.tsx                   |   44 +-
 .../components/RegionSelector.tsx                  |   24 +-
 .../components/SiteNav.tsx                         |    7 +-
 7 files changed, 1072 insertions(+), 769 deletions(-)
```

Plus this report: `agent-team/reports/07-design-foundation.md`.

## Shared files touched (ANNOUNCE list)

- **None** outside Slice 07's explicitly assigned deliverables (`package.json`, `package-lock.json`, `next.config.mjs`, `lib/types.ts`, `lib/api.ts`, `tests/**`, and all backend paths are untouched).
- **Maintainer review flag (per Brief 07 §7):** `dancing-with-the-sars-frontend/app/layout.tsx` metadata `title` and `description` reworded as specified; ready for maintainer keep/edit on PR #19.

## Class inventory (`app/redesign.css` old → new)

| Category | Count | Details |
| --- | ---: | --- |
| Old `app/redesign.css` selector classes | **75** | Dark-slate `--tm-*` / `.app-shell*` / `.site-nav*` / `.redesign-content` system |
| Retained & mapped onto paper-and-ink (renamed: **0**) | **63** | Every class imported by any `.ts`/`.tsx` file in `dancing-with-the-sars-frontend/` |
| Deleted proven-dead selector classes | **12** | Zero `git grep` matches anywhere in the repository (evidence below) |
| Added vocabulary & support selector classes | **31** | `REDESIGN_GUIDE.md` §5 vocabulary + BEM modifiers/sub-elements + `.tm-chip--active` + `.tm-scan-progress` |
| New `app/redesign.css` total selector classes | **94** | `63 retained + 31 added = 94` |

### Retained & mapped classes (63 — names unchanged, values mapped to REDESIGN_GUIDE §3/§5)

`app-shell`, `app-shell__brand`, `app-shell__content`, `app-shell__eyebrow`, `app-shell__inner`, `app-shell__mark`, `app-shell__status`, `app-shell__subtitle`, `app-shell__title`, `app-shell__top`, `redesign-content`, `site-nav`, `site-nav__link`, `site-nav__meta`, `tm-actions`, `tm-bbox`, `tm-button`, `tm-button--ghost`, `tm-button--primary`, `tm-calendar`, `tm-calendar__label`, `tm-calendar__row`, `tm-chip`, `tm-chip-row`, `tm-compare__after`, `tm-compare__divider`, `tm-compare__handle`, `tm-compare__img`, `tm-controls`, `tm-controls__input`, `tm-controls__row`, `tm-dashboard-controls`, `tm-dashboard-grid`, `tm-dashboard-info`, `tm-dashboard-map`, `tm-dashboard-map__canvas`, `tm-dashboard-map__date`, `tm-dashboard-map__footer`, `tm-dashboard-map__hud`, `tm-dashboard-overlays`, `tm-feature`, `tm-feature__desc`, `tm-feature__label`, `tm-features`, `tm-map`, `tm-map__canvas`, `tm-map__grid`, `tm-map__hint`, `tm-muted`, `tm-notice` (→ `.colophon`), `tm-panel`, `tm-panel__title`, `tm-problem` (→ `.colophon`), `tm-progress`, `tm-spark` (solid `--ink` bars), `tm-stage`, `tm-stage__badge` (→ `.colophon`), `tm-stage__date`, `tm-stage__empty`, `tm-stage__frame`, `tm-stage__legend`, `tm-stage__overlay`, `tm-ticks`.

### Vocabulary & support classes added (31)

- **`REDESIGN_GUIDE.md` §5 core primitives (13):**
  `.masthead`, `.site-nav__link` *(retained & restyled)*, `.plate`, `.plate__tag`, `.plate__caption`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`, `.chapter-button--primary`, `.chapter-button--ghost`, `.field`, `.footnote`, `.imagery-chip` (dark on-imagery overlay exception per §3).
- **Masthead, plate, table, field, and button sub-elements / modifiers (18):**
  `.masthead__brand-copy`, `.masthead__wordmark`, `.app-shell__header`, `.site-nav__index`, `.plate--flush`, `.plate__header`, `.plate__meta`, `.plate__body`, `.index-row--active`, `.rule-table--stats`, `.rule-table__num`, `.field__label`, `.field__input`, `.--primary` / `.--ghost` (shorthand modifier compatibility on `.chapter-button`), `.sr-only` (contextual `.app-shell__header > .sr-only + .app-shell__subtitle` spacing rule), `.tm-chip--active` (already referenced in `components/WorldviewReview.tsx` without a prior CSS rule), `.tm-scan-progress` (paper `<progress>` styling in `LiveScanPanel.tsx`).

### Deleted classes (12) & `git grep` zero-match evidence

Renamed classes: **0**.

Deleted classes (12):
1. `app-shell__footer`
2. `tm-checklist`
3. `tm-checklist--ready`
4. `tm-compare` *(bare `.tm-compare` only; `.tm-compare__img`, `.tm-compare__after`, `.tm-compare__divider`, `.tm-compare__handle` are used in `components/TimeReview.tsx` and retained)*
5. `tm-dashboard-controls__meta`
6. `tm-facts`
7. `tm-gradient`
8. `tm-hero`
9. `tm-hero__actions`
10. `tm-hero__eyebrow`
11. `tm-layout`
12. `tm-output`

Verification command across `dancing-with-the-sars-frontend/` (and across the full repo outside historical reports):

```bash
git grep -n -E '(app-shell__footer|\btm-checklist\b|tm-checklist--ready|\btm-compare\b([^_]|$)|tm-dashboard-controls__meta|\btm-facts\b|\btm-gradient\b|\btm-hero\b|tm-hero__actions|tm-hero__eyebrow|\btm-layout\b|\btm-output\b)' -- dancing-with-the-sars-frontend/
```

Output:

```text
(no output — exit code 1, zero matches)
```

## Checks run (exact commands + outputs)

### 1. Frontend verification gate

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

Output:

```text
added 190 packages, and audited 191 packages in 14s

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


 RUN  v2.1.9 /home/user/Centrale/dancing-with-the-sars-frontend

 ✓ tests/comparison.test.ts (30 tests) 11ms
 ✓ tests/time-machine.test.ts (11 tests) 27ms
 ✓ tests/scan-frames.test.ts (8 tests) 13ms
 ✓ tests/source-register.test.ts (10 tests) 7ms
 ✓ tests/live-fetch.test.ts (3 tests) 9ms
 ✓ tests/calendar-review.test.tsx (2 tests) 10ms
 ✓ tests/tile-url.test.ts (5 tests) 3ms
 ✓ tests/mapbox-token.test.ts (3 tests) 5ms
 ✓ tests/live-scan-panel.test.tsx (1 test) 9ms
 ✓ tests/pages.test.tsx (2 tests) 3ms

 Test Files  10 passed (10)
      Tests  75 passed (75)
   Start at  10:37:46
   Duration  2.52s (transform 262ms, setup 0ms, collect 472ms, tests 97ms, environment 2ms, prepare 695ms)


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
┌ ○ /                                    6.03 kB         618 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /compare                             2.37 kB         617 kB
├ ○ /time-machine                        7.86 kB         623 kB
├ ƒ /tm/frames/[date]                    0 B                0 B
└ ƒ /tm/scan                             0 B                0 B
+ First Load JS shared by all            87.3 kB
  ├ chunks/117-9776bcfde68b9ed6.js       31.7 kB
  ├ chunks/fd9d1056-88c8a1669018f964.js  53.6 kB
  └ other shared chunks (total)          1.97 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### 2. CI environment parity check

```bash
cd dancing-with-the-sars-frontend && BACKEND_URL="http://127.0.0.1:8000" NEXT_PUBLIC_MAPBOX_TOKEN="dummy_token" npm run typecheck && NEXT_PUBLIC_MAPBOX_TOKEN="dummy_token" npm test && BACKEND_URL="http://127.0.0.1:8000" NEXT_PUBLIC_MAPBOX_TOKEN="dummy_token" npm run build
```

Result: exit `0` — `tsc --noEmit` clean, `10 passed (10)` / `75 passed (75)`, `next build` `7/7` pages generated, compiled `.next/static/css/*.css` begins with the verbatim `@import url("https://fonts.googleapis.com/...")` rule with zero build-time font fetches.

## Known gaps, follow-ups, TODOs left in code

1. **Rebase note for workers 08 and 09:** Workers 08 (`dashboard-compare-plate`) and 09 (`timemachine-method-plate`) branch from Round 3 `main` alongside Slice 07. Round 3 merge order is **`07 → 09 → 08`**: once 07 merges first, worker 09 rebases onto 07 (adding `{ href: "/method", label: "Method" }` to `SiteNav.tsx`'s `LINKS` array as a single announced line) and worker 08 rebases onto `07 + 09`.
2. **Untouched page-level dark Tailwind classes until 08/09 land:** `app/page.tsx`, `app/compare/page.tsx`, `app/time-machine/page.tsx`, `Map.tsx`, `ComparisonViewer.tsx`, `WorldviewReview.tsx`, and `TimeReview.tsx` are out of lane for Slice 07 and still carry inline dark-slate Tailwind utilities (`bg-[#111a24]`, `text-slate-*`, `bg-amber-950/*`) that workers 08 and 09 replace with `.plate`, `.index-row`, `.rule-table`, `.colophon`, `.field`, and `.footnote`.
3. **No TODOs left in code.**

## What the supervisor must verify manually

1. **Visual browser check on deployed URL (`https://dancing-sars.duckdns.org/`):** No browser pixel check was possible from this sandbox. After merging `07 → 09 → 08` and rebuilding on the VM, verify runtime Google Fonts (`Archivo` 800/900 + `IBM Plex Mono` 400/500) load in the browser, verify `--paper` / `--ink` / `--accent` / `.colophon` contrast, verify on-imagery dark chips over Mapbox `satellite-streets-v12`, and check responsive breakpoints (`1100px` and `900px`).
2. **Maintainer review of `app/layout.tsx` metadata:** Confirm or edit the reworded `<title>` and `<meta name="description">` on PR #19.
3. **GitHub Actions CI:** Confirm both `backend` and `frontend` jobs are green on PR #19 before merging in order `07 → 09 → 08`.
