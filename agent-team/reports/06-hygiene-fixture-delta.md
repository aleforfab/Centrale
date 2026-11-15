# Report — 06-hygiene-fixture-delta — 2026-11-15

## Branch / PR / SHAs

- **Branch:** `arena/5832995f-centrale` (session-pinned active branch; switching/creating `chore/hygiene-fixture-delta` is not permitted in this session).
- **PR:** https://github.com/aleforfab/Centrale/pull/14 (draft, into `main`; not merged).
- **Base SHA:** `3a956874142f8cdadd3ff991dc8461b6ddce94ce` (`origin/main`, post-PR #13 Round 2 setup).
- **Implementation HEAD SHA:** `284a0a2021c6a7b6dfec491d01713c99ddf06a06` (subsequent commit adds only this report).

## Scope done

- **H1 — Dead frontend modules deleted (6 of 8 in list; 2 retained due to active importers/references — see below):**
  - Deleted:
    - `dancing-with-the-sars-frontend/components/DanceChart.tsx` (only imported by `TimeScrubber.tsx`, also deleted)
    - `dancing-with-the-sars-frontend/components/TimeScrubber.tsx`
    - `dancing-with-the-sars-frontend/components/ControlPanel.tsx`
    - `dancing-with-the-sars-frontend/components/AsfGranules.tsx`
    - `dancing-with-the-sars-frontend/lib/applications.ts` (only imported by `tests/applications.test.ts`, also deleted)
    - `dancing-with-the-sars-frontend/tests/applications.test.ts`
  - Post-deletion verification: `git grep -n -E "DanceChart|TimeScrubber|ControlPanel|AsfGranules|lib/applications|applications\.test" -- dancing-with-the-sars-frontend/` returns zero matches.
- **H2 — Small backend cleanups:**
  - `dancing-with-sars-backend/nisar/config.py`: removed unused `DATA_GAP_START` and `DATA_GAP_END` (confirmed zero readers outside the class via `git grep`).
  - `dancing-with-sars-backend/main.py`: removed top-level `import ee` and top-level `from services.gee_service import ...` (since `services/gee_service.py` imports `ee` at module top level). `initialize_gee` now imports lazily inside `lifespan` only when `Config.ENABLE_SENTINEL1_FALLBACK` is enabled, and `ee` + `services.gee_service` import lazily inside `_call_gee_fallback()` for the five `/api/gee/*` endpoints. Verified in a fresh Python subprocess that `import main` leaves both `ee` and `services.gee_service` absent from `sys.modules`. Fallback remains disabled by default.
  - `dancing-with-sars-backend/main.py`: replaced `allow_methods=["*"]` with explicit `allow_methods=["GET", "POST", "OPTIONS"]`, confirmed against all 17 OpenAPI routes across `main.py`, `routers/sites.py`, `routers/nisar.py`, and `routers/insar.py` (every endpoint uses exclusively `GET` or `POST`; `/products` static mount serves `GET`/`HEAD`).
- **H3 — `npm audit` (report only):**
  - Captured `cd dancing-with-the-sars-frontend && npm audit --json > /tmp/npm-audit.json`. No changes made to `package.json` or `package-lock.json` (report-only per brief & prompt). Full summary table and advisory IDs below.
- **H4 — `scripts/make_demo_site.py` origin offset + docs:**
  - Added `--origin-lon` and `--origin-lat` (both `float`, default `0.0`) to `dancing-with-sars-backend/scripts/make_demo_site.py`.
  - Default `(0.0, 0.0)` maps directly to UTM `(0.0, 0.0)` m in `EPSG:32646`, preserving byte-compatible YAML and bit-identical HDF5 coordinate datasets for existing callers and tests.
  - Non-zero origins are validated against `pyproj.CRS("EPSG:32646").area_of_use` (`90.0°E–96.0°E`, `0.0°N–84.0°N`, plus full grid NE corner check) and converted through the shared `EPSG:32646 <-> EPSG:4326` transformer (`TransformDirection.INVERSE`).
  - Threaded optional `origin_easting_m: float = 0.0` and `origin_northing_m: float = 0.0` through `tests/fixtures/make_fake_gcov.py` (`create_fake_gcov`, `create_fake_gcov_pair`) and `make_demo_site.py` (`bbox_from_grid`, `build_site_config`).
  - Created `docs/DEMO_FIXTURE_DELTA.md` covering purpose, verified `EPSG:32646` bounds, exact delta-fringe coordinates/bbox, operator commands (`make_demo_site` + `nisar.cli build-site` + `verify`), and the mandatory honesty paragraph.
- **H5 — Report-only checks & pre-delete `git grep` verification:** completed and recorded below.

## Scope not done (and why)

- **Two files from the H1 list were retained (per H1's "If you find an importer you missed, restore that file and report instead of deleting it" and CONTRACT's "deletes in H1 list only"):**
  - `dancing-with-the-sars-frontend/lib/sourceRegister.ts` — imported by `dancing-with-the-sars-frontend/tests/source-register.test.ts` (line 2), which is not in the H1 delete list and runs 10 tests.
  - `dancing-with-the-sars-frontend/public/resources/source-register.json` — imported by `dancing-with-the-sars-frontend/lib/sourceRegister.ts` (line 1) AND referenced as `DEFAULT_REGISTER` in `dancing-with-sars-backend/scripts/build_source_register.py` (line 32, documented in `README.md` lines 134–145).
  - Deleting either file without also deleting `tests/source-register.test.ts` (outside H1) would break `npm run typecheck` and `npm test`, and deleting the JSON would break `scripts/build_source_register.py`'s default path. Retained cleanly for a supervisor decision on retiring all four files + the `README.md` section together.
- **VM-side demo fixture rebuild:** explicitly out of scope; not touched.
- **`npm audit fix`:** not run — task specifies report-only (and 8 of 10 vulnerable entries require semver-major upgrades to `next@16.4.6` or `vitest@5.1.0`).
- **Branch name `chore/hygiene-fixture-delta`:** session is pinned to `arena/5832995f-centrale`; draft PR opened from the active branch.

## Files changed (`git diff --stat origin/main...HEAD` at implementation HEAD)

```text
 dancing-with-sars-backend/main.py                  | 126 ++++---
 dancing-with-sars-backend/nisar/config.py          |   6 +-
 .../scripts/make_demo_site.py                      | 120 ++++++-
 .../tests/fixtures/make_fake_gcov.py               |  17 +-
 .../tests/test_demo_script.py                      | 103 ++++++
 dancing-with-sars-backend/tests/test_site_api.py   |  46 +++
 .../components/AsfGranules.tsx                     |  62 ----
 .../components/ControlPanel.tsx                    | 212 ------------
 .../components/DanceChart.tsx                      | 116 -------
 .../components/TimeScrubber.tsx                    | 124 -------
 dancing-with-the-sars-frontend/lib/applications.ts | 376 ---------------------
 .../tests/applications.test.ts                     |  82 -----
 docs/DEMO_FIXTURE_DELTA.md                         |  89 +++++
 13 files changed, 420 insertions(+), 1059 deletions(-)
```

Plus this report: `agent-team/reports/06-hygiene-fixture-delta.md`.

## Shared files touched (ANNOUNCE list)

- **ANNOUNCE:** `dancing-with-sars-backend/tests/test_demo_script.py` — additive regression tests at EOF for default `(0, 0)` byte-compatibility, delta-fringe `--origin-lon 90.20 --origin-lat 22.35` build/verify, and out-of-zone `EPSG:32646` rejection. (Neither worker 04 nor worker 05 touches backend files.)
- **ANNOUNCE:** `dancing-with-sars-backend/tests/test_site_api.py` — additive regression tests at EOF for explicit CORS methods (`GET, POST, OPTIONS`), lazy `ee`/`services.gee_service` import, and removal of `Config.DATA_GAP_START` / `Config.DATA_GAP_END`.
- No frontend shared files (`lib/types.ts`, `lib/api.ts`, `package.json`, `package-lock.json`, `next.config.mjs`, `SiteNav.tsx`, `Map.tsx`, `app/**`) and no forbidden backend files (`live_fetch.py`, `jobs.py`, `routers/`, `nisar/insar/`) were touched.

## Pre-delete `git grep` evidence (H1 / H5)

Before deletion, `git grep` across the repository for all H1 targets and `DATA_GAP_*` showed:

```text
# Frontend code/test references to H1 targets:
dancing-with-the-sars-frontend/components/TimeScrubber.tsx:4:import type { TimeSeriesPoint } from "@/components/DanceChart";
dancing-with-the-sars-frontend/lib/applications.ts:1:import { paperFor } from "./sourceRegister";
dancing-with-the-sars-frontend/lib/sourceRegister.ts:1:import raw from "@/public/resources/source-register.json";
dancing-with-the-sars-frontend/tests/applications.test.ts:9:} from "@/lib/applications";
dancing-with-the-sars-frontend/tests/source-register.test.ts:2:import { registerIsComplete, sourceRegister as register, unverifiedPaperCount } from "@/lib/sourceRegister";

# Backend code reference to source-register.json:
dancing-with-sars-backend/scripts/build_source_register.py:32:    / "source-register.json"

# DATA_GAP_* references in code:
dancing-with-sars-backend/nisar/config.py:54:    DATA_GAP_START: str = "2026-07-27T22:03:25Z"
dancing-with-sars-backend/nisar/config.py:55:    DATA_GAP_END: str = "2026-08-10T00:55:27Z"
```

Non-code historical mentions of the deleted names remain only in docs (`CONTRIBUTING.md`, `README.md`, `REMAINING_WORK.md`, `MIGRATION_STATUS.md`, `docs/FULL_FEATURE_AUDIT.md`, `docs/IMPLEMENTATION_HANDOFF.md`, `docs/IMPLEMENTATION_VERIFICATION.md`, `dancing-with-sars-backend/docs/EODMS_SAR_DATA_SOURCE.md`, and `agent-team/briefs/*`), which are outside this slice's lane.

## Checks run (exact commands + outputs)

### 1. Frontend verification gate

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

Output:

```text
added 190 packages, and audited 191 packages in 9s

43 packages are looking for funding
  run `npm fund` for details

10 vulnerabilities (4 moderate, 3 high, 3 critical)

> typecheck
> tsc --noEmit

> test
> vitest run

 RUN  v2.1.9 /home/user/Centrale/dancing-with-the-sars-frontend

 ✓ tests/comparison.test.ts (30 tests) 10ms
 ✓ tests/time-machine.test.ts (11 tests) 24ms
 ✓ tests/source-register.test.ts (10 tests) 6ms
 ✓ tests/scan-frames.test.ts (2 tests) 10ms
 ✓ tests/live-fetch.test.ts (3 tests) 7ms
 ✓ tests/tile-url.test.ts (5 tests) 4ms
 ✓ tests/mapbox-token.test.ts (3 tests) 2ms
 ✓ tests/pages.test.tsx (2 tests) 2ms

 Test Files  8 passed (8)
      Tests  66 passed (66)

> build
> next build

  ▲ Next.js 14.2.35

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (7/7)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    6.37 kB         610 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /compare                             2.11 kB         611 kB
├ ○ /time-machine                        13.1 kB         622 kB
├ ƒ /tm/frames/[date]                    0 B                0 B
└ ƒ /tm/scan                             0 B                0 B
+ First Load JS shared by all            87.3 kB
Exit status: 0
```

### 2. Backend verification gate

```bash
cd dancing-with-sars-backend && ruff check . --output-format concise && pytest -q
```

Output (run via `.venv/bin/ruff` and `.venv/bin/pytest`):

```text
All checks passed!
........................................................................ [ 45%]
........................................................................ [ 91%]
.............                                                            [100%]
157 passed, 11 warnings in 3.69s
```

(The 11 warnings are pre-existing Pydantic `Field(..., example=...)` deprecations in `schemas.py` and a rasterio `Affine *` PendingDeprecationWarning in `test_export_site_builder.py`.)

### 3. Dry run — `--origin-lon` / `--origin-lat` and resulting WGS84 bbox

**Important geodetic note:** `pyproj.CRS("EPSG:32646").area_of_use` confirms that
`EPSG:32646` (`WGS 84 / UTM zone 46N`, central meridian `93°E`) spans
**`90.0°E–96.0°E`, `0.0°N–84.0°N`** (whereas `84°E–90°E` is UTM zone 45N /
`EPSG:32645`, and `96°E–102°E` is UTM zone 47N / `EPSG:32647`). The brief's
parenthetical noted `88.7–89.9 E` assuming zone 46N spanned `84–90 E`, while
explicitly requiring the chosen target to stay strictly inside `EPSG:32646`'s
true span (not breaking the fixture's CRS claim). Choosing
`--origin-lon 90.20 --origin-lat 22.35` places the synthetic grid on onshore
coastal delta land in Patuakhali / Barishal (Ganges–Brahmaputra–Meghna delta,
Bangladesh, just east of `90.0°E`, ~45 km north of the Bay of Bengal coast) so
every pixel of the 8 km × 8 km synthetic grid stays strictly inside
`EPSG:32646` (`90.20°E–90.28°E`, `22.35°N–22.42°N`).

Command:

```bash
cd dancing-with-sars-backend && .venv/bin/python -c '
from scripts.make_demo_site import bbox_from_grid, origin_to_utm, _utm_to_wgs84_transformer

for label, lon, lat in [
    ("default (legacy UTM 0,0)", 0.0, 0.0),
    ("delta fringe (EPSG:32646)", 90.20, 22.35),
]:
    e, n = origin_to_utm(lon, lat)
    bbox = bbox_from_grid(400, 20.0, origin_easting_m=e, origin_northing_m=n)
    t = _utm_to_wgs84_transformer()
    ne = t.transform(e + 400 * 20.0, n + 400 * 20.0)
    print(f"{label}: origin=({lon}, {lat}) -> UTM=({e:.6f}, {n:.6f}) -> grid_NE=({ne[0]:.6f}, {ne[1]:.6f}) -> bbox={bbox}")
'
```

Output:

```text
default (legacy UTM 0,0): origin=(0.0, 0.0) -> UTM=(0.000000, 0.000000) -> grid_NE=(88.582928, 0.072162) -> bbox=[88.53275770865586, 0.02164714244509917, 88.56142650985544, 0.05051198054315342]
delta fringe (EPSG:32646): origin=(90.2, 22.35) -> UTM=(211614.058633, 2474248.909013) -> grid_NE=(90.276199, 22.423515) -> bbox=[90.2228513915582, 22.372057509190025, 90.25333109458758, 22.40146354822749]
```

### 4. Local temp-dir synthetic CLI rehearsal (`make_demo_site` → `build-site` → `verify`)

```bash
TMPDIR_REHEARSAL=$(mktemp -d) && trap 'rm -rf "$TMPDIR_REHEARSAL"' EXIT && cd dancing-with-sars-backend && \
.venv/bin/python -m scripts.make_demo_site --output "$TMPDIR_REHEARSAL/demo-input" --origin-lon 90.20 --origin-lat 22.35 && \
PRODUCTS_DIR="$TMPDIR_REHEARSAL/products" CACHE_DIR="$TMPDIR_REHEARSAL/cache" .venv/bin/python -m nisar.cli build-site --config "$TMPDIR_REHEARSAL/demo-input/site.yaml" --local-dir "$TMPDIR_REHEARSAL/demo-input/granules" && \
PRODUCTS_DIR="$TMPDIR_REHEARSAL/products" CACHE_DIR="$TMPDIR_REHEARSAL/cache" .venv/bin/python -m nisar.cli verify --site demo-fixture
```

Output:

```text
Synthetic demo input created.
  granules : NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5
             NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260713T160541_20260713T160541_P05023_P_F_J_002.h5
  site file: /tmp/tmp.mSKmugaZz3/demo-input/site.yaml

This is synthetic data. The site caveat records that, and it must stay visible.

Next steps:
  python -m nisar.cli build-site --config /tmp/tmp.mSKmugaZz3/demo-input/site.yaml --local-dir /tmp/tmp.mSKmugaZz3/demo-input/granules
  python -m nisar.cli verify --site demo-fixture
Built NISAR site products at /tmp/tmp.mSKmugaZz3/products/demo-fixture
Verified site demo-fixture
2 acquisitions, 12 layers
Mission NISAR, maturity PROVISIONAL
```

### 5. `npm audit` report (H3 — report only, no lockfile changes)

Command:

```bash
cd dancing-with-the-sars-frontend && npm audit --json > /tmp/npm-audit.json
```

Severity counts (`metadata.vulnerabilities`):

| Info | Low | Moderate | High | Critical | Total |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 4 | 3 | 3 | **10** |

Per-package advisory summary:

| Package | Severity | Dependency | Advisories (GHSA) | Fix status |
| --- | --- | --- | --- | --- |
| `next` | critical | direct | `GHSA-p293-qw3h-jr36` (critical), `GHSA-2xp9-vwfh-vxw4` (critical), `GHSA-2464-fhr4-w9xw` (critical), `GHSA-h25m-26qc-wcjf` (high), `GHSA-q4gf-8mx6-v5v3` (high), `GHSA-8h8q-6873-q5fj` (high), `GHSA-c4j6-fc7j-m34r` (high), `GHSA-36qx-fr4f-26g5` (high), `GHSA-m99w-x7hq-7vfj` (high), `GHSA-89xv-2m56-2m9x` (high), `GHSA-p9j2-gv94-2wf4` (high), `GHSA-p3m5-59mp-jv5r` (high), `GHSA-9g9p-9gw9-jx7f` (moderate), `GHSA-ggv3-7p47-pfv8` (moderate), `GHSA-3x4c-7xq6-9pq8` (moderate), `GHSA-ffhc-5mcf-pf4q` (moderate), `GHSA-gx5p-jg67-6x7h` (moderate), `GHSA-h64f-5h5j-jqjh` (moderate), `GHSA-wfc6-r584-vfw7` (moderate), `GHSA-68g3-v927-f742` (moderate), `GHSA-4633-3j49-mh5q` (moderate), `GHSA-4c39-4ccg-62r3` (moderate), `GHSA-955p-x3mx-jcvp` (moderate), `GHSA-3g8h-86w9-wvmq` (low), `GHSA-vfv6-92ff-j949` (low); via `postcss` | major bump required (`next@16.4.6`) |
| `vitest` | critical | direct (dev) | `GHSA-5xrq-8626-4rwp` (critical), `GHSA-82fw-gwwq-j7x9` (moderate); via `@vitest/mocker`, `tinypool`, `vite`, `vite-node` | major bump required (`vitest@5.1.0`) |
| `tinypool` | critical | transitive (dev) | `GHSA-5gmw-xhrv-c9v3` (critical), `GHSA-85c8-ppgw-ccpr` (critical) | major bump required (`vitest@5.1.0`) |
| `postcss` | high | transitive | `GHSA-6g55-p6wh-862q` (high), `GHSA-r28c-9q8g-f849` (high), `GHSA-qx2v-qp2m-jg93` (moderate), `GHSA-fxqj-rqcc-2cmp` (moderate) | major bump required (`next@16.4.6`) |
| `source-map-js` | high | transitive | `GHSA-68fv-2mgg-jv7q` (high) | non-breaking (`npm audit fix`; not applied — report-only) |
| `vite` | high | transitive (dev) | `GHSA-587h-7wmj-h5pm` (high), `GHSA-4w7w-66w2-5vf9` (moderate), `GHSA-v6wh-96g9-6wx3` (moderate), `GHSA-698v-4r3x-3vcv` (moderate), `GHSA-r825-w8mm-5pxw` (moderate), `GHSA-rq7h-c2jc-7f22` (moderate), `GHSA-fx2h-pf6j-xcff` (moderate), `GHSA-9jrq-w75r-8gcw` (low); via `esbuild` | major bump required (`vitest@5.1.0`) |
| `@vitest/mocker` | moderate | transitive (dev) | `GHSA-82fw-gwwq-j7x9` (moderate), `GHSA-qxg6-89mg-rqv8` (moderate); via `vite` | major bump required (`vitest@5.1.0`) |
| `esbuild` | moderate | transitive (dev) | `GHSA-67mh-4wv8-2f99` (moderate) | major bump required (`vitest@5.1.0`) |
| `postcss-selector-parser` | moderate | transitive | `GHSA-rj75-hqrm-r3gf` (moderate) | non-breaking (`npm audit fix`; not applied — report-only) |
| `vite-node` | moderate | transitive (dev) | via `vite` | major bump required (`vitest@5.1.0`) |

## Honesty invariants

- **Kept.** `make_demo_site.py` preserves `CAVEAT` (*"Synthetic fixture data: not a real observation, not a real change, and not evidence of anything."*) in both default and delta-fringe modes.
- **Kept.** `docs/DEMO_FIXTURE_DELTA.md` states verbatim that the location is arbitrary, the data remains synthetic, and it is not a real observation, not a real change, and not evidence of anything about the Sundarbans, Bangladesh, or the Ganges–Brahmaputra delta.
- **Kept.** Geodetic truthfulness: `make_demo_site.py` enforces `EPSG:32646`'s true UTM zone 46N longitude span (`90.0°E–96.0°E`) rather than generating coordinates outside zone 46N while claiming `EPSG:32646`.
- **Kept.** No `/compare`, playback, InSAR, or Sentinel-1 mission semantics were altered; Earth Engine fallback stays disabled by default.
- **Kept.** No claim that the VM demo fixture has been rebuilt or that real Anak Krakatau granules have been built.

## Known gaps, follow-ups, TODOs left in code

1. **Source-register retirement decision:** `lib/sourceRegister.ts` and `public/resources/source-register.json` were kept because `tests/source-register.test.ts` and `dancing-with-sars-backend/scripts/build_source_register.py` reference them. If the maintainer wants the source register retired completely, remove all four files (`lib/sourceRegister.ts`, `public/resources/source-register.json`, `tests/source-register.test.ts`, `scripts/build_source_register.py`) and update `README.md` in a dedicated follow-up.
2. **Dependency upgrades:** Resolving the 3 critical / 3 high `next` and `vitest` advisories requires planned major upgrades (`next` 14 → 16, `vitest` 2 → 5); `postcss-selector-parser` and `source-map-js` can be cleared with a non-breaking `npm audit fix` in a dedicated `chore(deps)` PR.
3. **VM rebuild:** When ready to relocate the deployed synthetic demo fixture on the VM, follow `docs/DEMO_FIXTURE_DELTA.md` (`--origin-lon 90.20 --origin-lat 22.35`).

## What the supervisor must verify manually

1. Confirm GitHub Actions CI (`backend` and `frontend` jobs) passes on draft PR #14.
2. Review the decision to retain `lib/sourceRegister.ts` and `public/resources/source-register.json` (and whether to schedule a follow-up retiring the full source-register bundle including `tests/source-register.test.ts` and `scripts/build_source_register.py`).
3. Confirm the geodetic choice (`--origin-lon 90.20 --origin-lat 22.35`, strictly inside `EPSG:32646` `90.0°E–96.0°E`) meets the maintainer's intent for the later VM rebuild.
4. Merge in the Round 2 order (`06 → 04 → 05`) only when ready.
