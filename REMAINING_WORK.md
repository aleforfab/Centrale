# Remaining Work - Dancing with the SARs NISAR Implementation

This document lists all tasks that still need to be completed to transform the prototype into a fully functional NISAR application, organized by phase and priority.

**Last Updated**: NISAR product API and frontend integration implemented
**Status**: Phases 0-1 ✅ Complete (T1.4 follow-up remains), Phase 2 ✅ Pipeline implemented, Phase 3 ✅ Implemented, Phase 4 ✅ Implemented; first real site remains unbuilt

---

## 🎯 Quick Start - What to Do Next

### Immediate Priority (Blocking)
1. **Finish T1.4 live-data validation**
   - The smoke test has been implemented and run with Earthdata token authentication.
   - Results: `dancing-with-sars-backend/docs/nisar_file_layout.md`
   - The observed EPSG:3031 metadata and descending Y coordinates are supported by `nisar/reader.py`.
   - Still to verify: same-stack grid alignment, mask bit semantics, and acceptable remote-read performance.

---

## 📋 Phase by Phase Remaining Tasks

### Phase 1: NISAR Foundation

#### ⏳ T1.4: [LIVE] Live Smoke Test - Verify Assumptions
**Status**: 🟡 PARTIAL - Live run completed; some assumptions need more evidence

**What it does**:
- Authenticates with ASF DAAC using Earthdata credentials (token or username/password)
- Searches for NISAR GCOV granules in a user-supplied bbox
- Streams a window from the first granule
- Verifies assumptions A1-A7 by inspecting file structure and data
- Writes results to `docs/nisar_file_layout.md`

**Remaining validation**:
- Query a second granule from the same track/frame/direction and compare coordinate arrays.
- Determine mask bit semantics; preserve mask values raw until confirmed.
- Investigate the observed 74-second remote read for a 64×64 sample before relying on remote streaming in production.

**Assumptions to verify**:
- **A1**: Grid coordinate datasets exist at `.../grids/frequencyA/xCoordinates` and `yCoordinates` (1-D, projected metres), with CRS in `projection` dataset
- **A2**: Invalid pixel conventions (NaN, 0, fill value) and mask layer semantics
- **A3**: ASF result property names (always parse from granule name, not properties)
- **A4**: Grid alignment across cycles (same track+frame share identical grids)
- **A5**: Polarization list (from `listOfPolarizations` dataset or infer from datasets)
- **A6**: Streaming performance over HTTPS with fsspec
- **A7**: ASF Vertex deep link format

**After completion**:
- Review `docs/nisar_file_layout.md`
- Update `nisar/reader.py` coordinate transformation if needed
- Update `tests/fixtures/make_fake_gcov.py` to match real file structure
- Update assumption status in CODEX_PLAN.md
- Unskip reader tests that depend on coordinate transformation
- Re-run Phase 1 tests

---

### Phase 2: Processing and Export

#### 🟡 T2.2: Export Functionality
**Status**: ✅ IMPLEMENTED - COG export, XYZ tiles, JSON products, and budget guard

**Implemented files**:
- `nisar/export.py` - COG writing, tile rendering, JSON export

**Implemented functions**:
- [x] `write_cog()` - Write Cloud-Optimized GeoTIFF from numpy array
- [x] `render_tiles()` - Render XYZ PNG tiles using rasterio reprojection and Pillow
- [x] `write_manifest()` - Write manifest.json from processed data
- [x] `write_acquisitions()` - Write acquisitions.json
- [x] `write_timeseries()` - Write timeseries.json
- [x] `write_stats()` - Write stats.json
- [x] `estimate_tile_budget()` - Estimate MB for tile rendering

**Requirements**:
- `rasterio` for COG writing
- `rasterio` and Pillow for tile reprojection and rendering
- Proper handling of nodata/NaN (transparent PNG)
- Diverging colormap for difference layers (blue-white-red)
- Grayscale for backscatter layers
- Flat colors for mask layers

