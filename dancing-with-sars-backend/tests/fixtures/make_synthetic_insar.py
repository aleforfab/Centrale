"""Synthetic InSAR fixture generator (no real observations, no network).

These helpers create small complex SLC pairs, wrapped phase fields, GUNW-like
HDF5 products and plane DEMs for the proposed InSAR unit tests. Nothing here is
an observation, a change product, or evidence of anything.
"""

from __future__ import annotations

from pathlib import Path

import h5py
import numpy as np
from scipy import ndimage


def wrap_phase(phase: np.ndarray) -> np.ndarray:
    """Wrap an unwrapped phase array into (-pi, pi]."""

    return np.angle(np.exp(1j * np.asarray(phase, dtype=np.float64)))


def ramp_phase(
    shape: tuple[int, int] = (64, 64),
    slope_x: float = 0.03,
    slope_y: float = 0.02,
) -> np.ndarray:
    """Return a smooth synthetic phase ramp with gradients below pi/pixel."""

    yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]]
    return slope_x * xx + slope_y * yy


def gaussian_bump(
    shape: tuple[int, int] = (64, 64),
    amplitude: float = 2.0,
    sigma: float = 8.0,
) -> np.ndarray:
    """Return a closed, orbit-free synthetic Gaussian phase bump."""

    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width]
    center_y, center_x = (height - 1) / 2.0, (width - 1) / 2.0
    return amplitude * np.exp(
        -(((xx - center_x) ** 2 + (yy - center_y) ** 2) / (2.0 * sigma**2))
    )


def vortex_phase(shape: tuple[int, int] = (16, 16)) -> np.ndarray:
    """Return a wrapped phase vortex containing loop-integral residues."""

    height, width = shape
    yy, xx = np.mgrid[0:height, 0:width]
    center_y, center_x = (height - 1) / 2.0, (width - 1) / 2.0
    return np.angle((xx - center_x) + 1j * (yy - center_y))


def plane_dem(
    shape: tuple[int, int] = (64, 64),
    slope_x: float = 0.5,
    slope_y: float = 0.2,
) -> np.ndarray:
    """Return a synthetic plane DEM in metres."""

    yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]]
    return slope_x * xx + slope_y * yy


def complex_slc_pair(
    shape: tuple[int, int] = (64, 64),
    shift: tuple[float, float] = (2.35, -1.2),
    seed: int = 7,
) -> tuple[np.ndarray, np.ndarray]:
    """Return a synthetic complex pair with a known sub-pixel circular shift."""

    rng = np.random.default_rng(seed)
    reference = rng.normal(size=shape) + 1j * rng.normal(size=shape)
    secondary = ndimage.shift(
        reference,
        shift=shift,
        order=3,
        mode="wrap",
        prefilter=True,
    )
    return reference.astype(np.complex128), secondary.astype(np.complex128)


def _write_attributes(handle: h5py.File, attrs: dict[str, str] | None) -> None:
    for key, value in (attrs or {}).items():
        handle.attrs[key] = str(value)


def write_gunw_hdf5(
    path: str | Path,
    phase: np.ndarray,
    coherence: np.ndarray,
    incidence_angle: np.ndarray,
    wavelength_m: float = 0.24,
    attrs: dict[str, str] | None = None,
) -> Path:
    """Write a small synthetic GUNW-like HDF5 interferogram."""

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with h5py.File(target, "w") as handle:
        handle.create_dataset("unwrappedPhase", data=np.asarray(phase, dtype=np.float64))
        handle.create_dataset("coherence", data=np.asarray(coherence, dtype=np.float64))
        handle.create_dataset("incidenceAngle", data=np.asarray(incidence_angle, dtype=np.float64))
        handle.attrs["wavelength_m"] = float(wavelength_m)
        handle.attrs["status"] = "proposed"
        handle.attrs["caveat"] = "synthetic fixture, not a real observation"
        _write_attributes(handle, attrs)
    return target


def write_slc_pair_hdf5(
    path: str | Path,
    reference: np.ndarray,
    secondary: np.ndarray,
    wavelength_m: float = 0.24,
    attrs: dict[str, str] | None = None,
) -> Path:
    """Write a small synthetic complex SLC pair to HDF5."""

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with h5py.File(target, "w") as handle:
        handle.create_dataset("reference", data=np.asarray(reference, dtype=np.complex128))
        handle.create_dataset("secondary", data=np.asarray(secondary, dtype=np.complex128))
        handle.attrs["wavelength_m"] = float(wavelength_m)
        handle.attrs["status"] = "proposed"
        handle.attrs["caveat"] = "synthetic fixture, not a real observation"
        _write_attributes(handle, attrs)
    return target
