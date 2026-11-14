from datetime import date
from typing import Any

import asf_search as asf

from nisar.catalog import bbox_to_wkt
from nisar.config import Config
from nisar.naming import parse_granule_name


def search_asf_granules(
    bbox: list[float],
    start_date: str,
    end_date: str,
    platform: str = "Sentinel-1",
    max_results: int = 20
) -> list[dict[str, Any]]:
    """Searches Alaska Satellite Facility (ASF) archive for raw and RTC SAR granules."""
    wkt_polygon = (
        f"POLYGON(("
        f"{bbox[0]} {bbox[1]}, "
        f"{bbox[2]} {bbox[1]}, "
        f"{bbox[2]} {bbox[3]}, "
        f"{bbox[0]} {bbox[3]}, "
        f"{bbox[0]} {bbox[1]}))"
    )

    platform_map = {
        "Sentinel-1": asf.PLATFORM.SENTINEL1,
        "ALOS": getattr(asf.PLATFORM, "ALOS", "ALOS"),
        "UAVSAR": getattr(asf.PLATFORM, "UAVSAR", "UAVSAR"),
    }
    asf_platform = platform_map.get(platform, asf.PLATFORM.SENTINEL1)

    search_kwargs = {
        "intersectsWith": wkt_polygon,
        "start": start_date,
        "end": end_date,
        "platform": asf_platform,
        "maxResults": max_results,
    }

    # Include medium-resolution EW products required for polar acquisitions.
    if platform == "Sentinel-1":
        search_kwargs["processingLevel"] = [
            asf.PRODUCT_TYPE.GRD_HD,
            asf.PRODUCT_TYPE.GRD_MD,
        ]

    try:
        results = asf.geo_search(**search_kwargs)
    except asf.ASFError as exc:
        raise RuntimeError(f"ASF search failed: {exc}") from exc

    granules = []
    for r in results:
        props = r.properties
        granules.append({
            "granule_name": props.get("sceneName", "Unknown"),
            "flight_direction": props.get("flightDirection", "N/A"),
            "polarization": props.get("polarization", "N/A"),
            "start_time": props.get("startTime", "N/A"),
            "bytes": props.get("bytes", 0),
            "download_url": props.get("url", ""),
            "thumbnail_url": props.get("browse", [None])[0] if props.get("browse") else None,
        })
    return granules


def search_nisar_granules(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str = "PROVISIONAL",
    max_results: int = 50,
) -> list[dict[str, Any]]:
    """Search ASF for NISAR GCOV products and normalize granule provenance."""
    if start > end:
        raise ValueError("start must be on or before end")
    if maturity not in {"PROVISIONAL", "BETA"}:
        raise ValueError("maturity must be PROVISIONAL or BETA")
    if not 1 <= max_results <= 500:
        raise ValueError("max_results must be between 1 and 500")

    try:
        session = None
        token = Config.EARTHDATA_TOKEN
        username, password = Config.EARTHDATA_USERNAME, Config.EARTHDATA_PASSWORD
        if token:
            session = asf.ASFSession().auth_with_token(token)
        elif username and password:
            session = asf.ASFSession().auth_with_creds(username, password)
        results = asf.search(
            dataset="NISAR",
            processingLevel="GCOV",
            dataMaturity=maturity,
            intersectsWith=bbox_to_wkt(bbox),
            start=start.isoformat(),
            end=end.isoformat(),
            maxResults=max_results,
            session=session,
        )
    except Exception as exc:
        raise RuntimeError("ASF NISAR search is temporarily unavailable") from exc

    granules = []
    for result in results:
        properties = result.properties
        name = properties.get("sceneName") or properties.get("fileName") or ""
        try:
            parsed = parse_granule_name(name)
        except ValueError:
            continue
        granules.append({
            "granule": name,
            "cycle": parsed.cycle,
            "track": parsed.track,
            "frame": parsed.frame,
            "direction": parsed.direction,
            "date": parsed.date,
            "start": parsed.datetime_start,
            "end": parsed.datetime_end,
            "crid": parsed.crid,
            "maturity": parsed.maturity,
            "coverage": parsed.coverage,
            "polarizations": parsed.polarizations(),
            "download_url": properties.get("url"),
            "asf_url": f"https://search.asf.alaska.edu/#/?granule={name}",
        })
    return granules
