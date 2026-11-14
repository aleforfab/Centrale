"""Proposed InSAR baseline geometry and LOS projection utilities.

The formulas here are library notes for synthetic tests, not a validated
geophysical product. The chain's only output is a diagnostics dictionary; no
deformation map or displacement number is exposed to users.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class OrbitState:
    """Minimal orbit/timing state for a synthetic baseline calculation."""

    position_m: tuple[float, float, float]
    velocity_m_s: tuple[float, float, float]
    time_s: float


@dataclass(frozen=True)
class Baseline:
    """Baseline components derived from two orbit states and a look vector."""

    perpendicular_m: float
    parallel_m: float
    along_track_m: float
    temporal_days: float

    def as_dict(self) -> dict[str, float]:
        return {
            "perpendicular_m": self.perpendicular_m,
            "parallel_m": self.parallel_m,
            "along_track_m": self.along_track_m,
            "temporal_days": self.temporal_days,
        }


def _unit(vector: np.ndarray) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float64)
    norm = float(np.linalg.norm(array))
    if norm == 0.0:
        raise ValueError("A zero-length vector has no direction")
    return array / norm


def compute_baseline(
    reference: OrbitState,
    secondary: OrbitState,
    look_vector: tuple[float, float, float],
) -> Baseline:
    """Return LOS-parallel/perpendicular and along-track baseline components.

    ``look_vector`` points from the ground toward the reference sensor. The
    parallel component is the dot product of the orbital separation with this
    unit vector; the perpendicular component is the norm of the remaining
    vector. The along-track component uses the reference velocity direction.
    """

    separation = np.asarray(secondary.position_m, dtype=np.float64) - np.asarray(
        reference.position_m, dtype=np.float64
    )
    look = _unit(np.asarray(look_vector, dtype=np.float64))
    parallel = float(np.dot(separation, look))
    perpendicular_vector = separation - parallel * look
    perpendicular = float(np.linalg.norm(perpendicular_vector))
    along_track = float(np.dot(separation, _unit(np.asarray(reference.velocity_m_s))))
    temporal_days = abs(secondary.time_s - reference.time_s) / 86400.0
    return Baseline(
        perpendicular_m=perpendicular,
        parallel_m=parallel,
        along_track_m=along_track,
        temporal_days=temporal_days,
    )


def critical_baseline_m(
    wavelength_m: float,
    slant_range_m: float,
    incidence_angle_rad: float,
    range_resolution_m: float,
) -> float:
    """Return the classical range-bandwidth critical baseline.

    Formula used here: ``B_crit = lambda * R * tan(theta) / (2 * dr)`` where
    ``R`` is slant range, ``theta`` is incidence angle from vertical and ``dr``
    is slant-range resolution. This is a screening estimate, not a validated
    mission-specific limit.
    """

    if wavelength_m <= 0 or slant_range_m <= 0 or range_resolution_m <= 0:
        raise ValueError("Wavelength, slant range and range resolution must be positive")
    return float(
        wavelength_m
        * slant_range_m
        * math.tan(incidence_angle_rad)
        / (2.0 * range_resolution_m)
    )


@dataclass(frozen=True)
class BaselineCheck:
    """Proposed critical-baseline screening result."""

    critical_baseline_m: float
    ratio: float
    within_limit: bool

    def as_dict(self) -> dict[str, float | bool]:
        return {
            "critical_baseline_m": self.critical_baseline_m,
            "ratio": self.ratio,
            "within_limit": self.within_limit,
        }


def critical_baseline_check(
    perpendicular_baseline_m: float,
    wavelength_m: float,
    slant_range_m: float,
    incidence_angle_rad: float,
    range_resolution_m: float,
) -> BaselineCheck:
    """Compare an absolute perpendicular baseline with the screening estimate."""

    limit = critical_baseline_m(
        wavelength_m,
        slant_range_m,
        incidence_angle_rad,
        range_resolution_m,
    )
    ratio = abs(perpendicular_baseline_m) / limit if limit else float("inf")
    return BaselineCheck(
        critical_baseline_m=limit,
        ratio=float(ratio),
        within_limit=bool(ratio <= 1.0),
    )


def los_scale_factor(wavelength_m: float, local_incidence_angle_rad: float) -> float:
    """Return the proposed phase-to-vertical projection coefficient.

    Exact projection used here, matching the brief's ``cos(theta_local)`` style:

        d_vertical ~= (lambda / (4*pi)) * cos(theta_local) * DeltaPhi

    ``theta_local`` is interpreted as the angle between the line of sight and
    the local surface normal. Positive ``DeltaPhi`` means increased two-way
    path delay / increased slant range; positive displacement in this sign
    convention is motion away from the sensor. This coefficient is exposed only
    as a scalar diagnostic until a real chain is reviewed.
    """

    if wavelength_m <= 0:
        raise ValueError("Wavelength must be positive")
    return float(wavelength_m / (4.0 * math.pi) * math.cos(local_incidence_angle_rad))


def phase_to_range_change(unwrapped_phase: np.ndarray, wavelength_m: float) -> np.ndarray:
    """Return slant-range change for an unwrapped phase array (proposed only)."""

    if wavelength_m <= 0:
        raise ValueError("Wavelength must be positive")
    return np.asarray(unwrapped_phase, dtype=np.float64) * wavelength_m / (4.0 * math.pi)


def phase_to_los_displacement(unwrapped_phase: np.ndarray, wavelength_m: float) -> np.ndarray:
    """Return LOS displacement with positive values toward the sensor.

    This is the negative of slant-range change. It is not called by the static
    API and is not a user-facing result.
    """

    return -phase_to_range_change(unwrapped_phase, wavelength_m)
