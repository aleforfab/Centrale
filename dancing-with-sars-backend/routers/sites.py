"""Read-only API for precomputed NISAR site products."""

import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from nisar.config import Config
from nisar.models import Manifest, SiteSummary, TimeSeriesResponse

router = APIRouter(prefix="/api/sites", tags=["NISAR sites"])
SITE_ID_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def _site_root(site_id: str) -> Path:
    if not SITE_ID_RE.fullmatch(site_id):
        raise HTTPException(status_code=404, detail="Site not found")
    root = Config.get_products_dir() / site_id
    if not root.is_dir() or not (root / "manifest.json").is_file():
        valid_ids = sorted(
            directory.name
            for directory in Config.get_products_dir().iterdir()
            if directory.is_dir()
            and SITE_ID_RE.fullmatch(directory.name)
            and (directory / "manifest.json").is_file()
        )
        raise HTTPException(
            status_code=404,
            detail={"message": f"Unknown site '{site_id}'", "valid_site_ids": valid_ids},
        )
    return root


def _load_manifest(site_id: str) -> Manifest:
    root = _site_root(site_id)
    try:
        manifest = Manifest.model_validate_json((root / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValidationError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Invalid manifest for site '{site_id}'") from exc
    if manifest.site.id != site_id:
        raise HTTPException(status_code=500, detail=f"Manifest id mismatch for site '{site_id}'")
    return manifest


@router.get("", response_model=list[SiteSummary])
def list_sites() -> list[SiteSummary]:
    products_dir = Config.get_products_dir()
    summaries = []
    for site_dir in sorted(products_dir.iterdir()):
        if not site_dir.is_dir() or not SITE_ID_RE.fullmatch(site_dir.name):
            continue
        manifest_path = site_dir / "manifest.json"
        if not manifest_path.is_file():
            continue
        manifest = _load_manifest(site_dir.name)
        dates = sorted(item.date for item in manifest.acquisitions)
        summaries.append(SiteSummary(
            id=manifest.site.id,
            title=manifest.site.title,
            event_type=manifest.site.event_type,
            bbox=manifest.site.bbox,
            center=manifest.site.center,
            source=manifest.source.model_dump(mode="json"),
            date_range=[dates[0], dates[-1]] if dates else [],
            acquisition_count=len(manifest.acquisitions),
            pairs=[pair.model_dump(mode="json") for pair in manifest.pairs],
        ))
    return summaries


@router.get("/{site_id}")
def get_site(site_id: str) -> dict[str, Any]:
    return _load_manifest(site_id).model_dump(mode="json")


@router.get("/{site_id}/timeseries", response_model=list[TimeSeriesResponse])
def get_site_timeseries(site_id: str, pol: str) -> list[TimeSeriesResponse]:
    manifest = _load_manifest(site_id)
    polarization = pol.upper()
    if polarization not in {item.pol for item in manifest.polarizations}:
        valid = sorted(item.pol for item in manifest.polarizations)
        raise HTTPException(
            status_code=404,
            detail={"message": f"No time series for polarization '{polarization}'", "polarizations": valid},
        )
    path = _site_root(site_id) / "timeseries.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        points = payload[polarization]
        return [TimeSeriesResponse.model_validate(point) for point in points]
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValidationError) as exc:
        raise HTTPException(status_code=500, detail=f"Invalid time series for site '{site_id}'") from exc
