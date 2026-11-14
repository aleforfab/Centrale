# NISAR demo runbook

## Current state

The app displays static NISAR products built from a site YAML file. It does not
run a new Earth Engine or Sentinel-1 analysis from the interface. When no site
has been built, the frontend shows an empty-state message rather than presenting
fallback results as NISAR.

`GET /api/nisar/search` now caches its live ASF catalog results, and
`POST /api/nisar/fetch` builds a site from live granules in a background job
(enabled by default; `ENABLE_LIVE_FETCH=false` disables it); poll
`/api/nisar/fetch/jobs/{job_id}` for progress. See
[`LIVE_FETCH.md`](LIVE_FETCH.md) before using that path in a demo: it downloads
whole granules and needs Earthdata credentials.

The repository does not currently include a curated site configuration or a
real built product tree. Select a study region, then use ASF search to identify
a stack and matching dates before creating a site YAML file.

## Prepare a site

From `dancing-with-sars-backend`, search for available stacks:

```powershell
python -m nisar.cli discover --bbox "-60,-12,-59,-11" --start 2026-06-01 --end 2026-11-30
```

The example bbox is only a search example; confirm the returned frame fully
covers the region and that both curated pair dates are present in the same
track, direction, frame, and maturity. Do not use dates spanning known data
gaps without explicitly explaining the gap in the site description.

Create a YAML config with the schema used by `nisar.models.SiteConfig` and
`nisar.models.StackConfig`, including:

- a lowercase slug `id`, title, event type, description, caveat, and WGS84 bbox
- `stack.track`, `stack.frame`, `stack.direction`, and `stack.maturity`
- supported polarizations present in all required acquisitions
- at least one curated pair with valid `pre`, `post`, and `label`
- optional `tiles.min_zoom`, `tiles.max_zoom`, and `tiles.budget_mb`

Validate the plan before any downloads:

```powershell
python -m nisar.cli build-site --config sites\<site>.yaml --dry-run
```

Build and verify:

```powershell
python -m nisar.cli build-site --config sites\<site>.yaml
python -m nisar.cli verify --site <site-id>
```

`build-site` downloads the selected HDF5 granules when `--local-dir` is not
specified. NISAR granules can be multiple gigabytes each; check storage and
network capacity before building. Use `--local-dir <folder>` for existing
downloads. `--max-acquisitions` must still include every date used by curated
pairs.

Products are written under `PRODUCTS_DIR` (default `products/`) and include
COGs, XYZ PNG tiles, a validated manifest, acquisition provenance, time series,
and pair statistics.

## Start the app

Terminal 1, from `dancing-with-sars-backend`:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2, from `dancing-with-the-sars-frontend`:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`. Configure `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_MAPBOX_TOKEN` in the frontend's local environment file if needed.
The token is required for the basemap; product APIs and static product files
remain served by the backend.

## Suggested demo sequence

1. Select a site and describe its event, caveat, mission, product, maturity, and CRID.
2. Toggle a backscatter layer, then compare it with a difference or threshold layer.
3. Review the acquisition provenance links and regional time-series trend.
4. Explain blue/red change semantics and review area, coverage, noise, and histogram statistics.
5. Point out the shaded NISAR instrument gap and any missing cycle annotations.

## Offline or restricted-network checklist

- Build and verify products before the demo; the map display does not need to
  contact ASF once products exist locally.
- Keep the backend `products/` directory available and confirm
  `/api/data-status` reports a ready NISAR site.
- The frontend still loads Mapbox styles and basemap imagery over the network.
  A fully offline map requires self-hosted basemap tiles, which this app does
  not currently provide.
- The live NISAR search endpoint requires ASF network access. It is not needed
  to browse already-built products.

## Useful endpoints

- `GET /api/data-status` — active source and whether built NISAR products exist
- `GET /api/sites` — built site summaries
- `GET /api/sites/{site-id}` — site manifest
- `GET /api/sites/{site-id}/timeseries?pol=HH` — polarization time series
- `GET /api/nisar/search?bbox=min_lon,min_lat,max_lon,max_lat&start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /health` — backend and product readiness

Legacy `/api/gee/*` and Sentinel-1 `/api/asf/search` routes return 404 unless
`ENABLE_SENTINEL1_FALLBACK=true` is explicitly configured.

## Known limitations

- No first real study site is selected or committed. Site choice and full-size
  download are deliberate operator decisions.
- Live NISAR smoke-test results still need a second same-stack acquisition to
  confirm grid alignment; mask flag semantics and slow remote reads also remain
  under investigation. The current builder downloads whole granules.
- The UI supports multiple product overlays; swipe-based before/after comparison
  is not implemented yet.
- The time-series UI does not yet shade mission data gaps or infer missing
  repeat cycles.
- Pixel-level time-series, additional curated sites, and displacement/GUNW
  products are not implemented.

## Troubleshooting

- **No sites available:** create a valid site YAML, build it, and run `verify`.
- **ASF authentication/search failure:** check Earthdata network access and the
  backend `.env` without printing or sharing credential values.
- **Pair dates missing:** confirm exact acquisition dates and stack identity in
  ASF results; do not silently substitute another track or maturity.
- **Tile budget exceeded:** reduce the configured zoom range or site extent.
- **Mapbox token required:** configure `NEXT_PUBLIC_MAPBOX_TOKEN` and restart
  Next.js.
- **Fallback endpoint returns 404:** this is expected while the opt-in
  Sentinel-1 development fallback flag is disabled.
