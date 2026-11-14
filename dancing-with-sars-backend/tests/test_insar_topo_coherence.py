from __future__ import annotations

import math

import numpy as np
import pytest

from nisar.insar.coherence import (
    coherence_diagnostics,
    coherence_magnitude,
    complex_coherence,
)
from nisar.insar.topo import DEM, remove_topographic_phase, topographic_phase
from tests.fixtures.make_synthetic_insar import plane_dem, ramp_phase


def test_topographic_phase_formula_is_pinned() -> None:
    angle = math.radians(35.0)
    value = topographic_phase(
        np.array([[10.0]]),
        wavelength_m=0.24,
        perpendicular_baseline_m=150.0,
        slant_range_m=800_000.0,
        incidence_angle_rad=angle,
    )
    expected = 10.0 * -(4.0 * math.pi / 0.24) * 150.0 / (800_000.0 * math.sin(angle))
    assert value[0, 0] == pytest.approx(expected)


def test_topo_removal_residual_is_near_zero_on_a_plane() -> None:
    shape = (32, 32)
    angle = math.radians(35.0)
    dem = DEM(plane_dem(shape, slope_x=0.5, slope_y=0.2))
    modelled = topographic_phase(
        dem.height_m,
        wavelength_m=0.24,
        perpendicular_baseline_m=150.0,
        slant_range_m=800_000.0,
        incidence_angle_rad=angle,
    )
    phase = modelled + 0.1
    result = remove_topographic_phase(
        phase,
        dem,
        wavelength_m=0.24,
        perpendicular_baseline_m=150.0,
        slant_range_m=800_000.0,
        incidence_angle_rad=angle,
    )
    assert result.residual_rms < 0.101
    assert result.diagnostics()["formula"].startswith("-(4*pi/lambda)")


def test_complex_coherence_pinned_formula_and_bounds() -> None:
    primary = np.array([[1 + 0j, 0 + 1j], [1 + 1j, 1 + 0j]])
    secondary = np.array([[1 + 0j, 0 - 1j], [1 - 1j, 1 + 0j]])
    gamma = complex_coherence(primary, secondary, window=1)
    expected = (primary * np.conj(secondary)) / (
        np.abs(primary) * np.abs(secondary)
    )
    np.testing.assert_allclose(gamma, expected, atol=1e-12)
    assert np.all(np.abs(gamma) <= 1.0 + 1e-12)


def test_coherence_identical_and_decorrelated_cases() -> None:
    phase = ramp_phase((32, 32), slope_x=0.03, slope_y=0.02)
    identical = np.exp(1j * phase)
    assert float(np.mean(coherence_magnitude(identical, identical.copy(), 5))) == pytest.approx(1.0)

    rng = np.random.default_rng(9)
    decorrelated = rng.normal(size=phase.shape) + 1j * rng.normal(size=phase.shape)
    mean = float(np.mean(coherence_magnitude(identical, decorrelated, 5)))
    assert mean < 0.5
    diagnostics = coherence_diagnostics(identical, identical.copy(), 5)
    assert diagnostics.min_magnitude == pytest.approx(1.0)
    assert diagnostics.valid_fraction == pytest.approx(1.0)
    assert diagnostics.as_dict()["status"] == "proposed"
