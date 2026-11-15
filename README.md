# Dancing with the SARs

NASA Space Apps Challenge prototype for exploring NISAR L-band radar
observations: backscatter, differences between dates, thresholded change layers,
statistics, time series, and a before/after comparison of two installed
observations.

**What this is:** a software tool that measures differences in radar backscatter
between acquisitions of the same stack, and presents them with their provenance.

**What this is not:** a flood detector, a damage assessment, a displacement
measurement, or a validated scientific result. Backscatter change is a measured
difference; it does not identify a cause. No real NISAR case has been processed
yet. Read [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md) for the current state; the implementation ledger and verification record live in
[`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md), and
phase history in [`HACKATHON.md`](HACKATHON.md) and [`agent-team/PLAN.md`](agent-team/PLAN.md).

## Interfaces

| Route | What it does |
| --- | --- |
| `/` | Observation Plate: installed NISAR product layers, exact dates, measured change statistics, map + provenance |
| `/compare` | Before/after diptych: one polarization, two exact installed dates, reveal slider, locked cameras, no substitutions |
| `/time-machine` | Live-fetch scan (operator-side) + Worldview-style playback of exact backscatter frames, before/after mode |
| `/method` | Method & honesty register: data, processing, what the numbers are and are not, provenance |


Supporting material:

- `docs/IMPLEMENTATION_HANDOFF.md` — what exists, how it was produced, what is missing.
- `docs/IMPLEMENTATION_VERIFICATION.md` — executed test results and unverified claims.
- `docs/` backend runbook — site preparation, build, verification, local startup.
- `learning-guide/` — beginner course (Markdown source and PDF builder).

## Architecture

```text
GCOV granules → processing → products on disk → FastAPI serves them → browser explores
```

Expensive processing normally happens ahead of time via the CLI. The dashboard
does not let a visitor trigger processing; a guarded operator API route for
cache-miss builds is described in [Runtime live fetch](#runtime-live-fetch-operator-api)
below.

```text
browser ──► Next.js (same origin /api, /products) ──► FastAPI (loopback) ──► products/
```

The browser never learns the backend address: `next.config.mjs` rewrites `/api/*`
and `/products/*` to `BACKEND_URL` server-side. Leave `NEXT_PUBLIC_API_URL`
unset.

## Backend setup

```bash
cd dancing-with-sars-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell equivalents are unchanged from earlier versions of this file:
`.venv\Scripts\Activate.ps1`, `Copy-Item .env.example .env`.

Earth Engine is only needed for the legacy Sentinel-1 routes, which stay disabled
unless `ENABLE_SENTINEL1_FALLBACK=true`. ASF catalogue searches may work without
Earth Engine credentials. Live ASF NISAR searches and full-granule downloads use
Earthdata credentials instead (`EARTHDATA_TOKEN`, or
`EARTHDATA_USERNAME`/`EARTHDATA_PASSWORD`), as documented in `.env.example`.

## Frontend setup

```bash
cd dancing-with-the-sars-frontend
npm ci
cp .env.example .env.local
npm run dev
```

Set `BACKEND_URL` for the server-side proxy (default `http://127.0.0.1:8000`) and
`NEXT_PUBLIC_MAPBOX_TOKEN` to a **URL-restricted public** token for the basemap.
Without a token the pages still work and still show dates and provenance; only
the basemap and raster tiles are missing.

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
observation, not a real change, and not evidence of anything.*

## Working with other people

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before your first branch. It covers the
lane split, the shared files that need a heads-up, the lockfile recipe, and the
code-freeze rule. CI now runs on every branch and every pull request.

## Tests and checks

```bash
cd dancing-with-sars-backend && .venv/bin/ruff check . && .venv/bin/pytest -q
cd dancing-with-the-sars-frontend && npm run typecheck && npm test && npm run build
```

Current results are recorded in
[`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
`npm audit` is not clean; advisories are reported rather than silenced.


## Source register

`dancing-with-the-sars-frontend/public/resources/source-register.json` is a
static metadata file generated by a backend script. It records the supplied
white-paper filenames, plus explicit `null` values where a fingerprint, page
count or publication year has not been verified. The file is not imported by the
running frontend application; it is backend tooling data that the build script
(`dancing-with-sars-backend/scripts/build_source_register.py`) can regenerate.
It is not an exhaustive bibliography of those papers' citations, and no dataset
is treated as integrated merely because a paper mentions it.

To fill real values from PDFs you already have:

```bash
cd dancing-with-sars-backend
python -m scripts.build_source_register --pdf-dir ~/papers          # dry run
python -m scripts.build_source_register --pdf-dir ~/papers --write
```

## Deploying on the Google Cloud VM

Two documents, two owners:

- [`GCP_CHECKLIST.md`](GCP_CHECKLIST.md) — console work: billing guardrails,
  firewall target tags, IAM, snapshots, static IP, cost review. This is the
  project's Google Cloud owner's runbook.
- [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md) — SSH work on the VM: clone, Python
  environment, tests, synthetic rehearsal, frontend build, services, Caddy.

Nothing in either document has been executed on the VM yet; every step is marked
as unstarted.

## Runtime live fetch (operator API)

The precomputed dashboard path above is unchanged. `POST /api/nisar/fetch` adds
a cache-aside path for operators: catalog searches are TTL-cached, a miss is
queued as a background job, and progress is polled at
`/api/nisar/fetch/jobs/{job_id}`. Live fetch is **enabled by default**
(`ENABLE_LIVE_FETCH=false` opts out), but every live build still requires
Earthdata credentials and respects `LIVE_FETCH_MAX_BYTES`. The dashboard does
not expose a visitor-facing button for this route. See
[`dancing-with-sars-backend/docs/LIVE_FETCH.md`](dancing-with-sars-backend/docs/LIVE_FETCH.md).

For an evaluation of Canada's EODMS / SAR Toolbox / RCM CEOS-ARD instead of, or
alongside, ASF NISAR data, see
[`dancing-with-sars-backend/docs/EODMS_SAR_DATA_SOURCE.md`](dancing-with-sars-backend/docs/EODMS_SAR_DATA_SOURCE.md).
