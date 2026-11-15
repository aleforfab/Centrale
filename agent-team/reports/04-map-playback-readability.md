# Report — 04-map-playback-readability — 2026-11-15

> **Postscript (2026-11-15):** PR #15 was marked ready (CI green: backend pass,
> frontend pass) and **merged into `main` at the maintainer's explicit request**
> — merge commit `d8e2a2101d5eabb0511965a8a8e1e3143e48d933`, 2026-11-15T08:23:05Z.
> Note the round-2 order (06 → 04 → 05) landed as 04 → 06: slice 06's PR #14
> merged immediately after; combined-`main` verification belongs to the
> supervisor's final integration pass. Deployed-URL checks listed below remain
> open.

## Branch / PR link / base SHA / HEAD SHA

- **Branch:** `arena/5419dd9b-centrale` (session-pinned active branch; the brief's `feat/map-playback-readability` name could not be created or switched to per session branch policy — same situation as workers 01–03).
- **PR link:** https://github.com/aleforfab/Centrale/pull/15 (Draft PR into `main`; do not merge — supervisor is merge captain).
- **Base SHA (`origin/main`):** `3a956874142f8cdadd3ff991dc8461b6ddce94ce` (merge of PR #13, the round-2 setup; contains round-2 base `94e12f0`).
- **HEAD SHA:** `914f425d682b97e612e9f3084e6f00c207462689`

## Scope done / scope not done (and why)

### Done

1. **SAR basemap — satellite-streets.** The SAR/NISAR view now uses
   `mapbox://styles/mapbox/satellite-streets-v12` instead of `dark-v11`
   (`components/Map.tsx`, `styleForView`). Both view toggles consequently share
   the same basemap (the toggle API is kept because out-of-lane call sites use
   it; see "Known gaps"). The imagery was not judged too dark behind the raster
   in code review, so the sanctioned `outdoors-v12` alternative was **not**
   needed — but this is a code-level judgment only; the deployed-URL look is the
   supervisor's check. The tokenless local-canvas fallback style is unchanged.
2. **Raster opacity.** Observation/backscatter product layers draw at
   `raster-opacity: 0.8` (`RASTER_OPACITY_OBSERVATION`); `difference` (and
   `change_mask`, which never renders in playback) stay at `0.72`
   (`RASTER_OPACITY_DIFFERENCE`). Applied on add and on set-change refresh.
3. **Framing.** `map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
   { padding: 80, maxZoom: 12, duration: 700 })`. Padding/maxZoom exactly per
   brief; `duration: 700` was retained from the existing code for a smooth
   transition and does not change framing.
4. **Site footprint.** GeoJSON Polygon source `site-bbox` + line layer
   `site-bbox-line` with `line-color: "#ff8a3d"`, `line-width: 2`, added **after**
   product layers so the line draws over the rasters. Re-mounted by the
   permanent `style.load` handler (a `setStyle` basemap switch drops runtime
   sources/layers); moved between sites via cheap `GeoJSONSource.setData`.
5. **ScaleControl.** `new mapboxgl.ScaleControl({ unit: "metric" })` at
   `bottom-right`. The React attribution chip was nudged from `bottom-3` to
   `bottom-10` so it clears the scale bar (cosmetic, lane-internal, no content
   change).
6. **Playback flash fix — pre-mount + visibility toggle.**
   - `Map` gained an optional `activeLayerId` prop. All layers in the `layers`
     prop are mounted once per *set* (add/remove only happens in the
     `[layers]`-keyed `syncProductLayers` pass or after a style switch). When
     `activeLayerId` changes, a dedicated effect only calls
     `setLayoutProperty(<layerId>, "visibility", "visible" | "none")` on
     already-mounted layers — no `addSource`/`removeSource`/`addLayer`/
     `removeLayer`/`setTiles` on that path.
   - `WorldviewReview` now passes `layers={playbackLayers}` where
     `playbackLayers = useMemo(() => frames.map((f) => f.layer), [frames])`, so
     the prop is referentially stable across the 1.2 s ticks (identity changes
     only when manifest/polarization changes — a genuine set change).
   - Old single-layer call sites (dashboard `app/page.tsx`, compare flow) are
     untouched and still work: with no `activeLayerId`, every mounted layer is
     visible, and the "first entry renders on top" stacking order is preserved.
   - Playback-trace below.
7. **Manifest-derived date presets.** Hardcoded `KRAKATAU_STACK_DATES` and the
   `REQUESTED_STACK_DATE_SET` filter are **deleted** (brief-sanctioned choice;
   "delete it and update all importers" — announced here per brief). New
   `scanFrameDates(frames)` derives sorted, distinct preset dates from the
   loaded manifest's installed backscatter frames, so a preset chip can never
   point at a date with no observation (the "· unavailable" disabled-chip path
   is gone from both playback and compare preset rows). Bonus invariant win:
   frames on manifest dates outside the old hardcoded five are no longer
   silently dropped from playback.
8. **Gated Krakatau event phases.** The old local `eventPhase()` moved to
   `lib/scanFrames.ts` as `framePhase(manifest, frames, date)`. Eruption-phase
   labels ("Before event" / "Event date" / "Month after event" / "Later
   acquisition", anchored on 2026-09-06) apply only when
   `isKrakatauSite(manifest)` matches (site id/title contains "krakatau" or
   "krakatoa"). Other sites get the neutral fallback — "Before acquisition" /
   "After acquisition", anchored on the stack's earliest backscatter date (the
   anchor frame itself reads "Before acquisition"); empty input/degenerate
   stacks read the neutral "Acquisition". The renamed helper replaces the
   component-local function (no other importers existed; `grep` confirmed).
9. **Tests.** `tests/scan-frames.test.ts` updated to the no-date-filter
   behavior (the formerly excluded 2026-09-12 layer is now an expected frame,
   and its missing acquisition record exercises the provenance fallback), plus
   new coverage for `scanFrameDates` and both `framePhase` branches.

### Not done (and why)

- **No browser/pixel verification.** This sandbox has no browser, and the
  Mapbox token is URL-restricted to the deployed domain, so localhost could not
  validate it anyway. All playback/footprint/basemap claims below are
  code-level; deployed-URL verification is the supervisor's per the brief.
- Backend untouched (frontend lane); `npm audit` belongs to worker 06.

## Files changed (`git diff --stat origin/main...HEAD`)

```
 dancing-with-the-sars-frontend/components/Map.tsx  | 194 ++++++++++++++++-----
 .../components/WorldviewReview.tsx                 |  26 ++-
 dancing-with-the-sars-frontend/lib/scanFrames.ts   |  55 ++++--
 .../tests/scan-frames.test.ts                      |  55 +++++-
 4 files changed, 254 insertions(+), 76 deletions(-)
```

Plus this report (subsequent commit). Exactly the four lane files; nothing else.

## Shared files touched (ANNOUNCE list)

**None.** Only lane files (`components/Map.tsx`, `components/WorldviewReview.tsx`,
`lib/scanFrames.ts`, `tests/scan-frames.test.ts`) plus this report, which the
brief mandates. The deletion of the `KRAKATAU_STACK_DATES` export is a
lane-internal API change announced here per the brief; the only importers were
`WorldviewReview.tsx` and the lane test (both updated).

## Checks run (exact commands + outputs)

```bash
cd dancing-with-the-sars-frontend
```

`npm ci`:
```
added 190 packages, and audited 191 packages in 17s
```

`npm run typecheck`:
```
> typecheck
> tsc --noEmit
```
(clean, no errors)

`npm test`:
```
 RUN  v2.1.9 /home/user/Centrale/dancing-with-the-sars-frontend
 ✓ tests/comparison.test.ts (30 tests) 22ms
 ✓ tests/time-machine.test.ts (11 tests) 53ms
 ✓ tests/scan-frames.test.ts (8 tests) 27ms
 ✓ tests/source-register.test.ts (10 tests) 14ms
 ✓ tests/applications.test.ts (9 tests) 10ms
 ✓ tests/live-fetch.test.ts (3 tests) 16ms
 ✓ tests/tile-url.test.ts (5 tests) 6ms
 ✓ tests/mapbox-token.test.ts (3 tests) 5ms
 ✓ tests/pages.test.tsx (2 tests) 5ms
 Test Files  9 passed (9)
      Tests  81 passed (81)
```

`npm run build`:
```
▲ Next.js 14.2.35
 ✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (7/7)
Route (app)                              Size     First Load JS
┌ ○ /                                    6.79 kB         610 kB
...
```

## Playback trace (no source churn per tick)

Read directly from the code (no browser available — supervisor re-checks on the
deployed URL):

1. `WorldviewReview` renders `<Map layers={playbackLayers}
   activeLayerId={current.layer.id} …>`. `frames` is memoized on
   `[manifest, polarization]`; `playbackLayers` is memoized on `[frames]`.
   During the 1.2 s `setInterval` only `index` (component state) changes, so the
   `layers` array reaching `Map` is the **same object** every tick.
2. In `Map`, the `[layers]` effect therefore does **not** re-fire during
   playback. `syncProductLayers` — the only function containing
   `addSource`/`removeSource`/`addLayer`/`removeLayer`/`setTiles` — runs only on
   (a) initial style `"load"`, (b) `"style.load"` after a basemap switch, or
   (c) a real layer-set identity change. None of these happen on a tick.
3. A tick changes only `activeLayerId`, whose dedicated effect loops the
   already-mounted product layers and calls
   `setLayoutProperty(layerId, "visibility", …)` — a paint-free property swap
   that keeps each raster source's tile cache intact. Previously fetched frames
   replay from cache when the stack loops.
4. `fitBounds` is `[bbox]`-keyed and the site bbox is stable during playback;
   the footprint layer is untouched per tick.

Conclusion: advancing the timeline performs **no** source removal/addition and
no `setTiles`; the closing/reopening flash cause (tile-cache drop on source
re-add) is eliminated. First pass over un-warmed frames still fetches their
tiles from the network — visible as a load, not a re-add flash; warmed loops
are cache-served.

## Honesty invariants: kept / violated

**Kept.** Specifically:

- Difference/change-mask layers still cannot enter playback:
  `manifestToScanFrames` accepts only `kind === "backscatter"`.
- No date substitution or interpolation: presets are the installed dates
  themselves; the exact-date error paths and "missing dates stay missing" copy
  in compare mode are unchanged.
- The satellite basemap is labeled in the map HUD: "Satellite basemap is visual
  context only, not a matched-date observation." — so the new imagery backdrop
  cannot be mistaken for an optical observation of the event.
- Provenance table (date, polarization, product kind, CRID, maturity, source,
  granule) unchanged; maturity remains "PROVISIONAL".
- Eruption/event copy is now gated to Krakatau manifests; other sites can no
  longer inherit event framing they do not have.
- No synthetic/procedural content was touched or relabeled.

## Known gaps, follow-ups, TODOs left in code

- **Flagged, unchanged: `attributionControl: false`** (per brief). Mapbox
  terms typically require attribution for Mapbox-hosted styles; the React chip
  ("Map imagery © Mapbox") is not Mapbox's native control. Decision belongs to
  the maintainer.
- The **Optical/NISAR view toggle** now switches overlay copy only, since both
  views share `satellite-streets-v12`. Kept for API compatibility with the
  out-of-lane pages; if the maintainer wants the toggle to keep two visually
  distinct basemaps (or retire it), that is a follow-up decision.
- `app/time-machine/page.tsx` still contains "The request covers the specified
  five acquisition dates" copy — that file is worker 05's lane; with
  manifest-derived presets the phrase is now cosmetic-stale. Flagged for 05.
- `framePhase` neutral fallback anchors on the stack's earliest frame, so a
  one-frame stack labels its only frame "Before acquisition"; acceptable
  placeholder for future non-Krakatau sites.
- No `TODO` comments were left in code.

## What the supervisor must verify manually

On the deployed URL (https://dancing-sars.duckdns.org/) — the token is
URL-restricted and this sandbox has no browser:

1. Time Machine playback: frames advance without the raster closing/reopening;
   network tab shows no repeated tile re-fetch on warmed loops; no console
   errors.
2. SAR view sits on satellite-streets imagery (if it reads too dark under the
   0.8 raster, the sanctioned fallback is `outdoors-v12` — one-line change in
   `Map.tsx`).
3. Orange `#ff8a3d` footprint rectangle outlines the site bbox over the raster.
4. Metric ScaleControl bottom-right; zoom-to-site respects `maxZoom: 12`.
5. Date preset chips exactly match the manifest's installed backscatter dates;
   on Krakatau the header shows event phases, on any other site the neutral
   Before/After labels.
6. Round-2 merge order is **06 → 04 → 05**; this branch touches no files owned
   by 05 or 06, but re-run the frontend matrix after 06 lands.
