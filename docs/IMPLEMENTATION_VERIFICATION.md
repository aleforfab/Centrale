# Implementation verification record

Every line below was produced by running the command shown, on 2026-11-14, in the
agent sandbox (Python 3.11.2, Node.js 22.22.3, npm 10.9.8). It is not a report
about the Google Cloud VM, where none of this has been run yet.

## Executed results

### Backend

```bash
cd dancing-with-sars-backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/ruff check .
.venv/bin/python -m pytest -q
```

| Command | Result |
| --- | --- |
| dependency install | succeeded |
| `ruff check .` | `All checks passed!` |
| `pytest -q` | **78 passed**, 11 warnings (4 Pydantic deprecation, rasterio matrix-multiply, others in deps) |

The 11 warnings are in dependencies and pre-existing schema code, not in the new
work.

### Synthetic pipeline rehearsal

```bash
python -m scripts.make_demo_site --output /tmp/sars3/demo-input
PRODUCTS_DIR=/tmp/sars3/products CACHE_DIR=/tmp/sars3/cache \
  python -W error::RuntimeWarning -m nisar.cli build-site \
  --config /tmp/sars3/demo-input/site.yaml --local-dir /tmp/sars3/demo-input/granules
PRODUCTS_DIR=/tmp/sars3/products python -m nisar.cli verify --site demo-fixture
```

| Step | Result |
| --- | --- |
| demo input generation | 2 granules, `site.yaml` written |
| `build-site` | `Built NISAR site products at /tmp/sars3/products/demo-fixture` |
| `verify` | `Verified site demo-fixture` · `2 acquisitions, 12 layers` · `Mission NISAR, maturity PROVISIONAL` |
| product size | 1.2 MB for the fixture (400 px, two polarizations) |

Built with `-W error::RuntimeWarning`, so a NaN-cast warning would have failed the
build. It did not.

### Frontend

```bash
cd dancing-with-the-sars-frontend
npm ci
npm run typecheck
npm test
NEXT_PUBLIC_MAPBOX_TOKEN=dummy npm run build
```

| Command | Result |
| --- | --- |
| `npm ci` | succeeded; **8 moderate advisories** reported by `npm audit` (not a clean audit) |
| `npm run typecheck` | passed |
| `npm test` | **58 passed** across 4 files |
| `npm run build` | succeeded; routes `/`, `/compare`, `/applications`, `/setup`, `/_not-found` |

### HTTP checks against the running app

Backend on `127.0.0.1:8000`, Next dev on `0.0.0.0:3000` with
`BACKEND_URL=http://127.0.0.1:8000` and no Mapbox token.

| Request | Result |
| --- | --- |
| `GET /` | 200 |
| `GET /compare` | 200 |
| `GET /applications` | 200 |
| `GET /setup` | 200 |
| `GET /resources/source-register.json` | 200 |
| `GET /api/data-status` (proxied) | 200, `nisar_ready: true` |
| `GET /api/sites` (proxied) | 200, one site |
| `GET /products/.../1/1/0.png` (proxied) | 200, 334 bytes, valid PNG signature |

This proves the same-origin proxy works end to end for JSON and raster tiles.

## Defects found and fixed during this session

### 1. `smooth_linear()` erased valid data around invalid pixels

`power * valid` was computed before the boxcar filter. `NaN * 0` is `NaN`, so one
invalid pixel poisoned its whole neighbourhood.

Measured on the committed fixture (400 px grid, ~5% invalid pixels, 3×3 kernel):
valid pixels dropped from 1528 to 54 in one acquisition, and in another the
count reached 0, which aborted the build with
`No valid pixels in time-series acquisition 2026-07-13`.

Now invalid pixels are replaced with `0.0` before filtering, the mean is computed
with a `where` guard, and windows with no valid pixels stay `NaN` rather than
becoming plausible-looking zeros. Three regression tests added; the old test only
asserted that the call did not crash.

### 2. NaN reached the uint8 cast in `_colourize()`

`render_tiles()` emitted `RuntimeWarning: invalid value encountered in cast` for
every layer containing gaps. The alpha channel was already correct, so the visual
defect was limited, but the cast was undefined behaviour. Now sanitized with
`nan_to_num`, with a test that fails on the warning.

### 3. Frontend called the backend from the browser

