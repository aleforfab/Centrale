# Full feature audit — 2026-11-14

Scope: `arena/1b1bb994-centrale`, branched from merged `main` `d89fc8d`. This is a
verification record, not a claim that a real volcanic NISAR case has been built.

## Executive answer

**Does the frontend work with the backend?** Yes, for the installed-product API
path. Next.js serves same-origin `/api/*` and `/products/*` requests and proxies
them to FastAPI; the site catalogue, manifest, time-series JSON and one product
PNG tile all returned `200` in this check.

**Does the Time Machine scan retrieve real data and process it?** No. The scan
button calls `POST /tm/scan`, a local Next.js route that returns eight
procedural SVG frames keyed by the selected bbox/polarization/features. It does
not call the FastAPI live-fetch endpoint, does not search ASF, does not download
granules, and does not run the processing pipeline. The backend live-fetch API
exists and is enabled by default, but a real build currently returns `503`
because no Earthdata credentials are configured.

**Is the site production-ready?** Not yet. The UI and installed-product path are
working; real on-demand processing, angle normalization, interferometry,
credential/deployment configuration and browser-level imagery verification are
still open.

## What changed in this audit pass

- Committed the public `pk.*` Mapbox token in
  `dancing-with-the-sars-frontend/lib/mapboxToken.ts`. A valid environment
  override is still honoured; CI's `dummy_token` now falls back to the public
  token instead of disabling the basemap. `.env.example` documents this.
- Removed the dashboard backscatter graph and the regional time-series controls.
- Added two selectable **proposed** feature panels: “Angle normalization” and
  “Interferometry”. They explain the missing data/algorithm requirements and
  compute no result. They are not enabled by default.
- Updated `docs/FRONTEND_REDESIGN_BRIEF.md` with the new test counts, token
  behaviour and reduced information density.

## Checks actually run

### Backend

| Check | Result |
|---|---|
| `ruff check . --output-format concise` | `All checks passed!` |
| `pytest -q` | `110 passed, 11 warnings` |
| `pytest -q tests/test_live_fetch.py::test_fetch_products_builds_real_site_on_miss tests/test_fetch_jobs.py` | `16 passed, 9 warnings` |
| Clean-default FastAPI route surface | `/api/nisar/search`, `/api/nisar/fetch`, `/api/nisar/fetch/jobs`, `/api/nisar/fetch/jobs/{job_id}`, `/api/nisar/fetch/jobs/{job_id}/cancel` present |
| Clean-default `Config.ENABLE_LIVE_FETCH` | `True` |
| Clean-default Earthdata credentials | absent |
| Clean-default `POST /api/nisar/fetch` | `503` with Earthdata credential guidance |
| Synthetic CLI build/verify | `Verified site demo-fixture` · `2 acquisitions, 12 layers` · mission NISAR, maturity PROVISIONAL |

The focused live-fetch test proves that `fetch_products()` can run its catalog →
download → `build_site()` → `verify_site()` pipeline against **local synthetic
HDF5 fixtures with mocked ASF responses**. It does not prove a real ASF download
or a real volcanic case.

### Frontend

| Check | Result |
|---|---|
| `npm ci` | succeeded; `10 vulnerabilities (4 moderate, 3 high, 3 critical)` reported by npm audit |
| `npm run typecheck` | passed |
| `npm test` | `6 files / 65 tests passed` |
| `NEXT_PUBLIC_MAPBOX_TOKEN=dummy_token npm run build` | passed; `7/7` pages generated |
| Committed token in production chunks | found in `/`, `/compare`, `/time-machine` client chunks |
| Mapbox style endpoint with public token | returned the public `Mapbox Satellite Streets` v8 style |
| Mapbox raster tile endpoint with public token | returned `429 Too Many Requests` from this sandbox; browser tile rendering remains unverified |

The `429` does not invalidate the token — the style endpoint accepted it — but it
does mean that rate limits or shared-IP quotas can affect imagery. URL restrictions
and token rotation should be checked in the Mapbox dashboard; “public” is not the
same as “unlimited”.

### Live HTTP matrix

| Request | Result |
|---|---|
| FastAPI `/health` | `200` |
| Proxied `/api/data-status` | `200`, `nisar_ready: true`, `live_fetch_enabled: true` |
| Proxied `/api/sites` | `200` |
| Proxied `/api/sites/demo-fixture` | `200` |
| Proxied `/api/sites/demo-fixture/timeseries?pol=HH` | `200` |
| Proxied product PNG tile | `200 image/png` |
| `/`, `/compare`, `/time-machine` | `200` |
| Retired `/applications`, `/setup` | `404` |
| `/tm/frames/2026-09-01?...` | `200 image/svg+xml` |
| `POST /tm/scan` with five features | `200`, 8 frames, synthetic caveat preserved |
| `POST /tm/scan` with non-installed calendar date | `400`, exact-date refusal |
| Proxied `POST /api/nisar/fetch` | `503`, credentials required |
| Proxied `/api/nisar/fetch/jobs` | `200` |
| Proxied `GET /api/nisar/search` | `503` in this environment |
| Preview-like Host headers on active routes | `200` |

### UI contracts

- `/compare` client chunk contains `DateChoice`, `Before date`, `After date` and
  `type: "date"`. The server-rendered HTML shows the loading state because the
  site catalogue is fetched in `useEffect`; the controls appear after hydration.
- No pointer/drag/click handlers remain on `ComparisonViewer` imagery; only the
  range slider changes the reveal.
- `/` server HTML contains none of `Regional time series`, `DanceChart` or
  `Backscatter graph`.
- `/time-machine` exposes `Angle normalization (proposed)` and
  `Interferometry (proposed)`.
