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
import math
import sys
from pathlib import Path

import yaml

from tests.fixtures.make_fake_gcov import create_fake_gcov_pair

CRS_EPSG = "EPSG:32646"

CAVEAT = (
    "Synthetic fixture data: not a real observation, not a real change, "
    "and not evidence of anything."
)


def _utm_to_wgs84_transformer():
    """Return the shared EPSG:32646 <-> WGS84 transformer."""
    import pyproj

    return pyproj.Transformer.from_crs(CRS_EPSG, "EPSG:4326", always_xy=True)


def origin_to_utm(origin_lon: float = 0.0, origin_lat: float = 0.0) -> tuple[float, float]:
    """Convert optional WGS84 origin coordinates to EPSG:32646 metres.

    The default ``(0.0, 0.0)`` keeps the legacy UTM ``(0, 0)`` grid origin so
    existing tests and fixtures stay byte-compatible. Any non-zero origin must
    lie within EPSG:32646 (WGS 84 / UTM zone 46N: 90.0–96.0 E, 0.0–84.0 N).
    """
    if origin_lon == 0.0 and origin_lat == 0.0:
        return 0.0, 0.0

    import pyproj
    from pyproj.enums import TransformDirection

    area = pyproj.CRS.from_user_input(CRS_EPSG).area_of_use
    if (
        not (math.isfinite(origin_lon) and math.isfinite(origin_lat))
        or area is None
        or not (area.west <= origin_lon < area.east and area.south <= origin_lat <= area.north)
    ):
        raise ValueError(
            f"Origin ({origin_lon}, {origin_lat}) is outside {CRS_EPSG} "
            f"(WGS 84 / UTM zone 46N: longitude [{area.west}, {area.east}), "
            f"latitude [{area.south}, {area.north}]). "
            "Leave both --origin-lon and --origin-lat at 0 for the legacy UTM (0, 0) origin."
        )

    easting, northing = _utm_to_wgs84_transformer().transform(
        origin_lon,
        origin_lat,
        direction=TransformDirection.INVERSE,
    )
    if not (math.isfinite(easting) and math.isfinite(northing)):
        raise ValueError(
            f"Origin ({origin_lon}, {origin_lat}) did not project to finite {CRS_EPSG} coordinates."
        )
    return float(easting), float(northing)


def bbox_from_grid(
    size: int,
    pixel_spacing_m: float,
    inner_fraction: float = 0.3,
    origin_easting_m: float = 0.0,
    origin_northing_m: float = 0.0,
) -> list[float]:
    """Derive a WGS84 bbox from the inner part of the synthetic grid.

    The fixture stores coordinates in EPSG:32646 metres starting at
    ``(origin_easting_m, origin_northing_m)`` (default ``(0, 0)``), so the bbox
    is computed from the grid itself instead of being hardcoded.
    """
    low = size * pixel_spacing_m * inner_fraction
    high = size * pixel_spacing_m * (1.0 - inner_fraction)
    transformer = _utm_to_wgs84_transformer()
    west, south = transformer.transform(origin_easting_m + low, origin_northing_m + low)
    east, north = transformer.transform(origin_easting_m + high, origin_northing_m + high)
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
    origin_easting_m: float = 0.0,
    origin_northing_m: float = 0.0,
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
        "bbox": bbox_from_grid(
            size,
            pixel_spacing_m,
            origin_easting_m=origin_easting_m,
            origin_northing_m=origin_northing_m,
        ),
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
    parser.add_argument(
        "--origin-lon",
        type=float,
        default=0.0,
        help="Optional WGS84 longitude origin inside EPSG:32646 (default 0 keeps legacy UTM 0,0)",
    )
    parser.add_argument(
        "--origin-lat",
        type=float,
        default=0.0,
        help="Optional WGS84 latitude origin inside EPSG:32646 (default 0 keeps legacy UTM 0,0)",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite an existing demo input")
    args = parser.parse_args(argv)

    if args.size < 40:
        parser.error("--size must be at least 40 pixels")

    try:
        codes = polarization_codes(args.polarizations.split(","))
    except ValueError as error:
        parser.error(str(error))

    try:
        origin_easting_m, origin_northing_m = origin_to_utm(args.origin_lon, args.origin_lat)
    except ValueError as error:
        parser.error(str(error))

    if args.origin_lon != 0.0 or args.origin_lat != 0.0:
        import pyproj

        area = pyproj.CRS.from_user_input(CRS_EPSG).area_of_use
        span_m = args.size * args.pixel_spacing
        grid_east, grid_north = _utm_to_wgs84_transformer().transform(
            origin_easting_m + span_m,
            origin_northing_m + span_m,
        )
        if area is not None and (grid_east > area.east or grid_north > area.north):
            parser.error(
                f"Grid northeast corner ({grid_east:.6f}, {grid_north:.6f}) crosses outside "
                f"{CRS_EPSG} (max lon {area.east}, max lat {area.north})."
            )

    output: Path = args.output
    if output.exists() and any(output.iterdir()) and not args.force:
        print(f"{output} already contains files. Re-run with --force to overwrite.", file=sys.stderr)
        return 1

    granule_dir = output / "granules"
    granule_dir.mkdir(parents=True, exist_ok=True)

    first, second = create_fake_gcov_pair(
        granule_dir,
        size=args.size,
        pixel_spacing_m=args.pixel_spacing,
        crs_epsg=CRS_EPSG,
        pol_codes=codes,
        date1=f"{args.date_pre}T160541",
        date2=f"{args.date_post}T160541",
        origin_easting_m=origin_easting_m,
        origin_northing_m=origin_northing_m,
    )

    config = build_site_config(
        args.site_id,
        args.size,
        args.pixel_spacing,
        args.polarizations.split(","),
        args.date_pre,
        args.date_post,
        origin_easting_m=origin_easting_m,
        origin_northing_m=origin_northing_m,
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
