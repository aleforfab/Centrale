# Dancing with the SARs

NASA Space Apps Challenge prototype for exploring NASA–ISRO **NISAR** L-band radar
observations: dated backscatter layers, differences between two acquisitions,
thresholded change masks, measured statistics, time series, and a before/after
comparison of two installed observations — each with its provenance attached.

**What this is:** a software tool that measures differences in radar backscatter
between acquisitions of the same stack, and presents them together with the
granule, CRID, maturity and processing that produced them.

**What this is not:** a flood detector, a damage assessment, a displacement
measurement, or a validated scientific result. Backscatter change is a measured
difference; it does not identify a cause. No real NISAR case is committed yet —
everything in this repository has been exercised on clearly labelled synthetic
fixtures. InSAR is offered as a **proposed** chain only; GCOV carries no phase.

Executed results and what remains unverified:
[`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md). Open
gates — a real-site build and a public deployment — are recorded there and in
[`docs/ANAK_KRAKATAU_VM_BUILD.md`](docs/ANAK_KRAKATAU_VM_BUILD.md).

## Interfaces

| Route | What it does |
| --- | --- |
| `/` | **Observation Plate** — installed NISAR product layers, exact acquisition dates, measured change statistics, map and provenance |
| `/time-machine` | Worldview-style playback of exact backscatter frames, before/after mode, live-fetch scan panel (operator-side) |
| `/time-machine#compare` | Before/after diptych: one polarization, two exact installed dates, reveal slider, locked cameras, no substitutions |
| `/method` | Method and provenance: what GCOV carries, how layers are processed, source references |
| anything else | The paper 404 plate |

`/compare` is kept as a redirect to `/time-machine#compare` so old links still work.

## Architecture

```text
GCOV granules → processing → products on disk → FastAPI serves them → browser explores
```

```text
browser ──► Next.js (same origin /api, /products) ──► FastAPI (loopback) ──► products/
```

The browser never learns the backend address: `next.config.mjs` rewrites `/api/*`
and `/products/*` to `BACKEND_URL` on the server, so FastAPI can bind to loopback
and sit behind a reverse proxy. **Leave `NEXT_PUBLIC_API_URL` unset** — setting it
re-breaks tile URLs.

Expensive processing normally happens ahead of time through the CLI. A visitor
cannot trigger processing from the dashboard; a guarded operator route for
cache-miss builds is described in [Runtime live fetch](#runtime-live-fetch-operator-api).

### Product tree

Each built site is a self-contained directory under `PRODUCTS_DIR`:

```text
products/<site_id>/
  manifest.json        # site, source (CRID, maturity, spacing, CRS, normalization),
                       # stack, acquisitions, layers, pairs + stats, known gaps
  acquisitions.json  timeseries.json  stats.json
  cogs/<layer>.tif                       # Cloud-Optimized GeoTIFF, one per layer
  tiles/<layer>/{z}/{x}/{y}.png          # XYZ PNG tiles, transparent nodata
```

The manifest is the single source of truth for installed dates and layers; the
frontend renders nothing it cannot find there.

### Processing chain

```text
granule name → stack selection → windowed HDF5 read → γ⁰→σ⁰ normalize (linear power)
  → NaN-aware smoothing → grid alignment (resample if needed) → dB
  → difference → threshold masks (−2/−3/−6 dB, increase/decrease) → area statistics
  → COG + XYZ tiles + JSON manifest
```

Normalization is `σ⁰ = γ⁰ × rtcGammaToSigmaFactor`, applied **before** smoothing,
resampling and dB conversion, and recorded in the manifest as provenance. See
[`dancing-with-sars-backend/docs/NORMALIZATION.md`](dancing-with-sars-backend/docs/NORMALIZATION.md).

## Repository layout

```text
dancing-with-sars-backend/       FastAPI service, NISAR pipeline, CLI, tests
dancing-with-the-sars-frontend/  Next.js 14 app (App Router), Mapbox GL, tests
docs/                            verification record, VM build runbook
learning-guide/                  beginner course (Markdown source + PDF builder)
```

## Backend setup

Requires Python 3.11+.

```bash
cd dancing-with-sars-backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env               # Windows: Copy-Item .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Then check `GET /health` and `GET /api/data-status`.

**Credentials.** Live ASF catalog searches and granule downloads need Earthdata
credentials (`EARTHDATA_TOKEN`, or `EARTHDATA_USERNAME`/`EARTHDATA_PASSWORD`, or a
`.netrc`). Earth Engine is only needed for the legacy Sentinel-1 routes, which
stay disabled unless `ENABLE_SENTINEL1_FALLBACK=true`. Credentials belong in the
environment, never in git.

**Paths.** Keep `PRODUCTS_DIR` and `CACHE_DIR` outside the source tree on a
deployment host; both are git-ignored.

## Frontend setup

Requires Node.js 18+.

```bash
cd dancing-with-the-sars-frontend
npm ci
cp .env.example .env.local
npm run dev
```

`BACKEND_URL` (default `http://127.0.0.1:8000`) is the server-side proxy target.
`NEXT_PUBLIC_MAPBOX_TOKEN` is optional: a public `pk.*` demo token is committed in
`lib/mapboxToken.ts`, and the app falls back to it, so a fresh checkout renders the
basemap. Supply your own URL-restricted public token to use a different account; a
secret `sk.*` token must never go in this variable or in git.

## Command line

All commands run from `dancing-with-sars-backend`:

```bash
# find coherent track/frame/direction stacks for a bbox and date window
python -m nisar.cli discover --bbox "105.39,-6.14,105.46,-6.07" \
  --start 2026-08-01 --end 2026-10-01 [--json stacks.json]

# build the product tree from a site YAML
python -m nisar.cli build-site --config sites/<id>.yaml \
  [--local-dir <granules>] [--max-acquisitions N] [--dry-run]

# re-read the built tree and check the manifest against the files on disk
python -m nisar.cli verify --site <id>

# check GCOV layout and remote-read assumptions against ASF
python -m nisar.cli live-smoke [--bbox "..."] [--start 2026-06-17] [--end ...]
```

`discover` groups candidates into coherent stacks; `build-site` writes the product
tree; `verify` is the gate that a build actually produced what its manifest
claims.

Helper scripts in `scripts/`:

| Script | Purpose |
| --- | --- |
| `make_demo_site.py` | Generate a labelled synthetic site + YAML (rehearsal only) |
| `make_real_site.py` | Build a site YAML from a real ASF search |
| `live_smoke_nisar.py` | Verify GCOV layout and remote-read assumptions against ASF |
| `recolour_anak_krakatau.py` | Re-render difference tiles on an installed site |
| `build_source_register.py` | Fill the source register from local PDFs |

## Rehearse the whole pipeline on synthetic data

This proves the software runs. It produces no scientific evidence.

```bash
cd dancing-with-sars-backend
python -m scripts.make_demo_site --output /srv/dancing-sars/demo-input
PRODUCTS_DIR=/srv/dancing-sars/products CACHE_DIR=/srv/dancing-sars/cache \
  python -m nisar.cli build-site \
  --config /srv/dancing-sars/demo-input/site.yaml \
  --local-dir /srv/dancing-sars/demo-input/granules
PRODUCTS_DIR=/srv/dancing-sars/products python -m nisar.cli verify --site demo-fixture
```

The generated site's caveat states: *Synthetic fixture data: not a real
observation, not a real change, and not evidence of anything.* Synthetic sites are
hidden from every site selector in the UI. Full procedure:
[`dancing-with-sars-backend/docs/DEMO_RUNBOOK.md`](dancing-with-sars-backend/docs/DEMO_RUNBOOK.md).

## Runtime live fetch (operator API)

The precomputed dashboard path is unchanged. For an operator with credentials:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/nisar/search` | ASF catalog search, TTL-cached |
| `POST /api/nisar/fetch` | Queue a cache-miss build; returns a job id (`?sync=true` for legacy blocking) |
| `GET /api/nisar/fetch/jobs`, `/{job_id}` | List jobs / poll progress |
| `POST /api/nisar/fetch/jobs/{job_id}/cancel` | Cooperative cancellation |

Live fetch is **enabled by default** (`ENABLE_LIVE_FETCH=false` opts out) but every
build still needs Earthdata credentials and respects `LIVE_FETCH_MAX_BYTES`
(default 2 GiB) and `LIVE_FETCH_MAX_GRANULES`. Jobs are deduplicated per site and
persisted to disk, so a restart marks in-flight work as interrupted rather than
losing it. The dashboard exposes no visitor-facing processing button — a live
build downloads whole granules. See
[`dancing-with-sars-backend/docs/LIVE_FETCH.md`](dancing-with-sars-backend/docs/LIVE_FETCH.md).

## API surface

| Route | Purpose |
| --- | --- |
| `GET /health`, `GET /api/data-status` | Service state, whether NISAR products are installed |
| `GET /api/sites` | Installed site summaries (synthetic ones flagged) |
| `GET /api/sites/{id}` | Full manifest |
| `GET /api/sites/{id}/timeseries?pol=HH` | Mean backscatter per acquisition |
| `GET /api/insar/status` | Static `proposed` payload; there is deliberately no compute endpoint |
| `POST /api/gee/*` | Legacy Sentinel-1 fallback — 404 unless explicitly enabled |
| `/products/*` | Static COGs and tiles |

## Tests and checks

Same commands CI runs on every branch and every pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
cd dancing-with-sars-backend && ruff check . && pytest -q
cd dancing-with-the-sars-frontend && npm run typecheck && npm test && npm run build
```

Last verified on this tree: **169 backend tests passed**, **74 frontend tests
passed (22 files)**, ruff clean, typecheck clean. The dated record — including what
is explicitly *not* verified — is
[`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
`npm audit` is not clean; advisories are reported rather than silenced.

## Ground rules for changes

- **Never commit** credentials, `.env` files, granules, products, tiles,
  `node_modules/` or `.next/`. Both project directories ship a `.gitignore`; keep
  `PRODUCTS_DIR` and `CACHE_DIR` outside the tree.
- **Never hand-edit `package-lock.json`** — change `package.json`, then regenerate.
- **No multi-gigabyte downloads without explicit approval**, and only on a machine
  with network access to ASF. This repository is verified with synthetic fixtures.
- **Keep the honest labels.** Change in dB is a measurement, not a cause; InSAR
  stays `proposed`; synthetic fixtures stay flagged as synthetic and stay out of
  site selectors.
- **Do not silently substitute data.** The comparison path refuses a neighbouring
  date, another polarization or a derived layer rather than filling a gap; keep it
  that way.

## Deploying

Nothing here has been deployed. The service is designed to run as two loopback
processes behind a reverse proxy: FastAPI on `127.0.0.1:8000`, Next.js serving the
same origin and rewriting `/api/*` and `/products/*` to it.

The real-site build — five Anak Krakatau GCOV granules, ~24 GB, PROVISIONAL,
ascending track 10 frame 175, CRID `P05023` — is documented but unexecuted:
[`docs/ANAK_KRAKATAU_VM_BUILD.md`](docs/ANAK_KRAKATAU_VM_BUILD.md). **Merging is
not deploying**, and building is not validating.

## Source register

`dancing-with-the-sars-frontend/public/resources/source-register.json` is static
metadata generated by a backend script. It records the supplied white-paper
filenames plus explicit `null` values wherever a fingerprint, page count or
publication year has not been verified. It is not imported by the running app, and
no dataset is treated as integrated merely because a paper mentions it.

```bash
cd dancing-with-sars-backend
python -m scripts.build_source_register --pdf-dir ~/papers          # dry run
python -m scripts.build_source_register --pdf-dir ~/papers --write
```

## Further reading

| Document | Contents |
| --- | --- |
| [`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md) | Executed commands, results, and the explicit not-verified list |
| [`dancing-with-sars-backend/docs/INSAR.md`](dancing-with-sars-backend/docs/INSAR.md) | Proposed InSAR chain and why it is not wired up |
| [`dancing-with-sars-backend/docs/nisar_file_layout.md`](dancing-with-sars-backend/docs/nisar_file_layout.md) | Observed GCOV file layout, measured against a live granule |
| [`dancing-with-sars-backend/docs/EODMS_SAR_DATA_SOURCE.md`](dancing-with-sars-backend/docs/EODMS_SAR_DATA_SOURCE.md) | Evaluation of an alternative SAR data source |
| [`learning-guide/course.md`](learning-guide/course.md) | Beginner course on SAR and this product |
