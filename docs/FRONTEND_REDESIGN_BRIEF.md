# Frontend redesign brief — feature audit and visualisation options

Date: 2026-11-14
Branch: `arena/73d543cc-centrale`

## What is live right now

Three preview processes are running with synthetic data only:

| Preview | Port | What it shows |
|---|---:|---|
| Frontend redesign preview | `3000` | The current Next.js app: `/`, `/compare`, `/applications`, `/setup` |
| SAR Time Machine prototype | `8765` | The standalone image-based evolution / swipe-compare player |
| NISAR API | `8000` | FastAPI data and product endpoints behind the Next.js proxy |

The Next.js preview is backed by a generated `demo-fixture` site with 2 acquisitions, 12 layers, HH/HV polarizations and the required synthetic caveat. No real NISAR observations are present.

## Feature inventory

### Current Next.js frontend

| Route / area | Features today | Visual state today |
|---|---|---|
| `/` dashboard | Site, polarization and product-layer selectors; layer visibility; Mapbox map; time-series chart; pair statistics; ASF granule provenance; data-status banner; empty state | Dark slate dashboard, stacked controls, card-like sections, shared nav |
| `/compare` | One curated pair, one polarization, two exact observation dates; reveal slider; locked cameras; provenance and caveat; explicit problem states when data is missing | Dark split-view viewer with controls and a problem panel |
| `/applications` | Twelve NISAR application topics; capability labels derived from `CASE_REVIEWS`; limits and methods a real study would need | Card/list content page |
| `/setup` | Eight gates a topic must pass before becoming a published case | Content page |
| Shared shell | `SiteNav`, root layout, global dark theme | Minimal shared navigation and `globals.css` |
| Data access | Relative `/api/*` and `/products/*` URLs, server-side rewrite to `BACKEND_URL` | Browser never sees the backend address |

### Standalone `sar-time-machine-prototype`

| Feature | Implementation detail |
|---|---|
| Evolution playback | Play/pause, step, timeline scrub, speed, loop; each observation gets equal screen time |
| Swipe compare | Chosen baseline on the left, current frame on the right; draggable/keyboard-operable divider |
| Zoom and pan | Mouse wheel and drag; both layers stay aligned |
| Observation facts | Date, frame number, polarization, display range, days since previous, source |
| Accessibility | Space and arrow keys, Home/End on swipe handle, reduced-motion support |
| Honest labelling | Prominent “Synthetic demo” pill and notice that frames are not NISAR observations |
| Contract | Emulates `GET /api/series` with ordered, coregistered, equally sized image frames |
| Integration status | **Standalone only.** It does not use the main backend, site manifests or tile URLs |

## Integration constraint that matters most

The prototype expects full image frames from `/api/series`. The real project exposes site manifests with raster tile URL templates for `backscatter`, `difference`, `change_mask` and other layers, plus `acquisitions.json`, `timeseries.json` and `stats.json`.

So a production “time machine” cannot simply substitute tile URLs for image URLs. It needs to:

1. Select only `kind: "backscatter"` observation layers.
2. Keep one polarization and one curated stack.
3. Preserve exact dates; never invent intermediate observations.
4. Handle tiled map loading, projection and camera synchronisation.
5. Keep difference and change-mask layers out of the playback frames.
6. Preserve synthetic caveats, provenance and attribution.

This aligns with the existing `/compare` rule: no substitute date, no substitute polarization, no difference layer used as an observation.

## Visualisation options by feature

| Feature | Strongest visual pattern | Notes |
|---|---|---|
| Dashboard map | Map-first canvas with a compact left control rail, floating layer chips and a bottom timeline | Keeps the map dominant; moves selectors out of a three-column form row |
| Layer stack | Vertical “observation stack” with dates, polarization dots and layer kind badges | Makes exact dates and product kinds visible without opening a dropdown |
| Time series | Sparkline beneath the map with date ticks and a selected-point marker | Can connect to layer selection; preserve measured dB values and maturity |
| Change products | Right-side insight drawer with threshold chips, histogram and statistics | Keep statistics clearly labelled as measured outputs, not validated science |
| Provenance | Collapsible provenance panel or bottom sheet with ASF links, granule names, CRID, maturity | Keeps the main canvas uncluttered |
| Compare | Full-bleed split map with a central reveal handle, date chips and locked-camera indicator | Existing `/compare` logic can be restyled without changing its refusal rules |
| Time Machine | Cinematic full-bleed player with a large date readout, gap-aware timeline and baseline swipe | Needs a tile-based adapter before it can use real project products |
| Applications | Card grid with derived capability badges, “what exists” and “what a real study needs” columns | Do not hand-label topics as validated; labels stay derived |
| Setup | Stepper / gate checklist with status dots and “not recorded” states | Honest empty states are part of the design |
| Data status | Persistent chip in the top bar plus a clear empty-state card | Avoid implying data exists when no site is built |
| Synthetic / empty states | Amber notice treatment with explicit “not a real observation” language | Product decision; do not soften or hide |

## Possible design directions

### A. Mission-control dark dashboard
Close to the current palette: deep navy/slate, cyan and orange accents, dense controls, monospace metadata. Lowest implementation risk. Good for a technical audience.

### B. Map-first cinematic explorer
Full-bleed radar canvas, minimal chrome, large date typography, floating glass panels and a prominent timeline. Best fit for the standalone Time Machine interaction, but needs careful responsive and accessibility work.

