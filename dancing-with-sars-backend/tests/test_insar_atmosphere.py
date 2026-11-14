from __future__ import annotations

import numpy as np

from nisar.insar.atmosphere import screen_atmosphere
from tests.fixtures.make_synthetic_insar import ramp_phase


def test_flat_phase_has_no_atmosphere_flags() -> None:
    result = screen_atmosphere(np.zeros((32, 32)))
    assert result.flags() == {
        "stratified_troposphere_ramp": False,
        "wet_random_variance": False,
        "long_wavelength_ionospheric_trend": False,
    }
    assert result.as_dict()["diagnostics"]["corrected"] is False
    assert result.as_dict()["diagnostics"]["removal_out_of_scope_until_validated"] is True


def test_ramp_is_flagged_as_stratified_candidate() -> None:
    result = screen_atmosphere(ramp_phase((32, 32), slope_x=0.08, slope_y=0.05))
    assert result.stratified_troposphere_ramp is True
    assert result.long_wavelength_ionospheric_trend is False
    assert result.r_squared > 0.9


def test_random_variance_is_flagged_as_wet_candidate() -> None:
    rng = np.random.default_rng(12)
    result = screen_atmosphere(rng.normal(scale=0.5, size=(32, 32)))
    assert result.wet_random_variance is True
    assert result.residual_rms > 0.25


def test_quadratic_trend_is_flagged_as_long_wavelength_candidate() -> None:
    yy, xx = np.mgrid[0:32, 0:32]
    x = (xx - xx.mean()) / xx.std()
    y = (yy - yy.mean()) / yy.std()
    quadratic = 0.5 * x**2 + 0.25 * y**2
    result = screen_atmosphere(quadratic)
    assert result.long_wavelength_ionospheric_trend is True
    assert "Screening only" in result.caveats()[0]
