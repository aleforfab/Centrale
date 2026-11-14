"""Export processed NISAR arrays as COGs, XYZ PNG tiles, and JSON products."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.shutil import copy as copy_raster
from rasterio.transform import Affine
from rasterio.warp import reproject, transform_bounds

from nisar.models import Manifest

WEB_MERCATOR_LIMIT = 20037508.342789244
TILE_SIZE = 256
ESTIMATED_TILE_BYTES = 64 * 1024


def write_cog(
    array: np.ndarray,
    path: Path,
    transform: Affine,
    crs: str,
    nodata: float = float("nan"),
) -> Path:
    """Write a float32, tiled GeoTIFF with overviews for cloud-optimized access."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.asarray(array, dtype=np.float32)
    if data.ndim != 2 or not data.size:
        raise ValueError("COG input must be a non-empty two-dimensional array")
    source_path = path.with_name(f".{path.stem}.source.tif")
    output_path = path.with_name(f".{path.stem}.cog.tif")
    try:
        with rasterio.open(
            source_path,
            "w",
            driver="GTiff",
            width=data.shape[1],
            height=data.shape[0],
            count=1,
            dtype="float32",
            crs=crs,
            transform=transform,
            nodata=nodata,
            tiled=True,
            blockxsize=256,
            blockysize=256,
            compress="deflate",
            predictor=3,
            BIGTIFF="IF_SAFER",
        ) as dataset:
            dataset.write(data, 1)
        copy_raster(
            source_path,
            output_path,
            driver="COG",
            compress="DEFLATE",
            blocksize=256,
            overview_resampling=Resampling.average.name,
        )
        output_path.replace(path)
    finally:
        source_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
    return path


def _tile_range(bounds: tuple[float, float, float, float], zoom: int) -> tuple[int, int, int, int]:
    west, south, east, north = bounds
    count = 1 << zoom
    west = max(-WEB_MERCATOR_LIMIT, min(WEB_MERCATOR_LIMIT, west))
    east = max(-WEB_MERCATOR_LIMIT, min(WEB_MERCATOR_LIMIT, east))
    south = max(-WEB_MERCATOR_LIMIT, min(WEB_MERCATOR_LIMIT, south))
    north = max(-WEB_MERCATOR_LIMIT, min(WEB_MERCATOR_LIMIT, north))

    def x_index(value: float) -> int:
        return max(0, min(count - 1, int((value + WEB_MERCATOR_LIMIT) / (2 * WEB_MERCATOR_LIMIT) * count)))

    def y_index(value: float) -> int:
        return max(0, min(count - 1, int((WEB_MERCATOR_LIMIT - value) / (2 * WEB_MERCATOR_LIMIT) * count)))

    return x_index(west), x_index(east), y_index(north), y_index(south)


def estimate_tile_budget(
    bounds: tuple[float, float, float, float],
    min_zoom: int,
    max_zoom: int,
    average_tile_bytes: int = ESTIMATED_TILE_BYTES,
) -> float:
    """Estimate product tile storage in MiB using a conservative average PNG size."""
    if min_zoom < 0 or max_zoom < min_zoom or max_zoom > 24:
        raise ValueError("Invalid zoom range")
    count = 0
    for zoom in range(min_zoom, max_zoom + 1):
        min_x, max_x, min_y, max_y = _tile_range(bounds, zoom)
        count += (max_x - min_x + 1) * (max_y - min_y + 1)
    return count * average_tile_bytes / (1024 * 1024)


def _colourize(
    values: np.ndarray,
    kind: str,
    minimum: float | None,
    maximum: float | None,
) -> np.ndarray:
    valid = np.isfinite(values)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    if not valid.any():
        return rgba

    low = float(minimum) if minimum is not None else float(np.nanpercentile(values, 2))
    high = float(maximum) if maximum is not None else float(np.nanpercentile(values, 98))
    if high <= low:
        high = low + 1
    scaled = np.clip((values - low) / (high - low), 0, 1)

    if kind == "difference":
        strength = np.clip(np.abs(values) / max(abs(low), abs(high), 1), 0, 1)
        neutral = np.stack([245 - 40 * strength] * 3, axis=-1)
        blue = np.stack([45 * (1 - strength), 100 + 80 * (1 - strength), 210 + 45 * strength], axis=-1)
        red = np.stack([210 + 45 * strength, 55 * (1 - strength), 45 * (1 - strength)], axis=-1)
        colour = np.where((values < -0.25)[..., None], blue, np.where((values > 0.25)[..., None], red, neutral))
    elif kind == "change_mask":
        colour = np.zeros((*values.shape, 3), dtype=float)
        colour[valid & (values < 0)] = [40, 120, 255]
        colour[valid & (values > 0)] = [255, 82, 48]
    else:
        grey = scaled * 255
        colour = np.stack([grey, grey, grey], axis=-1)

    rgba[..., :3] = np.clip(colour, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)
    return rgba


