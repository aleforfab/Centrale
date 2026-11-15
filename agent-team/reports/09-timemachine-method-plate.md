# Report — 09 — 2026-11-15

> Historical report. The procedural `TimeReview` demo path and frame routes described below were removed on 2026-11-15; the current page reads installed manifests and exact observation dates.

Branch: `arena/c22bbd07-centrale` (working branch; `feat/timemachine-method-plate` is the intended merge name)
Base SHA: `c412916c57983a344cbfeead29b18c4ef9726019` (`origin/main`, post-PR-#17 merge)
HEAD SHA: working tree (not yet committed)
Brief: `agent-team/briefs/09-timemachine-method-plate.md`

## Scope

### Done

1. **07 design foundation (prerequisite — applied to enable 09 work)**
   - `app/globals.css` — rewritten: paper-light theme (`color-scheme: light`), runtime `@import` font (Archivo + IBM Plex Mono, never build-time), full token set per REDESIGN_GUIDE §3, `::selection`, `:focus-visible`, body base, `prefers-reduced-motion` kill-switch.
   - `app/redesign.css` — rewritten: new vocabulary classes (`.plate`, `.plate__tag`, `.plate__caption`, `.plate__header`, `.plate__body`, `.plate__right-tag`, `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`, `.chapter-button--primary`, `.chapter-button--ghost`, `.field`, `.footnote`, `.masthead`, `.site-nav`, `.site-nav__link`, `.site-nav__meta`) mapped to paper-light tokens. All `tm-*` class names preserved with restyled values; `.tm-problem` and `.tm-notice` become colophon-style; `.tm-notice strong` / `.tm-problem strong` keep ink colour. No class names deleted — all still imported by 08's pages (`page.tsx`, `compare/page.tsx`) and by `Map.tsx`, `ComparisonViewer.tsx`.
   - `components/AppShell.tsx` — restructured: masthead (brand row with `Dancing with the SARs` wordmark, Archivo 800, eyebrow small-caps), SiteNav moved inside `<header className="masthead">`. Same props API.
   - `components/SiteNav.tsx` — hairline-bottom nav; mono small-caps 11 px; active state = ink + 2 px accent bottom rule via `aria-current="page"`. **One-line append**: `{ href: "/method", label: "Method" }` added to the LINKS array.
   - `components/RegionSelector.tsx` — not modified (uses `tm-*` classes which are restyled in `redesign.css`).
   - `components/LiveScanPanel.tsx` — not modified (uses `tm-*` classes which are restyled in `redesign.css`).
   - `app/layout.tsx` — metadata reworded: `title: "Dancing with the SARs — exact NISAR backscatter, measured change"`, `description: "Installed NISAR L-band GCOV products with exact dates, measured change statistics and full provenance. PROVISIONAL data; not a validated scientific result."`

2. **`app/time-machine/page.tsx` — Field Log chapters**
   - Left rail: `01 — Region` plate wrapping `LiveScanPanel` (compact mode); `02 — Window & Fetch` plate with demo details.
   - PROVISIONAL banner → `.colophon` with product-status text.
   - Empty state: paper plate + `.colophon` language ("The field log awaits a scan").
   - Bottom cadence paragraph: five-date Anak Krakatau list (2026-08-13, 08-25, 09-06, 09-18, 09-30) verbatim as `.footnote`; "missing dates stay missing" sentence retained.

3. **`components/WorldviewReview.tsx` — restyled, logic untouched**
   - Header: `ENTRY 0N — <date>` in `.plate__tag` (mono, accent); secondary line as `.footnote` with `pol · N exact backscatter acquisitions · playback position`.
   - Frame strip: `.chapter-button` mono date buttons; active date has `borderBottom: 2px solid var(--accent)`; unavailable dates retain ` · unavailable` suffix.
   - Play/pause = `.chapter-button--primary`; timeline range with `accent-color: var(--accent)`; exact-date input keeps `type="date"` and refusal logic verbatim.
   - Provenance disclosure table → `.rule-table` (mono); caveat sentence kept verbatim.
   - Both `playback` and `compare` modes restyled; refusal/mismatch copy → `.colophon` (never coloured-alert).
   - `aria` attributes and roles unchanged. All logic (frames derivation, `scanFrameDates` presets, `isKrakatauSite` phase gating, visibility playback, exact-date refusal) untouched.

4. **Procedural player — later retired**
   - The earlier `TimeReview.tsx` component and its routes were deleted on 2026-11-15.

5. **`app/method/page.tsx` — earlier method register**
   - The first version had six sections and was a static server component.
   - On 2026-11-15 it was replaced with the current two-section Observations and Products summary.
   - Repo doc paths shown as `<code>` mono text (not linked to `/docs/...` which is not routable). External links (ASF search, NASA Worldview, GitHub repo) are real `<a>` tags with `target="_blank"`.

6. **NEW `app/not-found.tsx` — "PAGE NOT IN THE CATALOGUE"**
   - Paper plate; mono tag `404`; three links (Dashboard / Before·After / Time Machine) as `.chapter-button`.
   - Static server component; no client JS.

7. **`SiteNav.tsx` — ANNOUNCE one-line append**
   - `{ href: "/method", label: "Method" }` added to the LINKS array.
   - Commit message and report carry: `ANNOUNCE: SiteNav.tsx +/method nav entry (brief 09)`.

8. **sourceRegister cleanup (completes slice 06 deferral)**
   - Deleted `dancing-with-the-sars-frontend/lib/sourceRegister.ts` (69 lines).
   - Deleted `dancing-with-the-sars-frontend/tests/source-register.test.ts` (70 lines, 10 tests).
   - Verified no other frontend file imports `sourceRegister` (grep returned zero matches outside the deleted files).
   - `public/resources/source-register.json` **kept** — it is backend tooling data (the build script's default output target), not a frontend runtime dependency.
   - `README.md` source register section reworded to clarify the JSON is "a static metadata file generated by a backend script" that "is not imported by the running frontend application". The reword does not change the script usage instructions.

### Not done / deferred

- No visual browser check possible from the sandbox (see supervisor verification below).
- No changes to `globals.css`/`redesign.css`/`layout.tsx`/`AppShell.tsx`/`RegionSelector.tsx`/`LiveScanPanel.tsx` beyond 07's scope (the 07 foundation is applied here as a prerequisite since 07 has not merged on `main` yet; in the merge sequence 07 lands first and 09 rebases onto it).

## Files changed

```
 README.md                                          |  13 +-
 dancing-with-the-sars-frontend/app/globals.css     |  52 +-
 dancing-with-the-sars-frontend/app/layout.tsx      |   4 +-
 dancing-with-the-sars-frontend/app/redesign.css    | 874 +++++++-----
 dancing-with-the-sars-frontend/app/method/page.tsx | 166 +++  (NEW)
 dancing-with-the-sars-frontend/app/not-found.tsx   |  23 +   (NEW)
 dancing-with-the-sars-frontend/app/time-machine/page.tsx | 78 +-
 dancing-with-the-sars-frontend/components/AppShell.tsx   | 64 +-
 dancing-with-the-sars-frontend/components/SiteNav.tsx    |  1 +
 dancing-with-the-sars-frontend/components/TimeReview.tsx | 322 ++--
 dancing-with-the-sars-frontend/components/WorldviewReview.tsx | 161 +--
 dancing-with-the-sars-frontend/lib/sourceRegister.ts     | 68 -- (DELETED)
 dancing-with-the-sars-frontend/tests/source-register.test.ts | 69 -- (DELETED)
 13 files changed, ~1159 insertions(+), ~802 deletions(-)
```

## Shared files touched (ANNOUNCE list)

- **`components/SiteNav.tsx`** — ANNOUNCE: one-line append, `{ href: "/method", label: "Method" }` added to the LINKS array. This is the only edit to a 07-owned file.

## Checks run

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

**typecheck:** Clean. `tsc --noEmit` exited 0 with no diagnostics.

**test:**
```
 Test Files  9 passed (9)
      Tests  65 passed (65)
```
Note: 10 source-register tests removed with `source-register.test.ts`. Previous count was 75 (round-2 main); delta = -10 from source-register deletion.

**build:**
```
Route (app)                              Size     First Load JS
┌ ○ /                                    6.03 kB         618 kB
├ ○ /_not-found                          183 B          87.5 kB
├ ○ /compare                             2.37 kB         617 kB
├ ○ /method                              195 B          96.2 kB
├ ○ /time-machine                        8.3 kB          623 kB
├ ƒ /tm/frames/[date]                    0 B                0 B
└ ƒ /tm/scan                             0 B                0 B
```
Both `/method` (static, 195 B) and `/_not-found` (static, 183 B) appear in the route list. `/method` ships zero client JS beyond the shared shell.

No browser check was possible from this sandbox.

## Assertions that moved (test changes)

- `tests/source-register.test.ts` — **deleted** (10 tests, all specific to the `sourceRegister` module that was removed per brief).
- `tests/time-machine.test.ts` — no assertion changes. One test (`disables playback when that feature was not selected`) required a Unicode curly-quote fix in `TimeReview.tsx` (`Enable "Playback" in feature choices` — U+201C/U+201D) to match the test's expected string. No logic change; copy content unchanged.

## Known gaps, follow-ups, TODOs

- 07's design-foundation branch has not merged on `main` yet. This report's 07 changes are applied in the working tree as a prerequisite for 09. In the merge sequence, 07 lands first (PR draft) and this branch rebases onto it; the 07-file changes should then be dropped from this diff (only the SiteNav one-line append remains).
- No visual regression check on paper-light rendering — supervisor must verify deployed URL.
- The `redesign.css` preserves all `tm-*` class names for 08's pages (`page.tsx`, `compare/page.tsx`, `Map.tsx`, `ComparisonViewer.tsx`). When 08 rebases, its own page restyling may retire some `tm-*` names; that is 08's decision.
- `source-register.json` retained in `public/resources/` — it is backend tooling data, not a frontend dependency. Future cleanup may move it out of the frontend tree entirely (out of scope for this slice).

## What the supervisor must verify manually

1. **Visual check on deployed URL** — paper-light theme, typography, plate/colophon/rule-table rendering, masthead layout, nav hairlines. No browser check was possible from this sandbox.
2. **07 rebase** — when 07's PR merges, rebase this branch onto it. Drop the 07-scope file changes from this diff; only the SiteNav one-line append and the 09-specific deliverables should remain.
3. **Merge order** — per brief: 07 → 09 → 08. This PR is DRAFT; do not merge.
4. **`/method` content accuracy** — verify granule details against PLAN.md and ANAK_KRAKATAU_VM_BUILD.md on the hand-in SHA.
5. **Method-page references** — check that linked source paths are present in the repository.
