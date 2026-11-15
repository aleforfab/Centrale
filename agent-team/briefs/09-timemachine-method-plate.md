# Brief 09 — Replate: Time Machine (Field Log) + new `/method` summary (frontend)

> Historical brief. On 2026-11-15 the procedural demo/player and frame routes described here were removed. The current `/time-machine` reads installed manifests and exact dated observations; `/method` is a short observations/products summary.

Branch: `feat/timemachine-method-plate` from `origin/main` @ `7333923`. Read
`agent-team/CONTRACT.md` (round 3), `skills/dancing-with-the-sars/SKILL.md`, and
**`docs/REDESIGN_GUIDE.md`** — they bind. You code against worker 07's vocabulary
in the guide (`.plate`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`,
`.field`, `.footnote`, `.plate__tag`, `.plate__caption`) — names/values fixed.
Repo: `aleforfab/Centrale`.

## Why

This brief recorded a visual redesign of the Time Machine as a **field log**:
numbered chapters, dated entries and a concise `/method` page for readers who
want to understand the observations and products.

## Deliverables

### `app/time-machine/page.tsx` — chapters per REDESIGN_GUIDE §6 `/time-machine`
- Earlier layout: `01 — Region` and `02 — Window & Fetch` plates around the
  shared `LiveScanPanel`.
- PROVISIONAL banner → `.colophon` (verbatim content).
- Empty state ("No live frames loaded") → paper plate + `.colophon` language.
- Bottom cadence paragraph keeps the five-date Anak Krakatau list verbatim but
  set as `.footnote`; the "missing stay missing" sentence stays verbatim.

### `components/WorldviewReview.tsx` — the log entries
- Header: `ENTRY 0N — <date>` Archivo 900; phase as small accent caps tag;
  secondary line = `pol · N exact backscatter acquisitions · playback position`.
- Frame strip: mono date buttons; active date = accent bottom rule; unavailable
  dates keep the literal suffix ` · unavailable`.
- Play/pause = `.chapter-button --primary`; timeline range styled paper
  (accent thumb); `EXACT DATE` input keeps native `type="date"` and exact-date
  refusal logic verbatim.
- Provenance disclosure table → `.rule-table` (mono); caveat sentence kept verbatim.
- Both `playback` and `compare` modes fully restyled; refusal/mismatch copy →
  `.colophon`, never coloured-alert styling; `aria` attributes and roles unchanged.
- Logic (frames derivation, `scanFrameDates` presets, `isKrakatauSite` phase
  gating, visibility playback, exact-date refusal) is **untouched** — styling only.

### Procedural `TimeReview.tsx` — retired on 2026-11-15
The procedural player, frame routes and associated tests were removed. The
current Time Machine reads installed site manifests and exact observation dates.

### `/method` — current short summary
The page has two sections: Observations and Products. It summarizes the
installed radar layers and links to NASA Worldview for event context.

### Method nav link — ANNOUNCE (one announced append to a 07-owned file)
Add `{ href: "/method", label: "Method" }` to the `LINKS` array in
`components/SiteNav.tsx` (worker 07 kept the array trivially appendable). This
is your **only** edit to any 07 file: one line, commit message and report must
carry `ANNOUNCE: SiteNav.tsx +/method nav entry (brief 09)`. If the array
changed shape under 07, escalate instead of guessing.

### NEW `app/not-found.tsx` — “PAGE NOT IN THE CATALOGUE”
Paper plate; mono tag `404`; three links (Dashboard / Before·After / Time
Machine). No client JS.

### sourceRegister cleanup (completes slice 06's deferral)
- Delete `dancing-with-the-sars-frontend/lib/sourceRegister.ts` and
  `dancing-with-the-sars-frontend/tests/source-register.test.ts`.
- Read `dancing-with-sars-backend/scripts/build_source_register.py` (default
  path points at `public/resources/source-register.json`) and `README.md`
  (~lines 130–150). If the JSON is only used as that documented default and is
  unused by the app, **keep** the JSON (it is backend tooling data) and reword
  the README lines so they no longer imply a frontend runtime dependency; if
  the README says nothing about the frontend depending on it, leave it alone.
  Deleting the JSON outright is **not** authorized this round.

## Historical integration constraints
No changes to 07 files except the announced one-line nav append. No changes to
08 files. No new dependencies. InSAR/deformation/coherence remains a proposed
capability. Tests should reflect current exact-date and manifest-backed playback.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

`/method` and the 404 must appear in the build's route list — paste it.
State explicitly that no browser check was possible from your sandbox.

## Hand-in

Report at `agent-team/reports/09-timemachine-method-plate.md` (CONTRACT §4).
Draft PR. Do not merge. Merge order: 07 → 09 → 08; **rebase onto 07 before
hand-in** — your nav append and your pages both assume 07's masthead landed.
