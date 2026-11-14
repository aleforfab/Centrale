"""Proposed atmosphere screening only — no correction is attempted.

The screen fits low-order spatial polynomials and, when supplied, a DEM-height
term. It flags patterns consistent with a stratified tropospheric ramp, wet
random variance, or long-wavelength ionospheric trend. It never removes a phase
component and never turns a flag into a corrected product.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .topo import DEM


@dataclass(frozen=True)
class AtmosphereScreening:
    """Scalar flags and diagnostics; arrays are deliberately not returned."""

    stratified_troposphere_ramp: bool
    wet_random_variance: bool
    long_wavelength_ionospheric_trend: bool
    r_squared: float
    residual_rms: float
    linear_power: float
    quadratic_power: float
    height_coefficient: float

    def flags(self) -> dict[str, bool]:
        return {
            "stratified_troposphere_ramp": self.stratified_troposphere_ramp,
            "wet_random_variance": self.wet_random_variance,
            "long_wavelength_ionospheric_trend": self.long_wavelength_ionospheric_trend,
        }

    def caveats(self) -> list[str]:
        return [
            "Screening only: no atmospheric phase removal is performed.",
            "Thresholds are heuristic and require validation on real same-stack pairs.",
            "Not a scientifically reviewed or user-facing result.",
        ]

    def as_dict(self) -> dict[str, object]:
        return {
            "flags": self.flags(),
            "diagnostics": {
                "r_squared": self.r_squared,
                "residual_rms": self.residual_rms,
                "linear_power": self.linear_power,
                "quadratic_power": self.quadratic_power,
                "height_coefficient": self.height_coefficient,
                "corrected": False,
                "removal_out_of_scope_until_validated": True,
            },
            "caveats": self.caveats(),
            "status": "proposed",
        }


def _normalised(values: np.ndarray) -> np.ndarray:
    std = float(values.std())
    if std == 0.0:
        std = 1.0
    return (values - float(values.mean())) / std


def _design_matrix(shape: tuple[int, int], dem: DEM | None) -> tuple[np.ndarray, bool]:
    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width]
    x = _normalised(xx.astype(np.float64))
    y = _normalised(yy.astype(np.float64))
    columns = [
        np.ones(height * width),
        x.ravel(),
        y.ravel(),
        (x * y).ravel(),
        (x**2).ravel(),
        (y**2).ravel(),
    ]
    has_height = dem is not None
    if dem is not None:
        heights = np.asarray(dem.height_m, dtype=np.float64)
        if heights.shape != shape:
            raise ValueError("DEM shape must match the phase array")
        columns.append(_normalised(heights).ravel())
    return np.column_stack(columns), has_height


def screen_atmosphere(
    phase: np.ndarray,
    dem: DEM | None = None,
    wet_rms_threshold: float = 0.25,
    r_squared_threshold: float = 0.6,
    trend_threshold: float = 0.05,
) -> AtmosphereScreening:
    """Flag candidate atmospheric patterns without correcting the phase."""

    array = np.asarray(phase, dtype=np.float64)
    if array.ndim != 2:
        raise ValueError("Phase must be a two-dimensional array")
    if not np.isfinite(array).all():
        raise ValueError("Phase must contain only finite values")

    design, has_height = _design_matrix(array.shape, dem)
    coefficients, _, _, _ = np.linalg.lstsq(design, array.ravel(), rcond=None)
    fitted = (design @ coefficients).reshape(array.shape)
    residual = array - fitted
    ss_res = float(np.sum(residual**2))
    ss_tot = float(np.sum((array - array.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    residual_rms = float(np.sqrt(np.mean(residual**2)))
    linear_power = float(coefficients[1] ** 2 + coefficients[2] ** 2)
    quadratic_power = float(
        coefficients[3] ** 2 + coefficients[4] ** 2 + coefficients[5] ** 2
    )
    height_coefficient = float(coefficients[6]) if has_height else 0.0

    stratified = bool(
        r_squared >= r_squared_threshold
        and (linear_power >= trend_threshold or abs(height_coefficient) >= trend_threshold)
    )
    ionospheric = bool(
        r_squared >= r_squared_threshold and quadratic_power >= trend_threshold
    )
    wet = bool(residual_rms >= wet_rms_threshold)
    return AtmosphereScreening(
        stratified_troposphere_ramp=stratified,
        wet_random_variance=wet,
        long_wavelength_ionospheric_trend=ionospheric,
        r_squared=float(r_squared),
        residual_rms=residual_rms,
        linear_power=linear_power,
        quadratic_power=quadratic_power,
        height_coefficient=height_coefficient,
    )
