# Implementation handoff

This document describes what exists in `aleforfab/Centrale` **now**, how it was
produced, and what is still missing. It was written in this repository during the
migration from `aleforfab/DancingWithTheSARs`; read
[`../MIGRATION_STATUS.md`](../MIGRATION_STATUS.md) for the migration history.

## Provenance of this code, stated plainly

The base application (backend pipeline, API, dashboard) was imported into
Centrale by commit `fc77dc7`.

The applications library, the before/after comparison viewer, the setup guide,
the source register, the frontend test suite and the demo-site generator were
**written fresh in Centrale during this migration**. They were **not copied from
source commit `c1200a8`**: this session's GitHub authorization covered Centrale
only, and every read of the other repository returned HTTP 403.

Consequences, so nobody assumes otherwise:

- These features match the *described behaviour* in the project handoff. They are
  not byte-identical to whatever `c1200a8` contained.
- If the team later recovers `c1200a8`, diff it against this implementation
  deliberately. Do not assume one supersedes the other.
- Any wording here is this repository's own; it has no inherited authority.

## What is implemented

### Backend (`dancing-with-sars-backend`)

| Piece | State |
| --- | --- |
| `nisar/` GCOV reader, processing, export, site builder, catalogue | Present, imported |
| `build-site`, `verify`, `discover`, `live-smoke` CLI | Present, imported |
| Product API (`/health`, `/api/data-status`, `/api/sites`, `/api/sites/{id}`, `/timeseries`) | Present, imported |
| `scripts/make_demo_site.py` | New here: generates a synthetic site + YAML |
| `scripts/build_source_register.py` | New here: fills the register from local PDFs |

### Frontend (`dancing-with-the-sars-frontend`)

| Piece | Route / file | State |
| --- | --- | --- |
| Dashboard | `/` | Imported; now shows the shared section nav |
| Before/after viewer | `/compare`, `components/ComparisonViewer.tsx` | New here |
| Comparison matching logic | `lib/comparison.ts` | New here |
| Applications library | `/applications`, `lib/applications.ts` | New here |
| Capability labels | `lib/applications.ts` (`CAPABILITIES`, `capabilityFor`) | New here |
| Real-case setup guide | `/setup` | New here |
| Source register | `public/resources/source-register.json`, `lib/sourceRegister.ts` | New here |
| Typed register access | `lib/sourceRegister.ts` | New here |
| Shared section navigation | `components/SiteNav.tsx` | New here |
| Test suite | `tests/` (vitest) | New here |

### Routing change

`lib/api.ts` previously defaulted to `http://localhost:8000`, which meant the
browser called the backend directly. That breaks the planned VM layout, where
FastAPI binds to loopback and Caddy fronts Next.js.

Now:

- `lib/api.ts` uses relative URLs unless `NEXT_PUBLIC_API_URL` is deliberately set.
- `next.config.mjs` rewrites `/api/*` and `/products/*` to `BACKEND_URL`
  (default `http://127.0.0.1:8000`) on the server.
- `NEXT_PUBLIC_API_URL` must stay unset on the VM.

`components/Map.tsx` is unchanged; it composes tile URLs against
`api.baseUrl`, which is now empty, so its tile URLs become same-origin paths
automatically.

## Design decisions worth knowing

1. **Comparison uses observations only.** `buildComparison()` accepts only
   `kind === "backscatter"` layers with an exact date match for the requested
   polarization. It never substitutes a neighbouring date, another polarization,
   a difference layer or a change mask. When something is absent it returns a
   typed problem instead of a partial result.
2. **Dates are normalized, not compared as strings.** Pair records use compact
   `20260701`, layers use ISO `2026-07-01`. `normalizeDate()` accepts both and
   rejects impossible dates such as `2026-02-31` instead of letting `Date` roll
   them over.
3. **Capabilities are derived.** `capabilityFor()` returns
   `validated-for-this-case` only when a `CaseReview` exists for that topic.
   `CASE_REVIEWS` is empty, so all twelve topics render as learning resources.
4. **The register refuses to invent metadata.** Fingerprints, page counts and
   years ship as `null` with `verification: "filename only"`. The UI prints
   "fingerprint not recorded in this repository" rather than a fake hash.
   `scripts/build_source_register.py` fills real values from local PDFs.
5. **Separate comparison component.** The viewer is its own component rather than
   a mode inside `Map.tsx`, so the dashboard map keeps its behaviour. Both maps
   are created once and their cameras are mirrored on every move; the guard
   compares camera state, not timers, so there is no feedback loop.

## Required team inputs before a real case

- Candidate location and bounding box.
- Real granule names from one stack, with both pair dates present.
- Approval for the download volume.
- A reviewer for mask semantics, grid alignment and threshold sensitivity.
- A URL-restricted public Mapbox token (never committed, never private).
- A Decision on domain vs. plain HTTP, and confirmation of the VM's current IP.

## Commands

From `dancing-with-sars-backend`:

```bash
python -m scripts.make_demo_site --output /srv/dancing-sars/demo-input
PRODUCTS_DIR=/srv/dancing-sars/products CACHE_DIR=/srv/dancing-sars/cache \
  python -m nisar.cli build-site \
  --config /srv/dancing-sars/demo-input/site.yaml \
  --local-dir /srv/dancing-sars/demo-input/granules
PRODUCTS_DIR=/srv/dancing-sars/products python -m nisar.cli verify --site demo-fixture
```

From `dancing-with-the-sars-frontend`:

```bash
npm ci
npm run typecheck
npm test
npm run build
BACKEND_URL=http://127.0.0.1:8000 npm run start
```

## Explicit limitations

- No real NISAR case has been processed. All pipeline results so far are
  synthetic fixtures.
- GCOV mask semantics remain unconfirmed; mask values are preserved raw.
- Same-stack grid alignment on real acquisitions is unverified.
- The comparison viewer has not been seen rendering real tiles in a browser with
  a real Mapbox token. Its matching logic is unit-tested; its map rendering is not.
- The applications library summarises topics; it does not implement any hazard
  detector.
- Backscatter change is a measurement difference, not an explanation.
