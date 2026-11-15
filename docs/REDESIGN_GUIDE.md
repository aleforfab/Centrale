# Redesign guide — “The SAR Field Catalogue”

Round 3 (2026-11-15). Authoritative for workers 07/08/09. Read this before any code.

## 1. Position

**Before:** near-black slate (`#020617`), amber-on-dark, “cinematic radar
workspace” — a generic dark-mode SaaS dashboard. Ornate, low information density,
same look as every other satellite hackathon project.

**After:** an **editorial field catalogue** — paper surfaces, ink type, 1 px
hairline rules, catalogue row indexes, figure plates, marginalia provenance, one
accent colour. Reference language: `havu.cc/en` (a Tokyo design studio):

- sections numbered like chapters (`01 — …`)
- fused grotesque display type (sentences set solid, huge, tight tracking)
- paper/off-white surfaces with near-black ink
- ruled tables instead of cards; blueprint/diagram identity over decoration

We borrow **language and structure**, never their assets, copy, or name. No
bilingual JP/EN texture, no marquees across the app, no invented credentials.

## 2. What maps from havu.cc to Dancing with the SARs

| havu.cc pattern | Here |
| --- | --- |
| Chapters `01—Issue … 12—FAQ` | Figure/entry numbering: `FIG. 01` plates, `ENTRY 01–05` frames, `/method` sections 01–06 |
| Fused grotesque headlines | Archivo 800/900, −0.02em tracking; **used sparingly** — this is a tool, every page is not a poster |
| Paper + ink + single accent | `--paper` / `--ink` / `--accent` tokens (below) |
| Blueprint as centerpiece | The Map **is** the blueprint plate; provenance as figure caption + marginalia |
| Ruled comparison table | `/method` table: “What the numbers say / what they do not” |
| Pixels catalogue entries | `/method` colophon: the five PROVISIONAL granules as catalogue rows |
| FAQ accordions | None. `/method` is plain sections — fewer clicks, less theatre |

## 3. Tokens (names are fixed — do not rename)

```css
--paper:#FAF9F6;  --paper-2:#F3F1EC;  --paper-3:#E9E6DE;
--ink:#16130F;    --ink-soft:#3E3A33; --ink-mute:#6E695E;
--hairline:rgba(22,19,15,.16);  --hairline-strong:rgba(22,19,15,.32);
--accent:#C2410C;               /* text + UI on paper — AA */
--accent-graphic:#FF8A3D;       /* marks only, large or non-text */
--accent-dim:rgba(194,65,12,.10);
--colophon:#EDE7DA;
--font-display:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;
--font-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--radius:2px;  --shadow:none;
```

- Body text: `--ink-soft` on `--paper`. Muted: `--ink-mute`. Headings: `--ink`.
- `--accent` for links/primary accents; never `--accent-graphic` for small text.
- **On-imagery chips** (map overlays) are the one dark exception: `rgba(13,12,10,.88)`
  bg, `#F5F3EC` text. Imagery is dark; paper chips would glare and fail contrast.

## 4. Type & layout

- Base: `15px/1.55` ink-soft. Labels: `11px` mono, `0.18em` tracking, uppercase, ink-mute.
- Display: Archivo 800/900, `letter-spacing:-0.02em`, sizes via `clamp()`.
- Grid: 12-col; gutter `clamp(16px,4vw,56px)`; `max-width:1360px` centred; section gaps 28–40 px.
- Hairlines (1 px `--hairline`) between every section; plates get `1px --hairline-strong` borders.
- Radius `2px`; no shadows; **no gradients**; no blur/glass; no emoji decoration.
- Focus-visible: `2px solid var(--accent)`, `outline-offset:2px`.
- `::selection { background: var(--accent-dim); }`
- `prefers-reduced-motion`: global kill-switch in `globals.css` (already expected — keep).
- Motion: 160–220 ms, opacity/transform only.

## 5. Component vocabulary — exported by worker 07 in `app/redesign.css` (names fixed)

