# Brief 01 — gamma-to-sigma normalization for GCOV (backend)

Branch: `feat/gamma-to-sigma` from `origin/main` @ `037f42c`. Read
`agent-team/CONTRACT.md` first; it binds. Repo: `aleforfab/Centrale`.

## Why

The audit (`docs/FULL_FEATURE_AUDIT.md` §P0—angle normalization) found that
`nisar/reader.py::Window` carries power/validity/geometry/granule/pol but **not**
the radiometric normalization factor. Differences and statistics are therefore
computed on gamma-nought, and gamma is terrain-geometry dependent. The pipeline
must convert gamma0 → sigma0 with the product's own factor before dB conversion,
smoothing, differencing and time-series statistics — and must say so in
provenance.

## Facts on the ground (verified)

- Real GCOV layout (see `dancing-with-sars-backend/docs/nisar_file_layout.md`,
  run 2026-10-25): datasets live under `/science/LSAR/GCOV/grids/frequencyA`,
  including `HHHH`, `mask`, `numberOfLooks`, `xCoordinates`, `/projection`,
  **`rtcGammaToSigmaFactor`**. Whether the real factor is scalar or a 2D grid is
  NOT yet established — handle both. Same-stack grid alignment is NOT verified
  (audit A4) — do not assert it.
- `tests/fixtures/make_fake_gcov.py` currently creates a **scalar**
  `rtcGammaToSigmaFactor` (`np.ones(())`); extend the fixture to also produce a
  **2D factor grid** variant and non-1 values.
- The reader ignores the dataset today.
- GCOV = detected, radiometrically terrain-corrected (RTC) backscatter/covariance.
  There is no phase and no interferometry here.

## Tasks

1. Extend `nisar/reader.py`:
   - `Window` gains `rtc_gamma_to_sigma: np.ndarray | float | None` (carry scalar
     or grid; float32; same shape as power for grids; `None` only when absent).
   - Reader reads `rtcGammaToSigmaFactor` next to the covariance datasets (same
     frequency group). Missing dataset → `None` + a warning-level log, not an exception.
   - Extend the cache `.npz` round-trip so the factor survives windows caching.
   - No other Window semantics change.
2. New `nisar/normalize.py` (pure functions + dataclass):
   - `apply_gamma_to_sigma(window) -> NormalizedWindow`-ish API, or functions used by
     `processing.py`/`site_builder.py` with minimal coupling.
   - Convention (to be implemented and pinned by tests): **σ⁰ = γ⁰ × rtcGammaToSigmaFactor**
     (element-wise for grids; scalar broadcast). Document the convention, its source
     and limits in `docs/NORMALIZATION.md`. If the in-repo docs/spec excerpts do not
     settle the convention, implement this one, pin it with tests, and flag it
     prominently in the report as "convention assumed, needs review against the GCOV
     spec" — never choose silently.
   - Guard: non-finite/zero/negative factor pixels are masked out (added to
     `valid`), not silently nulled in dB.
3. Thread through the pipeline **before** dB conversion:
   - `site_builder.py`: normalize each window at load/build time; record method
     (`gamma_to_sigma_gcov_factor`), factor kind (`scalar|grid`), and presence of the
     factor in per-layer provenance and in `site.yaml`/manifest output.
   - `processing.py`: differences, masks, robust statistics and any smoothing operate
     on normalized dB; time-series statistics likewise. If any path converts to dB
     before normalization, that path is a bug.
4. Provenance:
   - Manifest per-layer provenance gains e.g. `normalization: {method,
     factor_kind, source: "gcov.rtcGammaToSigmaFactor", applied: true|false}`.
     Keep it additive; do not rename existing keys.
5. Tests (`tests/test_normalization.py` + fixture extension):
   - Scalar factor (e.g. 0.8): power scales exactly; dB shifts by 10·log10(0.8).
   - 2D grid factor: element-wise application; NaN/0/negative factor pixels masked.
   - Missing factor: layer marked `applied: false`, no crash, warning recorded.
   - Difference/stat path uses normalized values (pin numeric expectations).
   - Regression: two synthetic same-stack dates with a spatially varying factor
     show reduced angle-driven offset vs raw gamma path.
6. Docs: `docs/NORMALIZATION.md` — method, convention, limits (RTC gamma→sigma is
   an approximation; PROVISIONAL products; same stack only), provenance fields,
   and the **VM verification checklist**: run `python -m nisar.cli build-site` for
   the five real Anak Krakatau dates and compare raw-gamma vs normalized outputs;
   report dB bias change on non-eruption pixels; confirm no real change erased.
   Those two-real-dates checks are for the VM; this slice verifies only synthetic.

## Hard rules

- Do not touch the frontend, `live_fetch.py`, `jobs.py`, `routers/`, `main.py`,
  `config.py`, `cli.py`, `catalog.py`.
- Do not implement histogram matching or any empirical cross-date calibration.
- Do not claim the real Anak Krakatau data is normalized — this slice cannot run
  it (no network, no credentials); say "verified on synthetic fixtures only".
- Do not change `verify` semantics or weaken any caveat.
- No new dependencies.

## Done when

`ruff check . --output-format concise` clean; `pytest -q` green (paste output);
manifest contains the normalization block on a fixture build (show the JSON
snippet in the report); report at `agent-team/reports/01-normalizer.md` pushed
with the branch. Definition of done is **synthetic green + provenance visible**;
real-data validation is explicitly out of this slice.
