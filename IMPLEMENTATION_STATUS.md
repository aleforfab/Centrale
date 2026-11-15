> **SUPERSEDED — historical record.** As of 2026-11-15 this file describes an
> earlier state of the project (pre-round-2). Current truth lives in
> [`HACKATHON.md`](HACKATHON.md), [`agent-team/PLAN.md`](agent-team/PLAN.md) and
> [`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
> Do not use the commands or claims below for decisions; do not edit to force
> agreement — read forward instead.

# Implementation Status - Dancing with the SARs to NISAR

This document tracks the implementation progress of the CODEX_PLAN.md tasks.

## Overall Status

**Processing, product APIs, and the NISAR frontend are implemented. A real site build remains blocked on human selection of study region/pairs and approval for potentially multi-gigabyte downloads. Live format validation is still partial.**

## Phase 0: Hygiene and Safety ✅

### T0.1: Untrack .env and fix config names ✅
- [x] Updated `.env.example` with all required variables
- [x] Added `ENABLE_SENTINEL1_FALLBACK` and `PRODUCTS_DIR`
- [x] Created root-level `.gitignore` covering `.env`, `products/`, `.cache/`
- [x] Updated backend `.gitignore`
- [x] Created frontend `.gitignore`
- [x] Fixed variable name mismatch (EE_SERVICE_ACCOUNT, etc.)

### T0.2: README truth pass ✅
- [x] Removed claim about bundled Mapbox token
- [x] Clarified that Mapbox token must be URL-restricted
- [x] Added bash equivalents for all PowerShell commands

### T0.3: CI (GitHub Actions) ✅
- [x] Created `.github/workflows/ci.yml`
- [x] Backend: ruff check, pytest
- [x] Frontend: npm ci, typecheck, build with dummy Mapbox token

## Phase 1: NISAR Foundation ✅

### T1.1: nisar/naming.py + tests ✅
- [x] Implemented `parse_granule_name()` with regex from Appendix A
- [x] Implemented `NisarGranuleName` dataclass with all fields
- [x] Added `stack_key` property for grouping
- [x] Added `maturity`, `date`, `datetime_start/end` properties
- [x] Added `polarizations()` method to extract from pol_code
- [x] Tests: 15 tests covering parsing, validation, stack keys, edge cases
- [x] All tests pass

### T1.2: nisar/catalog.py + discover CLI + tests ✅
- [x] Implemented `search_gcov()` using asf.search with NISAR parameters
- [x] Implemented `GranuleInfo` class with parsing and containment checks
- [x] Implemented `Stack` class with grouping and statistics
- [x] Implemented `group_into_stacks()` function
- [x] Implemented `discover_stacks()` with latitude guard (< 60°)
- [x] Added known data gap information
- [x] Created CLI with `discover` subcommand
- [x] Tests: 10 tests with mocks, no network required
- [x] All tests pass

### T1.3: Fake GCOV fixture + nisar/reader.py + tests ✅
- [x] Created `tests/fixtures/make_fake_gcov.py` with HDF5 generation
- [x] Generates files with structure matching assumptions (A1-A7)
- [x] Created `nisar/reader.py` with `GcovReader` class
- [x] Implemented window reading with bbox-to-pixel conversion
- [x] Added coordinate transformation with pyproj
- [x] Added window caching to disk
- [x] Added `Window` dataclass with power, valid, transform, crs, spacing, etc.
- [x] Tests: fixture coordinate selection and north-up transforms are exercised
- [x] All reader tests pass

**Note:** The reader supports both ascending and descending coordinate axes. The local fixture tests now exercise coordinate selection and north-up transforms.

### T1.4: [LIVE] live_smoke_nisar.py 🟡
- [x] Implemented and ran the script using Earthdata token authentication
- [x] ASF returned live NISAR GCOV granules and streamed a 64×64 data sample
- [x] Wrote `docs/nisar_file_layout.md`
- [x] Updated reader CRS parsing for the observed `epsg_code` / `spatial_ref` metadata
- [x] Preserved raw mask values rather than assuming their meaning
- [ ] **Still to verify:** grid alignment across a second granule in the same stack
- [ ] **Still to verify:** mask bit semantics and remote-read performance for production use

## Phase 2: Processing and Export ✅

### T2.1: nisar/processing.py + tests ✅
- [x] Implemented `to_db()` - linear power to dB conversion
- [x] Implemented `smooth_linear()` - NaN-aware boxcar smoothing in linear domain
- [x] Implemented `diff_db()` - difference in dB
- [x] Implemented `classify()` - decrease/increase masks per threshold
- [x] Implemented `area_stats()` - comprehensive statistics per threshold
- [x] Implemented `robust_sigma()` - MAD-based noise estimate
- [x] Implemented `histogram()` - 60-bin histogram
- [x] Implemented `ensure_same_grid()` - resampling if grids differ
- [x] Implemented `process_pair()` - full pair processing
- [x] Implemented `compute_time_series()` - mean backscatter over time
- [x] Added `PairStats` and `TimeSeriesPoint` dataclasses
- [x] Tests: 20 tests covering all functions
- [x] All tests pass

### T2.2: nisar/export.py + models.py + tests ✅
- [x] Created `nisar/models.py` with Pydantic models
- [x] SiteConfig, StackConfig, PairConfig, TileConfig
- [x] Manifest, SourceInfo, SiteInfo, KnownGap
- [x] Acquisition, PolarizationInfo, Layer models
- [x] PairStatsModel, TimeSeriesResponse
- [x] COG writing, XYZ PNG tiles, and transparent nodata
- [x] JSON writers for manifest, acquisitions, timeseries, and statistics
- [x] Tile budget estimator and configured budget guard
- [x] Export and fixture integration tests

### T2.3: build-site CLI + verify CLI ✅
- [x] CLI commands in `nisar/cli.py`
- [x] `build-site` supports YAML, dry-run, local files, and acquisition caps
- [x] `verify` validates manifests, provenance, product JSON, COGs, tiles, and bbox coverage
- [x] End-to-end tests on synthetic fixtures

### T2.4: [LIVE][HUMAN] Build first real site ⏸️
- [ ] **BLOCKED: Requires a human-approved region/pair and full-granule download decision**
- [ ] Human needs to run discover, pick site, write YAML config
- [ ] Run build-site, run verify
- [ ] Commit small outputs

## Phase 3: API ✅

### T3.1: Product-serving endpoints ✅
- [x] New `routers/sites.py`
- [x] Endpoints: /api/sites, /api/sites/{id}, /api/sites/{id}/timeseries
- [x] StaticFiles at /products and CORS for tiles
- [x] TestClient tests for products, tiles, and unknown sites

### T3.2: NISAR data status ✅
- [x] Compute nisar_ready from PRODUCTS_DIR
- [x] Update /health and /api/data-status
- [x] Remove hardcoded false status

### T3.3: Gate the fallback ✅
- [x] GEE and Sentinel-1 ASF routes return 404 unless ENABLE_SENTINEL1_FALLBACK=true
- [x] Add parsed NISAR GCOV catalog search to `services/asf_service.py`
- [x] Add GET /api/nisar/search endpoint
- [x] Return 503 if ASF is unreachable

## Phase 4: Frontend 🟡

### T4.1-T4.8: Frontend updates 🟡
- [x] Typed `lib/types.ts` and `lib/api.ts`
- [x] Replace hardcoded study settings with `/api/sites`
- [x] Manifest-backed layer selection and map tiles
- [x] API-backed time series and acquisition selection
- [x] Synchronized multi-layer raster overlays
- [x] Pair stats, histogram, and consistent change colors
- [x] Product provenance, granule links, and data status
- [x] Loading, empty, error, map-token, and responsive states
- [x] `dancing-with-sars-backend/docs/DEMO_RUNBOOK.md`
- [x] Data-gap shading and missing-cycle annotations; maturity changes split chart lines
- [ ] Before/after swipe comparison

## Dependencies Added

### Backend (requirements.txt)
```
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
earthengine-api>=0.1.390
asf-search>=7.0.0
pydantic>=2.6.0
shapely>=2.0.0
python-dotenv>=1.0.0
numpy>=1.24.0
scipy>=1.11.0
h5py>=3.10.0
h5netcdf>=1.3.0
fsspec>=2024.0.0
aiohttp>=3.9.0
pyproj>=3.6.0
rasterio>=1.3.0
rio-tiler>=6.0.0
PyYAML>=6.0.0
```

### Backend Dev (requirements-dev.txt)
```
pytest>=8.0.0
httpx>=0.26.0
ruff>=0.3.0
```

## Test Results

```bash
# All tests pass (latest suite: 69 passed)
cd dancing-with-sars-backend
python -m pytest tests/ -v

# Includes reader, processing, export/site builder, product API, NISAR search,
# naming, catalog, and Earth Engine service tests.
```

## Next Steps

### Immediate (Can be done without network)
1. Select and approve the first real NISAR site and curated dates
2. Build and verify its static products; full granules can be multiple gigabytes
3. Complete live grid-alignment, mask semantics, and remote-performance validation

### Requires Human Action
1. **T2.4**: Human must select a real site, confirm the study area, and approve downloading its granules

### Remaining implementation
1. Add time-gap/cycle annotations and synchronized multi-layer map overlays
2. Select, build, and verify a human-approved real NISAR site

## Files Created/Modified

### Created
- `.gitignore` (root and backend)
- `.github/workflows/ci.yml`
- `dancing-with-sars-backend/.env.example` (updated)
- `dancing-with-sars-backend/requirements.txt` (updated)
- `dancing-with-sars-backend/requirements-dev.txt`
- `dancing-with-sars-backend/nisar/` (new package)
  - `__init__.py`
  - `config.py`
  - `naming.py`
  - `catalog.py`
  - `reader.py`
  - `processing.py`
  - `models.py`
  - `cli.py`
- `dancing-with-sars-backend/tests/` (new directory)
  - `__init__.py`
  - `test_naming.py`
  - `test_catalog.py`
  - `test_processing.py`
  - `test_reader.py`
  - `fixtures/`
    - `__init__.py`
    - `make_fake_gcov.py`
- `dancing-with-sars-backend/scripts/`
  - `README.md` (for T1.4)
- `README.md` (updated with bash commands, Mapbox token clarification)

### Modified
- `dancing-with-sars-backend/.gitignore`
- `dancing-with-sars-frontend/.gitignore` (new)

## Known Issues

1. **Live-data verification**: EPSG:3031 metadata and descending Y coordinates were observed and are supported by the reader. Same-stack grid alignment and mask flag semantics still need verification.

2. **Grid Alignment**: The `ensure_same_grid()` function uses rasterio for resampling, but this hasn't been tested with real data yet.

3. **Remote URL Reading**: The `read_window_from_url()` method is not yet implemented. This requires fsspec + aiohttp + Earthdata authentication.

4. **Reader Cache**: The window cache is implemented but hasn't been thoroughly tested with the coordinate transformation.

## What's Working

✅ All Phase 0 tasks complete
✅ NISAR live smoke test implemented and run; grid alignment and mask semantics remain open
✅ T2.1 complete (processing.py)
✅ Core infrastructure: naming, catalog search (mocked), reader, processing
✅ Test suite: 50+ tests passing
✅ CLI: discover command working with mocks
✅ Models: Pydantic models for all data structures
✅ Fixtures: HDF5 file generation for testing

## What Needs Work

⏸️ T2.2: Export functionality (COG, tiles, JSON)
⏸️ T2.3: Build-site and verify CLI
⏸️ T3.1-T3.3: API endpoints
⏸️ T4.1-T4.8: Frontend updates

## Recommendations

1. **Priority Order**: Complete T2.2-T2.3 before T3, as the CLI is needed to generate products for the API to serve.

2. **T1.4 follow-up**: Query a second acquisition in the same stack to confirm grid alignment; use more samples before assigning meaning to GCOV mask values.

3. **Testing**: All new code has comprehensive tests. The test suite should be run before any commits.

4. **Documentation**: Each module has docstrings. More documentation can be added as implementation progresses.

---

*Last updated: Implementation in progress*
*Next milestone: Complete Phase 2 (Processing and Export)*