**Tests**:
- [x] Test COG writing and reading
- [x] Test tile rendering (PNG signature check: `\x89PNG`)
- [x] Test manifest validation
- [x] Test budget guard (raises when budget_mb exceeded)

**Acceptance**: `pytest tests/test_export_site_builder.py` green

---

#### 🟡 T2.3: Build-Site CLI
**Status**: ✅ IMPLEMENTED - build, dry-run, local-dir, acquisition cap, and verify commands

**Task**: Completed the `build-site` and `verify` CLI commands in `nisar/cli.py`

**`build-site` command** (`python -m nisar.cli build-site --config sites/<id>.yaml`):
- [x] Load and validate YAML config
- [x] Query local granules or ASF and assert configured stack/dates
- [x] Assert all selected granules share stack key and maturity
- [x] Read windows for all acquisitions (cached, resumable)
- [x] Compute time series
- [x] Compute shared `stretch_db` for each polarization
- [x] For each curated pair: diff, threshold masks, and statistics
- [x] Write COGs, render tiles, and write all product JSON

**CLI options**:
- [x] `--dry-run` - Print plan without downloading or reading granule data
- [x] `--max-acquisitions N` - Limit acquisitions without dropping curated pair dates
- [x] `--local-dir PATH` - Read pre-downloaded granules

**`verify` command** (`python -m nisar.cli verify --site <id>`):
- [x] Check every manifest layer's tile folder exists and is non-empty
- [x] JSON validates against Pydantic models
- [x] No maturity mixing
- [x] Configured bbox is checked against product bounds with pixel-edge tolerance

**Tests**:
- [x] End-to-end test on fixtures (two fake granules → full product tree → verify passes)

**Acceptance**:
- `pytest` end-to-end test green
- Manual verification with fixture data

---

#### 🟡 T2.4: [LIVE][HUMAN] Build First Real Site
**Status**: ⏸️ BLOCKED - Requires human study-region/pair selection and consent for full-granule downloads

**Task**: Human must build the first real NISAR site

**Steps**:
1. [ ] Run `discover` for candidate regions (see §9 in CODEX_PLAN.md)
2. [ ] Pick a stack with ≥4 PROVISIONAL acquisitions on same track/frame/direction
3. [ ] Pick pairs where both dates exist and neither falls in instrument gap
4. [ ] Write `sites/<id>.yaml` configuration
5. [ ] Run `build-site --config sites/<id>.yaml`
6. [ ] Run `verify --site <id>`

**Site selection guidance** (from CODEX_PLAN.md §9):
- Target regions: Ganges–Brahmaputra floodplain, Pantanal, California Central Valley, Mekong delta
- Requirements: ≥4 PROVISIONAL acquisitions, both pair dates present, bbox fully inside one frame, latitude < 60°, visible before/after
- Expected acquisitions (2026-06-17 to mid-Nov): 8-11 minus data gap losses

**Output**:
- Commit small outputs (manifest, JSON, tiles) to repo
- Keep `products/` size within budget
- Larger data → GitHub release or object storage
- Document fetch instructions in README

**Acceptance**:
- `verify` passes on real NISAR site
- `GET /api/data-status` reports `nisar_ready: true` (after Phase 3)

---

### Phase 3: API

#### 🟡 T3.1: Product-Serving Endpoints
**Status**: ✅ IMPLEMENTED - site list, manifest, time-series, and static product serving

**Task**: Add new endpoints to serve precomputed products

**File to create**: `routers/sites.py` (keep `main.py` thin)

**Endpoints to implement**:
- [x] `GET /api/sites` - List all sites with summaries
- [x] `GET /api/sites/{id}` - Return full manifest
- [x] `GET /api/sites/{id}/timeseries?pol=HV` - Return time series for polarization

**Implementation details**:
- [x] Mount `StaticFiles` at `/products` for tile and COG serving
- [x] `PRODUCTS_DIR` from environment variable
- [x] Pydantic response models (use models from `nisar/models.py`)
- [x] 404 errors list valid IDs in `detail`
- [x] Return client-safe errors without stack traces

