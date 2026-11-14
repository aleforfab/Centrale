# Radiometric Gamma-to-Sigma Normalization for NISAR GCOV

**Status:** Implemented in the backend pipeline and verified on **synthetic fixtures only**. Real Anak Krakatau granules have **not** yet been downloaded, normalized, or inspected.

## 1. Method and Convention

NISAR Level-2 GCOV (Geocoded Covariance) products store terrain-flattened radiometric terrain-corrected backscatter ($\gamma^0$, linear power) under `/science/LSAR/GCOV/grids/frequencyA/<POL>` alongside `/science/LSAR/GCOV/grids/frequencyA/rtcGammaToSigmaFactor`.

Before any boxcar smoothing, resampling, dB conversion, pair differencing, classification, or time-series averaging, `nisar/normalize.py` converts $\gamma^0$ to $\sigma^0$:

$$\sigma^0 = \gamma^0 \times \text{rtcGammaToSigmaFactor}$$

- **Scalar factor:** broadcast across all valid pixels in the window.
- **2D grid factor:** applied element-wise (`power * factor`), aligned with the polarization grid and subjected to the same coordinate-orientation flips in `nisar/reader.py`.
- **Invalid-factor guard:** pixels where `rtcGammaToSigmaFactor` is non-finite (`NaN`, `±inf`) or `<= 0` are masked out (`valid = False`, output power = `NaN`) rather than silently becoming `NaN`/`0` after `to_db()`.
- **Missing dataset:** if `rtcGammaToSigmaFactor` is absent in the HDF5 frequency group, `GcovReader` returns `rtc_gamma_to_sigma = None` and logs a warning without crashing. Downstream processing leaves backscatter in $\gamma^0$ and records `applied: false` in provenance.
- **Window caching:** `GcovReader` stores `rtc_gamma_to_sigma` (scalar, 2D `float32` grid, or `None`) in its `.npz` window cache (`cache_version = 2`).

> **Convention flag:** The in-repo documentation does not include an official NISAR L2 GCOV ATBD formula excerpt settling whether `rtcGammaToSigmaFactor` multiplies or divides $\gamma^0$. The multiplicative convention $\sigma^0 = \gamma^0 \times \text{rtcGammaToSigmaFactor}$ is implemented and pinned by unit tests, and **needs review against the official NISAR GCOV product specification** during VM validation.

## 2. Pipeline Order

1. `GcovReader.read_window()` reads linear $\gamma^0$ power, `valid`, `mask`, and `rtcGammaToSigmaFactor`.
2. `apply_gamma_to_sigma()` computes linear $\sigma^0$ and updates `valid` (idempotent on `NormalizedWindow`).
3. `smooth_linear()` applies NaN-aware boxcar smoothing in **linear** $\sigma^0$ power.
4. `ensure_same_grid()` resamples in **linear** $\sigma^0$ power if pre/post grids differ.
5. `to_db()` converts linear $\sigma^0$ to decibels (`10 * log10(sigma0)`).
6. `diff_db()`, `classify()`, `area_stats()`, and `compute_time_series()` operate on normalized dB values.

No histogram matching or empirical cross-date radiometric calibration is performed.

## 3. Limits and Caveats

- **Approximation:** Multiplying GCOV $\gamma^0$ by `rtcGammaToSigmaFactor` is a product-level radiometric conversion from terrain-flattened $\gamma^0$ to $\sigma^0$; residual topographic, layover/shadow, and moisture/phenology effects remain.
- **Product maturity:** Current NISAR products in scope are `PROVISIONAL` (and may be reprocessed with updated CRIDs or calibration factors).
- **Same stack only:** Normalization only converts each acquisition using its own GCOV factor within a single track/frame/direction stack; it does not make cross-track or ascending/descending comparisons directly equivalent, and same-stack grid alignment on real granules remains subject to VM verification (`docs/nisar_file_layout.md` assumption A4).
- **No phase / InSAR:** GCOV is detected covariance/backscatter; normalization does not enable interferometry or displacement measurement.

## 4. Provenance Fields in `manifest.json`

Both `manifest.source.normalization` and every entry in `manifest.layers[]` include an additive `normalization` object:

```json
{
  "method": "gamma_to_sigma_gcov_factor",
  "factor_kind": "scalar",
  "source": "gcov.rtcGammaToSigmaFactor",
  "applied": true,
  "warning": null
}
```

- `method`: `"gamma_to_sigma_gcov_factor"`
- `factor_kind`: `"scalar"`, `"grid"`, `"mixed"` (for site/pair summaries mixing scalar and grid), or `null` (when missing)
- `source`: `"gcov.rtcGammaToSigmaFactor"`
- `applied`: `true` if the factor was present and applied (to both dates for pair layers); `false` if missing on any required granule
- `warning`: warning string when `applied` is `false` or when invalid factor pixels were masked, otherwise `null`

## 5. VM Verification Checklist (Real Anak Krakatau Granules)

Run these checks on a VM with Earthdata credentials and sufficient disk space (this slice verified synthetic fixtures only):

1. **Inspect the real `rtcGammaToSigmaFactor` layout** on one downloaded Anak Krakatau GCOV granule:
   - Confirm `/science/LSAR/GCOV/grids/frequencyA/rtcGammaToSigmaFactor` shape (scalar vs 2D grid), dtype, min/max range, and invalid/fill values.
   - Verify against the NISAR L2 GCOV spec that $\sigma^0 = \gamma^0 \times \text{rtcGammaToSigmaFactor}$ (and not division).
2. **Build the 5-date Anak Krakatau site** via CLI:
   ```bash
   cd dancing-with-sars-backend
   python -m nisar.cli build-site --config <anak_krakatau_site.yaml>
   python -m nisar.cli verify --site <anak_krakatau_site_id>
   ```
3. **Inspect `manifest.json`:**
   - Confirm `source.normalization.applied == true` and check `factor_kind` (`scalar` or `grid`).
   - Confirm every `backscatter`, `difference`, and `change_mask` layer carries `normalization`.
4. **Compare raw-$\gamma^0$ vs normalized-$\sigma^0$ outputs** across the 5 dates:
   - Measure `median_diff_db` and `sigma_db` on stable, non-eruption pixels (surrounding ocean/unchanged flanks) for consecutive pairs.
   - Record the dB bias change between raw-$\gamma^0$ and normalized-$\sigma^0$.
   - Visually and numerically confirm that true eruption/land-cover backscatter changes are preserved and not erased.
