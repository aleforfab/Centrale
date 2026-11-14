# Team plan — Centrale / Anak Krakatau — 2026-11-14

Supervisor branch `arena/3ac4203d-centrale` @ (see git log) on top of
`origin/main` @ `037f42c` (post-PR-#7). One supervisor + three worker sessions
(Arena Agent Mode, GitHub connector on, repo `aleforfab/Centrale`).

## Real-granule inventory (verified 2026-11-14 via NASA CMR from this session)

AOI bbox (small): `105.393056,-6.131944,105.453056,-6.071944` contains the
volcano at `-6.101944, 105.423056`; the app default `105.4,-6.15,105.55,-6.03`
contains it too. NISAR images the island every 12 days. The exact stack the
NASA Worldview animation used (Aug 13 → Sep 30 2026), all ascending, frame 010,
frequency A, HH+HV (`DHDH` in granule names → HHHH/HVHV covariance terms),
L-band, wavelength ~24 cm:

| Date (UTC) | Granule (NISAR_L2_PR_GCOV_…) | Orbit | Size (MB) | CRID token |
| --- | --- | --- | --- | --- |
| 2026-08-13 22:39:52 | `…_028_010_A_175_4005_DHDH_A_20260813T223952_20260813T224026_P05023_N_F_J_001` | 5472 | 4848 | P05023 |
| 2026-08-25 22:39:52 | `…_029_010_A_175_4005_DHDH_A_20260825T223952_20260825T224026_P05023_N_F_J_001` | 5645 | 4860 | P05023 |
| 2026-09-06 22:39:52 | `…_030_010_A_175_4005_DHDH_A_20260906T223952_20260906T224026_P05023_N_F_J_001` | 5818 | 4853 | P05023 |
| 2026-09-18 22:39:52 | `…_031_010_A_175_4005_DHDH_A_20260918T223952_20260918T224026_P05023_F_F_J_001` | 5991 | 4848 | P05023 |
| 2026-09-30 22:39:52 | `…_032_010_A_175_4005_DHDH_A_20260930T223952_20260930T224026_P05023_N_F_J_001` | 6164 | 4856 | P05023 |

- Collection: `NISAR_L2_GCOV_PROVISIONAL_V1` (`C2854338529-ASF`), dataset id
  *NISAR Provisional Geocoded Polarimetric Covariance Product (Version 1)*;
  download via `https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/<granule>/<granule>.h5` (Earthdata auth).
- Total ≈ **24.3 GB** → the real build runs on the VM only; this sandbox has no
  route to ASF/Earthdata (verified 2026-11-14).
- Validated collection `NISAR_L2_GCOV_V1` over the AOI currently shows a
  2026-10-24 granule (`P05036_N_F_J_001`, ~4.98 GB) and, apparently, no Aug–Sep
  2026 epochs yet (not fully enumerated — do not claim "not available", only
  "not found in the queried window"). `NISAR_L2_GCOV_BETA_V1`: none.
- Maturity caveat to keep in UI: these are **PROVISIONAL** (PR) products.
- Descending-pass granules intersect the bbox on other dates (e.g. 2026-07-04,
  frame 119) but are a different track/frame — out of the animation stack.
- HLS S30 (LP DAAC, COG) provides the optical before/after context
  (acquire Aug 8 / Sep 20 2026 per the NASA article); out of scope for workers.
- Time Machine must offer these exact five dates as presets; no intermediate dates.

## Slices (3 workers; two is normal, three is the limit)

| # | Slice | Branch | Owns | Depends on | Target size |
| --- | --- | --- | --- | --- | --- |
| 01 | gamma-to-sigma normalization + provenance | `feat/gamma-to-sigma` | backend pipeline files (see CONTRACT §1) | nothing | ~3 h |
| 02 | Worldview-style Time Machine: live fetch + 12-day animation + before/after slider | `feat/worldview-time-machine` | frontend (see CONTRACT §1) | backend API contract only (already on main) | ~3–4 h |
| 03 | Phase-capable InSAR adapter + chain (library + router, proposed-only) | `feat/insar-phase-chain` | new backend package (see CONTRACT §1) | nothing | ~3 h |

Merge order: 01 → 03 → 02. CI green per merge. Fix-forward (revert, don't rewrite).

Out of scope for workers (supervisor/VM only):

- Real Anak Krakatau download/build/verify — needs Earthdata credentials + ASF
  network + ~24 GB; executed on the VM per the runbook the supervisor writes
  (`docs/ANAK_KRAKATAU_VM_BUILD.md`). Not in any worker's brief.
- Deployment, Caddy/HTTPS, Mapbox token restrictions/quotas, multi-worker shared
  job store, VM browser test, final integration PR.
- Retiring dead frontend modules — optional, frontend lane only; do only if the
  slice is green early; list it in the report either way.

## Reports

Workers push `agent-team/reports/<id>.md` on their branch (format: CONTRACT §4).
Supervisor reads reports via git (`git fetch origin <branch>`), never by guessing.

## Hand-in

No wall-clock deadline was supplied (hackathon date unknown/not provided;
Space Apps 2026 has passed). Proposed hand-in: **at the end of the human's
current working block** — each worker targets ≤ 4 h and announces slips early.
Feature freeze = when the supervisor opens the integration draft PR. No merges
after freeze except reverts of visibly broken things.

## Supervisor status log

- 2026-11-14: rebased this branch onto merged `origin/main` `037f42c` (PR #7 merged).
  Granule inventory above verified via NASA CMR (PROVISIONAL stack confirmed; sizes/orbits/CRIDs as listed).
  Gate 1 recorded approved; Gate 2 (VM go-live) NOT approved.
- Next: commit + push `agent-team/`, print launch cards, await human to open the
  three worker sessions; then integrate.
