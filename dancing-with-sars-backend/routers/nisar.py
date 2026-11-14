"""NISAR catalog search, on-demand live fetching, and background job progress."""

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from nisar import jobs, live_fetch
from schemas import LiveFetchRequest
from services import asf_service

router = APIRouter(prefix="/api/nisar", tags=["NISAR catalog"])

# Cache-aside live search. Kept as a module-level name so it stays injectable in
# tests and in deployments that want to swap the upstream implementation.
search_nisar_granules = asf_service.search_nisar_granules_cached


def _parse_bbox(value: str) -> list[float]:
    try:
        bounds = [float(part.strip()) for part in value.split(",")]
    except ValueError as exc:
        raise ValueError("bbox must contain min_lon,min_lat,max_lon,max_lat") from exc
    if len(bounds) != 4:
        raise ValueError("bbox must contain min_lon,min_lat,max_lon,max_lat")
    if not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90):
        raise ValueError("bbox coordinates are outside valid longitude/latitude ranges")
    return bounds


@router.get("/search")
def search_nisar(
    bbox: Annotated[str, Query(description="min_lon,min_lat,max_lon,max_lat")],
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    maturity: Annotated[str, Query()] = "PROVISIONAL",
    max_results: Annotated[int, Query(ge=1, le=500)] = 50,
    refresh: Annotated[bool, Query(description="Bypass the catalog cache")] = False,
) -> dict[str, Any]:
    try:
        bounds = _parse_bbox(bbox)
        if refresh:
            asf_service.invalidate_catalog_cache(bounds, start, end, maturity, max_results)
        result = search_nisar_granules(bounds, start, end, maturity, max_results)
        if isinstance(result, dict):
            return result
        # Backwards-compatible path for a plain list (e.g. injected search stub).
        return {
            "granules": result,
            "count": len(result),
            "maturity": maturity,
            "source": "ASF live catalog",
            "cached": False,
            "stale": False,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _fetch_params(req: LiveFetchRequest) -> dict[str, Any]:
    return {
        "bbox": req.bbox,
        "start": req.start_date,
        "end": req.end_date,
        "maturity": req.maturity,
        "polarizations": req.polarizations,
        "max_granules": req.max_granules,
        "refresh": req.refresh,
    }


@router.post("/fetch")
def fetch_live_products(
    req: LiveFetchRequest,
    sync: Annotated[bool, Query(description="Run in the request thread (legacy blocking mode)")] = False,
):
    """Start (or reuse) a background live fetch.

    - Cache hit: ``200`` with the cached site and ``status: succeeded``.
    - Cache miss: ``202`` with a ``job_id`` and ``status_url`` to poll.
    - ``?sync=true``: old blocking behaviour, ``200`` with the site result.
    """
    params = _fetch_params(req)
    try:
        if sync:
            return live_fetch.fetch_products(**params)

        cached = live_fetch.cached_products(**params)
        if cached is not None:
            return {**cached, "status": "succeeded", "job_id": None}

        # Fail fast rather than enqueueing a job that cannot succeed.
        live_fetch.check_preconditions()
        job = jobs.get_job_manager().submit(params)
        status_url = f"/api/nisar/fetch/jobs/{job['job_id']}"
        return JSONResponse(
            status_code=202,
            content={
                "job_id": job["job_id"],
                "site_id": job["site_id"],
                "status": job["status"],
                "progress": job["progress"],
                "status_url": status_url,
                "message": "Live fetch queued. Poll status_url for progress.",
            },
            headers={"Location": status_url},
        )
    except live_fetch.LiveFetchDisabled as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (live_fetch.LiveFetchError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/fetch/jobs")
def list_fetch_jobs(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """List recent live-fetch jobs, newest first."""
    items = jobs.get_job_manager().list(limit)
    return {"jobs": items, "count": len(items)}


@router.get("/fetch/jobs/{job_id}")
def get_fetch_job(job_id: str) -> dict[str, Any]:
    """Poll a live-fetch job's status, stage, progress and result/error."""
    job = jobs.get_job_manager().get(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"message": f"Unknown fetch job '{job_id}'", "job_id": job_id},
        )
    return job


@router.post("/fetch/jobs/{job_id}/cancel")
def cancel_fetch_job(job_id: str) -> dict[str, Any]:
    """Request cooperative cancellation of a queued or running job."""
    job, accepted = jobs.get_job_manager().cancel(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"message": f"Unknown fetch job '{job_id}'", "job_id": job_id},
        )
    if not accepted:
        raise HTTPException(
            status_code=409,
            detail={"message": f"Job '{job_id}' already finished with status '{job['status']}'"},
        )
    return job
