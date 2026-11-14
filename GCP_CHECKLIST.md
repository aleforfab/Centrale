# Google Cloud checklist — your part of the project

This document is the **cloud owner's** runbook: console checks, cost guardrails,
network correctness, and the order of operations. The application side (code,
tests, build commands) is in [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md) and
[`docs/IMPLEMENTATION_HANDOFF.md`](docs/IMPLEMENTATION_HANDOFF.md).

Ground rule for this project: **we are a weekend workload with a $300 trial
credit, aiming to stay well below $100.** That is a planning target, not a Google
quote. Every price must be read from your own console, not from this file.

---

## Part A — Already done. Do not repeat these

Verified earlier through SSH or the console:

| Item | State |
| --- | --- |
| VM name / zone | `dancing-sars-weekend` / `europe-west9-b` |
| OS | Debian GNU/Linux 13 (trixie), x86_64 |
| RAM | ~7.8 GiB usable |
| Boot disk | grown to **50 GB** balanced PD, `/` at ~49 GB (6% used) |
| Tools | git 2.47.3, Python 3.13.5, Node 20.19.2, npm 9.2.0, build-essential, python3-venv, python3-dev, cloud-guest-utils |
| Compute service account | **None** (deliberately detached) |
| HTTP / HTTPS | "Allow HTTP traffic" and "Allow HTTPS traffic" saved on the VM |

Do not resize the disk again, do not recreate the VM, do not redo the IAM change.
Do not create a service-account key file.

---

## Part B — Ten checks, in this order

Each step says what to do, what "correct" looks like, and what to send back. Use
**Cloud Shell** in the console (the `>_` icon, top right) for the read-only
commands: it is already authenticated, costs nothing extra, and you never create
or download a key. Cloud Shell is its own machine — do **not** run the app's
processing there.

### Step 1 — Billing guardrails before anything else

1. Console → **Billing** → confirm the project's billing account is the one with
   the credit, and check **Credits** for the remaining amount and expiry date.
2. Billing → **Budgets & alerts** → create a budget scoped to this project:
   - Amount: **$50** (a warning line, not a cap)
   - Alerts at 50%, 90%, 100% of that amount, emailed to you
3. Optionally a second budget at **$150** as a second fence.

**Know this:** a budget alert does *not* stop anything. It emails you. Nothing in
Google Cloud will switch the VM off for you.

Correct result: two budget entries visible, and you can state the credit's expiry
date in your own words.

Send back: credit remaining + expiry date, and confirmation the budget exists.

### Step 2 — Record the true baseline (one paste)

In Cloud Shell, with the project selected in the console top bar:

```bash
gcloud config list --format="value(core.project)"
gcloud compute instances describe dancing-sars-weekend \
  --zone=europe-west9-b \
  --format="value(machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP,serviceAccounts.email)"
gcloud compute disks list --format="table(name,zone,sizeGb,type.basename(),users.basename())"
gcloud compute addresses list --format="table(name,address,status,region)"
```

Why: **the project ID must be confirmed, not inferred** from a display name, and
the machine type has never been read conclusively. `serviceAccounts.email` empty
is the proof that the service account is detached (it should print nothing for
that field).

Send back: the four outputs, verbatim.

### Step 3 — Machine shape

Correct for this workload: **2 vCPU / ~8 GB**, e.g. `e2-standard-2`. No GPU, no
extra attached disks, no second instance.

If the machine type is larger (e.g. `e2-standard-4`), that is roughly double the
hourly cost for a weekend workload that does not need it — shrinking it requires a
stop, so decide now rather than mid-event. Disk type should be **balanced PD**
(standard is cheaper but slower; SSD is more expensive than needed here).

Send back: machine type string and whether you are content with it.

### Step 4 — Identity hygiene (mostly done, just confirm)

- Compute Engine → VM → **API and identity management** → Service account:
  **None**. Already done.
- IAM & Admin → **Service Accounts** → confirm no user-managed keys exist for any
  account: the "Keys" column should show 0 or only Google-managed keys.
