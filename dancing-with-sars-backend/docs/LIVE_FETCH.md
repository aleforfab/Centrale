# Runtime live fetching (cache-aside + background jobs)

Date: 2026-11-14

Previously the running API never fetched SAR imagery: `/api/sites` served
precomputed products from `PRODUCTS_DIR`, and the only code that downloaded
granules lived in the offline `build-site` CLI. This feature adds a runtime,
cache-aside path so a request can fetch live ASF data when the result is not
already cached, **without blocking the HTTP request**.

## Two layers

| Layer | Endpoint | Network on a cache miss | Default / guard |
|---|---|---|---|
| Catalog metadata | `GET /api/nisar/search` | Live `asf.search()` for NISAR GCOV granules | Always on; cheap metadata, TTL cached |
| Imagery / products | `POST /api/nisar/fetch` | Live ASF search + granule download + full product build, run in a background job | On by default (`ENABLE_LIVE_FETCH=false` opts out); credentials + size cap required |

Both use deterministic keys derived from the exact query parameters, so an
identical request is served from disk with **no network request**.

> Enabling live fetch by default does **not** supply credentials. With no
> `EARTHDATA_TOKEN` (or username/password), `POST /api/nisar/fetch` returns
> `503` with an explicit message instead of attempting an anonymous download.
> Precomputed products and catalog searches still work without credentials.

### 1. Catalog cache

`services/asf_service.py::search_nisar_granules_cached` wraps the existing live
search with `nisar/cache.py`:

- Fresh entry (age ≤ `LIVE_FETCH_TTL_SECONDS`) → returned immediately,
  `cached: true`.
- Miss/expired → live ASF call, result written atomically to
  `.cache/catalog/<key>.json`, `cached: false`.
- ASF failure → stale entry served with `stale: true` and a `warning` field
  (unless `LIVE_FETCH_STALE_ON_ERROR=false`, which returns 503).
- `?refresh=true` invalidates the entry before searching.

Response fields: `granules`, `count`, `maturity`, `cached`, `stale`,
`fetched_at`, `age_seconds`, `source`.

### 2. Background product build

`POST /api/nisar/fetch` never blocks on downloads:

- **Cache hit** → `200` with the cached site, `status: "succeeded"`,
  `job_id: null`. No job, no network.
- **Cache miss** → `202 Accepted` with `job_id`, `site_id`, `status_url`,
  `progress: 0`, and a `Location` header. Preconditions (flag, credentials)
  are checked before enqueueing, so a doomed job is not created.
- **Identical concurrent request** → the already-active job is returned instead
  of starting a second multi-gigabyte download.

`nisar/jobs.py` runs `live_fetch.fetch_products()` in a bounded
`ThreadPoolExecutor` (`LIVE_FETCH_MAX_WORKERS`). Job state is written
atomically to `.cache/live/jobs/<job_id>.json` at every stage and reloaded on
startup; jobs left `queued`/`running` by a restart are marked `failed` with an
"interrupted by a process restart" error. Terminal jobs older than
`LIVE_FETCH_JOB_RETENTION_SECONDS` are pruned.

Progress stages emitted by `fetch_products()`: `validating` (5%), `catalog`
(12–20%), `stack` (28%), `planning` (35%), `downloading` (45%),
`building` (70%), `verifying` (90%), `done` (100%). Cancellation is
**cooperative**: the worker checks `should_cancel()` between stages, so a
download already in flight finishes before the job stops.

The generated site is a normal NISAR site, so `/api/sites`,
`/api/sites/{id}`, `/api/sites/{id}/timeseries` and the frontend work without
changes. `refresh: true` deletes the cached site and rebuilds it.

## Job endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/nisar/fetch` | Enqueue (or return a cache hit). `?sync=true` keeps the old blocking behaviour |
| `GET` | `/api/nisar/fetch/jobs/{job_id}` | Poll `status`, `stage`, `progress`, `message`, `result`/`error` |
| `GET` | `/api/nisar/fetch/jobs?limit=50` | List recent jobs, newest first |
| `POST` | `/api/nisar/fetch/jobs/{job_id}/cancel` | Request cancellation (`409` if already finished) |

Job statuses: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
`/health` and `/api/data-status` include `live_fetch_enabled`.

## Usage

Defaults (override in `.env`; live fetch is already on unless you set it to
`false`):

