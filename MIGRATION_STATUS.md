# Migration status: DancingWithTheSARs → Centrale

_Last updated: 2026-11-14. This file records what was actually executed, not what was planned._

## Status labels used here

- **Implemented**: code exists in this repository.
- **Tested on synthetic data**: passes automated tests and/or the synthetic fixture pipeline.
- **Tested on real observations**: run against real NISAR GCOV data.
- **Scientifically reviewed for this case**: a named reviewer checked interpretation, scope and limitations.
- **Deployed and externally checked**: reachable from a browser outside the VM.

No item in this repository currently reaches the last three labels.

## Branch and commits

| Item | Value |
| --- | --- |
| Repository | `https://github.com/aleforfab/Centrale` |
| Working branch for this session | `arena/d252cdc7-centrale` |
| Base commit (import) | `fc77dc7033fe7a3b812073220afe0f53902ccf67` |
| Fix commit on top of it | `7af1c20394aa9dbf8eece3998575b3be0d5eda86` |

`main` was not modified, and nothing was force-pushed.

## What Centrale already contained

Commit `fc77dc7` ("Import complete Dancing with the SARs project into Centrale")
imported the **base application**:

- Backend: FastAPI service, `nisar/` processing package, `routers/`, `services/`,
  `scripts/live_smoke_nisar.py`, committed synthetic `.h5` fixtures, 8 test files.
- Frontend: Next.js dashboard, `components/Map.tsx`, `DanceChart.tsx`,
  `ControlPanel.tsx`, `TimeScrubber.tsx`, `AsfGranules.tsx`, `lib/api.ts`, `lib/types.ts`.
- Docs: `README.md`, `IMPLEMENTATION_STATUS.md`, `REMAINING_WORK.md`, `TODO.md`,
  `dancing-with-sars-backend/docs/`.

So Centrale is **not** an empty repository, and the base pipeline is present here.
It is also **not** a copy of source commit `c1200a8`; see the gap list below.

## Verified in this session (executed, not assumed)

Environment: Python 3.11.2, Node.js 22.22.3, npm 10.9.8 (agent sandbox).

| Check | Command | Result |
| --- | --- | --- |
| Backend dependency install | `pip install -r requirements.txt -r requirements-dev.txt` | succeeded |
| Backend tests | `pytest -q` | **72 passed** (69 before this session's 3 new tests) |
| Backend lint | `ruff check .` | clean |
| Frontend install | `npm ci` | succeeded, 8 moderate advisories reported |
| Frontend type check | `npm run typecheck` | passed |
| Frontend production build | `npm run build` | passed (2 routes: `/`, `/_not-found`) |
| Synthetic site build | `python -m nisar.cli build-site --config ... --local-dir ...` | built 2 acquisitions, 12 layers |
| Synthetic verify | `python -m nisar.cli verify --site demo-fixture` | passed |
| Product API | `curl` on `/health`, `/api/data-status`, `/api/sites`, `/api/sites/{id}`, `/timeseries`, tile PNG | all 200; `nisar_ready: true`; valid PNG signature |

The synthetic rehearsal output lives under a scratch directory and is **not**
committed. It is a software rehearsal only: the fixture's own caveat states that
it is not a real observation, not a real change, and not evidence of anything.

## Defect found and fixed in this session

`smooth_linear()` claimed to be NaN-aware but multiplied the power array by the
validity mask before the boxcar sum. `NaN * 0` is `NaN`, so one invalid pixel
erased every pixel in its neighbourhood.

Observed on the committed fixture with a 3×3 kernel and ~5% scattered invalid
pixels: 1528 valid pixels collapsed to 54, and a two-polarization build failed
with `No valid pixels in time-series acquisition 2026-07-13`. This matters
beyond the fixture, because real GCOV products are masked and sparse validity is
the normal case.

The fix replaces invalid pixels with `0.0` before filtering, uses a
`where`-guarded normalized mean, and keeps all-invalid windows as `NaN` rather
than turning them into plausible-looking zero backscatter. Three regression
tests were added; the previous test only asserted that the call did not crash.

CI also now runs on `arena/**` branches. It previously ran only on `main`, so
session branches were never tested.

## Blocking issue: source branch not reachable from this session

The GitHub connection used by this session is authorized for `aleforfab/Centrale`
only. Every attempt to read the source repository failed:

```
git clone https://github.com/aleforfab/DancingWithTheSARs.git
  remote: Write access to repository not granted. (HTTP 403)

gh api repos/aleforfab/DancingWithTheSARs
  Resource not accessible by integration (HTTP 403)

curl https://api.github.com/repos/aleforfab/DancingWithTheSARs   -> 403
curl https://codeload.github.com/aleforfab/DancingWithTheSARs/tar.gz/... -> 404
```

So commit `c1200a8` and branch `arena/5ae22002-dancingwiththesars` have **not**
been retrieved, and nothing from that branch has been copied into Centrale.

### Missing compared with source commit `c1200a8`

Frontend:

- `app/applications/page.tsx` (12-topic applications library), absent.
- `app/compare/page.tsx` and `lib/comparison.ts` (before/after viewer), absent.
- `app/setup/page.tsx` (real-case setup guide), absent.
- `public/resources/source-register.json`, absent.
- Comparison mode in `components/Map.tsx`, absent (file is 166 lines here).
- Frontend test harness (33 tests in 5 files) and its dev dependencies, absent.

Backend:

- `scripts/make_demo_site.py` (synthetic demo input generator referenced by the
  planned VM rehearsal), absent.
- Backend test count is 72 here versus 131 reported for the source branch, so
  test coverage added on that branch is missing too.

Documentation and course:

- `docs/IMPLEMENTATION_HANDOFF.md`, `docs/IMPLEMENTATION_VERIFICATION.md`, absent.
- `learning-guide/course.md`, `build_pdf.py`, and the 42-page PDF, absent.

## VM deployment: not started

Nothing has been installed on the Google Cloud VM from Centrale. The VM state
recorded in the handoff (Debian 13, x86_64, 50 GB resized disk, no attached
service account) is unchanged by this session.

Planned commands are in [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md) once the code
migration is complete. Do not run deployment steps against a partial tree.

## Scientific gaps (unchanged by this session)

- No curated real NISAR case exists.
- GCOV quality-mask semantics remain unconfirmed; mask values are preserved raw.
- Same-stack grid alignment across real acquisitions is unverified.
- Threshold sensitivity, resampling consequences and independent context are
  not established.
- Backscatter change is a measurement difference, not a cause.

A green test suite shows the software runs. It does not validate any
interpretation of a real scene.
