# Brief 09 — Replate: Time Machine (Field Log) + new `/method` honesty register (frontend)

Branch: `feat/timemachine-method-plate` from `origin/main` @ `7333923`. Read
`agent-team/CONTRACT.md` (round 3), `skills/dancing-with-the-sars/SKILL.md`, and
**`docs/REDESIGN_GUIDE.md`** — they bind. You code against worker 07's vocabulary
in the guide (`.plate`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`,
`.field`, `.footnote`, `.plate__tag`, `.plate__caption`) — names/values fixed.
Repo: `aleforfab/Centrale`.

## Why

Time Machine is the emotional core of the product and the place where honesty
is easiest to lose. It becomes a **field log**: numbered chapters, exact entries,
measured claims. And the app gains the one page a skeptical journalist or judge
will read: `/method` — the honesty register, written for outsiders.

## Deliverables

### `app/time-machine/page.tsx` — chapters per REDESIGN_GUIDE §6 `/time-machine`
- Left rail: `01 REGION` plate then `02 WINDOW & FETCH` plate around the shared
  `LiveScanPanel` (props/behavior from round 2 — you do not re-implement fetch;
  progress renders as mono log lines `stage · percent` inside the panel area
  via the panel's own markup hooks, or adjacent log panel if simpler).
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

### `components/TimeReview.tsx` — demo path, same language
Demo banner → `.colophon` (verbatim: "Demo visualization — not NISAR
    observations…"); frames/controls restyled consistently; no logic changes.

### NEW `app/method/page.tsx` — “Method & honesty register” (REDESIGN_GUIDE §6 `/method`)
Sections 01–06 exactly as the guide specifies. Rules:
- **Never** claim a real observation was built, processed or verified. The
  Anak Krakatau build is documented as *planned, not executed*; Gate 2 pending.
- Every granule detail (CRID `P05023`, dates, orbit/frame, HH/HV ascending
  frame 010, ≈24.27 GB, collection `NISAR_L2_GCOV_PROVISIONAL_V1`) must match
  `agent-team/PLAN.md`'s inventory table and `docs/ANAK_KRAKATAU_VM_BUILD.md`
  on your hand-in SHA — re-read both; if any detail drifted, say so in the report
  and present both.
- Maturity is **PROVISIONAL** — write "not validated, not reviewed" everywhere
  it matters. No superlatives. No "first ever".
- `/method` links must be relative for repo docs (`/docs/...` is not routable —
  link nothing to nonexistent routes; instead mention doc paths as mono text).
  External links (ASF search, NASA Worldview, GitHub repo) may be real `<a>` tags.
- Static server component (no `use client`), ships zero client JS beyond the shell.

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

## Hard rules
No changes to 07 files except the announced one-line nav append. No changes to
08 files. No new dependencies. Honesty copy verbatim wherever it exists today
(list in report). No InSAR/deformation/coherence claims anywhere — the word
"proposed" stays. Tests updated only for deliberately changed copy, and you
say exactly which assertions moved.

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
