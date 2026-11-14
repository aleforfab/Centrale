# EODMS / "SAR Toolbox Canada" as a SAR data source — assessment

Date: 2026-11-14

## TL;DR

- The linked page is **documentation**, not a data repo or an API: it is a wiki
  page in `eodms-sgdot/eodms-website` describing the EODMS **SAR Toolbox**, a
  semi-automated *processing service* for RADARSAT-2 / RCM Level-1 products.
  The imagery itself lives behind EODMS, not on GitHub.
- The SAR Toolbox is **not usable as a live data backend** for this app: access
  is restricted to Government of Canada employees and RCM-vetted users, orders
  are asynchronous (minutes to several days), and there is a 10-product order
  cap (30 for InSAR). Derived products are subject to an EULA.
- The same organisation **does** publish an open, programmatic SAR dataset that
  fits this app: **RCM CEOS-ARD (Analysis Ready Data)** — 30 m C-band compact
  polarimetry over Canada's landmass, 12-day revisit, cloud-optimized GeoTIFFs
  on public S3, discoverable through an unauthenticated STAC API.
- Recommendation: **keep the existing NISAR pipeline, add EODMS RCM-ARD as a
  second, separately-flagged source** via STAC/S3. Use the SAR Toolbox only if
  a specific derived product (e.g. InSAR ground deformation) is a hard
  requirement and a vetted EODMS account is available.

## 0. Correcting the premise: what this branch actually does

This branch has already moved off Earth Engine for its primary data path:

- `services/gee_service.py` + the `/api/gee/*` and `/api/asf/search` routes are
  a **legacy Sentinel-1 development fallback**, gated by
  `ENABLE_SENTINEL1_FALLBACK` (404 otherwise) in `main.py`.
- The primary path is `nisar/` + `routers/sites.py`: ASF-discovered **NISAR
  GCOV** HDF5 granules processed into static COGs/tiles/JSON and served as
  precomputed site products. No Earth Engine call happens on that path.

So "replace Earth Engine with SAR data" is already done in design terms. What
this proposal really asks is: **replace (or augment) the NISAR/ASF mission with
Canadian RADARSAT/RCM data from EODMS**. That is a mission/source swap, not a
GEE swap, and it has concrete consequences listed in §4.

## 1. What the linked "ToolBox SAR Canada" page actually is

