# Brief 05 — Pages & scan controls: own dates everywhere, dedupe dashboard (frontend)

Branch: `feat/pages-scan-controls` from `origin/main` @ `94e12f0`. Read
`agent-team/CONTRACT.md` (round 2 section) and `skills/dancing-with-the-sars/SKILL.md` first; they bind.
Repo: `aleforfab/Centrale`.

## Why

Maintainer testing found three defects in the interaction model:

1. **Time Machine cannot choose dates.** The live-fetch request is hardcoded
   (`LIVE_REQUEST` = 2026-08-13 → 2026-10-01, PROVISIONAL, HH+HV); the operator
   must be able to select the scan window.
2. **Dashboard is redundant.** The "Product layer" dropdown and the "Visible map
   overlays" checkboxes list the same `polLayers`. Dropdown sets `layerId`
   (HUD/stats), checkboxes set `visibleLayerIds` (what draws), and they diverge.
   Several features overlap (below).
3. **Dashboard & Before/After have no selection area, no scan-window calendar,
   and no scan button** — the flow exists only inside Time Machine
   (`RegionSelector` + `startLiveFetch` + poll/cancel). It should exist there too,
   as one shared component.

## Tasks

### G1 — Time Machine: own dates for the scan window

- Replace the hardcoded `LIVE_REQUEST` window with two `type="date"` inputs
  (**start** / **end**) above the scan button; defaults `2026-08-13` / `2026-10-01`.
- Validation: both required, `start ≤ end`; invalid → scan disabled with an
  inline message. No upper bound required, but surface a neutral hint
  (e.g. "The build is capped by the backend size limit regardless of window").
- The request body sent to `POST /api/nisar/fetch` uses the selected window;
  maturity (PROVISIONAL), polarizations (HH+HV), `max_granules` stay fixed.
- Copy that previously printed the hardcoded window must print the selected one.
- Honesty unchanged: exact-date viewer over installed backscatter frames only;
  no interpolation; missing dates stay missing; difference/change-mask excluded
  from playback; PROVISIONAL + caveat intact.

### G2 — Shared live-scan panel, wired into Dashboard and Before/After

Extract a reusable `components/LiveScanPanel.tsx` from `app/time-machine/page.tsx`
(single source for fetch availability check, `/api/data-status` ping,
`startLiveFetch` → poll → progress → cancel/error states, credential/disabled/
size-limit messaging, `LiveFetchError` kinds). Required props, your call on names:
`idPrefix`, `defaultBbox = DEFAULT_BBOX`, `onBuilt(siteId) => void`, `compact?`.

Wire it in:

- **Dashboard** (`app/page.tsx`): render as a collapsed-by-default
  `<details>` card ("Fetch new observations (live)") under the controls row.
  Installed products remain the default view. On success: refresh `/api/sites`,
  auto-select the built site.
- **Before/After** (`app/compare/page.tsx`): same panel; on success: refresh
  sites, select the built site, exact-date pickers constrain to its backscatter
  layers as today.
- **Time Machine**: refactor it to use the shared panel (delete its inlined copy).
- All three pages show the same terminal states (credential/disabled/size-limit/
  failed/cancelled) and the same "PROVISIONAL products…" banner after a build.
- Cost honesty: the panel states that live fetch downloads from ASF/Earthdata
  (multi-GB, operator-side) and shows an estimate note; it never runs implicitly.
- `next.config.mjs` is not touched. The panel uses relative `/api` URLs only.
- Live-fetched sites are registered in the shared products dir and listed by
  `/api/sites` — that is the supported refresh path; do not add new backend routes.

### G3 — Dashboard: unify layer selection (kill the redundancy)

- One fieldset "Layers"; one row per `polLayer`: radio = **active layer**
  (drives HUD, stats, default visibility order, provenance), toggle = **visible**,
  badges for date / pol / kind (`backscatter` / `difference` / `change_mask`).
- Delete the "Product layer" dropdown and the old "Visible map overlays" fieldset.
- Consistency rule (pick one, document in report): either unchecking the active
  layer keeps it active but flagged "(hidden)", or unchecking the active layer is
  refused with a tooltip. Enforce it symmetrically.
- Clicking an Acquisitions date row sets the active layer through the same
  unified mechanism (it already does via `selectAcquisition` — keep that behaviour,
  one code path).
- `visibleLayerIds`/`layerId` state collapses into the unified model.

### G4 — Overlap & duplication cleanup

- At most one prominent CTA to the Time Machine on the dashboard (suggested:
  keep the hero CTA or the SiteNav entry, remove the third); hero becomes a slim
  intro bar or is removed — your call, state it in the report.
- "Site record" panel vs "Acquisitions" list: granule/CRID appear in exactly one
  of them (granule stays in Acquisitions; CRID lives in the source chips and
  provenance table).
- HUD (`tm-dashboard-map__hud`) shows one date concept: the active layer's date
  (typed "Observation" or "Product" as before); the pair label is only shown for
  difference layers. No more two competing dates.
- `/compare`: the row of exact-date chips becomes a compact single-line
  availability readout subordinate to the calendar pickers (not a second
  selector).
- Any additional duplication you find: list it in the report; fix only with the
  same no-behaviour-change discipline.

### G7 — Scan-handoff states (all three pages)

After a successful live build: auto-select the built site; banner stating the
PROVISIONAL maturity, the exact dates present, and the synthetic/real caveat;
missing dates stay missing everywhere; difference/change-mask layers never enter
playback or compare selection (existing `/tm/scan` refusal rules untouched);
no substitutions anywhere.

### B5 (from the map issue) — legend under the selector

Render `layer.legend` as small text directly under the unified layer list (or
selector, wherever it ends up). The map-side aside keeps its copy; duplication of
a one-line legend is acceptable here — say so if you dedupe it instead.

## Explicitly out of scope

`components/Map.tsx`, `components/WorldviewReview.tsx`, `lib/scanFrames.ts`,
`lib/tileUrl.ts` (worker 04); all of `dancing-with-sars-backend/`; deleted dead
modules (worker 06); `package.json`/lockfile; `next.config.mjs`; new routes or
backend endpoints; Redesign (Track C); header/wordmark reword.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

Plus an interaction checklist in the report: (1) invalid window disables scan;
(2) dropdown/overlays gone, single layer control; (3) scan panel appears on all
three pages and lands in the same state machine; (4) post-build auto-select
works; (5) no substitute-date path reachable. You cannot click a browser from
your sandbox — say so; the supervisor verifies pixels on the deployed URL.

## Hand-in

Report at `agent-team/reports/05-pages-scan-controls.md` (CONTRACT §4). Draft PR
when green. Do not merge.
