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

## 2. Verification gates before hand-in (run them, paste results)

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

## 3. Report format — `agent-team/reports/<slice-id>.md`

```
# Report — <slice-id> — <date>
Branch / PR link / base SHA / HEAD SHA
Scope done / scope not done (and why)
Files changed (git diff --stat origin/main...HEAD)
Shared files touched (ANNOUNCE list) or "none"
Checks run (exact commands + outputs)
Known gaps, follow-ups, TODOs left in code
What the supervisor must verify manually
```

## 4. Merge order (supervisor decides)

01 normalizer → 03 insar-chain → 02 worldview-scan (frontend last, rebases on 01's
provenance fields when both land). CI green required. Fix-forward: revert, don't rewrite.

## 5. What workers may NOT decide (escalate in report)

- Merging, deploying, VM access, credentials, spending/downloads, repo settings.
- Changing the product questions' answers or the demo path in `HACKATHON.md`.
- New dependencies (frontend or backend) without supervisor approval in the brief.
- Deleting/retiring files outside their lane.

## 6. If blocked

Stop at the last good state; commit with a clear message; push; write the blocker
and what you tried in the report; set PR draft; do not improvise around the
constraint (e.g., do not "fix" a missing credential by stubbing ASF).

## 7. Supervisor duties

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

Verification gates and report format below apply to all rounds.

Round-2 merge order (supervisor decides): **06 → 04 → 05**. CI green per merge.
Workers report against `94e12f0`; all three re-run the full frontend/backend
matrix on their merged base in the final integration pass.

Worker CANNOT decide (unchanged, plus):

- Anything VM-side: rebuild, demo-fixture regeneration with the delta origin,
  `NEXT_PUBLIC_API_URL` removal, live-fetch operator guard design (A3).
- The havu.cc-inspired visual redesign (Track C) — needs the maintainer's
  explicit decisions (accent, paper-light, `/method` page, scope).
- Gate 2 (real Anak Krakatau build) — still awaits explicit go-ahead.

## Round 3 (2026-11-15) — base `origin/main` @ `7333923`

Supervisor branch: `arena/09542992-centrale`. All round-3 workers branch from
`origin/main` @ `7333923` (round 2 merged: PRs #14/15/16). **Read
`docs/REDESIGN_GUIDE.md` before any code — it is part of this contract.**
Round 2 follow-through: worker 05's reported "playback limited to five fixed
Krakatau dates" was stale — `scanFrameDates` on `main` derives presets from the
manifest and `isKrakatauSite` gates eruption copy. Do not re-open.

| Slice | Owns | Must NOT touch |
| --- | --- | --- |
| 07 design-foundation | `app/globals.css`, `app/redesign.css` (full rewrite, class names stable), `app/layout.tsx`, `components/AppShell.tsx`, `components/SiteNav.tsx`, `components/RegionSelector.tsx`, `components/LiveScanPanel.tsx` (restyle only) | `app/page.tsx`, `app/compare/page.tsx`, `app/time-machine/**`, `components/Map.tsx`, `WorldviewReview.tsx`, `TimeReview.tsx`, `ComparisonViewer.tsx`, backend, package files |
| 08 dashboard-compare-plate | `app/page.tsx`, `app/compare/page.tsx`, `components/Map.tsx` (chrome only, API unchanged), `components/ComparisonViewer.tsx` | all of 07; `app/time-machine/**`; `WorldviewReview.tsx`, `TimeReview.tsx`; backend; package files; `layout.tsx` |
| 09 timemachine-method-plate | `app/time-machine/page.tsx`, `components/WorldviewReview.tsx`, `components/TimeReview.tsx`, **new** `app/method/page.tsx`, **new** `app/not-found.tsx`, `tests/source-register.test.ts` (delete), `lib/sourceRegister.ts` (delete), `README.md` (register section reword only), plus **one announced append** `SiteNav.tsx` (+`/method` link) | `globals.css`, `redesign.css`, `layout.tsx`, `Map.tsx`, `app/page.tsx`, `app/compare/page.tsx`, `ComparisonViewer.tsx`, all backend paths, package files |

Verification gates and report format below apply to all rounds.
**No new dependencies. No build-time font fetch** (runtime `@import` only).
CSS variable names are fixed by REDESIGN_GUIDE §3.

Merge order: **07 → 09 → 08**. 09 rebases onto 07; 08 rebases onto 07+09.
Workers report against `7333923` and re-run the full matrix on newer merged
bases when asked.

Cannot decide (unchanged): token values/names, merge, VM access, deployment,
Gate 2, admitting a `/method` claim that isn't backed by repo evidence, the
 havu.cc rebrand scope (already fixed as "full rebrand, paper-light default,
`#C2410C` accent text / `#FF8A3D` graphic, Archivo + IBM Plex Mono, `/method` included").