Sources: [SAR Toolbox wiki (EN)](https://github.com/eodms-sgdot/eodms-website/wiki/SAR-Toolbox),
[La Boîte à outils RSO (FR)](https://github.com/eodms-sgdot/eodms-website/wiki/La-Bo%C3%AEte-%C3%A0-outils-RSO).

- The repo `eodms-sgdot/eodms-website` is the **front-end HTML/TypeScript for
  the EODMS website**; the linked URL is a wiki page (2–4 revisions, last
  edited 2024). It contains no imagery and no client library.
- CCMEO's SAR Toolbox is integrated into EODMS. It lets a user pick processing
  methods, save/reuse sequences, and receive an email when processed products
  are ready to download. Methods: radiometric calibration, ortho-rectification
  and mosaic, speckle filters (Lee, Gamma MAP, MMSE, median, mean), utilities
  (complex-to-detected, incidence angle), polarimetry (Pauli, Freeman-Durden,
  M-Chi/M-Delta, Touzi, compact-pol conversions), InSAR ground deformation,
  lake-ice extent, CEOS ARD.
- Limitations stated on that page:
  - "SAR Toolbox is currently available to Government of Canada employees as
    well as all RCM vetted users." Vetted status requires a security screening
    ([CSA: about access to RCM data](https://www.asc-csa.gc.ca/eng/satellites/radarsat/access-to-data/about.asp)).
  - Delivery is **not near-real-time**: "from few minutes to several days"
    depending on demand and data volumes.
  - Max **10 products per order** (30 for InSAR); InSAR/lake-ice categories
    cannot be combined with other categories.
  - Validation can reject an order (ERROR) or warn (WARNING).
  - "Products derived from the SAR Toolbox are all subject to End User License
    Agreement" — derived-product restrictions on redistribution.

Consequence: an order-based, human-account-bound, minutes-to-days workflow
cannot back an interactive map or an on-demand API endpoint. It is a
*batch preprocessing step*, at best.

## 2. The programmatic EODMS surface (the real integration targets)

| Layer | Endpoint / package | Auth | Use for this project |
|---|---|---|---|
| STAC catalog | `https://www.eodms-sgdot.nrcan-rncan.gc.ca/search` (`/search/search`, `/collections/{id}/items`) | public for many collections; bearer token for restricted ones | Discovery of `rcm-ard`, `r1-ard`, `RCMImageProducts`, `Sentinel-1` items |
| RCM CEOS-ARD assets | public S3 bucket `arn:aws:s3:::rcm-ceos-ard` (`ca-central-1`, `--no-sign-request`) | none | Direct COG reads (the ideal backend source) |
| REST/RAPI | `https://www.eodms-sgdot.nrcan-rncan.gc.ca/wes/rapi` via [py-eodms-rapi](https://github.com/eodms-sgdot/py-eodms-rapi), [eodms-api-client](https://github.com/m9brady/eodms-api-client) | EODMS account | Legacy search / order / download of Level-1 products |
| Processing service | OGC API - Processes; `SAR_Toolbox` process in [eodms-cli](https://github.com/eodms-sgdot/eodms-cli) (`process -pi SAR_Toolbox --inputs_json ... --submit`), plus `order_st` / `download_available` in `eodms_prompt.py` | EODMS account (vetted for ST) | On-demand derived products, async |
| Helper libs | [eodms-cli](https://github.com/eodms-sgdot/eodms-cli), [eodms-py](https://github.com/eodms-sgdot/eodms-py), [eodms-ogc-client-py](https://github.com/eodms-sgdot/eodms-ogc-client-py), [radarsat-notebooks](https://github.com/eodms-sgdot/radarsat-notebooks) | n/a | Reference implementations, not the data itself |

The CLI README confirms `SAR_Toolbox` is exposed as an OGC process
(`process --list_processes`) but that its `items` block takes legacy
`recordId`s rather than STAC UUIDs, i.e. it is an order workflow, not a
catalog query.

## 3. Recommended source: RCM CEOS-ARD (open data)

Sources: [AWS Open Data Registry — RCM CEOS ARD](https://registry.opendata.aws/rcm-ceos-ard/),
[EODMS STAC collection `rcm-ard`](https://www.eodms-sgdot.nrcan-rncan.gc.ca/search/collections/rcm-ard),
[radarsat-notebooks](https://github.com/eodms-sgdot/radarsat-notebooks).

- NRCan produces **CEOS-ARD over Canada's landmass** from 30 m compact-pol
  standard coverage, on the mission's **12-day revisit**, specifically to
  remove the "order, download, process Level-1 yourself" burden. It was the
  first polarimetric dataset approved by the CEOS ARD committee.
- Assets are **cloud-optimized GeoTIFFs on a public S3 bucket** with direct
  download links; the registry states no AWS account is required
  (`aws s3 ls --no-sign-request s3://rcm-ceos-ard/`).
- Verified live on 2026-11-14 with an unauthenticated STAC query
  (`/search/collections/rcm-ard/items?bbox=...&datetime=...`). A returned item
  contains: `rr` and `rl` backscatter COGs (`gamma()`), `rrrl` covariance
  matrix, `data_mask`, `local_inc_angle`, `gamma_to_sigma_ratio`, quicklooks,
  `product.xml` metadata, and an **EULA PDF asset**. STAC properties include
  `order_key`, `rcm_uuid`, `sequence_id`, `sar:polarizations` (`CH`, `CV`,
  `XC`), `sat:orbit_state`, `sat:relative_orbit`, `sar:frequency_band` (`C`),
  `ceosard:specification` (`NRB - POL`).
- Licensing: free of charge to the broadest extent possible, but the
  Government of Canada retains ownership; the **RCM Public User License
  Agreement** applies and the STAC collection metadata says
  `license: "proprietary"`. Any demo must show attribution and the EULA link;
  it is *not* public-domain data.
- Coverage caveat: **Canada landmass**, C-band, 30 m, 12-day cadence. Events
  outside Canada cannot be studied, and the pre/post pair granularity is 12
  days rather than NISAR's cycle-based stack.

### Live verification (2026-11-14)

- Unauthenticated `GET /search/collections/rcm-ard/items?bbox=...&datetime=...`
  and `GET /search/search?collections=rcm-ard&...` both returned items;
  `/search/collections/rcm-ard/queryables` exposes `datetime`, `geometry`,
  `order_key`, `sat:absolute_orbit`, `sar:product_type`, `end_datetime`.
- The catalog is **still being produced**: a 2026-06-01 item reports
  `ard_proc_version: 1.2.0` (2025-02-27 items report `1.1.1`), with the same
  asset layout.
- A product metadata XML on the S3 bucket was readable with no credentials,
  confirming public asset access. It documents:
  - `RR.tif` / `RL.tif`: **Gamma-0 linear power**, conversion `10*log10(DN)` —
    exactly what `nisar/processing.py::to_db()` already does.
  - `bitmask.tif` (UINT8 mask), `localIncAngle.tif`,
    `gammaToSigmaRatio.tif`, `localContributingArea.tif`, `RRRL.tif` (complex
    covariance matrix), `product.xml`, and a per-item EULA PDF.
  - CEOS-ARD **NRB - POL**, ortho-rectified to a 20 m UTM grid, 30 m medium
    resolution, speckle filtering already applied (Sigma/Lee), Copernicus DEM
    + EGM2008. No Level-1 preprocessing is needed.
- One broad date-range STAC request returned a transient HTTP 502 and succeeded
  on retry, so a production client needs timeouts, retries, and preferably
  precomputed/cached products rather than a live S3 dependency during a demo.

## 4. What a swap would break (concrete code impact)

| Concern | Current NISAR path | RCM-ARD path |
|---|---|---|
| Reader | `nisar/reader.py` reads HDF5 GCOV groups, polarization-specific layers, mask bits | COG GeoTIFFs via `rasterio`/`rio-tiler`; different nodata (0), masks, and radiometry (`gamma()` already calibrated) |
| Naming / stack | `nisar/naming.py` parses NISAR granule names into cycle/track/frame/CRID/maturity; `catalog.py` groups by `stack_key` | STAC `order_key`, `relative_orbit`, `orbit_state`, `sequence_id`, `datetime`; no CRID/cycle concept |
| Polarizations | `VH/VV/HH/HV` (L-band), hardcoded in `schemas.py` regex and `ControlPanel.tsx` | `RR/RL` circular from `CH/CV` compact pol (C-band); validation and UI must accept them |
| Provenance / models | `SourceInfo(mission="NISAR", band="L", product="GCOV", maturity, crid, ...)`, `Acquisition.cycle`, ASF links | New source descriptor (mission, band, product `CEOS-ARD POL`, ARD processor version, STAC item id/URLs, EULA) |
| Status/health | `_nisar_status()` counts manifests with `mission == "NISAR"`; `/api/data-status` reports `primary_mission: NISAR` | Must report per-source readiness, not silently substitute one mission for another |
| Frontend | Page copy, badges, "View at ASF" links, NISAR data-gap shading, `nisar-source-*` Mapbox layer IDs | Mission-agnostic copy, EODMS STAC item links, EULA attribution, RR/RL labels |
| Search | `GET /api/nisar/search` via `asf_search` + Earthdata token | `GET /api/eodms/search` via STAC (no token) |
| Caveats | Change = backscatter difference only | Same, plus compact-pol/C-band interpretation and 12-day revisit |

Because the manifest is already a generic layer/time-series/statistics
contract, the *serving* layer (`routers/sites.py`, `export.py`, Mapbox tiles)
is largely reusable. The work is concentrated in a new reader + catalog
adapter + source metadata + UI copy.

## 5. Proposed plan (phased, no credentials required for phase 1)

1. **Phase A — discovery only (safe, testable, no account):** add
   `services/eodms_stac.py` (stdlib HTTP + STAC `/search` parsing, bbox/date
   validation, normalized granule dicts with RR/RL COG URLs, EULA link) and
   `GET /api/eodms/search` behind `ENABLE_EODMS_SOURCE`. Unit tests with a
   mocked STAC response. `/api/data-status` gains an `eodms` availability
   field. No change to the NISAR default.
2. **Phase B — product build:** a `rcm/` package (or a generalized
   `sar/` reader) that reads the RR/RL COGs, applies the existing
   `processing.py` dB/difference/classify/statistics functions, and writes the
   same manifest/COG/tile/JSON layout with `mission="RCM"` provenance. Extend
   `nisar.models` (or add `rcm.models`) so both sources validate.
3. **Phase C — UX:** mission-agnostic labels and polarization lists in
   `app/page.tsx`, `ControlPanel.tsx`, `lib/types.ts`, `Map.tsx`; per-site
   source badge, STAC item link, EULA/attribution; keep the "no silent
   substitution" behavior.
4. **Optional Phase D — SAR Toolbox:** only if a vetted account and a specific
   derived product (e.g. InSAR deformation, speckle-filtered mosaic) are
   required. Implement as an **offline order/ingest CLI** (`eodms-cli`-style),
   never as a request-time API call; store the delivered products under
   `PRODUCTS_DIR` with explicit EULA metadata.

## 6. Decision needed

- Add EODMS as a second source, or replace NISAR entirely?
- Is an EODMS account (ideally RCM-vetted) available? It is not needed for
  `rcm-ard` STAC/S3, but is mandatory for `RCMImageProducts` orders and for
  the SAR Toolbox.
- Is a Canada study area acceptable? If the demo must work globally, keep
  NISAR/ASF as the primary source and treat EODMS as an optional site pack.
