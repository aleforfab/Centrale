# Brief 06 — Retire dead code, small backend cleanups, fixture-delta code path (hygiene)

Branch: `chore/hygiene-fixture-delta` from `origin/main` @ `94e12f0`. Read
`agent-team/CONTRACT.md` (round 2 section) and `skills/dancing-with-the-sars/SKILL.md` first; they bind.
Repo: `aleforfab/Centrale`.

## Why

Low-risk cleanups deferred from the full audit, plus the **code** half of the
maintainer's synthetic-fixture relocation (bringing the demo site onto a
recognisable low-latitude coastal site near ~90 E, still inside EPSG:32646).
The VM-side rebuild is out of scope — see "Out of scope".

## Tasks

### H1 — Delete dead frontend modules (zero importers, verified 2026-11-14 by grep)

Delete:

- `dancing-with-the-sars-frontend/components/DanceChart.tsx`
- `dancing-with-the-sars-frontend/components/TimeScrubber.tsx`
- `dancing-with-the-sars-frontend/components/ControlPanel.tsx`
- `dancing-with-the-sars-frontend/components/AsfGranules.tsx`
- `dancing-with-the-sars-frontend/lib/applications.ts`
- `dancing-with-the-sars-frontend/lib/sourceRegister.ts`
- `dancing-with-the-sars-frontend/public/resources/source-register.json`
- `dancing-with-the-sars-frontend/tests/applications.test.ts`

Then `npm test` must stay green (update expectations only if a page test
referenced deleted copy — it does not; verify). If you find an importer you
missed, restore that file and report instead of deleting it.

### H2 — Small backend cleanups (no behavioural change beyond deletions)

- `nisar/config.py`: remove unused `DATA_GAP_START` / `DATA_GAP_END`
  (grep shows no readers outside the class itself).
- `main.py`: import `ee` lazily inside the Earth Engine fallback branch instead
  of at module import time (fallback stays off by default).
- `main.py`: replace `allow_methods=["*"]` with an explicit list
  (`["GET", "POST", "OPTIONS"]` — confirm against actual route methods used).

### H3 — npm audit (report only)

```bash
cd dancing-with-the-sars-frontend && npm audit --json > /tmp/npm-audit.json
```

Paste the summary table (severity counts + advisory ids) into your report.
Apply `npm audit fix` **only** if it requires zero manual intervention and CI
stays green; never hand-edit `package-lock.json`. Anything that forces a major
version bump is reported, not applied.

### H4 — `scripts/make_demo_site.py`: origin offset for the synthetic fixture

The synthetic stack stores coordinates starting at UTM (0, 0) in EPSG:32646;
`bbox_from_grid` projects a window around that origin to WGS84 for the YAML.
Add:

- `--origin-easting` / `--origin-northing` (metres, EPSG:32646) **or**
  `--origin-lon` / `--origin-lat` (WGS84, converted via pyproj) — pick one pair;
  if you pick lon/lat, convert through the same transformer used elsewhere in the
  script and state the exact numbers for a target at the western
  Ganges–Brahmaputra delta fringe (roughly 88.7–89.9 E, 21.2–23.2 N — all land,
  low-latitude, **within EPSG:32646's longitude span of 84–90 E**; do not use
  96 E, that is zone 47N and breaks the fixture's CRS claim).
- Default stays 0/0: current tests and fixtures must be byte-compatible with
  what they generate today.
- The offset must flow into the fake GCOVs' `xCoordinates`/`yCoordinates`
  (inspect `tests/fixtures/make_fake_gcov.py` and thread the offset through
  minimally; if the fake writer hardcodes `arange(size)*spacing`, add the offset
  there with a default of 0).
- `build_site_config`'s `bbox_from_grid` must take the same offset into account.
- Docs (new `docs/DEMO_FIXTURE_DELTA.md`): purpose, example command for the delta
  fringe, verification step (`nisar.cli build-site` + `verify`), and the honesty
  paragraph — **the location is arbitrary; the data remains synthetic; it is not
  a real observation, not a real change, and not evidence of anything about the
  Sundarbans, Bangladesh or the Ganges–Brahmaputra delta.**

### H5 — Report-only check

`npm audit` result and a note confirming nothing else references the deleted
files (`git grep` before delete). No other behavioural changes.

## Explicitly out of scope

- Frontend pages/components/lib owned by workers 04/05; `Map.tsx`; backend
  `nisar/live_fetch.py`, `jobs.py`, `routers/`, `attachments`; InSAR package.
- VM access, the actual demo-fixture rebuild, `LIVE_FETCH_MAX_BYTES`, Gate 2.
- Deleting or retiring anything beyond the H1 list without ANNOUNCE lines.
- New dependencies.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
cd dancing-with-sars-backend && ruff check . --output-format concise && pytest -q
```

Also paste: the exact `--origin-lon/--origin-lat` (or easting/northing) values
you chose and the WGS84 bbox they produce (show a dry run, e.g. via a small
`python -c` snippet).

## Hand-in

Report at `agent-team/reports/06-hygiene-fixture-delta.md` (CONTRACT §4).
Draft PR when green. Do not merge.
