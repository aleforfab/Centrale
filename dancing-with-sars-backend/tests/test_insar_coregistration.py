from __future__ import annotations

import numpy as np
import pytest

from nisar.insar.coherence import coherence_magnitude
from nisar.insar.coregister import coregister_pair, estimate_shift
from tests.fixtures.make_synthetic_insar import complex_slc_pair


def test_integer_shift_is_recovered_exactly() -> None:
    reference, _ = complex_slc_pair((64, 64), shift=(0, 0))
    secondary = np.roll(reference, (2, -3), axis=(0, 1))
    estimate = estimate_shift(
        reference,
        secondary,
        window_shape=(64, 64),
        overlap=0.0,
    )
    assert estimate.dy == pytest.approx(2.0, abs=1e-6)
    assert estimate.dx == pytest.approx(-3.0, abs=1e-6)
    assert estimate.windows_used == 1
    assert 0.0 < estimate.peak_correlation <= 1.0


def test_subpixel_shift_uses_parabolic_interpolation() -> None:
    reference, secondary = complex_slc_pair((64, 64), shift=(2.5, 1.5), seed=11)
    estimate = estimate_shift(
        reference,
        secondary,
        window_shape=(64, 64),
        overlap=0.5,
    )
    assert estimate.dy == pytest.approx(2.5, abs=0.15)
    assert estimate.dx == pytest.approx(1.5, abs=0.15)
    assert estimate.method == "fft cross-correlation + parabolic subpixel"


def test_coregister_pair_realigns_an_integer_shift() -> None:
    reference, _ = complex_slc_pair((64, 64), shift=(0, 0))
    secondary = np.roll(reference, (2, 3), axis=(0, 1))
    estimate = estimate_shift(
        reference,
        secondary,
        window_shape=(64, 64),
        overlap=0.0,
    )
    aligned = coregister_pair(reference, secondary, estimate)
    magnitude = coherence_magnitude(reference, aligned, window=1)
    assert float(np.mean(magnitude)) > 0.99
