# VM deployment runbook (Google Cloud, Debian 13)

**Nothing in this file has been executed on the VM yet.** It is the plan that
follows the migration. Steps are ordered so each one can be verified before the
next. The migration blocker is described in [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md).

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

## Step 1 — Clone Centrale and confirm the commit

Run on the VM after the migration commit exists:

```bash
cd ~
git clone --branch arena/d252cdc7-centrale \
  https://github.com/aleforfab/Centrale.git centrale
cd centrale
git log --oneline -3
git rev-parse HEAD
```

`git rev-parse HEAD` must print the commit ID announced at the end of the
migration. If it prints something else, stop and report it.

## Step 2 — Decide the Python interpreter before installing anything

The backend was tested under Python 3.11. The VM has Python 3.13. The pinned
geospatial stack (`rasterio`, `h5py`, `pyproj`, `scipy`) may not publish wheels
for 3.13 on this platform, and a source build of GDAL/PROJ is slow and fragile.

Check first, without changing the system Python:

```bash
cd ~/centrale/dancing-with-sars-backend
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
```

Report the full output if it fails. If a wheel is missing, the preferred fix is a
separately installed supported interpreter (for example a `python3.11` venv via
`uv` or `deadsnakes`), not replacing Debian's `python3`.

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

Then generate the synthetic input and build it (the generator name is confirmed
only after migration; do not guess it):

```bash
cd ~/centrale/dancing-with-sars-backend
python -m scripts.make_demo_site --output /srv/dancing-sars/demo-input

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
npm run typecheck
npm test          # only if the migrated tree includes the test runner
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
| 2 Python environment | not started |
| 3 Backend tests on VM | not started |
| 4 Synthetic rehearsal on VM | not started |
| 5 Frontend build on VM | not started |
| 6 Loopback services | not started |
| 7 Caddy | not started |
| 8 Network review | not started |
| Real NISAR case | not started, and not implied by any step above |
