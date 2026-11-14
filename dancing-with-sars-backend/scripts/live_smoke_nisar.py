"""Verify NISAR GCOV file-layout assumptions against a live ASF granule."""

import argparse
import logging
import os
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

import aiohttp
import fsspec
import h5py
import numpy as np
import pyproj
from dotenv import load_dotenv
from shapely.geometry import box, shape

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from nisar.catalog import bbox_to_wkt
from nisar.config import Config
from nisar.naming import parse_granule_name

logger = logging.getLogger(__name__)
GCOV_GROUP = "science/LSAR/GCOV/grids/frequencyA"
POLARIZATION_DATASETS = {"HHHH", "HVHV", "VHVH", "VVVV"}


def parse_bbox(value: str) -> list[float]:
    try:
        bbox = [float(part.strip()) for part in value.split(",")]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("bbox values must be numbers") from exc
    if len(bbox) != 4:
        raise argparse.ArgumentTypeError("bbox must be min_lon,min_lat,max_lon,max_lat")
    min_lon, min_lat, max_lon, max_lat = bbox
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise argparse.ArgumentTypeError("bbox coordinates are out of range or not ordered")
    return bbox


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bbox",
        type=parse_bbox,
        default=parse_bbox("-108,-76,-100,-74.5"),
        help="min_lon,min_lat,max_lon,max_lat",
    )
    parser.add_argument("--start", default="2026-06-17")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--maturity", choices=["PROVISIONAL", "BETA"], default="PROVISIONAL")
    parser.add_argument("--max-results", type=int, default=100)
    parser.add_argument("--output", type=Path, default=BACKEND_DIR / "docs" / "nisar_file_layout.md")
    return parser.parse_args()


def _authenticate(asf: Any):
    if Config.EARTHDATA_TOKEN:
        return asf.ASFSession().auth_with_token(Config.EARTHDATA_TOKEN)
    if Config.EARTHDATA_USERNAME and Config.EARTHDATA_PASSWORD:
        return asf.ASFSession().auth_with_creds(
            Config.EARTHDATA_USERNAME, Config.EARTHDATA_PASSWORD
        )
    raise RuntimeError(
        "No Earthdata credentials configured. Set EARTHDATA_TOKEN or "
        "EARTHDATA_USERNAME and EARTHDATA_PASSWORD in the backend .env."
    )


def _product_urls(product: Any) -> list[str]:
    urls = product.get_urls()
    if isinstance(urls, str):
        urls = [urls]
    return [
        url for url in urls
        if isinstance(url, str) and urlsplit(url).path.lower().endswith(".h5")
    ]


def _dataset_paths(group: h5py.Group) -> list[str]:
    paths: list[str] = []
    group.visititems(
        lambda name, item: paths.append(name)
        if isinstance(item, h5py.Dataset)
        else None
    )
    return paths


def _decode(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.ndarray):
        return ", ".join(_decode(item) for item in value.reshape(-1)[:8])
    return str(value)


