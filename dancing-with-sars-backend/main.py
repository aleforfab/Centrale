import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from nisar.config import Config
from routers.nisar import router as nisar_router
from routers.sites import router as sites_router
from schemas import (
    ChangeDetectionRequest,
    ObservationComparisonRequest,
    ObservationTileRequest,
    SARQueryRequest,
    TimeSeriesRequest,
)
from services.asf_service import search_asf_granules
from services.gee_service import (
    compute_change_tiles,
    compute_observation_comparison_tile,
    compute_observation_tile,
    compute_threshold_mask_tile,
    compute_zonal_timeseries,
    initialize_gee,
)

logger = logging.getLogger(__name__)
gee_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global gee_ready
    if Config.ENABLE_SENTINEL1_FALLBACK:
        try:
            initialize_gee()
            gee_ready = True
        except Exception:
            logger.exception("Earth Engine fallback initialization failed")
    yield


app = FastAPI(
    title="Dancing with the SARs - NASA Space Apps Challenge API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(sites_router)
app.include_router(nisar_router)
app.mount("/products", StaticFiles(directory=Config.get_products_dir()), name="products")


def _fallback_only() -> None:
    if not Config.ENABLE_SENTINEL1_FALLBACK:
        raise HTTPException(
            status_code=404,
            detail="Sentinel-1 development fallback is disabled.",
        )


def _fallback_response(result):
    if not isinstance(result, dict):
        raise HTTPException(status_code=500, detail="Unexpected fallback response format")
    return {**result, "source_status": "development fallback (Sentinel-1)"}


def _nisar_status() -> tuple[bool, int]:
    products_dir = Config.get_products_dir()
    valid_count = 0
    for site_dir in products_dir.iterdir():
        manifest_path = site_dir / "manifest.json"
        if not site_dir.is_dir() or not manifest_path.is_file():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Ignoring unreadable NISAR manifest %s: %s", manifest_path, exc)
            continue
        source = manifest.get("source")
        if isinstance(source, dict) and source.get("mission") == "NISAR":
            valid_count += 1
    return valid_count > 0, valid_count


@app.get("/health")
def health_check():
    nisar_ready, sites_count = _nisar_status()
    return {
        "status": "ok" if nisar_ready or (gee_ready and Config.ENABLE_SENTINEL1_FALLBACK) else "degraded",
        "earth_engine": "ready" if gee_ready else "unavailable",
        "radar_source": "NISAR products" if nisar_ready else (
            "Sentinel-1 development fallback" if Config.ENABLE_SENTINEL1_FALLBACK else "unavailable"
        ),
        "nisar_ready": nisar_ready,
        "sites_count": sites_count,
    }


@app.get("/api/data-status")
def data_status():
    nisar_ready, sites_count = _nisar_status()
    fallback_enabled = Config.ENABLE_SENTINEL1_FALLBACK
    return {
        "primary_mission": "NISAR",
        "active_source": "NISAR" if nisar_ready else (
            "Sentinel-1 development fallback" if fallback_enabled else "NISAR products unavailable"
        ),
        "nisar_ready": nisar_ready,
        "sites_count": sites_count,
        "message": "Precomputed NISAR products are available." if nisar_ready else (
            "No built NISAR site products are installed."
            + (" Sentinel-1 fallback is enabled." if fallback_enabled else "")
        ),
    }


@app.post("/api/gee/change-detection")
def run_change_detection(req: ChangeDetectionRequest):
    _fallback_only()
    if not gee_ready:
        raise HTTPException(
            status_code=503,
            detail="Earth Engine is not configured. Add valid credentials before running analysis.",
        )
    try:
        return _fallback_response(compute_change_tiles(
            bbox=req.bbox,
            pre_start=req.pre_start.isoformat(),
            pre_end=req.pre_end.isoformat(),
            post_start=req.post_start.isoformat(),
            post_end=req.post_end.isoformat(),
            polarization=req.polarization,
            threshold_db=req.threshold_db,
            orbit_pass=req.orbit_pass
        ))
    except (ee.EEException, OSError, RuntimeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/gee/change-mask")
def update_change_mask(req: ChangeDetectionRequest):
    _fallback_only()
    if not gee_ready:
        raise HTTPException(
            status_code=503,
            detail="Earth Engine is not configured. Add valid credentials before updating the threshold mask.",
        )
    try:
        return _fallback_response(compute_threshold_mask_tile(
            bbox=req.bbox,
            pre_start=req.pre_start.isoformat(),
            pre_end=req.pre_end.isoformat(),
            post_start=req.post_start.isoformat(),
            post_end=req.post_end.isoformat(),
            polarization=req.polarization,
            threshold_db=req.threshold_db,
            orbit_pass=req.orbit_pass,
        ))
    except (ee.EEException, OSError, RuntimeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/gee/timeseries")
def get_timeseries(req: TimeSeriesRequest):
    _fallback_only()
    if not gee_ready:
        raise HTTPException(
            status_code=503,
            detail="Earth Engine is not configured. Add valid credentials before loading the time series.",
        )
    try:
        return _fallback_response(compute_zonal_timeseries(
            bbox=req.bbox,
            start_date=req.start_date.isoformat(),
            end_date=req.end_date.isoformat(),
            polarization=req.polarization,
            orbit_pass=req.orbit_pass
        ))
    except (ee.EEException, OSError, RuntimeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/gee/observation-tile")
def get_observation_tile(req: ObservationTileRequest):
    _fallback_only()
    if not gee_ready:
        raise HTTPException(
            status_code=503,
            detail="Earth Engine is not configured. Add valid credentials before loading radar imagery.",
        )
    try:
        return _fallback_response(compute_observation_tile(
            bbox=req.bbox,
            observation_date=req.date.isoformat(),
            polarization=req.polarization,
            orbit_pass=req.orbit_pass,
        ))
    except (ee.EEException, OSError, RuntimeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/gee/observation-comparison")
def get_observation_comparison(req: ObservationComparisonRequest):
    _fallback_only()
    if not gee_ready:
        raise HTTPException(
            status_code=503,
            detail="Earth Engine is not configured. Add valid credentials before comparing radar observations.",
        )
    try:
        return _fallback_response(compute_observation_comparison_tile(
            bbox=req.bbox,
            start_date=req.start_date.isoformat(),
            end_date=req.end_date.isoformat(),
            polarization=req.polarization,
            orbit_pass=req.orbit_pass,
        ))
    except (ee.EEException, OSError, RuntimeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/asf/search")
def search_asf(req: SARQueryRequest):
    _fallback_only()
    try:
        results = search_asf_granules(
            bbox=req.bbox,
            start_date=req.start_date.isoformat(),
            end_date=req.end_date.isoformat(),
            platform=req.platform or "Sentinel-1",
            max_results=req.max_results or 20
        )
        return {"granules": results, "source_status": "development fallback (Sentinel-1)"}
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
