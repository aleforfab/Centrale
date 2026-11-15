# Anak Krakatau — VM build runbook

> **Status: WRITTEN, NOT EXECUTED.** Verified only up to read-only NASA CMR queries
> (2026-11-14). Nothing here has downloaded a granule or built a real tile yet.
> Every command below is a plan; record what actually happened in
> `docs/IMPLEMENTATION_VERIFICATION.md` (via a PR, never a direct push to `main`).
>
> Requires: the deployment VM (see `GCP_CHECKLIST.md`, `DEPLOYMENT_VM.md`),
> Earthdata credentials in the **backend environment only**, and explicit approval
> for the ~24.3 GB download (Gate 2 / build approval). This cannot be run in a
> credential-free or network-restricted environment.

## 1. Target outcome

A real installed site `anak-krakatau` (or the live-fetch cache equivalent) serving
**five** exact NISAR GCOV acquisitions — 2026-08-13, 08-25, 09-06, 09-18, 09-30 —
backscatter PNG tiles, time-series JSON and a manifest with per-layer provenance,
gamma-to-sigma normalization (once PR #9 is merged), maturity PROVISIONAL, all
visible in the app’s `/time-machine` live flow and `/compare`. Not an
interferogram, not validated science.

## 2. Verified inputs (NASA CMR, 2026-11-14; point query at −6.101944, 105.423056)

| Date (UTC) | Granule `NISAR_L2_PR_GCOV_…` | Orbit | MB | CRID |
|---|---|---|---|---|
| 2026-08-13 | `028_010_A_175_4005_DHDH_A_20260813T223952_20260813T224026_P05023_N_F_J_001` | 5472 | 4848 | P05023 |
| 2026-08-25 | `029_010_A_…_20260825T223952_…_P05023_N_F_J_001` | 5645 | 4860 | P05023 |
| 2026-09-06 | `030_010_A_…_20260906T223952_…_P05023_N_F_J_001` | 5818 | 4853 | P05023 |
| 2026-09-18 | `031_010_A_…_20260918T223952_…_P05023_F_F_J_001` | 5991 | 4848 | P05023 |
| 2026-09-30 | `032_010_A_…_20260930T223952_…_P05023_N_F_J_001` | 6164 | 4856 | P05023 |

Ascending track 028→032, frame 010, L-band, HH+HV (`DHDH` → HHHH/HVHV covariance
terms), 12-day repeat, collection `NISAR_L2_GCOV_PROVISIONAL_V1`. Sum ≈ **24.27 GB
(SI)**. Validated `NISAR_L2_GCOV_V1` shows only a 2026-10-24 granule over the
AOI; Beta: none. Download base:
`https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/<granule>/<granule>.h5`
(Earthdata auth required). HLS S30 optical before/after (Aug 8 / Sep 20 2026) is
reference-only from the NASA Worldview article; it is not part of this build.

The frontend Time Machine sends exactly: bbox `[105.4, -6.15, 105.55, -6.03]`,
`start_date 2026-08-13`, `end_date 2026-10-01`, `maturity PROVISIONAL`,
`polarizations [HH, HV]`, `max_granules 6`, `refresh false`. **Pre-build with
these identical parameters or the UI will trigger a second 24 GB fetch.**

## 3. Preconditions on the VM

- Sized per `GCP_CHECKLIST.md`; ≥ 80 GB free durable disk at `/srv/dancing-sars`
  (products + cache + ~25 GB input granules). `/tmp` is not durable.
- Backend venv installed per `DEPLOYMENT_VM.md`; systemd unit; Caddy reverse proxy.
- Secrets: `EARTHDATA_TOKEN` (preferred) or `EARTHDATA_USERNAME` /
  `EARTHDATA_PASSWORD` **in the unit’s environment or a `.env` with mode 600,
  never committed**. Rotate any token that ever lands in logs/repo.
- Environment for the backend service:
  ```
  PRODUCTS_DIR=/srv/dancing-sars/products
  CACHE_DIR=/srv/dancing-sars/cache
  ENABLE_LIVE_FETCH=true
  LIVE_FETCH_MAX_GRANULES=6
  LIVE_FETCH_MAX_BYTES=34359738368   # 32 GiB — the default 2 GiB refuses this build by design
  ```
  Run **one** uvicorn worker: the `JobManager` is single-process with local JSON
  files; multiple workers would each see only their own jobs. (If more workers
  are needed, implement/enable a shared job store first.)
- `git pull` `main` **after PR #9 merges** so normalization + provenance are in
  the build. If #9 is not merged, skip the normalization steps and say so in the
  receipt.

## 4. Baseline (before any download)

```bash
cd dancing-with-sars-backend && ruff check . --output-format concise && pytest -q
```
Expect ~123 passed post-#9 (110 on main @ 037f42c). Stop and report on any failure.

Read-only ASF search to re-confirm the stack (adapt flags to `cli.py discover`):
```bash
python -m nisar.cli discover --bbox 105.4,-6.15,105.55,-6.03 --start 2026-08-01 --end 2026-10-01 --maturity PROVISIONAL --max 10
```
Stop if the returning stack is not ascending frame 010 with five dates; update
the inventory in this file via PR instead of forcing it.

## 5. Build — pick one path

### Path A (recommended after pre-download): explicit CLI build (deterministic)

```bash
mkdir -p /srv/dancing-sars/input/granules   # ~25 GB free here
cd /srv/dancing-sars/input/granules
# Earthdata-authenticated download, e.g. earthaccess (python) or curl --netrc:
#   ~/.netrc: machine urs.earthdata.nasa.gov login <user> password <token-or-password>
for g in \
  NISAR_L2_PR_GCOV_028_010_A_175_4005_DHDH_A_20260813T223952_20260813T224026_P05023_N_F_J_001 \
  NISAR_L2_PR_GCOV_029_010_A_175_4005_DHDH_A_20260825T223952_20260825T224026_P05023_N_F_J_001 \
  NISAR_L2_PR_GCOV_030_010_A_175_4005_DHDH_A_20260906T223952_20260906T224026_P05023_N_F_J_001 \
  NISAR_L2_PR_GCOV_031_010_A_175_4005_DHDH_A_20260918T223952_20260918T224026_P05023_F_F_J_001 \
  NISAR_L2_PR_GCOV_032_010_A_175_4005_DHDH_A_20260930T223952_20260930T224026_P05023_N_F_J_001 ; do
  curl -fL --netrc -O "https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/${g}/${g}.h5"
done
sha256sum *.h5 > manifest.sha256
```

Write `site.yaml` (mirror `scripts/make_demo_site.py:build_site_config`; acquisitions
are read from the granule directory — set per-file dates implicitly from filenames):

```yaml
id: anak-krakatau
title: Anak Krakatau — 2026 eruption (NISAR GCOV, PROVISIONAL)
event_type: other
description: Five exact ascending-frame-010 L-band acquisitions bracketing the early-September 2026 eruption. Real NISAR observations; see caveat.
caveat: >-
  Backscatter differences only; not a displacement, damage or validated scientific
  product. NISAR PROVISIONAL GCOV; granules may be reprocessed. Dates are exact
  acquisitions; none are interpolated or substituted.
bbox: [105.4, -6.15, 105.55, -6.03]
stack: {track: 30, frame: 010, direction: A, maturity: PROVISIONAL}  # informational; per-granule track/frame is read from each file
polarizations: [HH, HV]
smoothing_px: 3
thresholds_db: [2.0, 3.0, 6.0]
default_threshold_db: 3.0
pairs:
  - {id: eruption-pair, pre: '2026-08-13', post: '2026-09-30', label: 'Before the eruption to a month after'}
tiles: {min_zoom: 0, max_zoom: 10, budget_mb: 512}
```

```bash
PRODUCTS_DIR=/srv/dancing-sars/products CACHE_DIR=/srv/dancing-sars/cache \
  python -m nisar.cli build-site --config site.yaml --local-dir /srv/dancing-sars/input/granules
PRODUCTS_DIR=/srv/dancing-sars/products python -m nisar.cli verify --site anak-krakatau
```

Then **prime the live-fetch cache with the UI’s exact parameters** (Path B), or
accept that the Time Machine’s first live scan repeats the download via the API.

### Path B (dogfoods the shipped UI path): POST /api/nisar/fetch
```bash
curl -s -X POST http://127.0.0.1:8000/api/nisar/fetch \
  -H 'content-type: application/json' \
  -d '{"bbox":[105.4,-6.15,105.55,-6.03],"start_date":"2026-08-13","end_date":"2026-10-01","maturity":"PROVISIONAL","polarizations":["HH","HV"],"max_granules":6,"refresh":false}'
# → {"job_id": "..."}; poll:
curl -s http://127.0.0.1:8000/api/nisar/fetch/jobs/<job_id>          # queued|running|succeeded|failed|cancelled
```
On success the site under `PRODUCTS_DIR/live-<hash>/manifest.json` is what the
Time Machine shows. Note `_choose_stack` selects the stack with the most dates
under the requested pols — it should pick exactly ascending frame 010’s five
dates; confirm `acquisition_count == 5`. Re-running with identical parameters
returns the cached site with **no re-download**. If it selects a different stack,
use Path A and file a bug.

## 6. Post-build checks (all required)

1. `manifest.json`: five acquisitions with exact dates; per-layer `kind:
   backscatter` raster templates; difference/change-mask layers present but
   **excluded from any playback list**; maturity PROVISIONAL; CRID P05023;
   granule names; `normalization` block (`applied: true`, `factor_kind` hopefully
   `grid`) after PR #9. **Gamma→sigma convention is σ⁰ = γ⁰ × rtcGammaToSigmaFactor
   (per-pixel float32 grid in real products; NISAR Data Product Format Document
   V1.2.1, eq. 7) — confirm the manifest’s dB range looks sane (≈ −35…+5 dB).**
2. Tiles: fetch one PNG per backscatter layer via `/products/anak-krakatau/tiles/…`;
   confirm `image/png` 200 and plausible imagery (island visible, not blank).
3. Normalization sanity (post-#9): compare backscatter dB on stable ocean/land
   pixels vs a raw-γ⁰ build; angle-driven offset should be reduced without the
   island’s post-eruption change disappearing. If the real change vanishes, **stop
   and report — do not ship**.
4. `/compare` for 2026-08-13 ↔ 2026-09-30: exact dates only, slider reveal only.
5. `/time-machine` live flow: press “Fetch real observations”, expect instant
   cache hit (Path B primed) or the Path A site; playback steps the five exact
   dates; provenance disclosure shows granule/CRID/maturity; the page has no
   procedural demo fallback.
6. Browser checklist (the audit’s P1-16): Mapbox basemap renders (or fails
   gracefully with dates/provenance still visible); SAR overlays align; calendar
   refuses non-installed dates; slider-only reveal; playback works; mobile layout
   acceptable. Record screenshots **outside** the repo (issue attachment), not in git.
7. Mapbox: confirm `pk.*` token URL restrictions + quota in the Mapbox dashboard;
   investigate any `429`; never claim unlimited use.
8. Bookkeeping: append the build receipt (date, SHAs, `verify` output, tile spot
   checks, screenshot links) to `docs/IMPLEMENTATION_VERIFICATION.md` **in a PR**.

## 7. Rollback

- Any failure → do not link the site in the UI; the installed synthetic
  `demo-fixture` remains (it always says it is not real). Fix forward; revert via
  git if needed.
- If the served manifest would mislabel anything (substitute date, wrong caveat,
  missing maturity), quarantine the site directory, restore the prior state, and
  report.
- Nothing in this runbook produces or permits a deformation/coherence/InSAR
  result; InSAR stays `proposed` until async chain verification + review.

## 8. What was intentionally NOT decided here

- Deleting or regenerating installed sites; retention of `/srv/dancing-sars/input`
  (~25 GB) after verification (operator’s call; keep until the PR receipt is merged).
- VM reboot/service supervision details (see `DEPLOYMENT_VM.md`).
- Multi-worker job store upgrade (only if you scale uvicorn beyond 1 worker).
