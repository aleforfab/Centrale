"""Live ASF catalog search for NISAR GCOV acquisitions."""

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from services.asf_service import search_nisar_granules

router = APIRouter(prefix="/api/nisar", tags=["NISAR catalog"])


@router.get("/search")
def search_nisar(
    bbox: Annotated[str, Query(description="min_lon,min_lat,max_lon,max_lat")],
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    maturity: Annotated[str, Query()] = "PROVISIONAL",
    max_results: Annotated[int, Query(ge=1, le=500)] = 50,
) -> dict[str, Any]:
    try:
        bounds = [float(value.strip()) for value in bbox.split(",")]
        if len(bounds) != 4:
            raise ValueError("bbox must contain min_lon,min_lat,max_lon,max_lat")
        if not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90):
            raise ValueError("bbox coordinates are outside valid longitude/latitude ranges")
        granules = search_nisar_granules(bounds, start, end, maturity, max_results)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"granules": granules, "count": len(granules), "maturity": maturity}
