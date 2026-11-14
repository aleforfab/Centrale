"""Proposed complex coherence estimation for synthetic SLC pairs."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .utils import wrap_phase


def _uniform_filter(array: np.ndarray, window: int) -> np.ndarray:
    if np.iscomplexobj(array):
        real = ndimage.uniform_filter(np.real(array), size=window, mode="reflect")
        imag = ndimage.uniform_filter(np.imag(array), size=window, mode="reflect")
        return real + 1j * imag
    return ndimage.uniform_filter(array, size=window, mode="reflect")


def complex_coherence(
    primary: np.ndarray,
    secondary: np.ndarray,
    window: int = 5,
) -> np.ndarray:
    """Return boxcar complex coherence ``gamma`` for two complex SLC arrays.

    Pinned formula:

        gamma = <p1 * conj(p2)> / sqrt(<|p1|^2> * <|p2|^2>)

    The angle brackets denote a uniform window mean. Empty-energy pixels return
    ``0 + 0j`` rather than NaN so scalar diagnostics remain finite.
    """

    p1 = np.asarray(primary, dtype=np.complex128)
    p2 = np.asarray(secondary, dtype=np.complex128)
    if p1.shape != p2.shape:
        raise ValueError("Primary and secondary SLC arrays must have the same shape")
    if window < 1 or window % 2 == 0:
        raise ValueError("window must be a positive odd integer")

    cross = _uniform_filter(p1 * np.conj(p2), window)
    power1 = _uniform_filter(np.abs(p1) ** 2, window)
    power2 = _uniform_filter(np.abs(p2) ** 2, window)
    denominator = np.sqrt(power1 * power2)
    gamma = np.divide(
        cross,
        denominator,
        out=np.zeros_like(cross, dtype=np.complex128),
        where=denominator > 0,
    )
    return np.clip(np.abs(gamma), 0.0, 1.0) * np.exp(1j * wrap_phase(np.angle(gamma)))


def coherence_magnitude(
    primary: np.ndarray,
    secondary: np.ndarray,
    window: int = 5,
) -> np.ndarray:
    """Return ``|gamma|`` clipped to ``[0, 1]``."""

    return np.abs(complex_coherence(primary, secondary, window))


@dataclass(frozen=True)
class CoherenceDiagnostics:
    """Scalar coherence diagnostics for the chain's dictionary-only output."""

    mean_magnitude: float
    min_magnitude: float
    max_magnitude: float
    valid_fraction: float
    window: int

    def as_dict(self) -> dict[str, float | int | str]:
        return {
            "mean_magnitude": self.mean_magnitude,
            "min_magnitude": self.min_magnitude,
            "max_magnitude": self.max_magnitude,
            "valid_fraction": self.valid_fraction,
            "window": self.window,
            "status": "proposed",
        }


def coherence_diagnostics(
    primary: np.ndarray,
    secondary: np.ndarray,
    window: int = 5,
) -> CoherenceDiagnostics:
    """Compute scalar-only coherence diagnostics; no array is returned."""

    magnitude = coherence_magnitude(primary, secondary, window)
    finite = np.isfinite(magnitude)
    return CoherenceDiagnostics(
        mean_magnitude=float(np.mean(magnitude[finite])) if finite.any() else 0.0,
        min_magnitude=float(np.min(magnitude[finite])) if finite.any() else 0.0,
        max_magnitude=float(np.max(magnitude[finite])) if finite.any() else 0.0,
        valid_fraction=float(np.mean(finite)),
        window=window,
    )