| Class | Purpose |
| --- | --- |
| `.masthead` / `.app-shell*` | hairline-bottom masthead: brand row (wordmark `Dancing with the SARs`, Archivo 800, eyebrow small-caps above) + right `.app-shell__status` mono small-caps; second row = `.site-nav` chapters |
| `.site-nav__link` | mono small-caps 11 px, hover hairline underline; active = ink + 2 px accent bottom rule; `aria-current="page"` |
| `.plate` | figure section: hairline-strong border, paper bg; inside header row = `.plate__tag` (mono, accent index, e.g. `FIG. 01 — ASCENDING FRAME 010`) + right mono muted tag |
| `.plate__caption` | strip under plate: mono 10–11 px, ink-mute |
| `.index-row` | catalogue list rows separated by hairlines; hover `--paper-2` |
| `.rule-table` | stats as a printed table: hairline row rules, right-aligned mono numerals |
| `.colophon` | **the caveat component** — `3px` `--accent-graphic` left rule, `--colophon` bg, ink text. Replaces all red/amber alert styling. Used for PROVISIONAL, synthetic, refusal, and “no substitution” copy |
| `.chapter-button` (+ `--primary`, `--ghost`) | mono small-caps; hairline border; primary = ink bg + paper text; disabled = ink-mute dashed |
| `.field` | form control wrapper: label = mono 10 px small-caps ink-mute; input = `--paper-2`, hairline-strong border, ink text, mono values, accent focus ring |
| `.footnote` | mono 10–11 px ink-mute, provenance blocks |

`.tm-*` classes currently imported by pages are restyled to this system by 07
(values change; **names stay** unless ANNOUNCEd). `.tm-problem`/`.tm-notice`/
`.tm-stage__badge` variants become `.colophon`; a compat alias may keep old
names working for one round, deleted in round 4.

## 6. Page compositions

### `/` — The Observation Plate
Grid `1fr / 380px` rail.
- Left column: `.plate` with the map; caption under it: `FIG. 01 — <site title> · <pol> · <kind> · <date|window>` + caveat line (`.plate__caption`).
- Right rail (`--paper-2` panel, mono section tags with hairline separators):
  `SITE` — title, description, `.colophon` caveat, source chips (mission/band/product/maturity/CRID).
  `LAYERS` — unified radio+toggle index rows + legend `.footnote`.
  `ACQUISITIONS` — numbered catalogue rows: `date · cycle · granule (mono, truncated) · CRID` + ASF link.
  `MEASURED CHANGE` — `.rule-table` of decrease/increase/coverage/noise/sigma + spark histogram as ink bars + “measured outputs, not a cause” `.footnote`.

### `/compare` — The Diptych
- Header row: two cells, each mono small tag (`BEFORE` / `AFTER`) + big Archivo 900 date.
- Plates side-by-side; slider = 1 px hairline with paper handle + mono `REVEAL` tab (dark chips on imagery stay).
- Selection row above: two `.field` date pickers + pol field; availability as one mono line subordinate to the pickers.
- `.colophon` under plates: caveat + verbatim “No substitute date, polarization or difference layer is used.”

### `/time-machine` — The Field Log
- Left rail chapters: `01 REGION` (RegionSelector plate) then `02 WINDOW & FETCH` (LiveScanPanel plate; progress as mono log lines `stage · percent`).
- PROVISIONAL banner → `.colophon`.
- Viewer plate: `ENTRY 0N — <date>` (Archivo 900), phase tag (small accent caps), frame strip = mono date buttons (active = accent underline), play/pause = `.chapter-button`, timeline = paper-styled range.
- `EXACT ACQUISITIONS` — `.rule-table` of provenance rows. Missing dates stay `· unavailable`.

### `/method` — Method & provenance
Two compact sections with mono index tags:
01 Observations — NISAR L-band GCOV, installed dates, polarization, stack and product maturity.
02 Products — gamma-to-sigma normalization, dB difference layers, threshold masks and source links.

### 404 — `PAGE NOT IN THE CATALOGUE` + three links (worker 09).

## 7. Voice
No exclamation marks. Short declaratives. Numbers before adjectives.

## 8. Implementation constraints
No new dependencies; CSS variable names fixed; `app/globals.css` and
`app/redesign.css` are worker 07's only stylesheets; **no build-time font fetch**
— fonts arrive via runtime `@import` in `globals.css`; workers 08/09 never edit
07's files; tests may be updated to match changed copy (say so in the report);
treat reports 04/05/06 known-gaps as historical notes.

## 9. Merge order & integration
07 → 09 → 08. Workers rebase on each prior merge if asked. Supervisor runs the
full matrix + deployed-URL check after all three merge (VM rebuild is part of
that pass — it also carries the deferred `NEXT_PUBLIC_API_URL` removal).