`lib/api.ts` defaulted to `http://localhost:8000`, and `next.config.mjs` had no
rewrites. On the VM that means the browser tries to reach loopback on the user's
machine. Fixed with relative URLs plus server-side rewrites to `BACKEND_URL`.

### 4. CI never ran on session branches

`.github/workflows/ci.yml` triggered only on `main` and `pull_request`. Branches
named `arena/**` were never tested. Added, along with a frontend test step and
removal of the now-wrong `NEXT_PUBLIC_API_URL` build variable.

## What was NOT verified

| Claim | Status |
| --- | --- |
| Real NISAR GCOV processing end to end | **Not verified.** No real granule has been read here. |
| Mask bit semantics | **Not verified.** Values preserved raw. |
| Same-stack grid alignment on real data | **Not verified.** |
| Comparison viewer rendering real tiles with a Mapbox token | **Not verified.** Logic is unit-tested; map rendering was only exercised without a token. |
| Browser-based visual check of `/compare` with imagery | **Not verified.** The sandbox rendered the page, not the tiles. |
| Google Cloud deployment | **Not started.** |
| Scientific interpretation of any scene | **Not attempted.** |

## Acceptance record template

Copy this into a new section when a real case is reviewed. Do not fill it in
advance.

```text
Case id:
Site id / bbox:
Granules (verbatim, one per line):
Pair dates:
Polarization and thresholds inspected:
Products built at commit:
`verify` output:
Reviewer name and relevant background:
Scope of the review (what was checked):
Mask / validity policy applied and why:
Grid alignment evidence:
Threshold sensitivity result:
Independent context used (source, date):
Statements supported as observations:
Statements that remain hypotheses:
Known limitations accepted:
Date:
```

A filled template supports one case. It does not validate the topic, the
pipeline, or any other site.

---

## 2026-11-15 — Round 3 integration verification (fresh detached worktree of `origin/main` @ `25878e4`)

Executed in the agent sandbox; **not** the VM. Nothing below is a browser-pixel
claim. Environment: Node.js 22.22.3, npm 10.9.8, Python 3.13 venv (Linux).

### Frontend

```bash
cd dancing-with-the-sars-frontend
npm ci
npm run typecheck   # clean, 0 errors
npm test            # Test Files 9 passed (9) · Tests 65 passed (65)
npm run build       # OK — routes: / (619 kB), /compare (618 kB), /time-machine (623 kB),
                    # /method (96 kB, 194 B page JS), /_not-found (custom 404),
                    # /tm/scan + /tm/frames/[date] were present in this historical build; removed 2026-11-15
```

Test-count movement is explained by intentional deletions: `applications.test.ts`
(round 2) and `source-register.test.ts` (round 3, 10 tests) retired with their
dead modules; `live-scan-panel.test.tsx` added in round 2. No unexplained loss.

### Backend

```bash
cd dancing-with-sars-backend
pip install -r requirements.txt -r requirements-dev.txt
ruff check .        # All checks passed!
pytest -q           # 157 passed, 11 warnings (dependency warnings, pre-existing)
```

### SSR smoke (production build, `next start` on 127.0.0.1:3100)

| Request | Status | Marker content present |
| --- | --- | --- |
| `/` | 200 | masthead wordmark, `NISAR · L-band · GCOV`, `/method` link, PROVISIONAL copy |
| `/compare` | 200 | diptych headers, dates, colophon slot |
| `/time-machine` | 200 | field-log chrome, live-scan panel |
| `/method` | 200 | method summary; `P05023`, PROVISIONAL, Gate 2 marked not executed, InSAR marked proposed |
| `/definitely-not-a-page` | 404 | `PAGE NOT IN THE CATALOGUE` plate |

### Explicitly NOT verified

- Any browser rendering; Mapbox basemap/raster/footprint/ScaleControl pixels.
- Playback frame-swap without flash (round-2 fix) in a live browser.
- The deployed site (`https://dancing-sars.duckdns.org/`) — VM still serves an older build.
- Real NISAR granules; Gate 2 (Anak Krakatau) remains unexecuted; InSAR unverified.
- Google Fonts runtime `@import` behavior with client network restrictions.
- Mapbox token restrictions/quotas.

**Merging is not deploying.** The VM rebuild per `DEPLOYMENT_VM.md` (post-merge
rebuild section, 2026-11-15) is required before the rebrand or the map fix are
visible publicly.