def _inspect_granule(
    url: str,
    authorization: str,
    sample_point: tuple[float, float],
) -> dict[str, Any]:
    started = time.monotonic()
    with fsspec.open(
        url,
        "rb",
        block_size=2 * 1024 * 1024,
        headers={"Authorization": authorization},
        client_kwargs={"timeout": aiohttp.ClientTimeout(total=45)},
    ) as remote_file:
        logger.info("Reading remote HDF5 metadata")
        with h5py.File(remote_file, "r") as file:
            if GCOV_GROUP not in file:
                raise RuntimeError(f"Expected HDF5 group /{GCOV_GROUP} was not found")
            group = file[GCOV_GROUP]
            logger.info("Located /%s", GCOV_GROUP)
            dataset_paths = _dataset_paths(group)
            x = group.get("xCoordinates")
            y = group.get("yCoordinates")
            projection = group.get("projection")
            projection_attrs = (
                {key: value for key, value in projection.attrs.items()}
                if isinstance(projection, h5py.Dataset)
                else {}
            )
            epsg = projection_attrs.get("epsg_code", projection_attrs.get("EPSG"))
            spatial_ref = projection_attrs.get("spatial_ref", projection_attrs.get("crs_wkt"))
            if epsg is not None:
                target_crs = pyproj.CRS.from_epsg(int(_decode(epsg)))
            elif spatial_ref is not None:
                target_crs = pyproj.CRS.from_user_input(_decode(spatial_ref))
            else:
                raise RuntimeError("Projection metadata has no EPSG code or spatial reference")
            coordinate_info = {
                "x_shape": list(x.shape) if isinstance(x, h5py.Dataset) else None,
                "y_shape": list(y.shape) if isinstance(y, h5py.Dataset) else None,
                "x_dtype": str(x.dtype) if isinstance(x, h5py.Dataset) else None,
                "y_dtype": str(y.dtype) if isinstance(y, h5py.Dataset) else None,
                "x_sample": [float(x[0]), float(x[-1])] if isinstance(x, h5py.Dataset) and x.size else None,
                "y_sample": [float(y[0]), float(y[-1])] if isinstance(y, h5py.Dataset) and y.size else None,
                "projection_attrs": {key: _decode(value) for key, value in projection_attrs.items()},
                "epsg": target_crs.to_epsg(),
                "x_spacing": _decode(group["xCoordinateSpacing"][()])
                if "xCoordinateSpacing" in group else None,
                "y_spacing": _decode(group["yCoordinateSpacing"][()])
                if "yCoordinateSpacing" in group else None,
            }
            pol_datasets = sorted(POLARIZATION_DATASETS.intersection(group.keys()))
            if not pol_datasets:
                raise RuntimeError("No expected polarization datasets found in frequencyA")

            center_x, center_y = pyproj.Transformer.from_crs(
                "EPSG:4326", target_crs, always_xy=True
            ).transform(*sample_point)
            x_coords = x[:]
            y_coords = y[:]
            col_center = int(np.argmin(np.abs(x_coords - center_x)))
            row_center = int(np.argmin(np.abs(y_coords - center_y)))
            point_in_grid = (
                x_coords.min() <= center_x <= x_coords.max()
                and y_coords.min() <= center_y <= y_coords.max()
            )
            if not point_in_grid:
                col_center = len(x_coords) // 2
                row_center = len(y_coords) // 2
            row_start = max(0, min(row_center - 32, len(y_coords) - 64))
            col_start = max(0, min(col_center - 32, len(x_coords) - 64))
            pol = group[pol_datasets[0]]
            row_end = min(pol.shape[0], row_start + 64)
            col_end = min(pol.shape[1], col_start + 64)
            sample = np.asarray(pol[row_start:row_end, col_start:col_end])
            finite = np.isfinite(sample)
            fill_value = pol.fillvalue
            mask = group.get("mask")
            mask_sample = (
                np.asarray(mask[row_start:row_end, col_start:col_end])
                if isinstance(mask, h5py.Dataset) and mask.ndim >= 2
                else None
            )
            polarization_list = group.get("listOfPolarizations")
            polarization_values = (
                _decode(polarization_list[()])
                if isinstance(polarization_list, h5py.Dataset)
                else None
            )
            return {
                "coordinate_info": coordinate_info,
                "polarization_datasets": pol_datasets,
                "polarization_list": polarization_values,
                "sample_shape": list(sample.shape),
                "sample_offset": [row_start, col_start],
                "sample_point": sample_point,
                "sample_point_in_grid": point_in_grid,
                "sample_finite": int(finite.sum()),
                "sample_nan": int(np.isnan(sample).sum()),
                "sample_zero": int(np.count_nonzero(sample == 0)),
                "sample_min_positive": float(np.min(sample[finite & (sample > 0)]))
                if np.any(finite & (sample > 0))
                else None,
                "fill_value": _decode(fill_value),
                "mask_dtype": str(mask.dtype) if isinstance(mask, h5py.Dataset) else None,
                "mask_sample_values": np.unique(mask_sample).tolist()
                if mask_sample is not None
                else None,
                "dataset_paths": dataset_paths,
                "read_seconds": round(time.monotonic() - started, 2),
            }


def _same_grid(first_url: str, second_url: str, authorization: str) -> bool | None:
    grids = []
    for url in (first_url, second_url):
        with fsspec.open(
            url,
            "rb",
            block_size=2 * 1024 * 1024,
            headers={"Authorization": authorization},
            client_kwargs={"timeout": aiohttp.ClientTimeout(total=45)},
        ) as remote_file, h5py.File(remote_file, "r") as file:
            group = file[GCOV_GROUP]
            grids.append((group["xCoordinates"][:], group["yCoordinates"][:]))
    return all(np.array_equal(a, b) for a, b in zip(grids[0], grids[1]))


