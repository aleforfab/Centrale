"""Static status for the proposed InSAR phase chain.

There is deliberately no compute endpoint. A real interferometric result must
wait for phase-capable products, a DEM, end-to-end verification and scientific
review.
"""

from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/api/insar", tags=["InSAR (proposed)"])

STATUS_PAYLOAD: dict[str, Any] = {
    "enabled": False,
    "status": "proposed",
    "reason": (
        "Phase-capable products (SLC/GUNW or a reviewed external interferogram "
        "service) and scientific review are required. Current NISAR GCOV is "
        "detected backscatter and carries no interferometric phase."
    ),
    "chain": [
        "coregistration",
        "topo-removal",
        "coherence",
        "filtering",
        "unwrap",
        "atmos-screening",
        "los-scaling",
    ],
    "requirements": ["SLC/GUNW or HyP3", "DEM", "scientific review"],
}


@router.get("/status")
def insar_status() -> dict[str, Any]:
    """Always return the same proposed-only payload with HTTP 200."""

    return dict(STATUS_PAYLOAD)
