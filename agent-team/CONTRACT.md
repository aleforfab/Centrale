# Agent-team contract — Centrale (supervisor: arena/3ac4203d-centrale)

Every worker session reads this file and its brief before writing code.
Workers know **only** their brief and this contract. The supervisor knows all.

## 0. Base, branches, push rules

- Base for everyone: `origin/main` @ `037f42c` (merged PR #7, 2026-11-14).
- Workers branch from it: `git switch -c <slice-branch> origin/main`.
  - worker 01: `feat/gamma-to-sigma`
  - worker 02: `feat/worldview-time-machine`
  - worker 03: `feat/insar-phase-chain`
- Never push to `main`. Never push to `arena/*` branches. Never merge your own PR.
- Open a **draft PR** into `main` when ready; the supervisor (merge captain) merges
  after CI is green and after the report below is complete.
- `git push --force-with-lease` only on your own branch; plain `--force` banned.
- Never `git add -f` ignored artifacts; never commit `.env*`, tokens, granules,
  products, tiles, `node_modules/`, `.venv/`, `.next/`, `products/`, `.cache/`.

## 1. Lane ownership (disjoint; crossing = conflict)

| Slice | Owns | Must NOT touch |
| --- | --- | --- |
| 01 normalizer | `dancing-with-sars-backend/nisar/reader.py`, `nisar/processing.py`, `nisar/site_builder.py`, new `nisar/normalize.py`, `tests/test_normalization.py`, `tests/fixtures/make_fake_gcov.py`, `dancing-with-sars-backend/docs/NORMALIZATION.md` | frontend; `live_fetch.py`, `jobs.py`, `catalog.py`, `routers/`, `main.py`, `config.py`, `cli.py` |
| 02 worldview-scan | `dancing-with-the-sars-frontend/**` (app/, components/, lib/, tests/) except root config; announces before touching `lib/types.ts`, `lib/api.ts`, `package.json` | any backend path; `next.config.mjs` rewrites (ask supervisor); `package-lock.json` by hand (banned) |
| 03 insar-chain | new `dancing-with-sars-backend/nisar/insar/` package, new `routers/insar.py`, new `tests/test_insar_*.py` + fixtures under `tests/fixtures/`, new `dancing-with-sars-backend/docs/INSAR.md`; **one announced append** to `main.py` (router include) | `nisar/reader.py`, `nisar/processing.py`, `nisar/site_builder.py`, `nisar/live_fetch.py`, `nisar/jobs.py`, `nisar/config.py` semantics (may add opt-in flags only, announced), frontend entirely |
| supervisor (this branch) | `agent-team/**`, `HACKATHON.md`, root docs, merging, CI, browser-level checks, VM runbook, final draft PR | — |

Shared-file edits by workers require an explicit "ANNOUNCE: …" line in the report
and the commit message. Unannounced shared-file edits are rejected at merge.

## 2. Honesty invariants (non-negotiable)

- Procedural/SVG frames are **never** described as real, NISAR observations,
  real change or evidence — not in UI copy, tests, docs or reports.
- Installed synthetic sites keep the caveat: *not a real observation, not a real
  change, and not evidence of anything.*
- `/compare` keeps refusing substitute dates, polarizations and difference/change-mask layers.
- Difference and change-mask layers never appear as observation/playback frames.
- Statistics are measured outputs, not causes; never "validated/scientific".
- Exact acquisition dates, polarization, product kind, source, CRID, maturity,
  granule names and provenance stay visible or reachable.
- InSAR/deformation/coherence outputs do not exist for users until the chain is
  verified end-to-end and scientifically reviewed; until then everything says
  **proposed**. Do not compute-then-hide; do not display pseudo-results.
- No claim that the Anak Krakatau case is processed/normalized/interferometric
  until real granules are built, verified and inspected on the VM.

## 3. Verification gates before hand-in (run them, paste results)

Backend slices:
```bash
cd dancing-with-sars-backend && ruff check . --output-format concise && pytest -q
```
Frontend slice:
```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```
Paste exact outputs (counts, pass/fail) into `agent-team/reports/<id>.md`.
"All green" without pasted evidence is treated as not run.

## 4. Report format — `agent-team/reports/<slice-id>.md`

```
# Report — <slice-id> — <date>
Branch / PR link / base SHA / HEAD SHA
Scope done / scope not done (and why)
Files changed (git diff --stat origin/main...HEAD)
Shared files touched (ANNOUNCE list) or "none"
Checks run (exact commands + outputs)
Honesty invariants: kept / violated (explain)
Known gaps, follow-ups, TODOs left in code
What the supervisor must verify manually
```

## 5. Merge order (supervisor decides)

01 normalizer → 03 insar-chain → 02 worldview-scan (frontend last, rebases on 01's
provenance fields when both land). CI green required. Fix-forward: revert, don't rewrite.

## 6. What workers may NOT decide (escalate in report)

- Merging, deploying, VM access, credentials, spending/downloads, repo settings.
- Changing the product questions' answers or the demo path in `HACKATHON.md`.
- Weakening any invariant in §2 for any reason.
- New dependencies (frontend or backend) without supervisor approval in the brief.
- Deleting/retiring files outside their lane.

## 7. If blocked

Stop at the last good state; commit with a clear message; push; write the blocker
and what you tried in the report; set PR draft; do not improvise around the
constraint (e.g., do not "fix" a missing credential by stubbing ASF).

## 8. Supervisor duties

Merge in order; run the full matrix (backend ruff/pytest, frontend ci/typecheck/
test/build, CLI verify on synthetic demo, browser-level check on local servers);
keep `HACKATHON.md` phase status current; open the single integration draft PR
with `CONTRIBUTING.md` sections; never merge it unless the user explicitly asks.

## Round 2 (2026-11-14) — base `origin/main` @ `94e12f0`

Supervisor branch: `arena/da6e366a-centrale`. All round-2 workers branch from
`origin/main` @ `94e12f0` after the round-2 setup PR merges (or, meanwhile,
from `origin/arena/da6e366a-centrale` read-only for the briefs). The
Sentinel-1 C-band pivot was considered and **dropped** by the maintainer —
the product stays NISAR L-band GCOV. See `skills/dancing-with-the-sars/SKILL.md`.

| Slice | Owns | Must NOT touch |
| --- | --- | --- |
| 04 map-playback-readability | `dancing-with-the-sars-frontend/components/Map.tsx`, `components/WorldviewReview.tsx`, `lib/scanFrames.ts`, `tests/scan-frames.test.ts` | `app/**`, `components/LiveScanPanel.tsx` (new, worker 05), `components/ComparisonViewer.tsx`, `next.config.mjs`, backend, package-lock |
| 05 pages-scan-controls | `dancing-with-the-sars-frontend/app/page.tsx`, `app/compare/page.tsx`, `app/time-machine/page.tsx`, **new** `components/LiveScanPanel.tsx`, `components/ComparisonViewer.tsx` (only if the availability readout needs it — ANNOUNCE), `components/SiteNav.tsx` (only with ANNOUNCE) | `Map.tsx`, `WorldviewReview.tsx`, `lib/scanFrames.ts`, `lib/tileUrl.ts`, backend, package-lock, `next.config.mjs` |
| 06 hygiene-fixture-delta | deletes in H1 list only; `dancing-with-sars-backend/nisar/config.py`, `main.py`, `scripts/make_demo_site.py`, `tests/fixtures/make_fake_gcov.py` (compat only), new `docs/DEMO_FIXTURE_DELTA.md`; `npm audit` report | `Map.tsx`, `WorldviewReview.tsx`, `app/**`, `live_fetch.py`, `jobs.py`, `routers/`, InSAR package; VM access of any kind |

Honesty invariants (§2), verification gates (§3) and report format (§4) are unchanged.

Round-2 merge order (supervisor decides): **06 → 04 → 05**. CI green per merge.
Workers report against `94e12f0`; all three re-run the full frontend/backend
matrix on their merged base in the final integration pass.

Worker CANNOT decide (unchanged, plus):

- Anything VM-side: rebuild, demo-fixture regeneration with the delta origin,
  `NEXT_PUBLIC_API_URL` removal, live-fetch operator guard design (A3).
- The havu.cc-inspired visual redesign (Track C) — needs the maintainer's
  explicit decisions (accent, paper-light, `/method` page, scope).
- Gate 2 (real Anak Krakatau build) — still awaits explicit go-ahead.
