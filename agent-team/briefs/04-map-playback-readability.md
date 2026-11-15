# Brief 04 — Map basemap, footprint, scale & playback fix (frontend)

Branch: `feat/map-playback-readability` from `origin/main` @ `94e12f0` (merge of PR #11).
Read `agent-team/CONTRACT.md` (round 2 section) and `skills/dancing-with-the-sars/SKILL.md` first; they bind.
Repo: `aleforfab/Centrale`.

## Why

The maintainer tested the deployed map. Three readability problems and one
playback defect remain now that the tile-URL fix (PR #11) landed:

1. The NISAR raster sits on a basemap that fights it; it should ride on real
   satellite context, not a dark UI surface.
2. Changing frames during Time Machine playback **reloads the raster each tick**
   — the frame visibly closes and reopens ("as if the image reload every time").
3. The operator cannot see the site's footprint or scale; the product claims to
   be location-honest but doesn't draw the location.

## Ground rules (from the maintainer's issue, verbatim intent)

- Basemap for the SAR/NISAR view: `mapbox://styles/mapbox/satellite-streets-v12`
  (if imagery proves too dark behind the raster, `outdoors-v12` is the
  sanctioned alternative — say so in your report).
- Raster draws **over** the basemap at `raster-opacity: 0.8` (`0.72` stays for
  `difference` layers).
- `map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, maxZoom: 12 })`.
  The `maxZoom: 12` matters — the site is framed inside a wider landscape, not
  zoomed to a z14 viewport fill.
- Footprint: a GeoJSON Polygon source `site-bbox` and a line layer `site-bbox-line`
  with `line-color: "#ff8a3d"`, `line-width: 2`.
- Add a `mapboxgl` **ScaleControl** (metric) to the map.

## Diagnosis you must fix (playback flash)

`WorldviewReview` advances `index` on a 1.2 s interval; `<Map layers={[current.layer]}>`
then receives a fresh array each tick. `Map`'s `useEffect([layers])` calls
`syncProductLayers`, which removes every `nisar-source-*` absent from the new set
and re-adds the new source — Mapbox drops the cached tiles and the frame flashes.

Fix it by pre-mounting:

- Mount **all** playback frames' raster sources/layers **once** when the set
  changes (never during the 1.2 s interval).
- During playback keep them mounted and toggle
  `layout.visibility` (`"visible"` / `"none"`) for the active frame.
- Make the `layers` prop referentially stable across ticks
  (`useMemo` on the frames array; no new array identity per render).
- No `removeSource`/`addSource`/`setTiles` calls during playback.
- Difference/change-mask layers remain excluded from playback (invariant).

Suggested shape (your call, adapt as needed): `Map` accepts
`layers` (full set to mount) plus `activeLayerId`; when `activeLayerId` changes it
only flips visibility. Keep the old single-layer call-sites working (dashboard,
compare) — do not break their panels.

## Also in scope

- `lib/scanFrames.ts`: replace the hardcoded `KRAKATAU_STACK_DATES` date-preset
  constant with **presets derived from the loaded manifest's backscatter frames**
  (keep a thin export for tests or delete it and update all importers — your
  choice, annoncée in the report).
- `eventPhase()` is Anak Krakatau-specific (eruption 2026-09-06). Gate it behind
  a Krakatau manifest check (site id/title heuristic) with a neutral fallback
  ("Before acquisition" / "After acquisition") for other sites.
- `tests/scan-frames.test.ts` must be updated to the new presets behaviour and
  stay green.

## Explicitly out of scope

- `/compare`, the three pages under `app/` (owned by worker 05),
  `components/LiveScanPanel.tsx` (05), `components/ComparisonViewer.tsx`.
- Backend, `next.config.mjs`, `package.json`/lockfile, `next.config.mjs` rewrites.
- Rendering `layer.legend` under the layer selector (worker 05).
- Attribution/terms-of-service decisions for `attributionControl: false` — flag
  it in your report, do not change it.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

Plus a written playback-trace in the report: confirm from the code (and note
you could not click a browser) that advancing the timeline performs **no**
source removal/addition. Deployed-URL check is the supervisor's, after merge.

## Hand-in

Report at `agent-team/reports/04-map-playback-readability.md` (format:
CONTRACT §4). Open a draft PR when green. Do not merge.
