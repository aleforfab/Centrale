> **SUPERSEDED — historical record.** As of 2026-11-15 this file describes an
> earlier state of the project (pre-round-2). Current truth lives in
> [`HACKATHON.md`](HACKATHON.md), [`agent-team/PLAN.md`](agent-team/PLAN.md) and
> [`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
> Do not use the commands or claims below for decisions; do not edit to force
> agreement — read forward instead.

# TODO - Dancing with the SARs

Quick reference for what needs to be done next.

---

## 🚨 Remaining Validation

- [ ] **T1.4: Follow up on live-data validation**
  - Smoke test is implemented and has run with Earthdata token authentication
  - Review `dancing-with-sars-backend/docs/nisar_file_layout.md`
  - Query a second granule from the same stack to verify grid alignment
  - Confirm mask bit semantics and assess the observed ~74-second remote 64×64 read

---

## 🎯 Phase 2: Processing & Export

### High Priority
- [x] **T2.2: Export Module** (`nisar/export.py`)
  - COG writing with rasterio's COG driver
  - XYZ tile rendering with rasterio and Pillow
  - JSON export and tile budget guard
  - Export and fixture integration tests

- [x] **T2.3: Build-Site CLI**
  - `python -m nisar.cli build-site --config sites/<id>.yaml`
  - Full processing pipeline
  - `--dry-run`, `--max-acquisitions`, `--local-dir` options
  - `verify` command
  - End-to-end fixture tests

- [ ] **T2.4: Build Real Site**
  - Run discover for candidate regions
  - Write `sites/<id>.yaml`
  - Run build-site and verify
  - Commit outputs

---

## 🎯 Phase 3: API

### High Priority
- [x] **T3.1: Product Endpoints** (`routers/sites.py`)
  - `GET /api/sites`
  - `GET /api/sites/{id}`
  - `GET /api/sites/{id}/timeseries`
  - StaticFiles at `/products`
  - Pydantic models, 404 with valid IDs, CORS
  - Tests with TestClient

- [x] **T3.2: Honest Data Status**
  - Dynamic `nisar_ready` from PRODUCTS_DIR
  - Update `/api/data-status` and `/health`
  - Remove hardcoded False

- [x] **T3.3: Gate Fallback**
  - GEE routes return 404 unless `ENABLE_SENTINEL1_FALLBACK=true`
  - Add `GET /api/nisar/search` endpoint
  - Fix `asf_service.py` with `search_nisar_granules()`
  - 503 (not 500) on ASF unreachable

---

## 🎯 Phase 4: Frontend

### All require Phase 3 completion

- [x] **T4.1**: `lib/types.ts` + `lib/api.ts` - Typed client
- [x] **T4.2**: Replace `studySettings` with `GET /api/sites`
- [x] **T4.3**: Generic manifest-backed layer system with synchronized overlay toggles in Map.tsx
- [x] **T4.4**: Time series, acquisition selection, data-gap shading, and cycle annotations
- [x] **T4.5**: Pair statistics and consistent colors (blue=decrease, red=increase)
- [x] **T4.6**: Provenance (header badge, granule links, attribution)
- [x] **T4.7**: Loading/empty/error states, token handling, responsive layout
- [x] **T4.8**: `docs/DEMO_RUNBOOK.md`

---

## 🎯 Phase 5: Stretch (After Core)

- [ ] **S1**: Click-to-chart (pixel time series)
- [ ] **S2**: 2-3 additional sites
- [ ] **S3**: Urgent Response mode
- [ ] **S4**: GUNW displacement (if data available)
- [ ] **S5**: Live search panel

---

## 📊 Progress

| Phase | Complete | Remaining |
|-------|----------|-----------|
| 0 | ✅ 3/3 | 0 |
| 1 | ✅ 3/4 | 1 (T1.4 follow-up) |
| 2 | ✅ 3/4 | 1 (human-approved real site) |
| 3 | ✅ 3/3 | 0 |
| 4 | ✅ 8/8 | 0 |
| 5 | ⏸️ 0/5 | 5 |
| **Total** | **20/27** | **7** |

---

## 🎯 Next Action

**Next:** choose and approve a real study region/pair, then build and verify its products. Separately, complete same-stack grid, mask, and remote-performance validation.

---

## 📚 Documentation

- Full specs: `CODEX_PLAN.md`
- Current status: `IMPLEMENTATION_STATUS.md`
- Detailed breakdown: `REMAINING_WORK.md`