### C. Editorial research story
Scroll-led narrative with large imagery, explanatory copy, pull quotes and feature cards. Good for outreach and the applications library, less ideal for dense map interaction.

### D. Light scientific workbench
High-contrast light theme, clear typography, white panels and strong data tables. Better for reports and readability, but a larger departure from the current dark visual identity.

## Scope choices for the next iteration

1. **Design-only first**: produce wireframes / a visual concept, change no app code.
2. **Restyle existing routes**: unify `/`, `/compare`, `/applications` and `/setup` with a new design system.
3. **Integrate Time Machine interactions**: add playback/scrub/swipe to the Next.js app using existing manifest layers and exact-date rules.
4. **Build one new `/time-machine` route**: keep the current app intact and add a focused player route.

## Honesty invariants to preserve

From `CONTRIBUTING.md` and the current tests:

- Synthetic sites must keep saying they are **not real observations**.
- `/compare` must keep refusing to substitute a date, a polarization or a difference layer.
- Capability labels stay derived from `CASE_REVIEWS`; do not hand-write “validated”.
- Statistics must never be described as a validated scientific result.
- Backscatter change is a measured difference, not a cause.

## Shared-file heads-up

One shared shell file was changed additively: `components/SiteNav.tsx` now links to `/time-machine` and uses the new pill navigation. No other shared files were edited: `app/layout.tsx`, `lib/types.ts`, `lib/api.ts`, `package.json`, the lockfile, CI, `README.md` and `CONTRIBUTING.md` are untouched. The `docs/` file here is additive only.

## Implementation status — 2026-11-14

The chosen deliverable is a clickable Next.js prototype on the map-first cinematic direction. All four current routes (`/`, `/compare`, `/applications`, `/setup`) now share `components/AppShell.tsx` and `app/redesign.css`; the new `/time-machine` route is the integrated Time Machine workspace.

| Requested feature | Where it lives | Prototype behaviour |
|---|---|---|
| Restyle all current routes | `AppShell`, `redesign.css`, all four page files | Dark cinematic shell, glass panels, large map, compact controls, derived capability labels and honest empty states remain intact |
| Mapbox region selection | `components/RegionSelector.tsx` | Draw/pan modes, drag-to-draw bbox, “use current view”, manual coordinates, visible bbox chips. A local Mapbox GL grid stands in for the basemap when no URL-restricted token is configured |
| Start scan from selected region | `POST /tm/scan`, “Start scan for selected region” button | Validates bbox and selected features, then returns eight ordered synthetic frames keyed by the exact bbox, polarization and feature set |
| Choices for features selected | `components/FeatureChoices.tsx`, `lib/timeMachine.ts` | Backscatter, difference, mask, time series, provenance, playback and two-date compare; the right rail shows a panel for each selected feature |
| Keep the slider | `components/TimeReview.tsx` | One event-date timeline slider with before/after event labels and a compare reveal slider |
| Add playback | `TimeReview` | Play/pause, 0.5×–4× speed, equal time per dated frame, reduced-motion guard |
| One event date or two dates | `TimeReview`, scan options | Mode toggle: one event date (before/after) or two exact dates to compare; pair mode has before/after selects and a draggable/keyboard-operable reveal handle |
| Exact-date honesty | `lib/comparison.ts`, `buildMockManifest()` | Only `backscatter` observation layers enter the mock manifest; no substitute date, polarization, difference or change-mask layer is used |

### Backend support check

`POST /api/nisar/fetch` in the FastAPI backend already accepts an arbitrary `bbox`, `start_date`, `end_date`, `maturity`, `polarizations` and `max_granules`. It is not used by the prototype button: the preview has live fetch disabled and no Earthdata credentials, and no real NISAR granule was downloaded or processed. The button calls local route handlers that generate deterministic SVG frames from the selected bbox and feature set. A production integration still needs tile loading, projection, camera synchronisation, exact-date gating, provenance and attribution.

### Honesty invariants preserved

- Prototype frames say they are **not a real observation**, not NISAR observations, not a real change and not evidence of anything.
- Installed synthetic sites keep their original caveat.
- `/compare` still refuses to substitute a date, a polarization or a difference/change-mask layer.
- Capability labels remain derived from `CASE_REVIEWS`.
- Statistics are described as measured outputs, not validated scientific results.

### Verification

- Backend: `ruff check .` → `All checks passed!`; `pytest -q` → `110 passed, 11 warnings`.
- Frontend: `npm ci`, `npm run typecheck`, `npm test` → `5 files / 67 tests passed`; `npm run build` → `9/9` pages generated, including `/time-machine`, `/tm/scan` and `/tm/frames/[date]`.
- CI compatibility: the first pull-request run exposed that `jsdom@31` needs Node 22 while the existing CI workflow pins Node 20. The jsdom-only interaction test was removed instead of changing shared `package.json`, the lockfile or CI. Server-rendered control checks remain in the Node-environment suite, and no app code changed in that fix.
- Live HTTP checks: `/`, `/compare`, `/applications`, `/setup`, `/time-machine`, `/api/data-status`, `/api/sites`, `/api/sites/demo-fixture`, `/tm/scan`, a synthetic frame, one product PNG tile, backend `/health` and the standalone prototype all returned `200`; preview-like Host headers also returned `200`.
- No real Mapbox basemap is claimed: the preview uses `NEXT_PUBLIC_MAPBOX_TOKEN=dummy_token`, so product tiles and the local Mapbox GL canvas are available but a real tiled Mapbox basemap is unverified.
