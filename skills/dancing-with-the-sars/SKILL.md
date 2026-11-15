---
name: dancing-with-the-sars
description: How an agent works in the aleforfab/Centrale repo ("Dancing with the SARs" — NISAR L-band radar analysis, Next.js frontend + FastAPI backend). Use for any code change, audit, or verification in this repository — it binds the honesty invariants, the verification gates, the lane contract between workers, and the credential/VM ground rules.
---

# Dancing with the SARs — Agent Skill

This repository is a public-facing NASA Space Apps project. It makes strong,
checkable claims in public; the cost of a wrong claim is reputational. Every
invariant below is mandatory. If your task conflicts with an invariant, stop
and escalate in your report/PR instead of working around it.

## Repository map

- `dancing-with-the-sars-frontend/` — Next.js app (Dashboard, Before/After,
  Time Machine), Mapbox GL, same-origin `/api/*` proxy via `next.config.mjs`.
- `dancing-with-sars-backend/` — FastAPI backend: NISAR GCOV catalog,
  live fetch (`/api/nisar/fetch`), installed-product builder, CLI
  (`python -m nisar.cli`), optional Sentinel-1 Earth Engine fallback (off by default).
- `agent-team/` — team contract, briefs (`briefs/`), worker reports (`reports/`).
- `docs/` — audits, deployment runbooks, verification ledgers.
- Deployed: VM behind Caddy at https://dancing-sars.duckdns.org/ (Oracle Cloud).
  Localhost cannot validate the Mapbox token (URL-restricted) — browser-level
  verification must happen on the deployed URL.

## Mission decision (2026-11-14)

The product serves **NISAR L-band (GCOV)**. The Sentinel-1 C-band pivot was
considered and dropped; do not reword the mission to Sentinel-1, and do not
relabel L-band layers as anything else.

## Honesty invariants (non-negotiable)

1. Procedural/synthetic frames are never described as real observations, real
   change, or evidence. The synthetic demo keeps its caveat everywhere:
   *not a real observation, not a real change, and not evidence of anything.*
2. `/compare` and the Time Machine never substitute a date, a polarization, or a
   difference/change-mask layer for an exact installed acquisition. Missing dates
   stay missing; there is no interpolation between frames.
3. Difference and change-mask layers never appear as observation/playback frames.
4. Statistics are measured outputs, not causes; never "validated", never
   "scientific", never attributed.
5. Exact acquisition date, polarization, product kind, source, CRID, maturity,
   granule name and provenance stay visible or one disclosure away.
6. InSAR/coherence/deformation outputs do not exist for users until verified
   end-to-end on real data; until then everything says **proposed**.
7. No claim that the Anak Krakatau case is processed/verified until real
   granules are built, verified and inspected on the VM.
8. Current NISAR products are PROVISIONAL — say so.

## Verification gates (run them; paste evidence in your report/PR)

Backend:

```bash
cd dancing-with-sars-backend
ruff check . --output-format concise && pytest -q
```

Frontend:

```bash
cd dancing-with-the-sars-frontend
npm ci && npm run typecheck && npm test && npm run build
```

"All green" without pasted output is treated as not run. Never claim a browser
pixel result unless you actually loaded the deployed page.

## Working protocol

- Read `agent-team/CONTRACT.md` and your brief before writing code. Your lane
  ownership is exclusive; sibling workers have parallel lanes.
- Branch from `origin/main`. Never push to `main`, never push to `arena/*`,
  never merge your own PR. Force-push only with `--force-with-lease` on your
  own branch.
- Commit shared-file edits only with an explicit `ANNOUNCE: …` in the commit
  message and your report, or not at all.
- Never commit `.env*`, tokens, granules, products, tiles, `node_modules/`,
  `.venv/`, `.next/`, `.cache/`. Never hand-edit `package-lock.json`.
- Credentials (Earthdata/ASF/Mapbox) go in env vars or the VM secret store —
  never in git, chat, or docs with real values.
- Heavy downloads (multi-GB) happen only on the VM, never in this sandbox.
- Out-of-lane requests (deploy, VM, merging, changing product positioning)
  are escalated in the report, not done.

## Known landmines

- `new URL(tileTemplate, base)` percent-encodes `{z}/{x}/{y}` → tiles 404.
  Tile templates travel verbatim (`lib/tileUrl.ts::resolveTileUrl`). Do not
  URL-parse them.
- `Map`'s `layers` prop must be referentially stable during playback —
  re-adding raster sources drops cached tiles (the "closing/reopening" flash).
- Live fetch (`POST /api/nisar/fetch`) builds multi-GB products and writes to
  the shared products dir — treat it as an operator action, not a UI confetti button.
- The synthetic demo's bbox is derived from its fake EPSG:32646 grid
  (`scripts/make_demo_site.py::bbox_from_grid`); relocation means adding an
  origin offset — see brief 06.
- Mapbox token is URL-restricted (deployed domain + localhost testing won't match).
