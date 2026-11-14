"""Proposed SLC-pair coregistration by FFT cross-correlation.

The estimator uses complex cross-correlation on overlapping windows, then
parabolic interpolation around the correlation peak for a sub-pixel offset.
Tests recover a known 2-3 pixel shift from synthetic complex arrays.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage


@dataclass(frozen=True)
class ShiftEstimate:
    """Scalar shift estimate returned by the proposed coregistration step."""

    dy: float
    dx: float
    peak_correlation: float
    windows_used: int
    method: str = "fft cross-correlation + parabolic subpixel"

    def as_dict(self) -> dict[str, float | int | str]:
        return {
            "dy": self.dy,
            "dx": self.dx,
            "peak_correlation": self.peak_correlation,
            "windows_used": self.windows_used,
            "method": self.method,
        }


def _wrapped_value(values: np.ndarray, index: int) -> float:
    return float(values[index % len(values)])


def _parabolic_offset(values: np.ndarray, peak: int) -> float:
    """Return a sub-pixel correction from three correlation-magnitude samples."""

    y0 = _wrapped_value(values, peak - 1)
    y1 = _wrapped_value(values, peak)
    y2 = _wrapped_value(values, peak + 1)
    denominator = y0 - 2.0 * y1 + y2
    if abs(denominator) < 1e-12:
        return 0.0
    return float(np.clip(0.5 * (y0 - y2) / denominator, -1.0, 1.0))


def _window_shift(reference: np.ndarray, secondary: np.ndarray) -> tuple[float, float, float]:
    correlation = np.fft.ifft2(
        np.fft.fft2(secondary) * np.conj(np.fft.fft2(reference))
    )
    shifted = np.fft.fftshift(correlation)
    surface = np.abs(shifted)
    peak_y, peak_x = np.unravel_index(np.argmax(surface), surface.shape)
    center_y, center_x = surface.shape[0] // 2, surface.shape[1] // 2
    dy = float(peak_y - center_y) + _parabolic_offset(surface[:, peak_x], peak_y)
    dx = float(peak_x - center_x) + _parabolic_offset(surface[peak_y, :], peak_x)
    total = float((surface**2).sum())
    peak = float(surface.max() ** 2 / total) if total else 0.0
    return dy, dx, peak


def estimate_shift(
    reference: np.ndarray,
    secondary: np.ndarray,
    window_shape: tuple[int, int] = (32, 32),
    overlap: float = 0.5,
) -> ShiftEstimate:
    """Estimate the shift that maps ``secondary`` back onto ``reference``.

    The returned ``(dy, dx)`` is the translation observed in ``secondary``.
    ``coregister_pair`` applies the negative translation to align the pair.
    """

    ref = np.asarray(reference)
    sec = np.asarray(secondary)
    if ref.shape != sec.shape:
        raise ValueError("Reference and secondary SLC arrays must have the same shape")
    if ref.ndim != 2:
        raise ValueError("SLC arrays must be two-dimensional")
    if not 0.0 <= overlap < 1.0:
        raise ValueError("overlap must be in [0, 1)")

    win_h = min(window_shape[0], ref.shape[0])
    win_w = min(window_shape[1], ref.shape[1])
    step_y = max(1, int(win_h * (1.0 - overlap)))
    step_x = max(1, int(win_w * (1.0 - overlap)))
    rows = list(range(0, ref.shape[0] - win_h + 1, step_y)) or [0]
    cols = list(range(0, ref.shape[1] - win_w + 1, step_x)) or [0]

    estimates: list[tuple[float, float, float]] = []
    for row in rows:
        for col in cols:
            ref_window = ref[row : row + win_h, col : col + win_w]
            sec_window = sec[row : row + win_h, col : col + win_w]
            estimates.append(_window_shift(ref_window, sec_window))

    dy = float(np.median([item[0] for item in estimates]))
    dx = float(np.median([item[1] for item in estimates]))
    peak = float(np.median([item[2] for item in estimates]))
    return ShiftEstimate(
        dy=dy,
        dx=dx,
        peak_correlation=peak,
        windows_used=len(estimates),
    )


def coregister_pair(
    reference: np.ndarray,
    secondary: np.ndarray,
    shift: ShiftEstimate | tuple[float, float],
) -> np.ndarray:
    """Align ``secondary`` to ``reference`` using the estimated shift."""

    dy, dx = (shift.dy, shift.dx) if isinstance(shift, ShiftEstimate) else shift
    return ndimage.shift(
        np.asarray(secondary),
        shift=(-dy, -dx),
        order=3,
        mode="wrap",
        prefilter=True,
    )