**CORS**: Ensure CORS headers appear on tile responses so Mapbox can fetch cross-origin

**Tests**:
- [x] Test list sites endpoint
- [x] Test get manifest endpoint
- [x] Test get timeseries endpoint
- [x] Test fetch tile (check PNG signature and CORS)
- [x] Test 404 cases with valid ID lists

**Acceptance**: `pytest tests/test_api.py` green

---

#### 🟡 T3.2: Honest Data Status
**Status**: ✅ IMPLEMENTED - readiness is derived from installed NISAR manifests

**Task**: Compute `nisar_ready` from products directory dynamically

**Changes required**:
- [x] Update `/api/data-status` to check `PRODUCTS_DIR` for NISAR manifests
- [x] `nisar_ready` is `true` only if ≥1 site manifest with `source.mission=="NISAR"` exists
- [x] Update `/health` to reflect real state
- [x] Remove hardcoded `False` values

**Implementation**:
```python
def check_nisar_ready() -> bool:
    products_dir = Config.get_products_dir()
    for site_dir in products_dir.iterdir():
        manifest_path = site_dir / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = json.load(f)
                if manifest.get("source", {}).get("mission") == "NISAR":
                    return True
    return False
```

---

#### 🟡 T3.3: Gate the Fallback
**Status**: ✅ IMPLEMENTED - opt-in Sentinel-1 fallback and live NISAR ASF search

**Task**: Make GEE routes optional and gated by flag

**Changes required**:
- [x] GEE routes (`/api/gee/*`) return 404 unless `ENABLE_SENTINEL1_FALLBACK=true`
- [x] Sentinel-1 ASF search (`/api/asf/search`) return 404 unless flag is true
- [x] Responses labelled with `source_status: "development fallback (Sentinel-1)"`

**Additional implementation**:
- [x] `asf_service.py`: add `search_nisar_granules()` function
  - Uses `asf.search()` (not `geo_search()`)
  - Returns parsed track/frame/cycle/CRID/maturity from granule name
  - Powers `GET /api/nisar/search` endpoint
- [x] Add `GET /api/nisar/search` endpoint
  - Parameters: `bbox`, `start`, `end`, `maturity`
  - Returns: live ASF results for NISAR
- [x] Degrade to 503 (not 500) if ASF is unreachable

**Code organization**:
- Move GEE code to `services/legacy/` if it doesn't break imports
- Keep fallback code available but disabled by default

---

### Phase 4: Frontend

All Phase 4 tasks require the backend API (Phase 3) to be complete.

#### 🟡 T4.1: Typed API Client
**Status**: ✅ IMPLEMENTED - typed site, manifest, layer, status, and time-series client

**Files to create**:
- `dancing-with-the-sars-frontend/lib/types.ts` - TypeScript interfaces
- `dancing-with-the-sars-frontend/lib/api.ts` - Typed client for API endpoints

**Type definitions needed**:
- Site, SiteSummary, Manifest, Acquisition, Layer, TimeSeriesPoint, etc.
- Match the Pydantic models in `nisar/models.py`

**Environment variables**:
- `NEXT_PUBLIC_API_URL` - Backend API URL
- Already have `NEXT_PUBLIC_MAPBOX_TOKEN`

---

#### 🟡 T4.2: Site Selector
**Status**: ✅ IMPLEMENTED - dynamic site selector backed by the products API

**Task**: Replace hardcoded `studySettings` with dynamic site loading

**Changes**:
- [x] Replace `studySettings` in `app/page.tsx` with `GET /api/sites`
- [x] Replace fixed settings with a dynamic site selector and manifest metadata
- [x] Add site selector UI
- [x] Load site configuration on selection

---

#### 🟡 T4.3: Layer System
**Status**: ✅ IMPLEMENTED - manifest-backed layer selection and synchronized raster overlays

**Task**: Generic layer system in `Map.tsx`