- The Time Machine “Backend support check” now describes real live fetch as an
  operator path that is not called by the procedural scan button.

## What needs to be fixed for the site to fully run

### P0 — real scan and processing

1. **Wire the Time Machine scan to the backend live-fetch API.** Today `/tm/scan`
   is a procedural prototype. A real mode must call `POST /api/nisar/fetch` with
   the selected bbox/date range/polarizations, poll `/api/nisar/fetch/jobs/{id}`,
   and handle queued, running, succeeded, failed, cancelled and credential-error
   states.
2. **Add a manifest-to-frames adapter.** On success, the UI must use the built
   site manifest's `kind: "backscatter"` layers and exact dates, not SVG frames.
   Difference and change-mask layers must remain out of playback/observation
   frames.
3. **Configure Earthdata credentials and ASF network access.**
   `EARTHDATA_TOKEN` or `EARTHDATA_USERNAME`/`EARTHDATA_PASSWORD` must be present
   in the backend environment; credentials must not be committed.
4. **Choose the volcanic case.** Need site name, bbox, eruption/pre/post dates,
   preferred polarization, track/frame/direction stack, granule names or ASF
   search window, and approval for the download volume. The current default bbox
   is a synthetic rehearsal region, not a reviewed volcanic case.
5. **Verify a real end-to-end build.** Search ASF, download the real granules,
   build COGs/tiles/statistics, run `verify`, inspect the manifest and render the
   real tiles in a browser. None of that has happened yet.

### P0 — angle normalization

6. **Read the real geometry metadata.** `nisar/reader.py::Window` currently
   carries power, validity, transform, CRS, spacing, granule, polarization and
   mask. It does not carry a local incidence angle or gamma-to-sigma grid. The
   fixture has a scalar `rtcGammaToSigmaFactor`, but the reader ignores it.
7. **Decide the radiometric model.** Use GCOV `rtcGammaToSigmaFactor` /
   `localIncAngle` (or a DEM-derived local incidence angle) to normalise to a
   common reference geometry; avoid unvalidated histogram matching that could
   create plausible-looking but false agreement.
8. **Thread normalization through `site_builder.py` and `processing.py`** before
   dB conversion, smoothing, differencing and time-series statistics. Preserve
   the normalization method and factor in provenance.
9. **Test two real dates from the same stack** to prove that the angle-driven
   offset is reduced without erasing real change. Add regression tests with
   synthetic incidence-angle grids.

### P0 — interferometry

10. **Change or extend the product source.** Current NISAR GCOV is detected
    covariance/backscatter and does not preserve interferometric phase. A true
    InSAR feature needs phase-capable SLC/GUNW-style products or an external
    interferogram service.
11. **Implement the InSAR chain only after the source is chosen:** precise
    coregistration, DEM/topographic phase removal, spatial/perpendicular baseline
    checks, coherence, filtering, phase unwrapping, atmospheric/ionospheric
    screening, line-of-sight displacement scaling and scientific review.
12. **Keep the new selectable option honest.** Until that chain exists, the UI
    must say “proposed” and must not display a deformation/coherence result.

### P1 — deployment and reliability

13. **Persist `PRODUCTS_DIR` and `CACHE_DIR`** on the VM; the current preview uses
    `/tmp`, which is not durable.
14. **Use a shared job store if running multiple backend workers.** The current
    `JobManager` is single-process with local JSON files.
15. **Configure the reverse proxy and public origin.** `BACKEND_URL`, Caddy/HTTPS,
    CORS, Mapbox token URL restrictions and `NEXT_PUBLIC_API_URL` must match the
    deployment. No VM deployment was checked here.
16. **Run a browser-level visual test** for Mapbox optical imagery, SAR raster
    overlays, locked comparison cameras, calendar pickers, slider-only reveal,
    playback and mobile layout. This sandbox verified HTTP and bundle contents,
    not pixels in a real browser.
17. **Review the `429` from the Mapbox tile endpoint.** Confirm token URL
    restrictions, quotas and billing behaviour; rotate or restrict the token if
    needed. The public token is committed, but no unlimited-use guarantee can be
    made from this repository.

### P1 — wide-audience UX

18. **Reduce the remaining dense panels.** Change statistics, acquisition granule
    lists, backend support facts, feature outputs and exact-date rules are still
    technical. Consider progressive disclosure, plain-language labels and a short
    “how to read this” guide.
19. **Remove or retire dead modules/tests** for removed routes and graphs:
    `components/DanceChart.tsx`, `components/TimeScrubber.tsx`,
    `components/ControlPanel.tsx`, `components/AsfGranules.tsx`,
    `lib/applications.ts`, `lib/sourceRegister.ts`,
    `public/resources/source-register.json`, and the corresponding standalone
    tests. They no longer power active routes.
20. **Add accessibility and i18n checks** for the calendar, slider, playback and
    proposed-feature panels once the final copy is chosen.

## Questions that need product decisions

1. Which volcanic site, bbox, eruption dates and granule names/ASF search window
   should be used for the first real case?
2. Should interferometry stay a clearly labelled proposal for GCOV, or may we add
   a phase-capable SLC/GUNW data source and implement the full InSAR chain?
3. Which normalization is intended: gamma-to-sigma using GCOV's
   `rtcGammaToSigmaFactor`, local-incidence-angle correction from a DEM, or an
   empirical cross-date calibration? What reference geometry should be used?
4. Should the Time Machine default to a real live-fetch scan when credentials are
   present, with procedural demo mode as an explicit fallback, or keep demo mode
   as the default?
5. Are Earthdata credentials and a VM/deployment environment available for the
   real download/build test, and is the multi-gigabyte download approved?
