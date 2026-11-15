# Brief 02 — Time Machine: real live fetch + Worldview-style UI (frontend)

> Historical brief. On 2026-11-15 the procedural scan routes and standalone player were removed. The current page uses installed manifests for exact-date playback and offers live fetch as an explicit action.

Branch: `feat/worldview-time-machine` from `origin/main` @ `037f42c`. Read
`agent-team/CONTRACT.md` first; it binds. Repo: `aleforfab/Centrale`.

## Why

The 2026-11-14 audit found that the then-current Time Machine used local
procedural SVG routes. That implementation was retired on 2026-11-15. The
current page loads installed site manifests, plays exact dated backscatter
observations, and provides backend live fetch as an explicit action.

## Facts on the ground

- Next.js rewrites: browser `/api/*` and `/products/*` → FastAPI (`BACKEND_URL`),
  server-side; the browser never learns the backend address. Keep that.
- Backend API (on main now): `POST /api/nisar/fetch`
  `{site_id?, bbox, start_date, end_date, polarizations[], maturity?, max_bytes?}`
  (see `dancing-with-sars-backend/routers/nisar.py` + `docs/LIVE_FETCH.md` —
  **read them first**, the exact request/response schema and job states are
  defined there; do not invent fields). `GET /api/nisar/fetch/jobs`,
  `GET /api/nisar/fetch/jobs/{job_id}`, `POST .../cancel`. Without Earthdata
  credentials the fetch returns `503` with credential guidance; present this
  as a blocked state.
- Job states include: queued, running, succeeded, failed, cancelled — plus
  credential/size-limit error surfacing from the job payload and `ENABLE_LIVE_FETCH`.
- On success the site manifest lists layers; only `kind: "backscatter"` layers
  may become observation/playback frames. Difference and change-mask layers stay
  out of playback (CONTRACT §2).
- Exact acquisition dates for the Anak Krakatau stack (do not invent others):
  2026-08-13, 2026-08-25, 2026-09-06, 2026-09-18, 2026-09-30 (ascending track
  028→032 / frame 010, HH+HV, PROVISIONAL, ~12-day repeat). Calendar inputs must
  accept only exact installed dates; refusal rules stay.
- Existing code to read first: `app/tm/scan/route.ts`, `lib/timeMachine.ts`,
  `app/time-machine/page.tsx`, `app/compare/page.tsx`,
  `components/ComparisonViewer.tsx`, `components/Map.tsx`, `lib/api.ts`,
  `lib/types.ts`, `tests/time-machine.test.ts`, `tests/pages.test.tsx`,
  `tests/mapbox-token.test.ts`.

## Tasks

1. **Live fetch client** (`lib/liveFetch.ts`, new): typed client for
   `POST /api/nisar/fetch`, job polling with backoff (queued/running/succeeded/
   failed/cancelled), credential/size-limit error mapping, cancel support.
   Mirror backend types exactly; append new interfaces to `lib/types.ts` only
   (additive — announce in report).
2. **Scan flow rework** (`app/tm/scan/route.ts` + `lib/timeMachine.ts`):
   - Time Machine scan calls FastAPI through `/api/*` (same-origin), not the
     procedural generator, **when the backend reports live fetch is available**.
     Availability check = lightweight `GET /api/nisar/fetch/jobs`-style probe or
     the data-status endpoint; pick what `docs/LIVE_FETCH.md` documents; do not add
     a new backend endpoint.
   - Poll until terminal state; then fetch the built site manifest and timeseries
     (`/api/sites/<id>/...`) to obtain real layers and dates.
   - Deep-link the resulting site into the Time Machine view (router navigation or
     shared state — pick the pattern the codebase already uses).
   - The procedural `/tm/scan` route and demo fallback were removed on
     2026-11-15. The current implementation uses installed manifests for playback.
3. **Manifest → raster frames adapter** (`lib/scanFrames.ts`, new):
   - Input: site manifest; Output: ordered frames `{date, layers: kind=backscatter
     raster tiles (XYZ template URL), polarization, granule, crid, maturity, source}`.
   - Exclude `difference` and `change-mask` kinds entirely.
   - Preserve exact 12-day ordering; no interpolated frames.
4. **Worldview-inspired time UI** (`app/time-machine/page.tsx` +
   `components/…`): play/pause timeline stepping through the exact stack dates;
   frame counter with date/polarization/track/frame; before-event / event /
   month-after framing around 2026-09-06; a calendar preset row
   (Aug 13 / Aug 25 / Sep 6 / Sep 18 / Sep 30); a before/after view with
   date pickers + reveal slider (reuse `/compare` mechanics; slider-only reveal;
   locked cameras). Plain language; progressive disclosure for granule/CRID/provenance.
5. **States**: queued / running (with progress + cancel) / succeeded / failed /
   cancelled / credential-error ("Earthdata credentials are not configured on the
   backend — see docs/LIVE_FETCH.md") / size-limit exceeded; display only
   backend-reported progress.
6. **Acquisition details**: show dates, polarization, product kind, CRID,
   maturity, granule names and ASF/NASA Earthdata source in the provenance panel.
7. Optional (only if green early): retire dead modules audit listed —
   `components/DanceChart.tsx`, `TimeScrubber.tsx`, `ControlPanel.tsx`,
   `AsfGranules.tsx`, `lib/applications.ts`, `lib/sourceRegister.ts`,
   `public/resources/source-register.json` — **only if nothing references them**;
   update/remove their standalone tests; list in report. Skip if any doubt.

## Hard rules

- No backend changes. No new dependencies without supervisor approval (a polling
  client needs none). `package-lock.json` regenerate only via `npm install` if
  `package.json` changes (announce first).
- Keep `/compare` calendar-date refusal semantics and slider-only reveal intact.
- Keep `/applications`, `/setup` retired (404). Keep nav to Dashboard / Before-after / Time Machine.
- No Mapbox token changes; keep using `lib/mapboxToken.ts`.
- Playback uses only `kind: "backscatter"` layers; never difference/change-mask.
- Typecheck/tests/build must pass; update the report with the current test count
  and retain coverage for date selection and manifest-backed playback.

## Done when

`npm ci && npm run typecheck && npm test && npm run build` all green (paste
output); a screenshot-worthy description of manifest-backed Time Machine playback;
report at `agent-team/reports/02-worldview-scan.md` pushed with the branch.
Verification here is frontend build + tests only — the real end-to-end ASF build
is a VM step and is out of scope; do not claim otherwise.