def run(args: argparse.Namespace) -> Path:
    load_dotenv(BACKEND_DIR / ".env")
    # Config reads environment variables at import time; refresh after loading .env.
    Config.EARTHDATA_TOKEN = os.getenv("EARTHDATA_TOKEN")
    Config.EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME")
    Config.EARTHDATA_PASSWORD = os.getenv("EARTHDATA_PASSWORD")

    import asf_search as asf

    session = _authenticate(asf)
    authorization = session.headers.get("Authorization")
    if not authorization:
        raise RuntimeError("ASF authentication completed without an authorization header")

    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        dataMaturity=args.maturity,
        intersectsWith=bbox_to_wkt(args.bbox),
        start=args.start,
        end=args.end,
        maxResults=args.max_results,
        session=session,
    )
    candidates = []
    for product in results:
        name = product.properties.get("sceneName", "")
        if not name.startswith("NISAR_"):
            continue
        parsed = parse_granule_name(name)
        urls = _product_urls(product)
        if urls:
            candidates.append((name, parsed, product.properties, urls[0], product.geometry))
    if not candidates:
        raise RuntimeError("ASF returned no downloadable NISAR GCOV granules for this query")

    name, parsed, properties, url, geometry = candidates[0]
    logger.info("Inspecting one ASF NISAR GCOV granule (%s candidates found)", len(candidates))
    try:
        overlap = shape(geometry).intersection(box(*args.bbox))
        if overlap.is_empty:
            raise ValueError("search result footprint does not overlap requested bbox")
        point = overlap.representative_point()
        sample_point = (point.x, point.y)
    except (AttributeError, TypeError, ValueError):
        sample_point = ((args.bbox[0] + args.bbox[2]) / 2, (args.bbox[1] + args.bbox[3]) / 2)
    inspection = _inspect_granule(url, authorization, sample_point)
    matching_stack = [
        candidate for candidate in candidates[1:]
        if candidate[1].stack_key == parsed.stack_key
        and candidate[1].maturity == parsed.maturity
    ]
    grid_match = (
        _same_grid(url, matching_stack[0][3], authorization)
        if matching_stack
        else None
    )

    info = inspection["coordinate_info"]
    coordinates_valid = bool(
        info["x_shape"] and info["y_shape"]
        and len(info["x_shape"]) == len(info["y_shape"]) == 1
        and info["x_dtype"] and info["y_dtype"]
    )
    report = f"""# NISAR GCOV live file-layout smoke test

Run date: {date.today().isoformat()}

## Query

- Granules returned with file URLs: {len(candidates)}
- Bbox: `{args.bbox}`
- Date range: `{args.start}` to `{args.end}`
- Requested maturity: `{args.maturity}`
- Inspected granule: `{name}`
- Stack: track `{parsed.track}`, frame `{parsed.frame}`, direction `{parsed.direction}`
- Cycle / CRID / maturity: `{parsed.cycle}` / `{parsed.crid}` / `{parsed.maturity}`

## Assumptions

| Assumption | Result | Observation |
|---|---|---|
| A1: Coordinate arrays and CRS | {"PASS" if coordinates_valid and info["epsg"] else "PARTIAL"} | x={info["x_shape"]} {info["x_sample"]}, y={info["y_shape"]} {info["y_sample"]}; spacing x/y={info["x_spacing"]}/{info["y_spacing"]}; EPSG:{info["epsg"]}; projection attributes: `{info["projection_attrs"]}` |
| A2: Invalid values and mask | OBSERVED | Sample near `{inspection["sample_point"]}` (inside grid: {inspection["sample_point_in_grid"]}): {inspection["sample_nan"]} NaN, {inspection["sample_zero"]} zero, fill value `{inspection["fill_value"]}`; mask dtype `{inspection["mask_dtype"]}`, values `{inspection["mask_sample_values"]}` |
| A3: ASF properties | OBSERVED | Available property keys: `{", ".join(sorted(properties.keys()))}`. Granule identity parsed from the name. |
| A4: Same-stack grid alignment | {"PASS" if grid_match is True else "FAIL" if grid_match is False else "NOT VERIFIED"} | {"Compared x/y coordinate arrays from two same-stack, same-maturity granules." if grid_match is not None else "No second same-stack, same-maturity granule was returned."} |
| A5: Polarization discovery | OBSERVED | GCOV datasets: `{inspection["polarization_datasets"]}`; listOfPolarizations: `{inspection["polarization_list"]}` |
| A6: HTTPS windowed read | OBSERVED | Read 64x64 sample in {inspection["read_seconds"]} seconds using fsspec/HDF5 remote access. |
| A7: ASF Vertex link | DOCUMENTED | `https://search.asf.alaska.edu/#/?granule={quote(name)}` |

## HDF5 layout

Inspected polarization datasets are under `/{GCOV_GROUP}`. Dataset paths discovered:
{chr(10).join(f"- `/{path}`" for path in inspection["dataset_paths"])}

## Data sample

- Dataset: `{inspection["polarization_datasets"][0]}`
- Sample shape: `{inspection["sample_shape"]}`
- Sample pixel offset: `{inspection["sample_offset"]}` (near bbox/footprint intersection)
- Finite samples: {inspection["sample_finite"]}
- Minimum positive sample: `{inspection["sample_min_positive"]}`
- Remote sample read time: {inspection["read_seconds"]} seconds

## Notes

This report records observations only; coordinate conventions, mask semantics,
and performance should be confirmed against additional granules before treating
the reader assumptions as validated.
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8")
    return args.output


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    logging.getLogger("asf_search").setLevel(logging.WARNING)
    import asf_search as asf

    args = parse_args()
    if args.max_results < 1:
        print("ERROR: --max-results must be positive", file=sys.stderr)
        return 2
    try:
        output = run(args)
    except (
        aiohttp.ClientError,
        asf.ASFError,
        asf.CMRError,
        OSError,
        RuntimeError,
        TimeoutError,
        ValueError,
        KeyError,
        IndexError,
    ) as exc:
        # Do not expose credential values through errors raised by auth libraries.
        message = str(exc)
        for secret in (
            os.getenv("EARTHDATA_TOKEN", ""),
            os.getenv("EARTHDATA_PASSWORD", ""),
            os.getenv("EARTHDATA_USERNAME", ""),
        ):
            if secret:
                message = message.replace(secret, "[REDACTED]")
        message = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", message, flags=re.IGNORECASE)
        logger.error("Live smoke test failed: %s", message)
        return 1
    print(f"Live smoke test report written to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
