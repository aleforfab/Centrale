from __future__ import annotations

import math

import numpy as np

from nisar.insar.filtering import goldstein_filter, noise_variance_against_ramp
from nisar.insar.unwrap import detect_residues, unwrap_phase
from tests.fixtures.make_synthetic_insar import (
    gaussian_bump,
    ramp_phase,
    vortex_phase,
    wrap_phase,
)


def test_goldstein_equivalent_reduces_noise_and_preserves_ramp() -> None:
    rng = np.random.default_rng(4)
    ramp = ramp_phase((64, 64), slope_x=0.03, slope_y=0.02)
    noisy = ramp + rng.normal(scale=0.35, size=ramp.shape)
    filtered, diagnostics = goldstein_filter(noisy, alpha=0.5, smoothing_window=5)
    before = noise_variance_against_ramp(noisy, ramp)
    after = noise_variance_against_ramp(filtered, ramp)
    assert after < before
    assert diagnostics.variance_reduction_ratio > 0.0
    assert diagnostics.ramp_preserved is True
    assert diagnostics.as_dict()["status"] == "proposed"


def test_unwrap_recovers_a_ramp_with_plus_and_minus_two_pi_offsets() -> None:
    ramp = ramp_phase((32, 32), slope_x=0.03, slope_y=0.02)
    for offset in (2 * math.pi, -2 * math.pi):
        phase = ramp + offset
        result = unwrap_phase(wrap_phase(phase))
        assert result.resolved is True
        assert result.residue_count == 0
        np.testing.assert_allclose(
            result.unwrapped_phase - result.unwrapped_phase[0, 0],
            phase - phase[0, 0],
            atol=1e-6,
        )


def test_unwrap_recovers_a_closed_gaussian_bump() -> None:
    phase = gaussian_bump((32, 32), amplitude=2.0, sigma=8.0)
    result = unwrap_phase(wrap_phase(phase))
    assert result.resolved is True
    np.testing.assert_allclose(
        result.unwrapped_phase - result.unwrapped_phase[0, 0],
        phase - phase[0, 0],
        atol=1e-6,
    )


def test_unwrap_flags_residues_instead_of_unwrapping_silently() -> None:
    vortex = vortex_phase((16, 16))
    assert np.count_nonzero(detect_residues(vortex)) > 0
    result = unwrap_phase(vortex)
    assert result.resolved is False
    assert result.residue_count > 0
    assert np.isnan(result.unwrapped_phase).any()
    assert result.as_dict()["unwrapped_phase_available"] is False
