---
name: dancing-with-the-sars
description: How an agent works in the aleforfab/Centrale repo ("Dancing with the SARs" — NISAR L-band radar analysis, Next.js frontend + FastAPI backend). Use for code changes, audits, and verification — it covers repository structure, verification gates, lane ownership, and credential/VM ground rules.
---

# Dancing with the SARs — Agent Skill

This repository is a public-facing NASA Space Apps project. Before changing a
feature, inspect its implementation and tests, and use the product manifest as
the source for installed dates and layers.

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