```ini
ENABLE_LIVE_FETCH=true
EARTHDATA_TOKEN=...            # or EARTHDATA_USERNAME / EARTHDATA_PASSWORD
LIVE_FETCH_TTL_SECONDS=3600
LIVE_FETCH_MAX_GRANULES=6
LIVE_FETCH_MAX_BYTES=2147483648
LIVE_FETCH_MAX_WORKERS=2
LIVE_FETCH_JOB_RETENTION_SECONDS=86400
```

```bash
# Metadata: live on a miss, cached afterwards
curl "http://localhost:8000/api/nisar/search?bbox=-101,49,-99,50&start=2026-06-01&end=2026-11-01&refresh=true"

# Products: enqueue a background job
curl -i -X POST http://localhost:8000/api/nisar/fetch \
  -H 'Content-Type: application/json' \
  -d '{"bbox":[-101,49,-99,50],"start_date":"2026-06-01","end_date":"2026-11-01","polarizations":["HH"],"max_granules":2}'
# => 202, Location: /api/nisar/fetch/jobs/job-xxxxxxxxxxxx

# Poll progress
curl http://localhost:8000/api/nisar/fetch/jobs/job-xxxxxxxxxxxx

# Cancel if needed
curl -X POST http://localhost:8000/api/nisar/fetch/jobs/job-xxxxxxxxxxxx/cancel

# When status == "succeeded", use the result
curl http://localhost:8000/api/sites
curl http://localhost:8000/api/sites/<site_id>
```

The job response also carries `result` (the same payload the old synchronous
endpoint returned) and `error` on failure, so no extra request is needed after
completion.

## Guards and failure responses

- **Opt-out.** Set `ENABLE_LIVE_FETCH=false` to force precomputed-only mode;
  `POST /api/nisar/fetch` then returns 404 rather than silently starting a
  multi-gigabyte download.
- **Credentials.** Live fetch is on by default, but missing Earthdata
  credentials still return 503 with an explicit message. No anonymous
  Earthdata fallback that could fail mid-download.
- **Size cap.** ASF must report `bytes` for every granule; unknown sizes or a
  total above `LIVE_FETCH_MAX_BYTES` abort before any download.
- **No silent substitution.** Only ASF NISAR GCOV granules are used; the
  Sentinel-1/Earth Engine fallback stays behind its own flag.
- **Complete cache only.** A manifest without its COGs/JSON is treated as a
  miss, not a hit.
- **Validation.** bbox, date order, maturity, polarizations, granule count and
  stack consistency are validated; errors return 422/503 with readable details.
- **Job isolation.** Unknown/invalid job ids return 404; cancelling a finished
  job returns 409; exceptions in a worker are logged and recorded as `failed`
  rather than taking down the API.

## Known limitations

- Jobs live in one process (a thread pool + local JSON files). A multi-worker
  deployment would need a shared queue/store (Redis, Celery, etc.).
- Cancellation is cooperative; it cannot interrupt an in-progress HTTP
  download.
- The fetch still downloads **whole granules** (the existing `site_builder`
  path). Windowed remote HDF5 reads were proven in
  `scripts/live_smoke_nisar.py`, but `GcovReader.read_window()` still raises
  `NotImplementedError` for URLs.
- The bbox must lie inside every granule footprint, and all acquisitions must
  share one track/frame/direction/maturity. If not, the job fails with a clear
  error instead of producing a misleading change map.
- Same-stack grid alignment and mask semantics remain unverified against live
  data (see `docs/nisar_file_layout.md` and `TODO.md` T1.4).
- `products/`, `.cache/` and the job JSON files are gitignored; they are
  runtime state, not source. Remove those directories (or use `refresh: true`)
  to clear the cache.

## Verification

```bash
cd dancing-with-sars-backend
python -m pytest tests/test_live_fetch.py tests/test_fetch_jobs.py -q
python -m pytest -q          # full suite
```

`tests/test_live_fetch.py` covers enabled-by-default configuration and explicit
opt-out, cache hits/misses/refresh, stale fallback, unsafe keys, size caps,
incomplete caches and a full build-and-verify against synthetic GCOV fixtures.
`tests/test_fetch_jobs.py` covers job lifecycle, progress persistence, failures,
cancellation, deduplication, restart recovery and every job endpoint. Network
calls are mocked in tests; a real end-to-end run requires ASF access and an
Earthdata token.