- APIs & Services → **Enabled APIs**: do not enable Earth Engine, Cloud Storage,
  BigQuery, or Kubernetes for this deployment. Each adds surface and possible
  cost, and the app needs none of them today.

If later we want private Cloud Storage for large products, the correct pattern is
a **narrowly scoped attached service account** (bucket-scoped object permissions),
not a downloaded JSON key. Decide then, not now.

Send back: confirmation of "Service account: None" plus the list of enabled APIs.

### Step 5 — Firewall correctness (the usual source of silent failures)

Console → VPC network → **Firewall**. For each rule, open it and check the
**Targets** column, not just the ports.

Correct end state:

| Rule | Ports | Source | Target | Notes |
| --- | --- | --- | --- | --- |
| `default-allow-ssh` | 22 | 0.0.0.0/0 | all instances | keeps you logged in |
| `default-allow-http` (or similar) | 80 | 0.0.0.0/0 | **this VM** (tag or all) | Caddy HTTP |
| `default-allow-https` (or similar) | 443 | 0.0.0.0/0 | **this VM** | Caddy HTTPS |
| `default-allow-internal` | all | 10.128.0.0/9 | all instances | private range only, fine |
| Nothing else | — | — | — | **no rule may expose 3000 or 8000** |

The failure mode to look for: a rule exists with port 80 allowed but its target
tag does not match the VM's network tags, so it has no effect. Compare the VM's
**Network tags** (VM details page) with the rules' target tags.

Even though 3000/8000 must never be exposed, the services bind to `127.0.0.1`
anyway — that is deliberate defence in depth.

Send back: a screenshot or table of every firewall rule with Targets and Ports
visible, plus the VM's network tags.

### Step 6 — Snapshots and orphaned resources

1. Compute Engine → **Snapshots** → **Snapshot schedules**: check whether
   `default-schedule-1` is still attached to the disk (Step 2's `disks list` does
   not show policies; use the disk's details page or
   `gcloud compute disks describe <disk> --zone europe-west9-b --format="value(resourcePolicies)"`).
   For a rebuildable rehearsal VM this is unnecessary spend: **detach it**.
2. Check for existing snapshots, images, unused reserved IPs, extra disks, and
   storage buckets you did not intend to create.

Remember: a **stopped** VM still bills for its disk, and a **reserved but unused**
static IP also costs money.

Send back: snapshot schedule status, and whether any snapshots/buckets exist.

### Step 7 — Logging and monitoring restraint

Do not enable: Firewall Insights, VPC Flow Logs, Cloud Logging sinks/exports,
extra monitoring agents, or uptime checks with paid alerting. Plain compute
logging is fine; the app's own logs go to journald on the VM.

Disabled logging does **not** mean the firewall is disabled — that confusion cost
time earlier.

Send back: nothing, unless you changed something here.

### Step 8 — Deploy the application (order matters)

Full commands: [`DEPLOYMENT_VM.md`](DEPLOYMENT_VM.md). The sequence, and why:

1. **Clone and verify the commit.** You must see
   `f5ce7eef7e2f5f5997baefb03c99871e24df3f37`.
2. **Python environment — the real risk.** The VM has Python 3.13; the backend
   was tested on 3.11. Run `python3 -m venv .venv` and install `requirements.txt`,
   then send me the output. Geospatial wheels (`rasterio`, `h5py`, `pyproj`,
   `scipy`) may be missing for 3.13. Do not replace Debian's Python and do not
   start a GDAL source build — there are cheaper routes.
3. **Backend tests**, then **synthetic rehearsal** (`make_demo_site` →
   `build-site` → `verify`). Stop and report if any step fails.
4. **Frontend** `npm ci && npm test && npm run build`.
5. **systemd units** for FastAPI (127.0.0.1:8000) and Next.js (127.0.0.1:3000),
   running as your normal user, not root.
6. **Caddy** on :80 proxying to 127.0.0.1:3000. HTTPS comes only after Step 9.

Send back after each numbered step, not at the end. A failure at step 2 makes
steps 3-6 meaningless.

