# HACKATHON.md — Dancing with the SARs (Centrale)

> Shared memory for the hackathon-copilot run of this repository. Update it at every decision.
> Project owner: aleforfab/Centrale. Working branch (supervisor): `arena/3ac4203d-centrale`.
> Base for all worker slices: `origin/main` @ `25878e4` (round 3, 2026-11-15).

## One-line pitch

For curious people and analysts, **Dancing with the SARs** shows what NASA–ISRO
NISAR radar saw when Anak Krakatau changed shape in September 2026 — as an
honest, provenance-linked, Worldview-style time exploration — so that anyone can
see a real SAR time series of a real eruption without being a SAR expert.

## Demo path (what a judge sees)

1. Open the site → dashboard with a real (credentialed) NISAR-built site installed
   (Anak Krakatau), layers = GCOV backscatter, exact acquisition dates.
2. `/time-machine` → **live-fetch scan** against ASF via FastAPI
   (`POST /api/nisar/fetch` + job polling) with Worldview-style 12-day playback
   and before/after slider (Aug 13 → Sep 30 2026 stack), blocked/error state if
   credentials are missing, procedural demo explicitly labelled as fallback only.
3. Every frame shows exact date, polarization, product kind, track/frame, granule,
   CRID, maturity (PROVISIONAL) and provenance; gamma-to-sigma normalization is
   applied and labelled; interferometry is offered only as a clearly labelled
   **proposed** feature until the chain is verified.

## Must / optional / cut (post-PR-#7 state)

- **Must:** live-fetch wiring + job polling + manifest raster adapter;
  gamma-to-sigma normalization with provenance; Worldview-style animation +
  before/after slider on real tile layers; VM build runbook for the real
  Anak Krakatau site; draft PR; honesty invariants intact.
- **Optional:** VM deployment execution (needs explicit go + credentials + network),
  shared job store for multi-worker backend, Pixel-level browser test on the VM,
  retiring dead frontend modules (lane: frontend).
- **Cut / never:** fake interferograms from GCOV backscatter; histogram-matching
  "normalization"; difference/change-mask layers in observation/playback frames;
  substitute dates; claims of "validated/scientific" before review.

## Stack & deployment

Next.js 15 (same-origin `/api/*`, `/products/*` rewrites) → FastAPI (loopback) →
`PRODUCTS_DIR` on disk. NASA ASF DAAC / CMR for catalog, Earthdata for auth.
Deployment gate (Gate 2) = GCP VM (see `GCP_CHECKLIST.md`, `DEPLOYMENT_VM.md`);
not approved yet. Browser tests: local servers + (on VM) real browser.

## Phase status (2026-11-15)

- Phase 0/1 (brief, scope): done — five product questions answered (see handoff).
- Phase 2 (skeleton runs): done — installed-product path verified; not deployed.
- Phase 3 (core build): merged 2026-11-14 — worker 01 gamma→sigma (#9), worker 03
  InSAR proposed package (#10), worker 02 Worldview Time Machine (#8).
- Phase 4 (interaction repair): merged 2026-11-15 — #11 tile fix, #14 hygiene +
  fixture delta origin, #15 map trio + playback pre-mount/visibility fix,
  #16 shared LiveScanPanel, Time Machine own scan-window dates, unified layer
  list, dedupe. Verified fresh worktree: typecheck clean; 65 tests / 9 files;
  ruff clean; backend 157 passed; build OK.
- Phase 5 (havu.cc-inspired rebrand, "The SAR Field Catalogue"): merged
  2026-11-15 — #13/#17 round setups, #18 Time Machine Field Log + `/method`
  honesty register + 404, #19 design foundation (paper tokens, masthead), #20
  Observation Plate + Diptych. Verified: SSR smoke on all routes; `/method`
  and custom 404 in build; `/`, `/compare`, `/time-machine`, `/method` 200.
  Browser-level check still pending — needs the VM rebuild below.
- Sentinel-1 C-band pivot considered and **dropped** 2026-11-15; product stays
  NISAR L-band GCOV.
- Gate 2 (Anak Krakatau real build) and Gate 3 (submission) NOT approved.

## Human gates

| Gate | State | Note |
| --- | --- | --- |
| Gate 1 — scope | **approved** (handoff: five questions answered; PR #7 merged) | recorded 2026-11-14 |
| Gate 2 — go-live (VM / public URL) | **not approved** | VM build + deploy need explicit go-ahead; credentials never enter the repo |
| Gate 3 — submission | **not reached** | |

## Constraints (hard)

- No Earthdata token/`.env`/granules/products/tiles/`.next`/`node_modules` in git.
- No network route to ASF/Earthdata from this sandbox (verified 2026-11-14) →
  the **real Anak Krakatau download (~24 GB) runs only on the VM**; this sandbox
  verifies everything with synthetic fixtures / mocked live fetch, honestly labelled.
- NISAR Provisional GCOV is what exists over the AOI for Aug–Sep 2026
  (see `agent-team/PLAN.md` §Real-granule inventory). Validated `NISAR_L2_GCOV_V1`
  shows only a 2026-10-24 granule over the AOI so far; `NISAR_L2_GCOV_BETA_V1`: none.
- Honesty invariants (see `agent-team/CONTRACT.md`) override convenience.
