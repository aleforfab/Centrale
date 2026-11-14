"""Proposed topographic phase removal from a caller-provided DEM.

Formula used here:

    DeltaPhi_topo = -(4*pi/lambda) * (B_perp / (R * sin(theta))) * h

Removing the phase means subtracting this term from the interferometric phase
and re-wrapping the residual. The DEM georeferencing is carried as an Affine-like
six-number tuple so this package adds no direct dependency beyond the already
installed backend stack.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .utils import wrap_phase


@dataclass(frozen=True)
class DEM:
    """Synthetic DEM array plus minimal georeferencing metadata."""

    height_m: np.ndarray
    transform: tuple[float, float, float, float, float, float] = (1.0, 0.0, 0.0, 0.0, -1.0, 0.0)
    crs: str = "EPSG:4326"

    def diagnostics(self) -> dict[str, object]:
        return {
            "shape": list(np.asarray(self.height_m).shape),
            "transform": list(self.transform),
            "crs": self.crs,
            "status": "proposed",
        }


def topographic_phase(
    height_m: np.ndarray,
    wavelength_m: float,
    perpendicular_baseline_m: float,
    slant_range_m: float,
    incidence_angle_rad: float,
) -> np.ndarray:
    """Return the modelled topographic phase for a DEM height array."""

    if wavelength_m <= 0 or slant_range_m <= 0:
        raise ValueError("Wavelength and slant range must be positive")
    sine = math.sin(incidence_angle_rad)
    if abs(sine) < 1e-9:
        raise ValueError("sin(incidence_angle) must be non-zero")
    return np.asarray(height_m, dtype=np.float64) * (
        -(4.0 * math.pi / wavelength_m)
        * perpendicular_baseline_m
        / (slant_range_m * sine)
    )


@dataclass(frozen=True)
class TopoRemovalResult:
    """Residual phase array plus scalar diagnostics (not a user-facing result)."""

    residual_phase: np.ndarray
    topographic_phase_rms: float
    residual_rms: float

    def diagnostics(self) -> dict[str, float | str]:
        return {
            "topographic_phase_rms": self.topographic_phase_rms,
            "residual_rms": self.residual_rms,
            "formula": "-(4*pi/lambda) * (B_perp / (R*sin(theta))) * h",
            "status": "proposed",
        }


def remove_topographic_phase(
    interferometric_phase: np.ndarray,
    dem: DEM,
    wavelength_m: float,
    perpendicular_baseline_m: float,
    slant_range_m: float,
    incidence_angle_rad: float,
) -> TopoRemovalResult:
    """Subtract modelled topographic phase and wrap the residual."""

    phase = np.asarray(interferometric_phase, dtype=np.float64)
    heights = np.asarray(dem.height_m, dtype=np.float64)
    if phase.shape != heights.shape:
        raise ValueError("Interferometric phase and DEM must have the same shape")
    modelled = topographic_phase(
        heights,
        wavelength_m,
        perpendicular_baseline_m,
        slant_range_m,
        incidence_angle_rad,
    )
    residual = wrap_phase(phase - modelled)
    return TopoRemovalResult(
        residual_phase=residual,
        topographic_phase_rms=float(np.sqrt(np.mean(modelled**2))),
        residual_rms=float(np.sqrt(np.mean(residual**2))),
    )
