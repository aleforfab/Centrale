"""Generate a synthetic demo site for rehearsal.

This creates fake GCOV granules plus a matching site YAML so the whole pipeline
can be exercised without downloading real data. The output is a software
fixture: it is not a real observation, not a real change, and not evidence of
anything. The generated site YAML says so in its own caveat field.

Usage (from `dancing-with-sars-backend`):

    python -m scripts.make_demo_site --output /srv/dancing-sars/demo-input
    PRODUCTS_DIR=/srv/dancing-sars/products \\
    python -m nisar.cli build-site \\
        --config /srv/dancing-sars/demo-input/site.yaml \\
        --local-dir /srv/dancing-sars/demo-input/granules
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from tests.fixtures.make_fake_gcov import create_fake_gcov_pair

CRS_EPSG = "EPSG:32646"

CAVEAT = (
    "Synthetic fixture data: not a real observation, not a real change, "
    "and not evidence of anything."
)


def bbox_from_grid(size: int, pixel_spacing_m: float, inner_fraction: float = 0.3) -> list[float]:
    """Derive a WGS84 bbox from the inner part of the synthetic grid.

    The fixture stores coordinates in EPSG:32646 metres starting at (0, 0), so
    the bbox is computed from the grid itself instead of being hardcoded.
    """
    import pyproj

    low = size * pixel_spacing_m * inner_fraction
    high = size * pixel_spacing_m * (1.0 - inner_fraction)
    transformer = pyproj.Transformer.from_crs(CRS_EPSG, "EPSG:4326", always_xy=True)
    west, south = transformer.transform(low, low)
    east, north = transformer.transform(high, high)
    return [float(west), float(south), float(east), float(north)]


def polarization_codes(polarizations: list[str]) -> list[str]:
    """Map HH/HV to the four-character polarization codes used in granule names."""
    codes = []
    for pol in polarizations:
        upper = pol.strip().upper()
        if upper not in {"HH", "HV", "VH", "VV"}:
            raise ValueError(f"Unsupported polarization {pol!r}; use HH, HV, VH or VV")
        codes.append(upper + upper)
    return codes


def build_site_config(
    site_id: str,
    size: int,
    pixel_spacing_m: float,
    polarizations: list[str],
    date_pre: str,
    date_post: str,
) -> dict:
    return {
        "id": site_id,
        "title": "Synthetic rehearsal site",
        "event_type": "other",
        "description": (
            "Generated fixture used to prove the build and verification pipeline runs. "
            "It contains no satellite observation."
        ),
        "caveat": CAVEAT,
        "bbox": bbox_from_grid(size, pixel_spacing_m),
        "stack": {"track": 122, "frame": 67, "direction": "D", "maturity": "PROVISIONAL"},
        "polarizations": [pol.strip().upper() for pol in polarizations],
        "smoothing_px": 3,
        "thresholds_db": [2.0, 3.0, 6.0],
        "default_threshold_db": 3.0,
        "pairs": [
            {
                "id": "synthetic-pair",
                "pre": date_pre,
                "post": date_post,
                "label": "Synthetic before and after",
            }
        ],
        "tiles": {"min_zoom": 0, "max_zoom": 10, "budget_mb": 60},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate a synthetic demo site for rehearsal.")
    parser.add_argument("--output", type=Path, default=Path("demo-input"), help="Output directory")
    parser.add_argument("--site-id", default="demo-fixture", help="Site id written into the YAML")
    parser.add_argument("--size", type=int, default=400, help="Synthetic raster size in pixels")
    parser.add_argument("--pixel-spacing", type=float, default=20.0, help="Pixel spacing in metres")
    parser.add_argument("--polarizations", default="HH,HV", help="Comma separated, e.g. HH,HV")
    parser.add_argument("--date-pre", default="20260701", help="Before date (YYYYMMDD)")
    parser.add_argument("--date-post", default="20260713", help="After date (YYYYMMDD)")
    parser.add_argument("--force", action="store_true", help="Overwrite an existing demo input")
    args = parser.parse_args(argv)

    if args.size < 40:
        parser.error("--size must be at least 40 pixels")

    output: Path = args.output
    if output.exists() and any(output.iterdir()) and not args.force:
        print(f"{output} already contains files. Re-run with --force to overwrite.", file=sys.stderr)
        return 1

    granule_dir = output / "granules"
    granule_dir.mkdir(parents=True, exist_ok=True)

    try:
        codes = polarization_codes(args.polarizations.split(","))
    except ValueError as error:
        parser.error(str(error))

    first, second = create_fake_gcov_pair(
        granule_dir,
        size=args.size,
        pixel_spacing_m=args.pixel_spacing,
        crs_epsg=CRS_EPSG,
        pol_codes=codes,
        date1=f"{args.date_pre}T160541",
        date2=f"{args.date_post}T160541",
    )

    config = build_site_config(
        args.site_id,
        args.size,
        args.pixel_spacing,
        args.polarizations.split(","),
        args.date_pre,
        args.date_post,
    )
    config_path = output / "site.yaml"
    config_path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")

    print("Synthetic demo input created.")
    print(f"  granules : {first.name}")
    print(f"             {second.name}")
    print(f"  site file: {config_path}")
    print()
    print("This is synthetic data. The site caveat records that, and it must stay visible.")
    print()
    print("Next steps:")
    print(f"  python -m nisar.cli build-site --config {config_path} --local-dir {granule_dir}")
    print(f"  python -m nisar.cli verify --site {args.site_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
