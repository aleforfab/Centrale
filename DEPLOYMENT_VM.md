# VM deployment runbook (Google Cloud, Debian 13)

**Nothing in this file has been executed on the VM yet.** It is the plan that
follows the migration. Steps are ordered so each one can be verified before the
next. Current state: [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md).

Console-side work (billing, firewall, IAM, snapshots, IP, costs) lives in
[`GCP_CHECKLIST.md`](GCP_CHECKLIST.md) and is owned by the project's Google Cloud
lead. This file starts at SSH.

## Already completed on the VM — do not repeat

Verified previously through SSH:

- Debian GNU/Linux 13 (trixie), x86_64, ~7.8 GiB RAM.
- Boot disk grown to 50 GB (`growpart` + `resize2fs` applied, `/` at 49 GB).
- Installed: `git 2.47.3`, `Python 3.13.5`, `Node.js 20.19.2`, `npm 9.2.0`,
  `build-essential`, `python3-venv`, `python3-dev`, `cloud-guest-utils`.
- Compute Engine service account set to **None**.
- Firewall: SSH works; "Allow HTTP traffic" and "Allow HTTPS traffic" were
  enabled. The effective target tags still need a final review (step 8).

Do not reformat the disk, recreate the VM, or redo IAM.

## Step 1 — Clone Centrale and confirm the baseline

The application work was merged into `main` through pull request #1 (merge commit
`3ae4123`). Deploy from `main`, not from an agent session branch.

```bash
cd ~
git clone https://github.com/aleforfab/Centrale.git centrale
cd centrale
git log --oneline -3
git rev-parse HEAD
git merge-base --is-ancestor 3ae4123 HEAD && echo "baseline present" || echo "BASELINE MISSING"
```

Expected: `baseline present`. `git rev-parse HEAD` will print whatever the current
tip of `main` is — teammates may have merged further work since. **Record that
ID** in your notes, because it is the exact code you are running.

If the check prints `BASELINE MISSING`, stop and report it: you would be deploying
an older tree than the one that was verified.

Update later with `git pull --ff-only`, which refuses to create a surprise merge
commit on the VM.

## Step 2 — Python environment (the wheel question is answered)

**Verified on the VM on 2026-11-14.** A throwaway venv on Python 3.13.5 resolved
native wheels for every package, including the compiled geospatial stack:

| Package | Wheel installed on the VM (cp313) |
| --- | --- |
| rasterio | 1.5.2 |
| h5py | 3.16.0 |
| pyproj | 3.8.0 |
| scipy | 1.18.1 |
| numpy | 2.5.4 |
| pydantic | 2.14.3 |
| fastapi | 0.162.7 |

So no GDAL/PROJ source build is needed, and the Python 3.11 fallback is **not**
required. Debian's system Python stays untouched; everything lives in a venv.

### Expect slightly newer versions than CI tests

Pinned lower bounds in `requirements.txt` mean the VM takes the newest compatible
release. On Python 3.11 (what CI and the agent sandbox use) pip resolves
**rasterio 1.4.4 / numpy 2.4.6 / pyproj 3.7.2 / scipy 1.17.1**, because newer
releases have no 3.11 wheels. On 3.13 it takes rasterio 1.5.x and numpy 2.5.x
instead.

Consequence: **`pytest` on the VM is the decisive check**, not the sandbox run. If
it fails, compare the installed versions against the table above before changing
any code, and pin the version that works rather than upgrading the interpreter.

```bash
cd ~/centrale/dancing-with-sars-backend
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
./.venv/bin/python -m pytest -q
```

Expected: 78 passed. `-r requirements-dev.txt` adds `pytest`, `httpx` and `ruff`,
which are needed for the checks but not for serving.

If a wheel were ever missing, the preferred fix is a separately installed
supported interpreter (a `uv`-managed 3.11 venv), never replacing Debian's
`python3`.

## Step 3 — Backend tests

```bash
cd ~/centrale/dancing-with-sars-backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/ruff check .
PRODUCTS_DIR=./products .venv/bin/pytest -q
```

Expected: ruff clean, all tests pass. Record the number.

## Step 4 — Synthetic rehearsal

Create a persistent data root first:

```bash
sudo mkdir -p /srv/dancing-sars/{granules,products,cache}
sudo chown -R "$(whoami)":"$(whoami)" /srv/dancing-sars
```

Then generate the synthetic input and build it. The generator exists in this
repository and was exercised in the sandbox; it has not been run on the VM yet.

```bash
cd ~/centrale/dancing-with-sars-backend
python -m scripts.make_demo_site --output /srv/dancing-sars/demo-input
# Re-running needs --force, or delete /srv/dancing-sars/demo-input first.

PRODUCTS_DIR=/srv/dancing-sars/products CACHE_DIR=/srv/dancing-sars/cache \
python -m nisar.cli build-site \
  --config /srv/dancing-sars/demo-input/site.yaml \
  --local-dir /srv/dancing-sars/demo-input/granules

PRODUCTS_DIR=/srv/dancing-sars/products \
python -m nisar.cli verify --site demo-fixture
```

This is a software rehearsal, not evidence of a real change.

## Step 5 — Frontend install and build

```bash
cd ~/centrale/dancing-with-the-sars-frontend
npm ci
cp .env.example .env.local   # then edit in your editor; do not paste secrets in chat
npm run typecheck
npm test
npm run build
```

`NEXT_PUBLIC_MAPBOX_TOKEN` must be a URL-restricted public token supplied in an
untracked `.env.local`. It is not committed and must not be pasted into chat.

## Step 6 — Services on loopback

- FastAPI: `127.0.0.1:8000`, non-root systemd unit, `PRODUCTS_DIR=/srv/dancing-sars/products`.
- Next.js: `127.0.0.1:3000`, non-root systemd unit, `BACKEND_URL=http://127.0.0.1:8000`.
- Leave `NEXT_PUBLIC_API_URL` unset so the browser stays same-origin.

Check from the VM itself:

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:3000 | head -c 200
```

## Step 7 — Caddy

Temporary HTTP-only configuration:

```caddy
:80 {
    reverse_proxy 127.0.0.1:3000
}
```

Ports 3000 and 8000 stay unexposed. HTTPS requires a real hostname pointing at
the VM's **current** external IP; the IP may have changed while the VM was
stopped, so re-check it before any DNS work.

## Step 8 — Networking review before claiming success

Confirm in the console:

- TCP 80 and 443 rules exist and their target tags match this VM.
- No public rule exposes 3000 or 8000.
- SSH remains usable.
- Firewall logging/Firewall Insights stay off unless deliberately needed.
- Snapshot schedule status (the `default-schedule-1` question) and the machine
  type are still unconfirmed; check rather than assume.

## Status of this document

| Step | Status |
| --- | --- |
| 1 Clone | not started |
| 2 Python environment | **wheel check done** on the VM (3.13.5, all wheels resolved). Full install and `pytest` still pending |
| 3 Backend tests on VM | not started |
| 4 Synthetic rehearsal on VM | not started |
| 5 Frontend build on VM | not started |
| 6 Loopback services | not started |
| 7 Caddy | not started |
| 8 Network review | not started |
| Real NISAR case | not started, and not implied by any step above |
