"""On-demand, cache-aside NISAR product fetch.

``/api/sites`` serves precomputed products from ``PRODUCTS_DIR``. Live fetch
adds the runtime cache-aside path when a site is not already present:

1. Look for a cached site manifest keyed by the exact search parameters.
2. On a miss, query ASF live (through the catalog cache), pick a coherent
   stack and a pre/post pair, download those granules, and run the existing
   ``site_builder`` pipeline to produce COGs, tiles, statistics and a manifest.
3. Store the result under ``PRODUCTS_DIR`` so identical future requests are
   served from disk with no network access.

Live fetch is enabled by default (set ``ENABLE_LIVE_FETCH=false`` to opt out).
Builds are still gated by Earthdata credentials and a download-size cap because
NISAR GCOV granules can be multiple gigabytes each. Nothing here substitutes
Sentinel-1 or Earth Engine data for NISAR.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from nisar import cache
from nisar.config import Config
from nisar.models import Manifest
from nisar.site_builder import (
    SiteBuildError,
    _download_remote_granules,
    build_site,
    plan_site,
    verify_site,
)
from services import asf_service

logger = logging.getLogger(__name__)

VALID_POLARIZATIONS = {"HH", "HV", "VH", "VV"}


class LiveFetchError(RuntimeError):
    """Raised when a live fetch cannot be completed."""


class LiveFetchDisabled(LiveFetchError):
    """Raised when live fetch has been explicitly disabled by configuration."""


class LiveFetchCancelled(LiveFetchError):
    """Raised when a cooperative cancellation is requested between stages."""


ProgressCallback = Callable[[str, int, str], None]
CancelCheck = Callable[[], bool]


def _validate_bbox(bbox: list[float]) -> list[float]:
    if len(bbox) != 4:
        raise ValueError("bbox must contain [min_lon, min_lat, max_lon, max_lat]")
    min_lon, min_lat, max_lon, max_lat = (float(value) for value in bbox)
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ValueError("bbox coordinates are invalid or out of bounds")
    return [min_lon, min_lat, max_lon, max_lat]


def _normalize_params(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str,
    polarizations: list[str],
    max_granules: int,
) -> dict[str, Any]:
    return {
        "bbox": [round(value, 6) for value in bbox],
        "start": start.isoformat(),
        "end": end.isoformat(),
        "maturity": maturity,
        "polarizations": sorted(polarizations),
        "max_granules": max_granules,
    }


def site_id_for(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str,
    polarizations: list[str],
    max_granules: int,
) -> str:
    """Deterministic slug for a live-fetch query (also the product directory name)."""
    return cache.make_key(
        "live",
        _normalize_params(bbox, start, end, maturity, polarizations, max_granules),
    )


def _load_manifest(products_dir: Path, site_id: str) -> Manifest | None:
    """Return a cached manifest only if its generated products are present."""
    root = Path(products_dir) / site_id
    path = root / "manifest.json"
    if not path.is_file():
        return None
    try:
        manifest = Manifest.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError, ValueError):
        logger.warning("Ignoring unreadable live-fetch manifest %s", path)
        return None
    if manifest.site.id != site_id or not manifest.layers or not manifest.acquisitions:
        return None
    for required in ("acquisitions.json", "timeseries.json", "stats.json"):
        if not (root / required).is_file():
            logger.warning("Incomplete cached products for %s: missing %s", site_id, required)
            return None
    for layer in manifest.layers:
        if not (root / "cogs" / f"{layer.id}.tif").is_file():
            logger.warning("Incomplete cached products for %s: missing COG %s", site_id, layer.id)
            return None
    return manifest


def _choose_stack(
    granules: list[dict[str, Any]],
    maturity: str,
    polarizations: list[str],
) -> dict[str, Any]:
    """Pick the stack with the most distinct dates that supports the requested pols."""
    requested_pols = {str(pol).upper() for pol in polarizations}
    groups: dict[tuple[int, str, int], dict[str, dict[str, Any]]] = {}
    for granule in granules:
        if str(granule.get("maturity", "")).upper() != maturity.upper():
            continue
        available_pols = {str(pol).upper() for pol in (granule.get("polarizations") or [])}
        if not requested_pols.issubset(available_pols):
            continue
        try:
            key = (int(granule["track"]), str(granule["direction"]), int(granule["frame"]))
            day = str(granule["date"]).replace("-", "")
            if len(day) != 8 or not day.isdigit():
                continue
        except (KeyError, TypeError, ValueError):
            continue
        groups.setdefault(key, {}).setdefault(day, granule)

    usable = [(len(dates), key, dates) for key, dates in groups.items() if len(dates) >= 2]
    if not usable:
        polarization_label = ", ".join(sorted(requested_pols)) or "the selected polarization"
        channels = " or ".join(sorted(requested_pols))
        recovery = (
            f"Try one channel at a time ({channels}) or widen the date range."
            if len(requested_pols) > 1
            else "Try widening the date range or selecting a different polarization."
        )
        raise LiveFetchError(
            "ASF did not return a single track/frame/direction stack with at least "
            f"two dates for polarization(s) {polarization_label}. {recovery}"
        )
    # Most dates wins; the key makes ties deterministic.
    _, (track, direction, frame), dates = max(usable, key=lambda item: (item[0], item[1]))
    ordered = sorted(dates)
    return {
        "stack": {"track": track, "frame": frame, "direction": direction, "maturity": maturity},
        "pre": ordered[0],
        "post": ordered[-1],
        "dates": ordered,
        "granules": [dates[day] for day in ordered],
    }


def _write_site_config(
    site_id: str,
    bbox: list[float],
    start: date,
    end: date,
    polarizations: list[str],
    max_granules: int,
    selection: dict[str, Any],
) -> Path:
    config = {
        "id": site_id,
        "title": f"Live ASF NISAR · {start.isoformat()} to {end.isoformat()}",
        "event_type": "other",
        "description": (
            "Products built on demand from live ASF NISAR GCOV granules for the "
            "requested bounding box and date range. The pre/post pair is the first "
            "and last acquisition of the selected stack."
        ),
        "caveat": (
            "Backscatter differences only; this is not a displacement or damage "
            "product. Granules may be provisional and later reprocessed. The bbox "
            "must lie inside each granule footprint."
        ),
        "bbox": bbox,
        "stack": selection["stack"],
        "polarizations": polarizations,
        "smoothing_px": Config.DEFAULT_SMOOTHING_PX,
        "thresholds_db": list(Config.DEFAULT_THRESHOLDS_DB),
        "default_threshold_db": Config.DEFAULT_THRESHOLD_DB,
        "pairs": [
            {
                "id": "live-pair",
                "pre": selection["pre"],
                "post": selection["post"],
                "label": f"{selection['pre']} to {selection['post']}",
            }
        ],
        "tiles": {
            "min_zoom": Config.LIVE_FETCH_MIN_ZOOM,
            "max_zoom": Config.LIVE_FETCH_MAX_ZOOM,
            "budget_mb": Config.LIVE_FETCH_TILE_BUDGET_MB,
        },
    }
    path = Config.get_live_fetch_dir() / "configs" / f"{site_id}.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    logger.info("Wrote live-fetch site config %s (%d max granules)", path, max_granules)
    return path


def _granule_download_bytes(product: Any) -> int | None:
    """Return the HDF5 payload size ASF reports for a granule.

    ``properties['bytes']`` is a dict keyed by filename, and each value is itself
    a dict (``{"bytes": ..., "format": ...}``). Only ``.h5`` entries count towards
    the download budget; browse PNGs are excluded. Returns ``None`` when no size
    can be determined, so callers can refuse rather than guess.
    """
    raw = getattr(product, "properties", {}).get("bytes")
    if isinstance(raw, dict):
        total = 0
        found = False
        for name, item in raw.items():
            if not str(name).lower().endswith(".h5"):
                continue
            value = item.get("bytes") if isinstance(item, dict) else item
            try:
                total += int(value)
            except (TypeError, ValueError):
                continue
            found = True
        return total if found else None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def _enforce_size_limit(matches: list[tuple[Any, ...]], limit_bytes: int) -> int:
    """Refuse to download when ASF does not report sizes or the total is too large."""
    total = 0
    for index, match in enumerate(matches):
        product = match[0]
        size = _granule_download_bytes(product)
        if size is None:
            raise LiveFetchError(
                "ASF did not report a granule size; refusing an unbounded download. "
                "Use fewer granules or precomputed products instead."
            )
        if size <= 0:
            raise LiveFetchError(f"ASF reported an invalid size for granule {index + 1}")
        total += size
    if total > limit_bytes:
        raise LiveFetchError(
            f"Live fetch would download {total / 1024 ** 3:.2f} GiB, exceeding the "
            f"configured limit of {limit_bytes / 1024 ** 3:.2f} GiB "
            "(LIVE_FETCH_MAX_BYTES). Narrow the date range or lower max_granules."
        )
    logger.info("Live fetch download budget: %.2f MiB", total / 1024 ** 2)
    return total


def _response(
    site_id: str,
    manifest: Manifest,
    *,
    cached: bool,
    catalog_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "site_id": site_id,
        "cached": cached,
        "source": "cached NISAR products" if cached else "ASF live fetch",
        "manifest_url": f"/api/sites/{site_id}",
        "tiles_url": f"/products/{site_id}/tiles",
        "granules": [item.granule for item in manifest.acquisitions],
        "acquisition_count": len(manifest.acquisitions),
        "layers": len(manifest.layers),
        "generated_at": manifest.generated_at,
        "catalog": catalog_meta,
        "message": (
            "Serving cached products; no network request was made."
            if cached
            else "Fetched live ASF granules and built NISAR products; results are now cached."
        ),
    }


def _report(progress: ProgressCallback | None, stage: str, percent: int, message: str) -> None:
    """Emit a progress update if a callback was supplied."""
    if progress is not None:
        progress(stage, percent, message)


def _check_cancel(should_cancel: CancelCheck | None) -> None:
    """Abort between pipeline stages when cancellation was requested."""
    if should_cancel is not None and should_cancel():
        raise LiveFetchCancelled("Live fetch was cancelled")


def _prepare(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str,
    polarizations: list[str] | None,
    max_granules: int | None,
) -> dict[str, Any]:
    """Validate a query and return its normalized form plus the cache site id."""
    bbox = _validate_bbox(bbox)
    if start >= end:
        raise ValueError("start must be earlier than end")
    if maturity not in {"PROVISIONAL", "BETA"}:
        raise ValueError("maturity must be PROVISIONAL or BETA")

    pols = sorted({str(pol).upper() for pol in (polarizations or ["HH"])})
    if not pols or not set(pols).issubset(VALID_POLARIZATIONS):
        raise ValueError(f"polarizations must be a non-empty subset of {sorted(VALID_POLARIZATIONS)}")

    limit = Config.LIVE_FETCH_MAX_GRANULES
    count = limit if max_granules is None else int(max_granules)
    if not 2 <= count <= limit:
        raise ValueError(f"max_granules must be between 2 and {limit}")

    return {
        "bbox": bbox,
        "start": start,
        "end": end,
        "maturity": maturity,
        "pols": pols,
        "count": count,
        "site_id": site_id_for(bbox, start, end, maturity, pols, count),
    }


def check_preconditions() -> None:
    """Fail fast before enqueuing a job that cannot possibly succeed."""
    if not Config.ENABLE_LIVE_FETCH:
        raise LiveFetchDisabled(
            "Live fetching is disabled. Set ENABLE_LIVE_FETCH=true and configure "
            "Earthdata credentials to build products on demand."
        )
    if not Config.has_earthdata_creds():
        raise LiveFetchError(
            "Earthdata credentials are required for live granule downloads. Set "
            "EARTHDATA_TOKEN (or EARTHDATA_USERNAME/EARTHDATA_PASSWORD) in the backend .env."
        )


def cached_products(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str = "PROVISIONAL",
    polarizations: list[str] | None = None,
    max_granules: int | None = None,
    refresh: bool = False,
) -> dict[str, Any] | None:
    """Return cached products for a query, or ``None`` if a fetch is needed.

    This is a cheap, network-free check used by the API before enqueuing work.
    """
    prepared = _prepare(bbox, start, end, maturity, polarizations, max_granules)
    if refresh:
        return None
    manifest = _load_manifest(Config.get_products_dir(), prepared["site_id"])
    if manifest is None:
        return None
    return _response(prepared["site_id"], manifest, cached=True)


def fetch_products(
    bbox: list[float],
    start: date,
    end: date,
    maturity: str = "PROVISIONAL",
    polarizations: list[str] | None = None,
    max_granules: int | None = None,
    refresh: bool = False,
    progress: ProgressCallback | None = None,
    should_cancel: CancelCheck | None = None,
) -> dict[str, Any]:
    """Return NISAR products for a query, fetching them live on a cache miss.

    ``progress(stage, percent, message)`` is called between pipeline stages and
    ``should_cancel()`` is polled so a background job can be stopped cleanly.
    """
    prepared = _prepare(bbox, start, end, maturity, polarizations, max_granules)
    bbox = prepared["bbox"]
    start, end = prepared["start"], prepared["end"]
    maturity, pols = prepared["maturity"], prepared["pols"]
    count, site_id = prepared["count"], prepared["site_id"]
    products_dir = Config.get_products_dir()

    _report(progress, "validating", 5, "Validated query parameters")
    _check_cancel(should_cancel)

    if not refresh:
        manifest = _load_manifest(products_dir, site_id)
        if manifest is not None:
            logger.info("Live fetch cache hit for %s", site_id)
            _report(progress, "done", 100, "Serving cached products")
            return _response(site_id, manifest, cached=True)

    check_preconditions()

    if refresh:
        shutil.rmtree(products_dir / site_id, ignore_errors=True)
        asf_service.invalidate_catalog_cache(
            bbox, start, end, maturity, Config.MAX_RESULTS
        )

    try:
        _check_cancel(should_cancel)
        _report(progress, "catalog", 12, "Searching ASF catalog for NISAR GCOV granules")
        catalog = asf_service.search_nisar_granules_cached(
            bbox, start, end, maturity, Config.MAX_RESULTS
        )
        granules = catalog["granules"] if isinstance(catalog, dict) else list(catalog)
        catalog_meta = (
            {
                "cached": catalog.get("cached", False),
                "stale": catalog.get("stale", False),
                "fetched_at": catalog.get("fetched_at"),
                "count": catalog.get("count", len(granules)),
            }
            if isinstance(catalog, dict)
            else {"cached": False, "stale": False, "count": len(granules)}
        )
        if not granules:
            raise LiveFetchError(
                "ASF returned no NISAR GCOV granules for this bbox and date range."
            )
        _report(progress, "catalog", 20, f"ASF returned {len(granules)} granules")

        _check_cancel(should_cancel)
        _report(progress, "stack", 28, "Selecting a coherent track/frame/direction stack")
        selection = _choose_stack(granules, maturity, pols)
        config_path = _write_site_config(
            site_id, bbox, start, end, pols, count, selection
        )

        _report(progress, "planning", 35, "Planning granule downloads and checking size limits")
        plan = plan_site(config_path, max_acquisitions=count)
        matches = plan["matches"]
        if not matches:
            raise LiveFetchError("ASF returned no granules matching the selected stack and dates")
        _enforce_size_limit(matches, Config.LIVE_FETCH_MAX_BYTES)

        _check_cancel(should_cancel)
        _report(progress, "downloading", 45, f"Downloading {len(matches)} granules")
        granule_dir = Config.get_live_fetch_dir() / "granules" / site_id
        _download_remote_granules(matches, granule_dir)

        _check_cancel(should_cancel)
        _report(progress, "building", 70, "Building COGs, tiles, statistics and manifest")
        build_site(config_path, local_dir=granule_dir, max_acquisitions=count)

        _report(progress, "verifying", 90, "Verifying generated products")
        verify_site(site_id)
    except LiveFetchError:
        raise
    except (SiteBuildError, ValueError, OSError, RuntimeError) as exc:
        raise LiveFetchError(f"Live fetch could not build NISAR products: {exc}") from exc

    manifest = _load_manifest(products_dir, site_id)
    if manifest is None:
        raise LiveFetchError("Live fetch built products but the resulting manifest is invalid")
    _report(progress, "done", 100, "Products built and cached")
    return _response(site_id, manifest, cached=False, catalog_meta=catalog_meta)
