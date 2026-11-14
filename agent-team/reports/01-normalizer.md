# Report — 01-normalizer — 2026-11-14

## Branch / PR link / base SHA / HEAD SHA

- **Branch:** `arena/29b33504-centrale` (session branch fixed by Arena environment; requested slice name `feat/gamma-to-sigma` could not be created/switched to per session branch policy)
- **PR link:** https://github.com/aleforfab/Centrale/pull/9 (Draft PR into `main`)
- **Base SHA (`origin/main`):** `037f42c1e6156d6ec92ebd6d46cb058ec522cc21`
- **Implementation HEAD SHA (prior to this report commit):** `5c3cb468d5438a6db3974eb7617f7189b4eab7ae`

## Scope done / scope not done (and why)

### Done (verified on synthetic fixtures only)
1. **`nisar/reader.py`:**
   - Added `rtc_gamma_to_sigma: np.ndarray | float | None = None` to `Window` (scalar `float`, 2D `float32` grid matching `power.shape`, or `None` when absent).
   - Reads `rtcGammaToSigmaFactor` from `science/LSAR/GCOV/grids/frequency{A|B}`; applies the same coordinate-orientation flips (`[:, ::-1]` / `[::-1, :]`) when 2D; logs a warning and returns `None` (no exception) when the dataset is missing.
   - Replaced pickle-in-`.npz` caching with real atomic `.npz` archives (`cache_version = 2`, `np.savez_compressed` / `np.load(..., allow_pickle=False)`) so `rtc_gamma_to_sigma` (`None`, scalar, or 2D grid) survives window caching, while legacy v1 cache files fall back cleanly to a cache miss.
2. **`nisar/normalize.py`:**
   - Added `NormalizationProvenance`, `NormalizedWindow`, `normalize_power()`, `apply_gamma_to_sigma()` (idempotent on `NormalizedWindow`), `combine_pair_normalization()`, and `summarize_site_normalization()`.
   - Implemented **convention assumed, needs review against the GCOV spec**: `σ⁰ = γ⁰ × rtcGammaToSigmaFactor` (element-wise for 2D grids; scalar broadcast).
   - Guard: non-finite (`NaN`, `±inf`), zero, or negative factor pixels are masked out (`valid = False`, `power = NaN`), never silently converted to fake values in dB. Missing factor logs a warning, marks `applied: false`, and leaves power unnormalized (`γ⁰`).
3. **`nisar/processing.py` & `nisar/site_builder.py` & `nisar/models.py`:**
   - `site_builder.py` normalizes each `Window` at load time via `apply_gamma_to_sigma()` before smoothing, resampling, dB conversion, time-series calculation, differencing, and stats.
   - `processing.py` (`process_pair` and `compute_time_series`) also calls `apply_gamma_to_sigma()` (idempotent when given `NormalizedWindow`) before `smooth_linear()`, `ensure_same_grid()`, and `to_db()`.
   - Added additive `normalization` provenance (`NormalizationInfo`: `{method, factor_kind, source, applied, warning}`) on `manifest.source` and every layer in `manifest.layers[]`.
4. **Fixtures, tests, and docs:**
   - Extended `tests/fixtures/make_fake_gcov.py` with `gamma_to_sigma` (scalar, 2D grid, or `None` to omit), `make_varying_gamma_to_sigma_grid()`, `base_db_value`, and `nan_fraction`.
   - Added `tests/test_normalization.py` covering scalar scaling (`0.8` -> `10*log10(0.8)` dB shift), 2D grid application + `NaN`/0/negative masking, missing-factor warning + `applied: false`, `.npz` cache round-trip, coordinate flip alignment, `process_pair`/`compute_time_series` numeric expectations, `site_builder` manifest provenance, and a synthetic same-stack spatially-varying-factor regression test.
   - Wrote `dancing-with-sars-backend/docs/NORMALIZATION.md` documenting method, convention, limits, provenance schema, and the VM verification checklist.

### Not done (and why)
- **Real Anak Krakatau granule normalization & validation:** Not run. This sandbox has no Earthdata credentials and outbound network access is restricted (no ASF downloads). **This slice is verified on synthetic fixtures only.**
- **Official NISAR L2 GCOV ATBD formula confirmation:** In-repo docs (`docs/nisar_file_layout.md`, `docs/FULL_FEATURE_AUDIT.md`) do not include a GCOV ATBD formula excerpt settling multiplication vs division for `rtcGammaToSigmaFactor`.

## Files changed (`git diff --stat origin/main...HEAD`)

```text
 dancing-with-sars-backend/docs/NORMALIZATION.md    |  78 ++++
 dancing-with-sars-backend/nisar/models.py          |  27 ++
 dancing-with-sars-backend/nisar/normalize.py       | 279 ++++++++++++
 dancing-with-sars-backend/nisar/processing.py      |  59 ++-
 dancing-with-sars-backend/nisar/reader.py          | 175 ++++++-
 dancing-with-sars-backend/nisar/site_builder.py    |  28 +-
 .../tests/fixtures/make_fake_gcov.py               |  55 ++-
 .../tests/test_normalization.py                    | 507 +++++++++++++++++++++
 8 files changed, 1160 insertions(+), 48 deletions(-)
```
*(Plus this report file `agent-team/reports/01-normalizer.md` added in the subsequent commit.)*

## Shared files touched (`ANNOUNCE` list)

- `ANNOUNCE: dancing-with-sars-backend/nisar/models.py` — added `NormalizationInfo` Pydantic model and optional `normalization: NormalizationInfo | None = Field(default=None, ...)` fields on `SourceInfo` and `Layer` so `site_builder.py` / `write_manifest()` serialize normalization provenance additively without breaking existing manifests or tests.

## Checks run (exact commands + outputs)

