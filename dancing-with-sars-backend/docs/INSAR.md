# Proposed InSAR phase chain

**Status: proposed until verified.** This package is a library and a static
status endpoint only. It is not enabled for users, it does not compute a
deformation map for the UI, and it does not claim a validated scientific
result. No real interferogram has been processed here.

The current production product path reads NISAR GCOV, which is detected,
radiometrically terrain-corrected backscatter. It carries **no interferometric
phase**. A real InSAR feature needs phase-capable products and a reviewed chain.

## Source options

1. **GUNW-style geocoded unwrapped interferogram.** `GunwHdf5Adapter` reads a
   synthetic HDF5 layout with `unwrappedPhase`, `coherence` and optional
   `incidenceAngle` datasets. `read_phase_bytes()` also contains a deployment
   code path for HTTPS with an Earthdata bearer token and for S3 via the already
   installed `fsspec` dependency. No test performs a network request.
2. **SLC pair for a local chain.** `SlcPairAdapter` reads synthetic complex
   `reference` and `secondary` arrays. This is the mode exercised by
   `run_slc_chain()`.
3. **External interferogram service.** `ExternalInterferogramService` is a
   Protocol and `Hyp3StyleServiceHook` is a callable-backed placeholder. No
   external SDK, endpoint, credential or service dependency is bundled.

`detect_product_identity()` recognises `_GUNW_`, `_GSLC_`, `_SLC_` and HyP3-style
filename/attribute conventions, and extracts a NISAR-like CRID where present.
It mirrors the repository's filename conventions but does not alter
`nisar/naming.py`.

## Algorithm notes

- **Coregistration.** `coregister.py` uses complex FFT cross-correlation on
  overlapping windows. The peak is refined with parabolic interpolation for a
  sub-pixel shift; windows are combined by median. `coregister_pair()` applies
  the negative shift with cubic spline interpolation.
- **Topographic phase.** `topo.py` uses
  `DeltaPhi_topo = -(4*pi/lambda) * (B_perp / (R*sin(theta))) * h` with a
  caller-provided DEM. Georeferencing is carried as an Affine-like six-number
  tuple; no new dependency is added.
- **Coherence.** `coherence.py` pins the boxcar formula
  `gamma = <p1*conj(p2)> / sqrt(<|p1|^2>*<|p2|^2>)`. Adaptive P/B windows are
  not implemented.
- **Filtering.** `filtering.py` is a documented Goldstein-inspired 2D FFT
  equivalent: it removes a least-squares plane, applies spectral shrinkage,
  then adds the plane back. It reduces synthetic noise variance and preserves a
  synthetic ramp. It is not a validated production Goldstein filter.
- **Unwrapping.** `unwrap.py` uses Itoh-style row/column integration of wrapped
  differences plus a 2x2 loop-integral residue check. Residues and conflicting
  integration paths are flagged; affected pixels become NaN. It does not
  silently unwrap a field with unresolved branch cuts.
- **Atmosphere.** `atmosphere.py` performs **screening only**. It fits
  low-order spatial polynomials and an optional DEM-height term to flag
  candidate stratified tropospheric ramps, wet random variance and long
  wavelength ionospheric trends. Removal is explicitly out of scope until
  validated.
- **Geometry and LOS.** `geometry.py` computes LOS-parallel/perpendicular and
  along-track baseline components, a classical critical-baseline screening
  estimate, and the scalar phase-to-vertical projection coefficient
  `(lambda/(4*pi))*cos(theta_local)`. Positive phase means increased slant
  range; positive displacement is away from the sensor. The coefficient is a
  diagnostic only.
- **Chain.** `chain.py` orchestrates coregistration, topographic removal,
  coherence, filtering, unwrapping (SLC) or pass-through (GUNW), atmosphere
  screening and LOS scaling. Every step records parameters and caveats. The
  only output format is `InSarDiagnostics.as_dict()`, which contains scalars,
  flags, strings and lists. It rejects numpy arrays and never contains a
  user-facing deformation map.

## Static API

`GET /api/insar/status` always returns HTTP 200 with `enabled: false`,
`status: "proposed"`, the required chain steps and the requirements. There is
no compute endpoint, no job endpoint and no frontend integration.

## Verification protocol before any real use

- Obtain two real same-stack phase-capable pairs (SLC or GUNW-style) with exact
  dates, polarization, track/frame/direction, CRID, maturity and provenance.
- Provide a DEM with known georeferencing and confirm local incidence geometry.
- Compare coregistration against independent orbit/DEM estimates.
- Inspect coherence maps and confirm expected stable/unstable areas.
- Measure residual topographic phase after removal against known baselines.
- Perform closure-phase checks where a third acquisition is available.
- Compare any local interferogram with an independent GUNW product if available.
- Review phase unwrapping residues, atmospheric flags and LOS projection sign
  with a named scientific reviewer.
- Keep every output labelled proposed until the reviewer signs off.

## Review checklist

- [ ] Real phase-capable granule names and provenance recorded.
- [ ] DEM, baseline and incidence geometry independently checked.
- [ ] Coregistration residuals inspected.
- [ ] Coherence maps inspected, not reduced to a single number.
- [ ] Residual topographic phase and closure phase checked.
- [ ] Unwrapping residues and branch cuts reviewed.
- [ ] Atmospheric screening reviewed; no unvalidated correction applied.
- [ ] LOS sign convention and projection checked.
- [ ] Named reviewer, scope, limitations and date recorded.
- [ ] UI remains disabled or explicitly labelled proposed.

## Explicit limitations

- Synthetic fixtures only; **not verified on real data — needs GUNW/SLC pairs
  on the VM + reviewer sign-off**.
- No edits to `nisar/reader.py`, `nisar/processing.py`,
  `nisar/site_builder.py`, `nisar/live_fetch.py`, `nisar/jobs.py` or
  `nisar/catalog.py`.
- No frontend changes, no user-facing coherence/deformation numbers and no
  claims about the Anak Krakatau case.
- No new third-party dependencies. `numpy`, `scipy`, `h5py`, `fsspec` and
  FastAPI are already in `requirements.txt`; the DEM transform is stored as a
  tuple rather than importing `affine` directly.
