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
yet. Read [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md) for the current state.

## Interfaces

| Route | What it does |
| --- | --- |
| `/` | Dashboard: site and layer selection, map overlays, statistics, time series, acquisition provenance |
| `/compare` | Before/after viewer: one curated pair, one polarization, two exact dates, reveal slider, locked cameras |
| `/applications` | Twelve NISAR application topics with capability labels, limits, and the methods a real study would need |
| `/setup` | The eight gates a topic must pass before it becomes a published case |

Supporting material:

- `docs/IMPLEMENTATION_HANDOFF.md` — what exists, how it was produced, what is missing.
- `docs/IMPLEMENTATION_VERIFICATION.md` — executed test results and unverified claims.
- `docs/` backend runbook — site preparation, build, verification, local startup.
- `learning-guide/` — beginner course (Markdown source and PDF builder).

## Architecture

```text
GCOV granules → processing → products on disk → FastAPI serves them → browser explores
```

Expensive processing happens ahead of time via the CLI. There is no public
endpoint that lets a visitor trigger processing or downloads.

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
Earth Engine credentials.

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

## Tests and checks

```bash
cd dancing-with-sars-backend && .venv/bin/ruff check . && .venv/bin/pytest -q
cd dancing-with-the-sars-frontend && npm run typecheck && npm test && npm run build
```

Current results are recorded in
[`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
`npm audit` is not clean; advisories are reported rather than silenced.

## The applications library and capability labels

The library summarises twelve NISAR application topics. Every topic carries a
capability label, and the label is **derived**, not typed by hand:

- **Learning resource** — educational topic, not a working detector.
- **Exploratory case** — real observations for this topic are installed.
- **Validated for this case** — a documented review exists for one specific case.

`CASE_REVIEWS` in `lib/applications.ts` is empty, so all twelve topics render as
learning resources. Adding a review record is the only way to promote one, and it
promotes only that case.

## Source register

`dancing-with-the-sars-frontend/public/resources/source-register.json` records the
supplied white-paper filenames, plus explicit `null` values where a fingerprint,
page count or publication year has not been verified. It is not an exhaustive
bibliography of those papers' citations, and no dataset is treated as integrated
merely because a paper mentions it.

To fill real values from PDFs you already have:

```bash
cd dancing-with-sars-backend
python -m scripts.build_source_register --pdf-dir ~/papers          # dry run
python -m scripts.build_source_register --pdf-dir ~/papers --write
```

## Deploying on the Google Cloud VM

See [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md). Nothing there has been executed on
the VM yet, and the document marks each step as unstarted.
