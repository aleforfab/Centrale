# Synthetic demo fixture — Ganges–Brahmaputra delta fringe origin

## Purpose

By default, `dancing-with-sars-backend/scripts/make_demo_site.py` writes synthetic
GCOV grids whose projected `EPSG:32646` (WGS 84 / UTM zone 46N) coordinates start
at `(0, 0)` metres. Because UTM zone 46N has a 500,000 m false easting at its
central meridian (`93°E`), `(0, 0)` projects to roughly `88.51°E, 0.0°N` — open
equatorial ocean in the Indian Ocean, and slightly west of the official
`EPSG:32646` zone boundary (`90.0°E–96.0°E`).

The `--origin-lon` and `--origin-lat` flags let an operator relocate the
synthetic rehearsal fixture onto recognisable coastal land at a low-latitude
site near `~90°E` inside `EPSG:32646`, while keeping `(0, 0)` as the default so
existing tests and fixtures stay byte-compatible.

## Honesty notice (mandatory)

**The location is arbitrary; the data remains synthetic; it is not a real
observation, not a real change, and not evidence of anything about the
Sundarbans, Bangladesh or the Ganges–Brahmaputra delta.**

The generated `site.yaml` and built `manifest.json` retain the fixture caveat:
*Synthetic fixture data: not a real observation, not a real change, and not
evidence of anything.* Do not remove or soften that caveat in the site config
or UI.

## Target coordinates and CRS note

`EPSG:32646` (`WGS 84 / UTM zone 46N`, central meridian `93°E`) has an official
area of use of **`90.0°E` to `96.0°E`, `0.0°N` to `84.0°N`** (verified via
`pyproj.CRS("EPSG:32646").area_of_use`). Note that `84°E–90°E` is UTM zone 45N
(`EPSG:32645`) and `96°E–102°E` is UTM zone 47N (`EPSG:32647`); `make_demo_site.py`
rejects non-zero origins outside `90.0°E–96.0°E`, `0.0°N–84.0°N` (and grids
whose northeast corner crosses past `96.0°E` or `84.0°N`) so the fixture's
`EPSG:32646` CRS claim stays valid.

Recommended delta-fringe origin (Patuakhali / Barishal coastal delta fringe,
Bangladesh — onshore low-latitude delta land just east of `90.0°E`, ~45 km
north of the Bay of Bengal coast, strictly within `EPSG:32646`):

| Parameter | Value |
| --- | --- |
| `--origin-lon` | `90.20` (°E, WGS84) |
| `--origin-lat` | `22.35` (°N, WGS84) |
| Projected origin (`EPSG:32646`) | `(211614.058633 m E, 2474248.909013 m N)` |
| Full grid extent (`size=400`, `pixel-spacing=20 m`, 8 km × 8 km) | `SW (90.200000, 22.350000)` → `NE (90.276199, 22.423515)` |
| Derived `site.yaml` WGS84 `bbox` (inner 40%) | `[90.2228513915582, 22.372057509190025, 90.25333109458758, 22.40146354822749]` |
| Derived `manifest.json` `center` | `[90.23809124307289, 22.386760528708758]` |

Omitting `--origin-lon` and `--origin-lat` (or passing `0` for both) leaves the
grid origin at UTM `(0, 0)` metres and produces the legacy bbox
`[88.53275770865586, 0.02164714244509917, 88.56142650985544, 0.05051198054315342]`.

## Operator commands (not yet executed on the VM)

From `dancing-with-sars-backend` (with the backend virtualenv active):

### 1. Generate synthetic input at the delta fringe

```bash
python -m scripts.make_demo_site \
  --output /srv/dancing-sars/demo-input \
  --origin-lon 90.20 \
  --origin-lat 22.35 \
  --force
```

### 2. Build the site products

```bash
PRODUCTS_DIR=/srv/dancing-sars/products \
python -m nisar.cli build-site \
  --config /srv/dancing-sars/demo-input/site.yaml \
  --local-dir /srv/dancing-sars/demo-input/granules
```

### 3. Verify the built site

```bash
PRODUCTS_DIR=/srv/dancing-sars/products \
python -m nisar.cli verify --site demo-fixture
```

`verify` should report `Verified site demo-fixture` and confirm the manifest,
COGs, tiles, time series, and pair statistics are intact. After rebuilding on
the VM, restart or reload the backend only if needed (site discovery reads
`PRODUCTS_DIR` dynamically) and confirm `/api/sites/demo-fixture` returns the
relocated `bbox` alongside the unchanged synthetic caveat.
