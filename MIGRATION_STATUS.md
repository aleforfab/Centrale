> **SUPERSEDED — historical record.** As of 2026-11-15 this file describes an
> earlier state of the project (pre-round-2). Current truth lives in
> [`HACKATHON.md`](HACKATHON.md), [`agent-team/PLAN.md`](agent-team/PLAN.md) and
> [`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).
> Do not use the commands or claims below for decisions; do not edit to force
> agreement — read forward instead.

# Migration status: DancingWithTheSARs → Centrale

_Last updated: 2026-11-14. This file records what was actually executed._

## Status labels used here

- **Implemented**: code exists in this repository.
- **Tested on synthetic data**: passes automated tests and/or the synthetic fixture pipeline.
- **Tested on real observations**: run against real NISAR GCOV data.
- **Scientifically reviewed for this case**: a named reviewer checked interpretation, scope and limitations.
- **Deployed and externally checked**: reachable from a browser outside the VM.

No item reaches the last three labels.

## Branch and commits

| Item | Value |
| --- | --- |
| Repository | `https://github.com/aleforfab/Centrale` |
| Working branch for this session | `arena/d252cdc7-centrale` |
| Base commit (import) | `fc77dc7033fe7a3b812073220afe0f53902ccf67` |
| Fix commit | `7af1c20394aa9dbf8eece3998575b3be0d5eda86` |
| Documentation commit | `46117876687e41aa843c20f6c7ca15de5d75a90f` |
| Cloud checklist commit | `2c66f03504f665ec2fec058c6e1512896f196b76` |
| Collaboration guardrails commit | `c31a8e5cd46c9cda23038c2893292d5e0744d3b4` |
| Merged to `main` via PR #1 | merge commit `3ae4123ae8402d5295280e193ba77836ee4cbc8f` |

`main` is now the deployment baseline. Contributors branch from it; this session
branch continues to carry follow-up work for review through separate pull
requests.

`main` was not modified, and nothing was force-pushed.

## What happened to the source branch

The team confirmed that work has moved to Centrale and that nothing further will
be done in `DancingWithTheSARs`. Commit `c1200a8` was **never retrieved** by this
session: the GitHub authorization available here covers `aleforfab/Centrale` only,
and every read of the other repository returned HTTP 403 (`git clone`,
`gh api`, `api.github.com`, `codeload.github.com`).

On the team's instruction ("code everything needed yourself"), the features
described in the handoff were **written fresh in Centrale**. They are a
reimplementation from a written specification, not a copy of `c1200a8`. Treat any
future recovery of `c1200a8` as something to diff deliberately, not to merge
blindly.

## What is implemented now

| Piece | Status |
| --- | --- |
| Base backend (GCOV pipeline, CLI, API) | Implemented (imported at `fc77dc7`) |
| Base dashboard `/` | Implemented (imported), now with shared navigation |
| Applications library `/applications` | Implemented here, 12 topics |
| Capability labels | Implemented here, derived from `CASE_REVIEWS` (empty ⇒ all learning resources) |
| Before/after viewer `/compare` | Implemented here |
| Exact-date matching logic `lib/comparison.ts` | Implemented here |
| Real-case setup guide `/setup` | Implemented here, 8 gates, all "not recorded" |
| Source register (`public/resources/source-register.json`) | Implemented here, metadata partial by design |
| Register builder `scripts/build_source_register.py` | Implemented here |
| Demo generator `scripts/make_demo_site.py` | Implemented here |
| Frontend test suite (vitest, 58 tests) | Implemented here |
| Course `learning-guide/course.md` + PDF builder | Implemented here (16-page PDF generated) |
| Server-side `/api` and `/products` proxy | Implemented here (was missing) |

Details and design reasoning: [`docs/IMPLEMENTATION_HANDOFF.md`](docs/IMPLEMENTATION_HANDOFF.md).

## Verified in this session (executed, not assumed)

Environment: Python 3.11.2, Node.js 22.22.3, npm 10.9.8 (agent sandbox).

| Check | Result |
| --- | --- |
| Backend dependency install | succeeded |
| `ruff check .` | clean |
| `pytest -q` | **78 passed** |
| `npm ci` | succeeded, 8 moderate advisories (not a clean audit) |
| `npm run typecheck` | passed |
| `npm test` | **58 passed**, 4 files |
| `npm run build` | passed, 4 app routes |
| `make_demo_site` → `build-site` → `verify` | 2 acquisitions, 12 layers, verify passed |
| HTTP: `/`, `/compare`, `/applications`, `/setup`, register | all 200 |
| HTTP: proxied `/api/data-status`, `/api/sites`, `/products/...png` | 200, valid PNG |
| PDF build | 16 pages, no markup leakage in extracted text |

Full commands and caveats: [`docs/IMPLEMENTATION_VERIFICATION.md`](docs/IMPLEMENTATION_VERIFICATION.md).

## Defects found and fixed here

1. **`smooth_linear()` erased valid data.** Multiplying by the validity mask left
   `NaN` in place, so one invalid pixel blanked its whole neighbourhood: 1528 valid
   pixels dropped to 54, and one build aborted with
   `No valid pixels in time-series acquisition`. Fixed, with three regression tests.
2. **NaN reached the uint8 cast** in tile colouring, emitting a `RuntimeWarning`
   per layer. Sanitized, with a test that fails on the warning.
3. **The frontend called the backend from the browser** (`http://localhost:8000`).
   Replaced with relative URLs plus server-side rewrites to `BACKEND_URL`, which
   the VM architecture requires.
4. **CI never ran on session branches.** Now triggers on `arena/**`, and runs the
   frontend tests.

## Not done, and not implied by anything above

- No real NISAR granule has been processed into a case.
- Mask semantics, grid alignment and resampling on real data remain unverified.
- The comparison viewer has not been seen rendering real tiles with a real Mapbox
  token in a browser.
- Nothing is deployed on the Google Cloud VM. See
  [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md); every step there is still "not started".

## Scientific gaps (unchanged)

- No curated, validated real case exists.
- GCOV quality-mask semantics remain unconfirmed; mask values are preserved raw.
- Threshold sensitivity, resampling consequences and independent context are not
  established for any real scene.
- Backscatter change is a measurement difference, not a cause.

A green test suite shows the software runs. It does not validate any
interpretation of a real scene.
