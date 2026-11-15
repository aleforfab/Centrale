# Frontend redesign brief — feature audit and visualisation options

Date: 2026-11-14
Branch: `arena/73d543cc-centrale`

## Preview state at the time of this brief

This 2026-11-14 inventory documented a Next.js preview backed by a generated
`demo-fixture` site and a standalone image player. On 2026-11-15, the interactive
procedural demo routes and the standalone player were removed. The current
`/time-machine` page reads installed site manifests and offers live fetch.

## Feature inventory at 2026-11-14

### Frontend snapshot

| Route / area | Features then | Visual state then |
|---|---|---|
| `/` dashboard | Site, polarization and product-layer selectors; layer visibility; Mapbox map; time-series chart; pair statistics; ASF granule provenance; data-status banner; empty state | Dark slate dashboard, stacked controls, card-like sections, shared nav |
| `/compare` | One curated pair, one polarization, two exact observation dates; reveal slider; locked cameras; provenance and caveat; explicit problem states when data is missing | Dark split-view viewer with controls and a problem panel |
| `/applications` | Twelve NISAR application topics; capability labels derived from `CASE_REVIEWS`; limits and methods a real study would need | Card/list content page |
| `/setup` | Eight gates a topic must pass before becoming a published case | Content page |
| Shared shell | `SiteNav`, root layout, global dark theme | Minimal shared navigation and `globals.css` |
| Data access | Relative `/api/*` and `/products/*` URLs, server-side rewrite to `BACKEND_URL` | Browser never sees the backend address |

### Time Machine page

The current page reads site manifests, displays installed radar observations,
plays exact dated frames, compares selected dates, and exposes live fetch as an
explicit action. There is no procedural frame endpoint or standalone demo player.

## Design options recorded in this brief

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
| Setup | Stepper / gate checklist with status dots and “not recorded” states | Use concise empty states |
| Data status | Persistent chip in the top bar plus a clear empty-state card | Avoid implying data exists when no site is built |
| Empty states | Clear notice treatment with a link to available actions | Keep the product controls visible |

## Possible design directions

### A. Mission-control dark dashboard
Close to the current palette: deep navy/slate, cyan and orange accents, dense controls, monospace metadata. Lowest implementation risk. Good for a technical audience.

### B. Map-first cinematic explorer
Full-bleed radar canvas, minimal chrome, large date typography, floating glass panels and a prominent timeline. Best fit for the standalone Time Machine interaction, but needs careful responsive and accessibility work.

### C. Editorial research story
Scroll-led narrative with large imagery, explanatory copy, pull quotes and feature cards. Good for outreach and the applications library, less ideal for dense map interaction.

### D. Light scientific workbench
High-contrast light theme, clear typography, white panels and strong data tables. Better for reports and readability, but a larger departure from the current dark visual identity.

## Scope choices recorded in this brief

1. **Design-only first**: produce wireframes / a visual concept, change no app code.
2. **Restyle existing routes**: unify `/` and `/compare` with a new design system; `/applications` and `/setup` were later retired.
3. **Integrate Time Machine interactions**: add playback/scrub/swipe to the Next.js app using existing manifest layers and exact-date rules.
4. **Build one new `/time-machine` route**: keep the current app intact and add a focused player route.

## Shared-file heads-up

One shared shell file was changed: `components/SiteNav.tsx` uses the pill navigation and now links only `/`, `/compare` and `/time-machine`; the retired `/applications` and `/setup` links were removed. No other shared files were edited: `app/layout.tsx`, `lib/types.ts`, `lib/api.ts`, `package.json`, the lockfile, CI, `README.md` and `CONTRIBUTING.md` are untouched. The `docs/` file here is additive only.

## Implementation status — 2026-11-14

For the end-to-end feature/backend/processing audit, see
[`FULL_FEATURE_AUDIT.md`](FULL_FEATURE_AUDIT.md). This brief records the design
and UI implementation; the audit records what was actually verified and what is
still blocking a real deployment.

The chosen deliverable is a clickable Next.js prototype on the map-first cinematic direction. The current routes (`/`, `/compare`, `/time-machine`) share `components/AppShell.tsx` and `app/redesign.css`; `/applications` and `/setup` were removed from the route tree and navigation.

| Requested feature | Where it lives | Prototype behaviour |
|---|---|---|
| Restyle current routes | `AppShell`, `redesign.css`, `/`, `/compare`, `/time-machine` | Dark cinematic shell, glass panels, large optical-first map, compact controls, calendar date inputs and clear empty states remain intact |
| Mapbox region selection | `components/RegionSelector.tsx` | Draw/pan modes, drag-to-draw bbox, “use current view”, manual coordinates, visible bbox chips. The initial Mapbox style is optical satellite imagery; a local grid is only a fallback if the style cannot load |
| Live fetch | `components/LiveScanPanel.tsx`, `/api/nisar/fetch` | Selects a region, date window and HH/HV channels; submits a real backend request |
| Layer selection | Dashboard `Layers` rail | Shows radar observations and one primary change product per date pair; other thresholds are grouped separately |
| Playback | `components/CalendarReview.tsx` | Plays installed observations and uses the same map for date selection |
| Date comparison | `components/CalendarReview.tsx`, `components/ComparisonViewer.tsx` | Compares the selected installed dates and polarization |

### Backend support check

`POST /api/nisar/fetch` accepts a `bbox`, date range, polarization selection and granule limit. The live-fetch panel uses this endpoint; a successful build appears in the installed site catalogue. Live access requires backend Earthdata credentials.

### Verification

- Backend: `ruff check .` → `All checks passed!`; `pytest -q` → `110 passed, 11 warnings`.
- Historical frontend check (2026-11-14): `npm ci`, `npm run typecheck`, `npm test` → `6 files / 65 tests passed`; the build at that time included `/tm/scan` and `/tm/frames/[date]`, removed on 2026-11-15.
- CI compatibility: the first pull-request run exposed that `jsdom@31` needs Node 22 while the existing CI workflow pins Node 20. The jsdom-only interaction test was removed instead of changing shared `package.json`, the lockfile or CI. Server-rendered control checks remain in the Node-environment suite, and no app code changed in that fix.
- Historical live HTTP checks (2026-11-14): `/`, `/compare`, `/time-machine`, `/api/data-status`, `/api/sites`, `/api/sites/demo-fixture`, the old scan routes and a product tile returned `200`; `/applications` and `/setup` returned `404`.
- The public `pk.*` Mapbox token is committed in `lib/mapboxToken.ts` and used as fallback when no valid environment override exists; CI's `dummy_token` no longer disables the basemap. The Mapbox Satellite Streets v12 style endpoint accepted the token. Initial region selector and dashboard map request optical satellite imagery; actual raster-tile rendering in a browser was not visually verified from the sandbox, and the local grid remains the fallback if Mapbox is unreachable.
- The dashboard backscatter graph and regional time-series controls were removed to reduce information density. Interferometry and angle normalization are now selectable *proposed* feature panels; neither computes a result from GCOV backscatter.
