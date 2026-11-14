"""Proposed Goldstein-inspired 2D FFT phase filtering.

This is a documented 2D FFT-based equivalent, not a validated production
Goldstein implementation. A least-squares plane is removed before spectral
shrinkage and added back afterwards so a long-wavelength ramp is preserved.
The filter returns scalar diagnostics only; it does not correct or interpret
atmospheric phase.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .utils import wrap_phase


def fit_plane(phase: np.ndarray) -> tuple[np.ndarray, tuple[float, float, float]]:
    """Fit and return ``a + b*x + c*y`` plus its coefficients."""

    array = np.asarray(phase, dtype=np.float64)
    height, width = array.shape
    yy, xx = np.mgrid[0:height, 0:width]
    design = np.column_stack(
        [np.ones(height * width), xx.ravel(), yy.ravel()]
    )
    coefficients, _, _, _ = np.linalg.lstsq(design, array.ravel(), rcond=None)
    plane = (design @ coefficients).reshape(height, width)
    return plane, (
        float(coefficients[0]),
        float(coefficients[1]),
        float(coefficients[2]),
    )


@dataclass(frozen=True)
class FilterDiagnostics:
    """Scalar-only filtering diagnostics for the chain dictionary."""

    input_variance: float
    output_variance: float
    variance_reduction_ratio: float
    plane_slope_x: float
    plane_slope_y: float
    filtered_plane_slope_x: float
    filtered_plane_slope_y: float
    ramp_preserved: bool
    alpha: float
    smoothing_window: int

    def as_dict(self) -> dict[str, float | int | bool | str]:
        return {
            "input_variance": self.input_variance,
            "output_variance": self.output_variance,
            "variance_reduction_ratio": self.variance_reduction_ratio,
            "plane_slope_x": self.plane_slope_x,
            "plane_slope_y": self.plane_slope_y,
            "filtered_plane_slope_x": self.filtered_plane_slope_x,
            "filtered_plane_slope_y": self.filtered_plane_slope_y,
            "ramp_preserved": self.ramp_preserved,
            "alpha": self.alpha,
            "smoothing_window": self.smoothing_window,
            "algorithm": "Goldstein-inspired FFT spectral shrinkage",
            "status": "proposed",
        }


def goldstein_filter(
    phase: np.ndarray,
    alpha: float = 0.5,
    smoothing_window: int = 5,
) -> tuple[np.ndarray, FilterDiagnostics]:
    """Reduce high-frequency phase noise while preserving a fitted plane.

    The adaptive weight combines a Goldstein-style spectral ratio with a
    Gaussian low-pass envelope derived from the spectral centroid. Removal of
    atmospheric trends is intentionally out of scope.
    """

    array = np.asarray(phase, dtype=np.float64)
    if not 0.0 <= alpha <= 1.0:
        raise ValueError("alpha must be in [0, 1]")
    if smoothing_window < 1 or smoothing_window % 2 == 0:
        raise ValueError("smoothing_window must be a positive odd integer")

    plane, (_, slope_x, slope_y) = fit_plane(array)
    residual = array - plane
    complex_residual = np.exp(1j * residual)
    spectrum = np.fft.fft2(complex_residual)
    power = np.fft.fftshift(np.abs(spectrum) ** 2)
    smoothed = ndimage.uniform_filter(
        power,
        size=smoothing_window,
        mode="reflect",
    )
    adaptive = np.clip(power / (smoothed + 1e-12), 0.0, 1.0) ** alpha

    fy = np.fft.fftshift(np.fft.fftfreq(array.shape[0]))[:, None]
    fx = np.fft.fftshift(np.fft.fftfreq(array.shape[1]))[None, :]
    radius = np.sqrt(fy**2 + fx**2)
    total_power = float(power.sum())
    centroid = float((radius * power).sum() / total_power) if total_power else 0.15
    cutoff = max(0.08, min(0.35, centroid))
    gaussian = np.exp(-((radius / cutoff) ** 2))
    weight = adaptive * gaussian

    filtered_complex = np.fft.ifft2(spectrum * np.fft.ifftshift(weight))
    filtered_residual = wrap_phase(np.angle(filtered_complex))
    filtered = plane + filtered_residual

    _, (_, filtered_slope_x, filtered_slope_y) = fit_plane(filtered)
    input_variance = float(np.var(residual))
    output_variance = float(np.var(filtered - plane))
    reduction = (
        (input_variance - output_variance) / input_variance
        if input_variance > 0
        else 0.0
    )
    slope_tolerance = 0.02 + 0.05 * max(abs(slope_x), abs(slope_y))
    ramp_preserved = bool(
        abs(filtered_slope_x - slope_x) <= slope_tolerance
        and abs(filtered_slope_y - slope_y) <= slope_tolerance
    )
    diagnostics = FilterDiagnostics(
        input_variance=input_variance,
        output_variance=output_variance,
        variance_reduction_ratio=float(reduction),
        plane_slope_x=slope_x,
        plane_slope_y=slope_y,
        filtered_plane_slope_x=filtered_slope_x,
        filtered_plane_slope_y=filtered_slope_y,
        ramp_preserved=ramp_preserved,
        alpha=alpha,
        smoothing_window=smoothing_window,
    )
    return filtered, diagnostics


def noise_variance_against_ramp(phase: np.ndarray, ramp: np.ndarray) -> float:
    """Return variance of phase around a known ramp for synthetic tests."""

    return float(np.var(np.asarray(phase) - np.asarray(ramp)))
