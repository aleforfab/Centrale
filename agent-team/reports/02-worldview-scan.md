# Report — 02-worldview-scan — 2026-11-14

## Branch / PR / SHAs

- Branch: `arena/7f70de26-centrale` (session-pinned active branch). The brief names `feat/worldview-time-machine`, but that branch is not the active session branch; branch switching/creation is not permitted in this session. Work remains on the pinned branch.
- PR: https://github.com/aleforfab/Centrale/pull/8 (draft, into `main`; from the pinned active branch).
- Base SHA: `037f42c1e6156d6ec92ebd6d46cb058ec522cc21` (`origin/main`).
- Implementation/test HEAD SHA: `dc3456bc66516f4fc3fbcb68e3f0e45b660ef6e2` (subsequent commits add only this report and the PR link).

## Scope done

- Replaced Time Machine's default procedural scan with an explicit same-origin live-fetch flow. Availability comes from the documented `/api/data-status` `live_fetch_enabled` field. Fetch request uses only backend-supported fields: selected bbox, 2026-08-13 through 2026-10-01, `PROVISIONAL`, `HH` + `HV`, `max_granules: 6`, and `refresh: false`.
- Added typed `lib/liveFetch.ts` for availability, enqueue/cache-hit handling, job polling, cancellation, manifest loading and credential/size-limit error mapping. Poll status/progress comes from the backend; no progress is fabricated.
- Added `lib/scanFrames.ts`: produces ordered frames only from `kind: "backscatter"` layers and only for the five requested Anak Krakatau dates. Difference/change-mask layers and other dates cannot enter playback. Per-frame provenance is joined from acquisition records and source metadata.
- Added a Worldview-inspired review: exact-date timeline, play/pause and frame count, before/event/month-after framing around 2026-09-06, five fixed date presets with absent dates disabled, and exact-date before/after comparison through the existing slider-only `ComparisonViewer` (camera sync retained).
- Added progressive “Exact acquisitions and provenance” disclosure with date, polarization, product kind, CRID, maturity, source and granule.
- Procedural `/tm/scan` remains available only through the explicitly labeled “Optional demo visualization (procedural, not observations)” disclosure, with the full required warning.
- Fixed same-origin raster URL resolution in `components/Map.tsx` when `NEXT_PUBLIC_API_URL` is unset; tile requests use the page origin.
- Added live-fetch client and frame-adapter tests.

## Scope not done / why

- No real ASF/Earthdata fetch or end-to-end product build was run. The brief places that credentialed, multi-GB operation on the VM; this frontend hand-in does not claim it succeeded.
- The specified feature branch name could not be used because this session is pinned to `arena/7f70de26-centrale`; the draft PR originates from that active branch.

## Files changed

`git diff --stat origin/main...HEAD` at implementation HEAD:

```text
 .../app/time-machine/page.tsx                      | 588 ++++++++-------------
 dancing-with-the-sars-frontend/components/Map.tsx  |   4 +-
 .../components/WorldviewReview.tsx                 | 161 ++++++
 dancing-with-the-sars-frontend/lib/liveFetch.ts    | 115 ++++
 dancing-with-the-sars-frontend/lib/scanFrames.ts   |  47 ++
 dancing-with-the-sars-frontend/lib/types.ts        |   1 +
 .../tests/live-fetch.test.ts                       |  45 ++
 .../tests/scan-frames.test.ts                      |  47 ++
 8 files changed, 631 insertions(+), 377 deletions(-)
```

## Shared files touched

- **ANNOUNCE:** `dancing-with-the-sars-frontend/lib/types.ts` — additive optional `DataStatus.live_fetch_enabled` field, matching `/api/data-status`.
- No `lib/api.ts`, `package.json`, lockfile, backend, `next.config.mjs`, or token changes.

## Checks run

Command (from `dancing-with-the-sars-frontend`):

```bash
npm ci && npm run typecheck && npm test && npm run build
```

Exact verification summary from the successful run:

```text
npm ci: added 190 packages; audited 191 packages; 10 vulnerabilities (4 moderate, 3 high, 3 critical)

> typecheck
> tsc --noEmit

> test
> vitest run
Test Files  8 passed (8)
     Tests  70 passed (70)

> build
> next build
✓ Compiled successfully
✓ Generating static pages (7/7)
Routes generated: /, /_not-found, /compare, /time-machine, /tm/frames/[date], /tm/scan
Exit status: 0
```

`git diff --cached --check` also passed before commit.

## Honesty invariants

- **Kept.** Demo mode always carries “not NISAR observations, not a real change, not evidence of anything.”
- **Kept.** Real mode labels the maturity as provided by the manifest (including `PROVISIONAL`) and does not claim validation or scientific review.
- **Kept.** Playback adapter accepts only exact dated `backscatter` layers and filters to the five specified dates; no interpolated/substitute dates, difference layers or change masks.
- **Kept.** Date selection refuses a date not present in the manifest for the selected polarization. Before/after uses the existing exact-observation comparison and slider-only reveal behavior.
- **Kept.** Live failures, credentials, size limit and cancellation are distinct from successful frames; only backend-reported progress is shown.

## Screenshot-worthy description

- **Real mode:** a dark map-first view with the current exact NISAR raster, a five-stop date strip, animation controls, frame/date/polarization/track-frame labels, an exact-date reveal comparison, and an expandable acquisition provenance table. Missing dates are visibly unavailable, not filled in.
- **Demo mode:** an opt-in procedural SVG review, visibly preceded by the full simulation caveat and labeled as a demo; it is never substituted for the live scan.

## Known gaps / follow-ups

- A backend success and real built manifest are needed to inspect actual tiles, track/frame fields, and provenance content. The frontend correctly presents the blocked credential state when backend preconditions reject the request.
- `npm ci` reports 10 existing dependency audit findings; dependency changes were not made as part of this slice.
- Missing expected acquisitions remain disabled in the preset strip by design.

## What the supervisor must verify manually

1. Configure Earthdata credentials on the VM and run the bounded live fetch; confirm successful backend manifest/tile responses and the exact expected acquisition dates.
2. Inspect a credential-free run for the documented `503` guidance; inspect disabled-live-fetch behavior and cancel a queued/running job.
3. Check raster tiles in the deployed same-origin proxy, test the before/after camera lock and reveal slider, and confirm the expanded granule/CRID/maturity provenance against the returned manifest.
4. Confirm the draft PR is from this active session branch and merge only under the supervisor's integration plan.