### 1. Ruff + Pytest

```bash
cd dancing-with-sars-backend && .venv/bin/ruff check . --output-format concise && .venv/bin/pytest -q
```

Output:
```text
All checks passed!
........................................................................ [ 58%]
...................................................                      [100%]
123 passed, 11 warnings in 2.63s
```
*(11 pre-existing warnings from `schemas.py` Pydantic v1 `example=` kwargs and `rasterio` `Affine *` deprecation in `test_export_site_builder.py`.)*

### 2. Synthetic fixture build + verify + manifest `normalization` snippet

```bash
cd dancing-with-sars-backend && rm -rf /tmp/norm-demo && \
  .venv/bin/python -m scripts.make_demo_site --output /tmp/norm-demo/input --size 120 --polarizations HH && \
  PRODUCTS_DIR=/tmp/norm-demo/products CACHE_DIR=/tmp/norm-demo/cache \
  .venv/bin/python -m nisar.cli build-site --config /tmp/norm-demo/input/site.yaml --local-dir /tmp/norm-demo/input/granules && \
  PRODUCTS_DIR=/tmp/norm-demo/products CACHE_DIR=/tmp/norm-demo/cache \
  .venv/bin/python -m nisar.cli verify --site demo-fixture
```

Output:
```text
Synthetic demo input created.
  granules : NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5
             NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260713T160541_20260713T160541_P05023_P_F_J_002.h5
  site file: /tmp/norm-demo/input/site.yaml

This is synthetic data. The site caveat records that, and it must stay visible.

Built NISAR site products at /tmp/norm-demo/products/demo-fixture
Verified site demo-fixture
2 acquisitions, 6 layers
Mission NISAR, maturity PROVISIONAL
```

Manifest JSON snippet (`/tmp/norm-demo/products/demo-fixture/manifest.json`):
```json
{
  "source": {
    "mission": "NISAR",
    "band": "L",
    "product": "GCOV",
    "maturity": "PROVISIONAL",
    "crid": "P05023",
    "frequency": "A",
    "pixel_spacing_m": 20.0,
    "crs": "EPSG:32646",
    "normalization": {
      "method": "gamma_to_sigma_gcov_factor",
      "factor_kind": "scalar",
      "source": "gcov.rtcGammaToSigmaFactor",
      "applied": true,
      "warning": null
    }
  },
  "layers_sample": [
    {
      "id": "backscatter-hh-2026-07-01",
      "kind": "backscatter",
      "title": "HH backscatter · 2026-07-01",
      "pol": "HH",
      "date": "2026-07-01",
      "pair_id": null,
      "threshold_db": null,
      "sign": null,
      "tile_url_template": "/products/demo-fixture/tiles/backscatter-hh-2026-07-01/{z}/{x}/{y}.png",
      "min_zoom": 0,
      "max_zoom": 10,
      "legend": "Backscatter (dB, normalized sigma0), brighter means a stronger return",
      "normalization": {
        "method": "gamma_to_sigma_gcov_factor",
        "factor_kind": "scalar",
        "source": "gcov.rtcGammaToSigmaFactor",
        "applied": true,
        "warning": null
      }
    }
  ]
}
```

## Honesty invariants: kept / violated

- **Kept:**
  - Synthetic fixtures retain the exact caveat (*"not a real observation, not a real change, and not evidence of anything"*).
  - No claim that real Anak Krakatau data is normalized or verified; docs and report state **verified on synthetic fixtures only**.
  - No histogram matching or empirical cross-date calibration implemented.
  - Missing `rtcGammaToSigmaFactor` is never silently treated as `1.0`; it logs a warning and marks `applied: false`.
  - Convention `σ⁰ = γ⁰ × rtcGammaToSigmaFactor` is explicitly flagged as **convention assumed, needs review against the GCOV spec**.
  - `verify_site` semantics, `/compare` rules, frontend, and restricted backend files (`live_fetch.py`, `jobs.py`, `catalog.py`, `routers/`, `main.py`, `config.py`, `cli.py`) were not modified.

## Known gaps, follow-ups, TODOs left in code

- **Convention verification:** Confirm `σ⁰ = γ⁰ × rtcGammaToSigmaFactor` against the official NISAR L2 GCOV ATBD / product specification.
- **Real-granule `rtcGammaToSigmaFactor` layout:** Confirm on real ASF GCOV granules whether `rtcGammaToSigmaFactor` is scalar or 2D, and whether its grid dimensions always match `HHHH`/`HVHV` (currently `GcovReader` raises `InvalidFileError` if a 2D factor grid has a different shape from the polarization grid).
- **Precomputed `PRODUCTS_DIR` sites (if any exist on VM):** Any pre-existing cached `.npz` windows on the VM (pickle v1) will automatically be treated as cache misses and rebuilt into `.npz` v2 on next read; pre-existing `manifest.json` files on disk will lack `normalization` until rebuilt.

## What the supervisor must verify manually

1. Confirm the **assumed convention** (`σ⁰ = γ⁰ × rtcGammaToSigmaFactor`) against the official NISAR L2 GCOV specification before merging/enabling on real data.
2. Review the **shared-file edit** in `dancing-with-sars-backend/nisar/models.py` (`ANNOUNCE:`).
3. On the VM with Earthdata credentials, execute the checklist in `dancing-with-sars-backend/docs/NORMALIZATION.md` §5 against the five real Anak Krakatau GCOV dates (inspect `rtcGammaToSigmaFactor` shape/range, run `build-site` + `verify`, compare raw-`γ⁰` vs normalized-`σ⁰` dB bias on non-eruption pixels, and confirm real volcanic change is preserved).
4. Note that the branch is `arena/29b33504-centrale` (Arena session branch) rather than `feat/gamma-to-sigma`.
