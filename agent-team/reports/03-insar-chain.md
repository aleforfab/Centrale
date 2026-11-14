# Report — 03-insar-chain — 2026-11-14

Branch: `arena/95d96e92-centrale`
PR link: https://github.com/aleforfab/Centrale/pull/10
Base SHA: `037f42c1e6156d6ec92ebd6d46cb058ec522cc21`
HEAD SHA: `98a5d87423666637637371219b13cd76c843e792` (implementation commit; the
final report-only commit is the PR head — GitHub PR head is authoritative)

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

Stat at implementation head `98a5d87`:

```text
 agent-team/reports/03-insar-chain.md               |  65 ++++
 dancing-with-sars-backend/docs/INSAR.md            | 114 +++++++
 dancing-with-sars-backend/main.py                  |   2 +
 dancing-with-sars-backend/nisar/insar/__init__.py  |  24 ++
 .../nisar/insar/atmosphere.py                      | 137 ++++++++
 dancing-with-sars-backend/nisar/insar/chain.py     | 374 +++++++++++++++++++++
 dancing-with-sars-backend/nisar/insar/coherence.py | 102 ++++++
 .../nisar/insar/coregister.py                      | 127 +++++++
 dancing-with-sars-backend/nisar/insar/filtering.py | 144 ++++++++
 dancing-with-sars-backend/nisar/insar/geometry.py  | 178 ++++++++++
 dancing-with-sars-backend/nisar/insar/source.py    | 300 +++++++++++++++++
 dancing-with-sars-backend/nisar/insar/topo.py      | 104 ++++++
 dancing-with-sars-backend/nisar/insar/unwrap.py    | 119 +++++++
 dancing-with-sars-backend/nisar/insar/utils.py     |  11 +
 dancing-with-sars-backend/routers/insar.py         |  39 +++
 .../tests/fixtures/make_synthetic_insar.py         | 134 ++++++++
 .../tests/test_insar_atmosphere.py                 |  41 +++
 .../tests/test_insar_chain.py                      |  76 +++++
 .../tests/test_insar_coregistration.py             |  50 +++
 .../tests/test_insar_filter_unwrap.py              |  62 ++++
 .../tests/test_insar_geometry.py                   |  59 ++++
 .../tests/test_insar_router.py                     |  24 ++
 .../tests/test_insar_source.py                     |  80 +++++
 .../tests/test_insar_topo_coherence.py             |  77 +++++
 24 files changed, 2443 insertions(+)
```

The final report-only commit changes `agent-team/reports/03-insar-chain.md`;
no code or test file changes after the implementation head.

## Shared files touched (ANNOUNCE list) or "none"

ANNOUNCE: `main.py` append — import and register the static proposed
`/api/insar/status` router. No other shared files were touched.

## Checks run (exact commands + outputs)

```text
$ ruff check . --output-format concise
All checks passed!

$ pytest -q
........................................................................ [ 52%]
................................................................         [100%]
=============================== warnings summary ===============================
schemas.py:25
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:25: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    pre_start: date = Field(..., example="2018-10-01")

schemas.py:26
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:26: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    pre_end: date = Field(..., example="2018-11-07")

schemas.py:27
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:27: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    post_start: date = Field(..., example="2018-11-09")

schemas.py:28
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:28: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    post_end: date = Field(..., example="2018-12-15")

schemas.py:48
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:48: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    start_date: date = Field(..., example="2018-06-01")

schemas.py:49
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:49: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    end_date: date = Field(..., example="2019-06-01")

schemas.py:58
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:58: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    start_date: date = Field(..., example="2018-10-01")

schemas.py:59
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:59: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    end_date: date = Field(..., example="2018-12-15")

schemas.py:60
  /home/user/Centrale/dancing-with-sars-backend/schemas.py:60: PydanticDeprecatedSince20: Using extra keyword arguments on `Field` is deprecated and will be removed. Use `json_schema_extra` instead. (Extra keys: 'example'). Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.14/migration/
    platform: str | None = Field(default="Sentinel-1", example="Sentinel-1")

tests/test_export_site_builder.py::test_write_cog_and_render_xyz_tile
tests/test_export_site_builder.py::test_render_tiles_rejects_excessive_budget
  /home/user/Centrale/dancing-with-sars-backend/.venv/lib/python3.11/site-packages/rasterio/transform.py:178: PendingDeprecationWarning: Use `@` matmul instead of `*` mul operator for matrix multiplication
    return Affine.translation(west, north) * Affine.scale(xsize, -ysize)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
136 passed, 11 warnings in 2.61s

$ GET /api/insar/status
status_code: 200
{
  "chain": [
    "coregistration",
    "topo-removal",
    "coherence",
    "filtering",
    "unwrap",
    "atmos-screening",
    "los-scaling"
  ],
  "enabled": false,
  "reason": "Phase-capable products (SLC/GUNW or a reviewed external interferogram service) and scientific review are required. Current NISAR GCOV is detected backscatter and carries no interferometric phase.",
  "requirements": [
    "SLC/GUNW or HyP3",
    "DEM",
    "scientific review"
  ],
  "status": "proposed"
}
```

Draft PR #10 CI on implementation head `98a5d87`:

```text
$ gh pr checks 10 --watch --interval 10
backend    pass  38s  https://github.com/aleforfab/Centrale/actions/runs/43633612464/job/132565487427
frontend   pass  54s  https://github.com/aleforfab/Centrale/actions/runs/43633612464/job/132565487227
```

The final report-only commit triggers a fresh PR check run; see PR #10 for the
authoritative final-head status. Worker does not merge.

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
- Final-head CI on draft PR #10.
- `GET /api/insar/status` returns the exact proposed payload.
- No `reader.py`, `processing.py`, `site_builder.py`, `live_fetch.py`,
  `jobs.py`, `catalog.py` or frontend diff.
- Real phase-capable products, DEM, two same-stack pairs, coherence maps,
  residual topographic phase, closure phase, GUNW comparison and reviewer
  sign-off before any user-facing InSAR result.