**Changes**:
- [x] Refactor `Map.tsx` to render selected and simultaneously visible manifest layers
- [x] Create and synchronize raster sources from manifest layer definitions
- [x] Set bounds/min/max zoom from manifest
- [x] Keep satellite/dark basemap switch
- [x] Simultaneously render and synchronize multiple raster overlays

**Mapbox configuration**:
- Raster sources use `tileSize: 256`
- Multiple synchronized raster overlays are selectable in the frontend

---

#### 🟡 T4.4: Chart and Timeline
**Status**: ✅ IMPLEMENTED - acquisition time series, gap/cycle annotations, and maturity-separated lines

**Task**: Update time series visualization

**Changes**:
- [x] Update `DanceChart` to use API time-series data
- [x] Use acquisition and time-series points for date selection
- [x] Shade instrument data gap (2026-07-27 → 2026-08-10)
- [x] Label the data gap
- [x] Mark missing cycles when cycle numbers are discontinuous
- [x] Show maturity in point tooltips and selection buttons
- [x] Break the chart line when maturity changes

---

#### 🟡 T4.5: Stats Panel and Legends
**Status**: ✅ IMPLEMENTED - pair statistics and consistent increase/decrease legend

**Task**: Update statistics display and legends

**Changes**:
- [x] Show changed km² per sign, percent, sigma, and histogram
- [x] Per-layer legend with consistent color semantics
- [x] **Color semantics**: Blue = lower backscatter in later date, Red/orange = higher
- [x] Use consistent colors for increase and decrease

---

#### 🟡 T4.6: Provenance
**Status**: ✅ IMPLEMENTED - mission, product, maturity, CRID, and granule provenance shown

**Task**: Show data provenance throughout UI

**Changes**:
- [x] Header badge from `/api/data-status`
  - Example: "NISAR L-band · GCOV · PROVISIONAL (CRID P05023)"
  - If not ready: "Sentinel-1 development data" with banner
- [x] Never label Sentinel-1 output as NISAR
- [x] Per-acquisition info: granule name, cycle, CRID, maturity
- [x] Granule links using A7 format:
  - Primary: `https://search.asf.alaska.edu/#/?granule=<name>`
  - Fallback: `https://search.earthdata.nasa.gov/search?q=<granule_name>`
- [x] Attribute product data to ASF DAAC and map imagery to Mapbox

---

#### 🟡 T4.7: States and Robustness
**Status**: ✅ IMPLEMENTED - loading, empty, error, token, and responsive states

**Task**: Handle edge cases and errors gracefully

**Changes**:
- [x] Loading states for API operations
- [x] Empty states when no data available
- [x] Error states with clear messages
- [x] Missing Mapbox token detection and friendly error
- [x] Responsive layouts for mobile and desktop

---

#### 🟡 T4.8: Demo Runbook
**Status**: ✅ IMPLEMENTED - see `dancing-with-sars-backend/docs/DEMO_RUNBOOK.md`

**Task**: Create comprehensive demo documentation

**File to create**: `docs/DEMO_RUNBOOK.md`

**Contents**:
- [x] Start commands for backend and frontend
- [x] Site preparation and local-product checklist
- [x] Demo walkthrough through site selection, layers, stats, and provenance
- [x] Known limitations
- [x] Troubleshooting guide

---

### Phase 5: Stretch Goals

Only after Phases 1-4 are complete and verified.

#### 🟡 S1: Click-to-Chart
**Task**: Pixel time series on click
- [ ] Store ≤512×512 decimated stack per site (Zarr or NetCDF)
- [ ] Serve `GET /api/sites/{id}/pixel-timeseries?lon=&lat=&pol=`
- [ ] Show clicked pixel's dB time series

#### 🟡 S2: Additional Sites
**Task**: 2-3 sites with different change types
- [ ] Flood extent site
- [ ] Agricultural cycle site
- [ ] Fire site

#### 🟡 S3: Urgent Response Mode
**Task**: Filter for recent event products
- [ ] Discovery filter on `PT == "UR"`
- [ ] List recent event products

