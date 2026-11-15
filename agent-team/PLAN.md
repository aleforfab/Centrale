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
- 2026-11-14 (evening): user merged the worker PRs into `main` —
  #9 → `3262d14` (normalizer), #10 → `fcf417a` (InSAR proposed package),
  #8 → `ee64f86` (Worldview Time Machine). Supervisor verified CI green on all
  three post-merge runs implicitly via the PRs. PR #11 (Mapbox tile-placeholder
  fix) was rebased onto merged `main` (conflict in `Map.tsx` vs PR #8's hunk —
  resolved to the `resolveTileUrl()` verbatim-placeholder approach), re-verified
  (75 tests, typecheck, build) and is CLEAN with backend+frontend CI green;
  merge still pending user go. Supervisor branch rebased onto `ee64f86`.
  Real Anak Krakatau build STILL NOT RUN; VM verification pending; Gate 2 not
  approved. Deployed VM is behind `main` (was `d89fc8d`) — rebuild after #11 merge.
- 2026-11-14 (later, supervisor): workers 01 and 02 handed in as DRAFT PRs —
  PR #9 `arena/29b33504-centrale` (+1323/-48, 9 files, backend-only + ANNOUNCE
  models.py; CI green; convention σ⁰=γ⁰×rtcGammaToSigmaFactor **confirmed against
  NISAR Data Product Format Document V1.2.1 (eq. 7; per-pixel float32 grid)**) and
  PR #8 `arena/7f70de26-centrale` (+733/-377, 9 files, frontend-only + ANNOUNCE
  types.ts; CI green; 70 tests; playback backscatter-only, exact dates, demo CTA
  labelled). Worker 03 (InSAR): **no branch/PR yet**. Supervisor drafted
  `docs/ANAK_KRAKATAU_VM_BUILD.md` (NOT executed) and resolved the normalize
  convention via public NISAR product documentation. Note: remote carries
  pre-migration branches (e.g. `arena/535a4271-centrale` live-fetch,
  `arena/d252cdc7-centrale` VM runbook) with no merge base to current `main` —
  they are the pre-migration lineage whose content is already imported into
  `main` (LIVE_FETCH.md, GCP_CHECKLIST.md, live_fetch.py); do not rebase them.
  Clone refspec is narrow (`main` + `arena/3ac4203d-centrale*`); supervisor
  fetched worker branches explicitly by ref. No merges performed; awaiting user
  go-ahead; merge order 01 → 03 → 02.
- 2026-11-14 (later still): worker 03 handed in as DRAFT PR #10
  `arena/95d96e92-centrale` (+2559/-0, 24 files, append-only new package
  `nisar/insar/` + `routers/insar.py` + tests + `docs/INSAR.md`; one ANNOUNCEd
  `main.py` append of 2 lines; CI green on final head; synthetic fixtures only;
  everything labelled proposed; no compute endpoint; no UI exposure). Supervisor
  inspected the diff: no forbidden files touched. Branch naming accepted as
  `arena/*` for all workers (sessions pinned; contract's `feat/*` names were
  unattainable there — no action needed). **All three slices are now handed in;
  no merges performed.** Merge order 01 → 03 → 02 into `main` awaits user go.
  Real Anak Krakatau build remains unrun (VM runbook ready:
  `docs/ANAK_KRAKATAU_VM_BUILD.md`).

## Round 2 setup (2026-11-14, arena/da6e366a-centrale)

- Maintainer decisions: keep NISAR L-band (Sentinel-1 C-band pivot dropped);
  map readability trio + footprint + scale in scope; Time Machine must accept
  operator-selected scan dates; Dashboard/Before/After gain the selection area +
  scan-window calendar + scan button from Time Machine; dashboard layer
  dropdown-vs-checkboxes redundancy and overlapping features to be unified;
  playback image flash to be fixed (root cause identified: fresh `layers` array
  per tick → `syncProductLayers` remove/add → raster tiles dropped).
- Round-2 setup committed on `arena/da6e366a-centrale`: `skills/dancing-with-the-sars/SKILL.md`
  (Agent Skills format), CONTRACT round-2 lanes (base `94e12f0`), briefs
  `04-map-playback-readability.md`, `05-pages-scan-controls.md`,
  `06-hygiene-fixture-delta.md`. Merge order 06 → 04 → 05.
- NOT assigned (maintainer/VM/supervisor only): A2 VM rebuild (ff-pull + remove
  NEXT_PUBLIC_API_URL + verify deployed URL), A3 live-fetch operator guard
  design, Gate 2 Anak Krakatau build (go-ahead not given), havu.cc redesign
  (Track C — needs C0 decisions), integration verification pass.

## Round 3 setup (2026-11-15, arena/09542992-centrale @ 7333923)

- Round 2 merged: #14 hygiene+fixture-origin, #15 map (satellite-streets,
  opacity 0.8, fitBounds 80/12, footprint `#ff8a3d`, ScaleControl, playback
  pre-mount + visibility), #16 pages (LiveScanPanel shared; Time Machine own
  scan dates; unified layer list; hero removed; post-scan handoff). Verified
  merged main: `npm ci`, typecheck clean, **75 tests / 10 files pass**,
  `next build` OK (routes `/`, `/compare`, `/time-machine`).
- Worker 05 known-gap note was stale; presets are manifest-derived on main.
- Worker 06 deferral: `sourceRegister.ts` + `source-register.json` retained
  (backend tooling default + test). Frontend trio retirement assigned to slice 09.
- Round 3 = **havu.cc-inspired rebrand**, briefs 07/08/09 + `docs/REDESIGN_GUIDE.md`.
  Decisions locked (override before workers start or at PR review):
  full visual rebrand; paper-light default; accent `#C2410C` (text) / `#FF8A3D`
  (graphic); Archivo + IBM Plex Mono via runtime @import (no build-time fetch);
  `/method` honesty register included; 404 restyled; no new deps; NISAR L-band
  product copy unchanged; merge order 07 → 09 → 08.
- Not in round 3: VM rebuild (A2), live-fetch operator guard (A3), Gate 2,
  `/tm/scan` procedural path internals, backend.
