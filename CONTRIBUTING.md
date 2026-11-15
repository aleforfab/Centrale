# Contributing — how we avoid merge pain

Three people share this repository and the deadline is close. Most merge
disasters are avoidable with discipline that costs nothing, so this page is short
and practical. Read the four rules at the top; the rest is reference.

---

## The four rules that matter

1. **Short branches, merged fast.** One concern per branch, merged within a
   working day. A branch that lives three days will conflict, no matter how
   careful you are.
2. **Pull main into your work every morning and before you push.** Small,
   frequent integrations turn a scary conflict into a trivial one.
3. **Announce before editing a shared file.** Shared files are listed below. If
   you must touch one, say so in the chat and open a draft PR, so nobody else
   starts from the same assumption.
4. **Never force-push `main`, never hand-edit `package-lock.json`, never commit
   generated data.** Everything else is recoverable; these three are not.

---

## Branches and pull requests

```bash
# once, after cloning
git clone https://github.com/aleforfab/Centrale.git
cd Centrale
git switch main && git pull

# start work
git switch -c feat/compare-slider      # or fix/, docs/, chore/

# save work
git add -A && git commit -m "Add reveal slider to comparison viewer"

# keep up with main
git fetch origin
git rebase origin/main                 # your own branch only

# publish
git push -u origin feat/compare-slider
```

Then open a pull request into `main`, fill in the template, and ask for one
review. Merge only when CI is green.

Branch names: `feat/…`, `fix/…`, `docs/…`, `chore/…`. The session branches named
`arena/…` belong to the automated agent sessions; do not push to them and do not
merge them from a PR you did not open.

### If you rebased your own branch

```bash
git push --force-with-lease
```

`--force-with-lease` refuses to overwrite work you have not seen. Plain
`--force` is banned. Force-pushing `main` or a branch someone else is building on
is banned too.

---

## Who edits what (lanes)

Work in your lane. Crossing lanes is what creates conflicts.

| Lane | Typical files |
| --- | --- |
| Backend pipeline | `dancing-with-sars-backend/nisar/`, `scripts/`, `tests/`, `routers/`, `services/` |
| Dashboard UI | `dancing-with-the-sars-frontend/app/page.tsx`, `components/Map.tsx`, `DanceChart.tsx`, `ControlPanel.tsx`, `TimeScrubber.tsx`, `AsfGranules.tsx` |
| Content pages | `app/applications/`, `app/compare/`, `app/setup/`, `lib/applications.ts`, `lib/comparison.ts`, `components/ComparisonViewer.tsx`, `public/resources/` |
| Cloud and deployment | `GCP_CHECKLIST.md`, `DEPLOYMENT_VM.md`, service units and Caddy config (kept outside the repo) |
| Docs and course | `README.md`, `docs/`, `learning-guide/`, `skills/` |

### Shared files — announce first

These are touched by everyone, so they conflict most often:

| File | Rule |
| --- | --- |
| `dancing-with-the-sars-frontend/lib/types.ts` | Add fields at the end of an interface. Do not rename or reorder existing fields without telling everyone. |
| `dancing-with-the-sars-frontend/lib/api.ts` | Add one small function per PR. |
| `package.json` | One dependency change per PR, and say so in the PR title (`chore(deps): …`). |
| `package-lock.json` | Never edit by hand. Always regenerate. Recipe below. |
| `.github/workflows/ci.yml` | Coordinate before changing; a broken CI file blocks everyone. |
| `README.md`, `CONTRIBUTING.md` | Append a section; do not reformat the whole file. |
| `app/layout.tsx`, `components/SiteNav.tsx` | Shared shell; keep changes minimal. |

### Additive by default

In shared lists — application topics, API routes, nav links, test cases — **append
at the end**. Do not renumber, reorder or reword existing entries to look tidier.
That is what turns a two-line addition into a full-file conflict.

---

## When a conflict happens

```bash
git fetch origin
git switch my-branch
git rebase origin/main
# edit each conflicted file, then:
git add <file>
git rebase --continue
```

Useful escape hatch at any point:

```bash
git rebase --abort
```

You are back to where you started, with nothing lost.

### Lockfile conflict (the one everyone hits)

Do not merge lockfiles by hand. Take `main`'s version and regenerate:

```bash
git checkout origin/main -- dancing-with-the-sars-frontend/package-lock.json
cd dancing-with-the-sars-frontend
npm install                    # regenerates the lockfile from your package.json
git add package-lock.json
```

Verify with `npm ci` (it must not complain) before finishing the rebase.

### Binary conflict

`.h5`, `.png`, `.pdf`, `.tif` cannot be merged. Pick one side explicitly:

```bash
git checkout --ours  path/to/file     # keep your branch's copy
git checkout --theirs path/to/file    # keep the incoming copy
```

Then regenerate the artifact if it is produced by a script — that is the safer
answer for anything generated.

---

## Never commit these

`.env`, `.env.local`, any token or key, `node_modules/`, `.next/`, `venv/`,
`.venv/`, `products/`, `.cache/`, downloaded granules, and generated tiles. They
are in `.gitignore`; do not add exceptions for convenience, and never
`git add -f` them.

If a commit already contains a secret, tell the owner immediately — rotating the
secret is faster than rewriting history during an event.

---

## Before you open a PR

```bash
# backend
cd dancing-with-sars-backend && ruff check . && pytest -q

# frontend
cd dancing-with-the-sars-frontend && npm run typecheck && npm test && npm run build
```

The PR template repeats this. CI runs it too, but a green CI is not a substitute
for having run it yourself — CI takes a minute, you will see the failure sooner.

## Merging to main

- **Merge order:** backend first, then shared types, then UI that depends on them.
  If two PRs touch the same lane, merge one, let the other rebase.
- **Integration owner (merge captain):** one person decides the order and merges.
  On this project that is whoever is not mid-feature. The role rotates, but there
  is always exactly one.
- **Fix forward, do not rewrite.** If something breaks on main, revert the PR
  (`git revert <sha>`) and fix it on a branch. Reverting is fast and transparent;
  force-pushing main to hide a mistake is not.
- **Code freeze:** stop merging features two hours before the submission deadline.
  After that, only fixes for things that are visibly broken.

---

## Repository settings to enable (owner, once)

These are done in GitHub → **Settings**, and they prevent most accidents:

1. **Branches → Add branch protection rule** for `main`:
   - Require a pull request before merging
   - Require status checks to pass: `backend`, `frontend`
   - Do not allow force pushes
   - Do not allow deletions
   - (Optional) Require linear history — keeps the log readable
2. **General → Automatically delete head branches** — keeps the branch list clean.
3. Keep the default branch as `main`. Do not add a long-lived `dev` branch; it
   only postpones conflicts and doubles the merging.

Until protection is on, the four rules at the top of this page are the only thing
keeping `main` usable. Treat them as mandatory.

---

## Quick reference

```bash
# what is mine right now?
git status && git branch --show-current

# what changed on main since I started?
git fetch origin && git log --oneline HEAD..origin/main

# what will my PR actually change?
git diff origin/main...HEAD --stat

# undo a local commit but keep the edits
git reset --soft HEAD~1

# temporarily park unfinished work
git stash push -m "wip: slider"
git stash pop
```
