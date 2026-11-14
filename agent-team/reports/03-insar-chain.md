# Report — 03-insar-chain — 2026-11-14

Branch: `arena/95d96e92-centrale`
PR link: pending
Base SHA: `037f42c1e6156d6ec92ebd6d46cb058ec522cc21`
HEAD SHA: pending

## Scope done / scope not done (and why)

Done: new proposed-only `nisar/insar/` package, static `GET /api/insar/status`
router, `docs/INSAR.md`, synthetic HDF5 fixture generator and synthetic unit
tests. No frontend, reader, processing, site_builder, live_fetch, jobs, catalog
or config semantics were edited.

Not done: could not create/push the requested `feat/insar-phase-chain` branch or
avoid pushing an `arena/*` branch. Arena pins this session to
`arena/95d96e92-centrale`; the system rule requires work, commit and push only
on that current branch. Supervisor must reconcile the branch name if the
contract's `feat/...` naming is mandatory. No merge, deployment, VM access,
credential use, real granule download or real-data verification was performed.

## Files changed (git diff --stat origin/main...HEAD)

Pending.

## Shared files touched (ANNOUNCE list) or "none"

ANNOUNCE: `main.py` append — import and register the static proposed
`/api/insar/status` router. No other shared files were touched.

## Checks run (exact commands + outputs)

Pending.

## Honesty invariants: kept / violated (explain)

Kept. Everything is labelled `proposed`; `/api/insar/status` is disabled and
static; no compute endpoint exists; no UI numbers or deformation map are
exposed; only synthetic fixtures are used; no real-data or scientific-review
claim is made. Exact dates/provenance invariants in untouched product paths are
preserved.

## Known gaps, follow-ups, TODOs left in code

- **not verified on real data — needs GUNW/SLC pairs on the VM + reviewer sign-off**
- Coregistration, topographic removal, coherence, filtering, unwrapping,
  atmosphere screening and LOS scaling are synthetic library implementations,
  not validated production algorithms.
- The GUNW HDF5 layout is a synthetic convention and must be checked against a
  real product before use.
- HyP3-style service is only a protocol/callable hook; no external service is
  implemented or contacted.
- No new third-party dependency was added. `affine` is not imported directly;
  DEM georeferencing uses an Affine-like six-number tuple.

## What the supervisor must verify manually

- Merge-order and branch-name conflict described above.
- Backend CI on the draft PR.
- `GET /api/insar/status` returns the exact proposed payload.
- No `reader.py`, `processing.py`, `site_builder.py`, `live_fetch.py`,
  `jobs.py`, `catalog.py` or frontend diff.
- Real phase-capable products, DEM, two same-stack pairs, coherence maps,
  residual topographic phase, closure phase, GUNW comparison and reviewer
  sign-off before any user-facing InSAR result.
