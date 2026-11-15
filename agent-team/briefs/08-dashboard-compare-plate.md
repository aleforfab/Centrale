# Brief 08 — Replate: Dashboard & Before/After (frontend)

Branch: `feat/dashboard-compare-plate` from `origin/main` @ `7333923`. Read
`agent-team/CONTRACT.md` (round 3), `skills/dancing-with-the-sars/SKILL.md`, and
**`docs/REDESIGN_GUIDE.md`** — they bind. You code against worker 07's vocabulary
(`.plate`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`, `.field`,
`.footnote`, `.plate__tag`, `.plate__caption`) **as specified in the guide — the
names and values are fixed regardless of merge order.**
Repo: `aleforfab/Centrale`.

## Why

The dashboard and the diptych are the credibility surfaces: installed products,
exact dates, measured change. They should look like printed catalogue plates —
not like a streaming dashboard.

## Deliverables

### `app/page.tsx` — The Observation Plate (layout per REDESIGN_GUIDE §6 `/`)
- Grid `1fr / 380px`. Left: `.plate` wrapping the Map; `.plate__tag` above it
  (`FIG. 01 — <site title uppercased> · <pol> · <kind> · <date|window>`);
  `.plate__caption` below with the site caveat.
- Right rail, `.index-row` sections with mono section tags and hairline separators:
  - `SITE` — title, description, caveat as `.colophon`, source chips (small).
  - `LAYERS` — the unified radio+toggle list (from round 2) restyled as catalogue
    index rows (date · pol · kind badge · title); the active legend renders as
    `.footnote` directly under the list (B5 requirement, verbatim legend text).
  - `ACQUISITIONS` — numbered catalogue rows: `date · cycle · granule (mono, truncated)` + CRID; ASF link stays; granule appears only here (not duplicated in SITE).
  - `MEASURED CHANGE` — `.rule-table` (decrease/increase km²/%, valid coverage,
    noise σ) + existing ink-bar histogram + `.footnote` with the verbatim
    "measured outputs, not a validated scientific result / not a cause" lines.
- The map HUD (`tm-dashboard-map__hud`) date block becomes a mono caption
  (dark chip on imagery exception per guide §3). Map-footer CTA stays deleted
  (round 2 decision — nav owns the Time Machine entry).
- All warnings/"No precomputed products" empty state → `.colophon` language.

### `components/Map.tsx` — chrome only, API unchanged
HUD/legend/toggle/attribution-chip/“no token” overlay restyle to paper-on-imagery
chips (dark chip exception) or paper chips over paper panel as appropriate;
`.plate` does **not** wrap Map (page owns plate). Props/`layers` semantics
unchanged; the round-2 pre-mount/visibility playback work stays exactly as-is;
footprint + ScaleControl from worker 04 stay.

### `app/compare/page.tsx` — The Diptych (REDESIGN_GUIDE §6 `/compare`)
- Header row: two cells — mono `BEFORE` / `AFTER` tag + big Archivo 900 date.
- Selection row: `.field` date pickers + polarization field + one mono
  availability line subordinate to the pickers (no chips row).
- `.colophon` under the viewer: caveat + the exact sentence
  `No substitute date, polarization or difference layer is used.`
- Empty state ("No installed products to compare") → paper plate + `.colophon`;
  the CLI hint stays verbatim.

### `components/ComparisonViewer.tsx` — visual only
Slider hairline, handle + `REVEAL` mono tab, before/after date captions,
comparison stats (if shown) as `.rule-table`; "no substitution" refusal copy
verbatim → `.colophon`. Logic, exact-layer resolution, slider a11y untouched.

## Hard rules

Honesty invariants intact: dates, pol, product kind, source, CRID, maturity,
granules visible/reachable; PROVISIONAL copy kept; no substitute paths;
synthetic caveats verbatim; difference/change-mask never selectable as
observation frames (compare) and excluded from playback. No new dependencies.
No edits to worker 07 files (`globals.css`, `redesign.css`,
`AppShell.tsx`, `SiteNav.tsx`, `RegionSelector.tsx`, `LiveScanPanel.tsx`,
`layout.tsx`). If a needed primitive is missing, stop and note it in the report
— do not patch 07's files. `app/time-machine/**` and `WorldviewReview.tsx` are
worker 09's.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

`tests/pages.test.tsx` may be updated only for nav-copy changes (none expected —
nav unchanged) and only with ANNOUNCE. Visual QA is not possible from your
sandbox — say so; the supervisor verifies the deployed URL.

## Hand-in

Report at `agent-team/reports/08-dashboard-compare-plate.md` (CONTRACT §4).
Draft PR. Do not merge. Merge order: 07 → 09 → 08; you rebase onto 07 & 09 if
they merged before your hand-in.
