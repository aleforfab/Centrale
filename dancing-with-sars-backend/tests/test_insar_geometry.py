from __future__ import annotations

import math

import numpy as np
import pytest

from nisar.insar.geometry import (
    OrbitState,
    compute_baseline,
    critical_baseline_check,
    los_scale_factor,
    phase_to_los_displacement,
    phase_to_range_change,
)


def test_baseline_components_and_temporal_separation() -> None:
    reference = OrbitState((0, 0, 0), (1, 0, 0), 0.0)
    secondary = OrbitState((100, 200, 300), (1, 0, 0), 12 * 86400.0)
    baseline = compute_baseline(reference, secondary, (0, 0, 1))
    assert baseline.parallel_m == pytest.approx(300.0)
    assert baseline.perpendicular_m == pytest.approx(math.sqrt(100**2 + 200**2))
    assert baseline.along_track_m == pytest.approx(100.0)
    assert baseline.temporal_days == pytest.approx(12.0)
    assert baseline.as_dict()["temporal_days"] == pytest.approx(12.0)


def test_critical_baseline_screen_and_ratio() -> None:
    angle = math.radians(35.0)
    check = critical_baseline_check(
        perpendicular_baseline_m=100.0,
        wavelength_m=0.24,
        slant_range_m=800_000.0,
        incidence_angle_rad=angle,
        range_resolution_m=10.0,
    )
    expected_limit = 0.24 * 800_000.0 * math.tan(angle) / (2.0 * 10.0)
    assert check.critical_baseline_m == pytest.approx(expected_limit)
    assert check.ratio == pytest.approx(100.0 / expected_limit)
    assert check.within_limit is True
    assert check.as_dict()["within_limit"] is True


def test_los_scale_factor_is_pinned() -> None:
    angle = 0.6
    expected = 0.24 / (4.0 * math.pi) * math.cos(angle)
    assert los_scale_factor(0.24, angle) == pytest.approx(expected)
    with pytest.raises(ValueError):
        los_scale_factor(0.0, angle)


def test_phase_to_range_and_los_sign_convention() -> None:
    phase = np.array([[0.0, math.pi], [-math.pi, 2 * math.pi]])
    wavelength = 0.24
    range_change = phase_to_range_change(phase, wavelength)
    los_displacement = phase_to_los_displacement(phase, wavelength)
    np.testing.assert_allclose(range_change, phase * wavelength / (4 * math.pi))
    np.testing.assert_allclose(los_displacement, -range_change)
