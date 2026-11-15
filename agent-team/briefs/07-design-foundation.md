# Brief 07 — Design foundation: tokens, masthead, shared primitives (frontend)

Branch: `feat/design-foundation` from `origin/main` @ `7333923` (post-round-2:
PRs #14–#16 merged). Read `agent-team/CONTRACT.md` (round 3),
`skills/dancing-with-the-sars/SKILL.md`, and **`docs/REDESIGN_GUIDE.md`** — they bind.
Repo: `aleforfab/Centrale`.

## Why

The interface is a generic dark SaaS dashboard. Round 3 rebrands the app as a
paper-and-ink editorial catalogue ("The SAR Field Catalogue"). You build the
foundation every other round-3 worker codes against — same names, same values,
no surprises.

## Deliverables (you own these files, all of them)

1. **`app/globals.css`** — rewrite. Keep `@tailwind base|components|utilities`.
   Set `color-scheme: light`. First line must be the runtime font import
   (browser-side, never build-time):
   `@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap");`
   then the fixed token set from REDESIGN_GUIDE §3, `::selection`, focus-visible,
   global `prefers-reduced-motion` kill-switch, body base (`--paper`, `--ink-soft`,
   Archivo body font, mono for `code,kbd,samp`).
2. **`app/redesign.css`** — rewrite completely. Inventory **every** class the app
   imports today (`git grep -hoE 'class(Name)?="[^"]+"'` and the current file)
   and map it onto the new system **keeping class names** (`.tm-*`, `.app-shell*`,
   `.site-nav*`, `.redesign-content`). New fixed-name vocabulary classes from
   REDESIGN_GUIDE §5 must exist here (`.plate`, `.plate__tag`, `.plate__caption`,
   `.index-row`, `.rule-table`, `.colophon`, `.chapter-button`,
   `.field`, `.footnote`). Old `.tm-problem`/`.tm-notice` may become
   `.colophon`-styled aliases; do not delete any name other workers or pages
   import without ANNOUNCE. Values change; names don't. Delete only classes you
   can prove dead (`git grep` evidence in the report — same bar as slice 06).
3. **`components/AppShell.tsx`** — restructure to the masthead (brand row:
   wordmark + page `eyebrow`; right `.app-shell__status` slot unchanged in API).
   Same props (`current`, `eyebrow`, `title`, `subtitle`, `status`, `children`).
   Brand line `Dancing with the SARs` stays (L-band product — unchanged).
4. **`components/SiteNav.tsx`** — chapter nav per guide (Dashboard / Before/After /
   Time Machine); hairlines, mono small-caps, active state via `aria-current` +
   accent rule. Do **not** add a Method link (worker 09 adds it with ANNOUNCE).
5. **`components/RegionSelector.tsx`** — restyle only (classes). Logic, map
   interactions and bbox semantics untouched.
6. **`components/LiveScanPanel.tsx`** — restyle only (classes). **Fetch/poll/
   cancel/validation logic untouched.** `tests/live-scan-panel.test.tsx` stays green.
7. **`app/layout.tsx`** — metadata reword, flagged for maintainer review in the
   report (delete or keep the flag; the PR accepts maintainer edits):
   - `title`: `Dancing with the SARs — exact NISAR backscatter, measured change`
   - `description`: `Installed NISAR L-band GCOV products with exact dates, measured change statistics and full provenance. PROVISIONAL data; not a validated scientific result.`

## Explicitly out of scope

Pages (`app/page.tsx`, `app/compare/page.tsx`, `app/time-machine/page.tsx`) —
workers 08/09; `components/Map.tsx`, `WorldviewReview`, `TimeReview`,
`ComparisonViewer` — 08/09; new routes; backend; `next.config.mjs`; package
files/lockfile; any `@font-face`/build-time font; deleting `.tm-*` names other
files import.

## Verification gates (paste outputs)

```bash
cd dancing-with-the-sars-frontend && npm ci && npm run typecheck && npm test && npm run build
```

Report must include: class inventory old→new (counts), every renamed/deleted
class with `git grep` zero-match evidence, list of vocabulary classes added,
and a note that no visual browser check was possible from your sandbox (the
supervisor does the deployed-URL pass).

## Hand-in

Report at `agent-team/reports/07-design-foundation.md` (CONTRACT §4). Draft PR
when green. Do not merge. Rebase note: worker 08/09 branch from `7333923`
like you; if 07 merges first they rebase — say so in your report.
