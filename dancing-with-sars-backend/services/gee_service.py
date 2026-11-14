import json
import logging
import os
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import ee

logger = logging.getLogger(__name__)


def get_radar_collection() -> str:
    return os.getenv("EE_SAR_COLLECTION", "COPERNICUS/S1_GRD")


def initialize_gee():
    """Initializes Google Earth Engine using service account or local credentials."""
    try:
        project = os.getenv("EE_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
        service_account = os.getenv("EE_SERVICE_ACCOUNT") or os.getenv("GEE_SERVICE_ACCOUNT")
        private_key = os.getenv("EE_PRIVATE_KEY")
        key_file_value = os.getenv("GEE_PRIVATE_KEY_FILE") or os.getenv("EE_PRIVATE_KEY_FILE")
        missing_key_file = False

        if key_file_value and not private_key:
            key_file = Path(key_file_value).expanduser()
            if not key_file.is_absolute():
                key_file = Path(__file__).resolve().parents[1] / key_file
            if not key_file.is_file():
                missing_key_file = True
            else:
                private_key = key_file.read_text(encoding="utf-8")
                if not project:
                    project = json.loads(private_key).get("project_id")

        if service_account and private_key:
            credentials = ee.ServiceAccountCredentials(
                service_account,
                key_data=private_key,
            )
            ee.Initialize(credentials, project=project)
        else:
            if not project:
                raise RuntimeError(
                    "Earth Engine requires a Google Cloud project ID. Set EE_PROJECT, "
                    "GOOGLE_CLOUD_PROJECT, or provide a service-account JSON with project_id."
                )
            oauth_credentials = ee.data.get_persistent_credentials()
            if oauth_credentials:
                if missing_key_file:
                    logger.warning(
                        "Configured Earth Engine service-account key file is missing; "
                        "using saved Earth Engine OAuth credentials instead."
                    )
                ee.Initialize(credentials=oauth_credentials, project=project)
            elif missing_key_file:
                raise FileNotFoundError(
                    "Earth Engine service-account key file was not found and no saved "
                    "Earth Engine OAuth credentials are available."
                )
            else:
                ee.Initialize(project=project)
    except (ee.EEException, OSError, TypeError, ValueError) as exc:
        raise RuntimeError(f"Failed to initialize Earth Engine: {exc}") from exc


def apply_speckle_filter(image: ee.Image, radius_m: int = 15) -> ee.Image:
    """Applies a boxcar spatial mean filter to reduce SAR speckle noise."""
    boxcar = ee.Kernel.square(radius=radius_m, units="meters")
    return image.focal_mean(kernel=boxcar)


def get_s1_composite(
    geom: ee.Geometry,
    start_date: str,
    end_date: str,
    polarization: str = "VH",
    orbit_pass: str = "DESCENDING"
) -> ee.Image:
    """Filters Sentinel-1 GRD, applies speckle filtering, and computes median backscatter (dB)."""
    s1 = (
        ee.ImageCollection(get_radar_collection())
        .filterBounds(geom)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", polarization))
        .filter(ee.Filter.inList("instrumentMode", ["IW", "EW"]))
    )

    if orbit_pass and orbit_pass.upper() in ["ASCENDING", "DESCENDING"]:
        s1 = s1.filter(ee.Filter.eq("orbitProperties_pass", orbit_pass.upper()))

    s1 = s1.select(polarization)
    s1_filtered = s1.map(lambda img: apply_speckle_filter(img, 15))
    return s1_filtered.median().clip(geom)


def get_period_difference(
    geom: ee.Geometry,
    pre_start: str,
    pre_end: str,
    post_start: str,
    post_end: str,
    polarization: str,
    orbit_pass: str,
) -> tuple[ee.Image, ee.Image, ee.Image]:
    pre_img = get_s1_composite(geom, pre_start, pre_end, polarization, orbit_pass)
    post_img = get_s1_composite(geom, post_start, post_end, polarization, orbit_pass)
    return pre_img, post_img, post_img.subtract(pre_img)


def compute_change_tiles(
    bbox: list[float],
    pre_start: str,
    pre_end: str,
    post_start: str,
    post_end: str,
    polarization: str = "VH",
    threshold_db: float = -3.0,
    orbit_pass: str = "DESCENDING"
) -> dict[str, str]:
    """
    Computes dB change difference (post - pre) and returns XYZ tile templates for:
      1. RGB composite (Red: Post, Green: Pre, Blue: Diff)
      2. Thresholded Binary Change Mask
    """
    geom = ee.Geometry.BBox(bbox[0], bbox[1], bbox[2], bbox[3])

    pre_img, post_img, diff_img = get_period_difference(
        geom, pre_start, pre_end, post_start, post_end, polarization, orbit_pass
    )

    # False-colour composite: red = post, green = pre, blue = change.
    rgb_input = ee.Image.cat([
        post_img.rename("post"),
        pre_img.rename("pre"),
        diff_img.rename("difference"),
    ])
    rgb = rgb_input.visualize(
        bands=["post", "pre", "difference"],
        min=[-25, -25, -8],
        max=[-5, -5, 8],
    )

    # Binary mask: drop in backscatter below threshold_db
    # .selfMask() removes non-change pixels (makes them transparent)
    change_mask = diff_img.lt(threshold_db).selfMask()
    change_mask_vis = change_mask.visualize(palette=["#FF3333"])

    rgb_map_id = rgb.getMapId()
    mask_map_id = change_mask_vis.getMapId()

    return {
        "rgb_tile_url": rgb_map_id["tile_fetcher"].url_format,
        "mask_tile_url": mask_map_id["tile_fetcher"].url_format,
        "data_source": get_radar_collection(),
        "source_status": "development fallback",
    }


def compute_threshold_mask_tile(
    bbox: list[float],
    pre_start: str,
    pre_end: str,
    post_start: str,
    post_end: str,
    polarization: str = "VH",
    threshold_db: float = -3.0,
    orbit_pass: str = "DESCENDING",
) -> dict[str, str]:
    """Re-renders only the backscatter threshold mask for changed slider values."""
    geom = ee.Geometry.BBox(bbox[0], bbox[1], bbox[2], bbox[3])
    _, _, diff_img = get_period_difference(
        geom, pre_start, pre_end, post_start, post_end, polarization, orbit_pass
    )
    mask = diff_img.lt(threshold_db).selfMask().visualize(palette=["#FF3333"])
    map_id = mask.getMapId()
    return {"mask_tile_url": map_id["tile_fetcher"].url_format}


def compute_zonal_timeseries(
    bbox: list[float],
    start_date: str,
    end_date: str,
    polarization: str = "VH",
    orbit_pass: str = "DESCENDING"
) -> list[dict[str, Any]]:
    """Calculates backscatter (dB) time series over the ROI, grouped and sorted by calendar date."""
    geom = ee.Geometry.BBox(bbox[0], bbox[1], bbox[2], bbox[3])

    s1 = (
        ee.ImageCollection(get_radar_collection())
        .filterBounds(geom)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", polarization))
        .filter(ee.Filter.inList("instrumentMode", ["IW", "EW"]))
    )

    if orbit_pass and orbit_pass.upper() in ["ASCENDING", "DESCENDING"]:
        s1 = s1.filter(ee.Filter.eq("orbitProperties_pass", orbit_pass.upper()))

    s1 = s1.select(polarization)

    def extract_stats(img):
        reduced = img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geom,
            scale=50,
            maxPixels=1e8
        )
        return ee.Feature(None, {
            "date": img.date().format("YYYY-MM-dd"),
            "backscatter": reduced.get(polarization)
        })

    fc = s1.map(extract_stats)
    features = fc.getInfo().get("features", [])

    # Group by date to prevent duplicate date nodes and chart zig-zagging
    daily_groups = defaultdict(list)
    for f in features:
        props = f.get("properties", {})
        val = props.get("backscatter")
        dt = props.get("date")
        if val is not None and dt:
            daily_groups[dt].append(val)

    # Sort sequentially and compute daily average
    series = [
        {"date": dt, "backscatter": round(sum(vals) / len(vals), 2)}
        for dt, vals in sorted(daily_groups.items())
    ]
    return series