#### 🟡 S4: GUNW Displacement
**Task**: Ground displacement layer
- [ ] Only if T1.4-style checks show suitable GUNW products
- [ ] Separate specification required first

#### 🟡 S5: Live Search Panel
**Task**: Interactive NISAR discovery
- [ ] User draws bbox on map
- [ ] UI lists available NISAR acquisitions via `/api/nisar/search`
- [ ] No processing (discovery only)

---

## 📊 Summary by Priority

### 🔴 P0 - Blocking (Cannot Proceed Without)
1. **T1.4 follow-up**: Verify same-stack grid alignment and GCOV mask semantics with additional real granules

### 🟡 P1 - High Priority (Next Steps)
1. **T2.2**: Implement export.py (COG, tiles, JSON)
2. **T2.3**: Complete build-site and verify CLI
3. **T3.1**: Product-serving API endpoints
4. **T3.2**: Honest data status computation
5. **T3.3**: Gate Sentinel-1 fallback

### 🟡 P2 - Medium Priority
1. **T4.1-T4.8**: All frontend updates
2. **T2.4**: Build first real site (requires human action)

### 🟢 P3 - Stretch (After Core Complete)
1. **S1-S5**: All stretch goals

---

## 📝 Task Count Summary

| Phase | Total Tasks | Completed | Remaining | % Complete |
|-------|-------------|-----------|-----------|------------|
| Phase 0 | 3 | 3 | 0 | 100% |
| Phase 1 | 4 | 3 | 1 | 75% |
| Phase 2 | 4 | 2 | 2 | 50% |
| Phase 3 | 3 | 0 | 3 | 0% |
| Phase 4 | 8 | 0 | 8 | 0% |
| Phase 5 | 5 | 0 | 5 | 0% |
| **Total** | **27** | **8** | **19** | **29.6%** |

*Note: T2.4 requires site selection and a real-data build; T1.4 follow-up depends on additional same-stack acquisitions.*

---

## 🎯 Estimated Effort

| Task | Estimated Time |
|------|----------------|
| T1.4 follow-up (grid/mask validation) | Depends on same-stack data availability |
| T2.2 (Export) | 3-4 hours |
| T2.3 (CLI) | 4-6 hours |
| T3.1-T3.3 (API) | 4-6 hours |
| T4.1-T4.8 (Frontend) | 6-8 hours |
| **Total** | **18-26 hours** |

---

## 📌 Important Notes

1. **Live-data caveat** - The smoke test confirmed EPSG:3031 and descending Y coordinates and prompted reader fixes, but grid alignment and mask semantics still need evidence from more than one sample.

2. **All new code must have tests** - The current test suite has 100% coverage for completed tasks. Maintain this standard.

3. **Never commit secrets** - Earthdata credentials must come from environment variables or `~/.netrc` only.

4. **Phase dependencies** - Each phase depends on the previous one. Don't skip ahead.

5. **Human decisions** - Some tasks require your input (site selection, citation text, etc.). These are marked with [HUMAN].

---

## ✅ Checklist Before Event (Nov 14-15)

- [x] T1.4: Live smoke test run and `dancing-with-sars-backend/docs/nisar_file_layout.md` generated
- [ ] T1.4 follow-up: Same-stack alignment and mask semantics verified
- [ ] T2.2: Export functionality complete
- [ ] T2.3: build-site CLI complete
- [ ] T2.4: At least 1 real site built and verified
- [ ] T3.1-T3.3: API endpoints working
- [ ] T4.1-T4.8: Frontend updated
- [ ] CI passing
- [ ] All tests passing
- [ ] Demo runbook written
- [ ] Offline demo verified (no network needed for runtime)

---

## 📞 Need Help?

If any task is unclear or you need implementation details, refer to:
- `CODEX_PLAN.md` - Full specification
- `IMPLEMENTATION_STATUS.md` - Current progress
- `dancing-with-sars-backend/docs/nisar_file_layout.md` - Live smoke-test observations; some assumptions remain unverified

For coding questions, the implementation follows the specifications exactly. Each module has docstrings explaining the functionality.