def render_tiles(
    cog_path: Path,
    tile_dir: Path,
    *,
    kind: str,
    min_zoom: int,
    max_zoom: int,
    budget_mb: float,
    minimum: float | None = None,
    maximum: float | None = None,
) -> dict[str, Any]:
    """Render COG pixels into a budget-guarded XYZ raster tile pyramid."""
    cog_path, tile_dir = Path(cog_path), Path(tile_dir)
    with rasterio.open(cog_path) as source:
        bounds = transform_bounds(source.crs, "EPSG:3857", *source.bounds, densify_pts=21)
        estimate_mb = estimate_tile_budget(bounds, min_zoom, max_zoom)
        if estimate_mb > budget_mb:
            raise ValueError(
                f"Estimated tile budget {estimate_mb:.1f} MiB exceeds configured "
                f"budget {budget_mb:.1f} MiB; reduce zoom range or site extent."
            )
        tile_dir.mkdir(parents=True, exist_ok=True)
        rendered = 0
        for zoom in range(min_zoom, max_zoom + 1):
            min_x, max_x, min_y, max_y = _tile_range(bounds, zoom)
            tile_count = 1 << zoom
            for x in range(min_x, max_x + 1):
                for y in range(min_y, max_y + 1):
                    left = x / tile_count * 2 * WEB_MERCATOR_LIMIT - WEB_MERCATOR_LIMIT
                    right = (x + 1) / tile_count * 2 * WEB_MERCATOR_LIMIT - WEB_MERCATOR_LIMIT
                    top = WEB_MERCATOR_LIMIT - y / tile_count * 2 * WEB_MERCATOR_LIMIT
                    bottom = WEB_MERCATOR_LIMIT - (y + 1) / tile_count * 2 * WEB_MERCATOR_LIMIT
                    destination = np.full((TILE_SIZE, TILE_SIZE), np.nan, dtype=np.float32)
                    destination_transform = Affine(
                        (right - left) / TILE_SIZE,
                        0,
                        left,
                        0,
                        -(top - bottom) / TILE_SIZE,
                        top,
                    )
                    reproject(
                        source=rasterio.band(source, 1),
                        destination=destination,
                        src_transform=source.transform,
                        src_crs=source.crs,
                        src_nodata=source.nodata,
                        dst_transform=destination_transform,
                        dst_crs="EPSG:3857",
                        dst_nodata=np.nan,
                        resampling=Resampling.bilinear,
                    )
                    rgba = _colourize(destination, kind, minimum, maximum)
                    output = tile_dir / str(zoom) / str(x) / f"{y}.png"
                    output.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(rgba, mode="RGBA").save(output, format="PNG", optimize=True)
                    rendered += 1
    return {"tile_count": rendered, "estimated_mb": estimate_mb}


def write_json(path: Path, data: Any) -> Path:
    """Write JSON-compatible data atomically."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    serializable = data.model_dump(mode="json") if hasattr(data, "model_dump") else data
    temporary.write_text(json.dumps(serializable, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(path)
    return path


def write_manifest(path: Path, manifest: Manifest) -> Path:
    """Validate and write a site manifest."""
    validated = Manifest.model_validate(manifest)
    return write_json(path, validated)


def write_acquisitions(path: Path, acquisitions: list[dict[str, Any]]) -> Path:
    return write_json(path, acquisitions)


def write_timeseries(path: Path, timeseries: dict[str, list[dict[str, Any]]]) -> Path:
    return write_json(path, timeseries)


def write_stats(path: Path, stats: dict[str, Any]) -> Path:
    return write_json(path, stats)
