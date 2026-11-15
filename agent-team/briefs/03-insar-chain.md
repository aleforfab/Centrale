# Brief 03 — phase-capable InSAR adapter + chain (backend, proposed-only)

Branch: `feat/insar-phase-chain` from `origin/main` @ `037f42c`. Read
`agent-team/CONTRACT.md` first; it binds. Repo: `aleforfab/Centrale`.

## Why

The product question on interferometry was answered "yes, with constraints":
GCOV is detected, radiometrically terrain-corrected backscatter — it carries
**no interferometric phase**. A real InSAR feature needs phase-capable products
(SLC/GUNW-style) or an external interferogram service. Until a chain producing
coherence/interferogram/LOS-displacement outputs passes verification and
scientific review, the UI must keep saying **proposed** and must not display
any deformation number.

This slice adds the phase-capable source path and the chain as a **library +
an opt-in router**, with full unit tests on **synthetic complex fixtures**.
Nothing is enabled for users by default; nothing appears in the Time Machine;
no result is displayed.

## Scope

1. New package `dancing-with-sars-backend/nisar/insar/`:
   - `source.py` — adapter interface for phase-capable products:
     (a) GUNW-style geocoded unwrapped interferogram ingest (S3/HTTPS via ASF
     with Earthdata auth — code path only, no network in tests),
     (b) SLC pair input for a local chain,
     (c) external interferogram service hook (HyP3-style) behind a clearly
     marked interface; **no hard dependency on any external service**.
   - Product detection by filename/attributes (`_GUNW_`, `_GSLC_`, CRID etc.),
     mirroring `nisar/naming.py` conventions where they fit.
   - `geometry.py` — perpendicular/parallel baseline from orbit/timing params;
     critical-baseline check; incidence-angle scaling for LOS displacement:
     `dLOS = Δφ · λ / (4π) · cos(θ_local)`-style projection (document the exact
     projection used and its sign convention).
   - `coregister.py` — SLC-pair coregistration via FFT cross-correlation on
     overlapping windows (coherence-aligned shift estimation; sub-pixel via
     parabolic interpolation), with unit tests recovering a known 2–3 px shift.
   - `topo.py` — topographic phase removal: Δφ_topo = −(4π/λ) · B⊥ / (r·sinθ) · h,
     fed by a DEM the caller provides (array + georeferencing); tests with a
     synthetic plane DEM and known B⊥.
   - `coherence.py` — complex coherence (boxcar or adaptive P/B window);
     tests: identical phases → |γ| ≈ 1; decorrelated → |γ| < 1; known formula pinned.
   - `filtering.py` — Goldstein adaptive filter (or documented 2D FFT-based
     equivalent); tests: phase noise variance reduced, ramp preserved.
   - `unwrap.py` — phase unwrapping. Prefer a correct, documented algorithm you
     can test (e.g. 2D region-growing with residue detection — Itoh 1982 /
     branch-cut is acceptable; document choice). Tests must recover a synthetic
     ramp and a closed-orbit-free Gaussian bump, and must **flag** residues it
     cannot resolve instead of unwrapping silently.
   - `atmosphere.py` — screening only (NOT correction): flag spatial phase
     ramps / quadratic fits consistent with troposphere (dry stratified +
     wet random) and long-wavelength ionospheric trends; return flags +
     diagnostics, document that removal is out of scope until validated.
   - `chain.py` — orchestrates: coregister → topo removal → coherence → filter →
     screen → (unwrap if phase-capable SLC mode; pass-through for GUNW) →
     LOS scaling → diagnostics dict. Every step records parameters + caveats.
     The diagnostics dict is the ONLY output format; it never includes a
     user-facing "deformation map" claim.
   - `fixtures.py` or tests-local synthetic SLC-pair/GUNW HDF5 generator
     (small, e.g. 64×64) — committed under `tests/fixtures/`.
2. New `routers/insar.py`: `GET /api/insar/status` → `{
     "enabled": false, "status": "proposed",
     "reason": "…why not available: phase-capable products + review required…",
     "chain": ["coregistration","topo-removal","coherence","filtering","unwrap","atmos-screening","los-scaling"],
     "requirements": ["SLC/GUNW or HyP3","DEM","scientific review"]
   }`. Always 200; returns static status only. No compute endpoint. Register the router in
   `main.py` with **one announced append** (see CONTRACT §1).
3. `docs/INSAR.md` — source options (GUNW vs SLC chain vs HyP3), algorithm notes,
   verification protocol (two real same-stack pairs, coherence maps, residual
   topo phase, closure phase, comparison to GUNW if available), review checklist,
   and explicit "proposed until verified" statement.
4. Tests `tests/test_insar_*.py` — all synthetic; assert numeric invariants
   (shift recovery, |γ| bounds, Goldstein variance reduction, unwrap ramp ±2π,
   topo removal residual near zero on a plane, LOS scaling factor).

## Hard rules

- Everything stays labelled proposed: `/api/insar/status` says proposed, docs say
  proposed, no frontend is touched, no UI numbers appear.
- No edits to `reader.py`, `processing.py`, `site_builder.py`, `live_fetch.py`,
  `jobs.py`, `catalog.py`. New files only (plus the one announced `main.py` append).
- No new third-party dependencies (numpy/scipy/h5py/affine are already backend deps —
  confirm in `requirements.txt`; if you need scikit-image/phase-unwrap libs,
  DO NOT add them — implement or stop and flag in the report).
- No network access in tests; mock any ASF/HyP3 interaction.
- No claim of verification; report must list "not verified on real data — needs
  GUNW/SLC pairs on the VM + reviewer sign-off".

## Done when

`ruff check . --output-format concise` clean; `pytest -q` green (paste output,
including the new insar tests); `/api/insar/status` returns its static
payload (show it); report at `agent-team/reports/03-insar-chain.md` pushed with
the branch.