### Step 9 — Public exposure and HTTPS decision

Two valid paths:

- **No domain (fastest):** Caddy serves plain HTTP on port 80. The app works. In
  the Mapbox dashboard, restrict the token to `http://<current-external-IP>` (or
  the preview URL you use) — an unrestricted public token is the thing that costs
  money if it leaks.
- **With a domain:** reserve a **static** external IP, attach it to the VM, point
  an A record at it, then let Caddy obtain a certificate automatically. Only then
  is HTTPS real: an open port 443 is not evidence that TLS works.

Note the consequence of the earlier stop/start: the VM's ephemeral IP may have
changed. Re-read it before any DNS work, and if you reserve a static IP, do it
while the VM is running so it takes over the address.

Send back: which path you chose, the current IP, and whether you own a domain.

### Step 10 — Cost review after the first day

1. Billing → **Reports**, grouped by service, last 24 hours.
2. Check specifically: Compute Engine (VM hours), Persistent Disk storage,
   external IP charges, snapshot storage, network egress.
3. Compare with your budget line. If spending is above plan, the usual causes are
   a larger machine type, snapshots left attached, a second disk, or a reserved
   static IP you are not using.

**Teardown when the weekend ends** (do this so the credit survives):
stop or delete the VM, release any static IP you reserved, delete snapshots,
delete any buckets, and delete the budget is optional but keep it for the record.

---

## Part C — What I need from you, and nothing else

| # | Item | How |
| --- | --- | --- |
| 1 | Project ID | Step 2 output |
| 2 | Machine type + disk type | Step 2 output |
| 3 | External IP + static or ephemeral | Step 2 output |
| 4 | Firewall rules with targets + VM network tags | Step 5 |
| 5 | Snapshot schedule status | Step 6 |
| 6 | Credit remaining + expiry, budget confirmed | Step 1 |
| 7 | Whether you own a domain | your answer |
| 8 | Python 3.13 install output | Step 8.2 |

Never send: passwords, tokens, service-account keys, Mapbox tokens, Earthdata
credentials, or full `.env` files. If a command output contains an IP or project
ID, that is fine.

---

## Part D — Mistakes that bite this specific project

1. **Assuming a firewall rule applies because it exists.** Check target tags.
2. **Confusing "Allow HTTP traffic" with a working app.** It only permits port 80;
   Caddy still has to run and the app still has to answer.
3. **Deleting `default-allow-ssh` or turning on "Block project-wide SSH keys"**
   while relying on those keys to log in. You can lock yourself out.
4. **Reserving a static IP you then forget**, paying for an address attached to
   nothing.
5. **Leaving the snapshot schedule on** for a VM you can rebuild from git in five
   minutes.
6. **Recreating the VM with Ubuntu** because a tutorial said so — the existing
   Debian VM is already provisioned and correct.
7. **Enabling BigQuery, GKE, Cloud SQL or a load balancer** "to be safe". All four
   are outside the agreed architecture.
8. **Running processing on the free Cloud Shell**, which has a small disk and a
   usage quota.
9. **Believing a green CI run means the science is validated.** It means the
   software runs; the scientific gaps are listed in
   [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md).
10. **Quoting a price from a document instead of the console.** Prices, credits
    and eligibility change; the console is authoritative.

---

## Part E — Division of labour, so we do not duplicate work

| Area | Owner |
| --- | --- |
| Google Cloud console: billing, firewall, IAM, snapshots, IP, domain, costs | **You** |
| VM provisioning already completed (OS, disk, tools, service account) | Done, verified |
| SSH steps: clone, venv, tests, synthetic rehearsal, npm, systemd, Caddy | You run, I diagnose from pasted output |
| Application code, tests, docs, fixes | Me, on `arena/d252cdc7-centrale` |
| Scientific review of any real case | Neither of us alone — needs a reviewer with radar background |

Cloud settings I claim nothing about are exactly the ones in Part C. I have not
inspected your console; everything in Part A came from your earlier screenshots
and SSH output.