def compute_observation_tile(
    bbox: list[float],
    observation_date: str,
    polarization: str = "VV",
    orbit_pass: str | None = None,
) -> dict[str, str]:
    """Builds a single-day, grayscale radar backscatter tile for the map."""
    geom = ee.Geometry.BBox(bbox[0], bbox[1], bbox[2], bbox[3])
    day = date.fromisoformat(observation_date)
    collection = (
        ee.ImageCollection(get_radar_collection())
        .filterBounds(geom)
        .filterDate(observation_date, (day + timedelta(days=1)).isoformat())
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", polarization))
        .filter(ee.Filter.inList("instrumentMode", ["IW", "EW"]))
        .select(polarization)
    )
    if orbit_pass:
        collection = collection.filter(
            ee.Filter.eq("orbitProperties_pass", orbit_pass.upper())
        )

    image = collection.median().clip(geom).visualize(
        min=-25,
        max=-5,
        palette=["#0b1220", "#64748b", "#f8fafc"],
    )
    map_id = image.getMapId()
    return {"tile_url": map_id["tile_fetcher"].url_format}


def compute_observation_comparison_tile(
    bbox: list[float],
    start_date: str,
    end_date: str,
    polarization: str = "VV",
    orbit_pass: str | None = None,
) -> dict[str, str]:
    """Renders finish-minus-start backscatter for two selected acquisitions."""
    geom = ee.Geometry.BBox(bbox[0], bbox[1], bbox[2], bbox[3])

    def daily_composite(day_string: str) -> ee.Image:
        day = date.fromisoformat(day_string)
        collection = (
            ee.ImageCollection(get_radar_collection())
            .filterBounds(geom)
            .filterDate(day_string, (day + timedelta(days=1)).isoformat())
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", polarization))
            .filter(ee.Filter.inList("instrumentMode", ["IW", "EW"]))
            .select(polarization)
        )
        if orbit_pass:
            collection = collection.filter(
                ee.Filter.eq("orbitProperties_pass", orbit_pass.upper())
            )
        return collection.median().clip(geom)

    start_image = daily_composite(start_date)
    finish_image = daily_composite(end_date)
    difference = finish_image.subtract(start_image).rename("difference")
    visualized = difference.visualize(
        min=-6,
        max=6,
        palette=["#2166ac", "#f7f7f7", "#b2182b"],
    )
    map_id = visualized.getMapId()
    return {"tile_url": map_id["tile_fetcher"].url_format}
