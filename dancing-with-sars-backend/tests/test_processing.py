"""Tests for nisar.processing module."""

import numpy as np
import pytest

from nisar.processing import (
    area_stats,
    classify,
    compute_time_series,
    diff_db,
    histogram,
    robust_sigma,
    smooth_linear,
    to_db,
)


class TestToDb:
    """Tests for to_db function."""

    def test_to_db_basic(self):
        """Test basic dB conversion."""
        power = np.array([0.1, 1.0, 10.0], dtype=np.float32)
        db = to_db(power)
        
        expected = 10 * np.log10(power)
        np.testing.assert_allclose(db, expected, rtol=1e-5)

    def test_to_db_with_invalid(self):
        """Test dB conversion with invalid values."""
        power = np.array([0.1, 0.0, -0.1, np.nan, np.inf], dtype=np.float32)
        db = to_db(power)
        
        assert np.isnan(db[1])  # zero
        assert np.isnan(db[2])  # negative
        assert np.isnan(db[3])  # NaN
        assert np.isnan(db[4])  # inf
        assert np.isfinite(db[0])  # valid

    def test_to_db_2d(self):
        """Test dB conversion with 2D array."""
        power = np.array([[0.1, 1.0], [10.0, 100.0]], dtype=np.float32)
        db = to_db(power)
        
        expected = 10 * np.log10(power)
        np.testing.assert_allclose(db, expected, rtol=1e-5)


class TestSmoothLinear:
    """Tests for smooth_linear function."""

    def test_smooth_linear_no_smoothing(self):
        """Test smoothing with kernel_size=1."""
        power = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)
        smoothed = smooth_linear(power, kernel_size=1)
        
        np.testing.assert_array_equal(power, smoothed)

    def test_smooth_linear_uniform_values(self):
        """Test smoothing with uniform values."""
        power = np.ones((10, 10), dtype=np.float32)
        smoothed = smooth_linear(power, kernel_size=3)
        
        np.testing.assert_allclose(smoothed, np.ones_like(power), rtol=1e-5)

    def test_smooth_linear_with_nan(self):
        """Test smoothing with NaN values."""
        power = np.array([[1.0, 2.0, np.nan], [4.0, 5.0, 6.0]], dtype=np.float32)
        smoothed = smooth_linear(power, kernel_size=3)
        
        # Should not crash and should handle NaN
        assert smoothed.shape == power.shape
        assert np.any(np.isfinite(smoothed))

    def test_smooth_linear_nan_does_not_erase_neighbours(self):
        """An invalid pixel must not blank the valid pixels around it.

        Regression test: the previous implementation multiplied NaN by the
        validity mask, so NaN survived the multiplication and the boxcar mean
        poisoned every window touching an invalid pixel.
        """
        power = np.ones((5, 5), dtype=np.float32)
        power[2, 2] = np.nan

        smoothed = smooth_linear(power, kernel_size=3)

        # Every pixel whose window contains at least one valid value stays defined.
        assert np.isfinite(smoothed).all()
        # Values remain the mean of the valid neighbours (all 1.0 here).
        np.testing.assert_allclose(smoothed, np.ones_like(power), rtol=1e-5)

    def test_smooth_linear_all_invalid_window_stays_nan(self):
        """A window with no valid pixels must produce NaN, not a fake zero."""
        power = np.zeros((3, 3), dtype=np.float32)

        smoothed = smooth_linear(power, kernel_size=3)

        assert np.isnan(smoothed).all()

    def test_smooth_linear_sparse_valid_pixels_survive(self):
        """Scattered invalid pixels must not collapse the valid population."""
        rng = np.random.default_rng(7)
        power = rng.uniform(0.01, 1.0, size=(60, 60)).astype(np.float32)
        power[rng.random((60, 60)) < 0.05] = np.nan  # ~5% gaps, as in speckle masks

        smoothed = smooth_linear(power, kernel_size=3)

        finite_fraction = np.isfinite(smoothed).mean()
        assert finite_fraction > 0.95

    def test_smooth_linear_even_kernel(self):
        """Test that even kernel size raises error."""
        power = np.ones((10, 10), dtype=np.float32)
        with pytest.raises(ValueError, match="kernel_size must be odd"):
            smooth_linear(power, kernel_size=2)

    def test_smooth_linear_linear_domain(self):
        """Test that smoothing is done in linear power, not dB."""
        # Create a simple case where averaging in linear vs dB gives different results
        # Use a 3x1 array with a 3x1 kernel
        # Values [0.1, 1.0, 10.0] in linear power
        # Mean in linear: (0.1 + 1.0 + 10.0) / 3 = 3.7, which is ~5.7 dB
        # Mean in dB: (-10 + 0 + 10) / 3 = 0 dB, which is 1.0 in linear
        
        power = np.array([[0.1], [1.0], [10.0]], dtype=np.float32)
        smoothed = smooth_linear(power, kernel_size=3)
        
        # With kernel_size=3, all three pixels are averaged
        expected_linear = (0.1 + 1.0 + 10.0) / 3  # 3.7
        expected_db = 10 * np.log10(expected_linear)  # ~5.7
        
        # The smoothed value should be close to 3.7
        actual_linear = smoothed[1]  # Middle pixel gets the full kernel
        actual_db = 10 * np.log10(actual_linear)
        
        # Should be close to 5.7, not 0
        assert abs(actual_db - expected_db) < 0.1
        # Should NOT be 0 (which would be the case if we averaged in dB)
        assert abs(actual_db) > 0.1


def test_time_series_rejects_an_acquisition_with_no_valid_pixels():
    class EmptyWindow:
        granule = "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5"
        power = np.zeros((4, 4), dtype=np.float32)

    with pytest.raises(ValueError, match="No valid pixels in time-series acquisition"):
        compute_time_series([EmptyWindow()])


class TestDiffDb:
    """Tests for diff_db function."""

    def test_diff_db_basic(self):
        """Test basic difference computation."""
        pre_db = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        post_db = np.array([2.0, 2.0, 4.0], dtype=np.float32)
        
        diff = diff_db(pre_db, post_db)
        expected = np.array([1.0, 0.0, 1.0], dtype=np.float32)
        
        np.testing.assert_array_equal(diff, expected)

    def test_diff_db_with_nan(self):
        """Test difference with NaN values."""
        pre_db = np.array([1.0, np.nan, 3.0], dtype=np.float32)
        post_db = np.array([2.0, 2.0, np.nan], dtype=np.float32)
        
        diff = diff_db(pre_db, post_db)
        
        # Pixels where either pre or post is NaN should be NaN in the result
        assert np.isnan(diff[1])  # pre is NaN
        assert np.isnan(diff[2])  # post is NaN
        # First pixel should have a valid difference
        assert np.isfinite(diff[0])


class TestClassify:
    """Tests for classify function."""

    def test_classify_basic(self):
        """Test basic classification."""
        diff_db = np.array([-6.0, -4.0, -2.0, 0.0, 2.0, 4.0, 6.0], dtype=np.float32)
        thresholds = [3.0]
        
        result = classify(diff_db, thresholds)
        
        decrease, increase = result[3.0]
        
        # With threshold 3.0:
        # decrease: values <= -3.0 (indices 0, 1)
        # increase: values >= +3.0 (indices 5, 6)
        expected_decrease = np.array([True, True, False, False, False, False, False])
        expected_increase = np.array([False, False, False, False, False, True, True])
        
        np.testing.assert_array_equal(decrease, expected_decrease)
        np.testing.assert_array_equal(increase, expected_increase)

    def test_classify_multiple_thresholds(self):
        """Test classification with multiple thresholds."""
        diff_db = np.array([-6.0, -4.0, -2.0, 0.0, 2.0, 4.0, 6.0], dtype=np.float32)
        thresholds = [2.0, 4.0]
        
        result = classify(diff_db, thresholds)
        
        # At threshold 2.0:
        # decrease: values <= -2.0 (indices 0, 1, 2)
        # increase: values >= +2.0 (indices 4, 5, 6)
        decrease_2, increase_2 = result[2.0]
        expected_decrease_2 = np.array([True, True, True, False, False, False, False])
        expected_increase_2 = np.array([False, False, False, False, True, True, True])
        
        np.testing.assert_array_equal(decrease_2, expected_decrease_2)
        np.testing.assert_array_equal(increase_2, expected_increase_2)

    def test_classify_with_nan(self):
        """Test classification with NaN values."""
        diff_db = np.array([-6.0, np.nan, 0.0, 6.0], dtype=np.float32)
        thresholds = [3.0]
        
        result = classify(diff_db, thresholds)
        decrease, increase = result[3.0]
        
        # NaN pixels should be excluded from both masks
        assert not decrease[1]  # NaN pixel
        assert not increase[1]  # NaN pixel


class TestAreaStats:
    """Tests for area_stats function."""

    def test_area_stats_basic(self):
        """Test basic area statistics."""
        # Create a simple diff array with known changes
        # 10x10 array, spacing = 10m
        diff_db = np.zeros((10, 10), dtype=np.float32)
        
        # Mark a 5x5 region in the top-left as -6 dB (decrease)
        diff_db[:5, :5] = -6.0
        
        # Mark a 3x3 region in the bottom-right as +6 dB (increase)
        diff_db[-3:, -3:] = 6.0
        
        spacing_m = 10.0
        thresholds_db = [3.0]
        
        stats = area_stats(diff_db, spacing_m, thresholds_db)
        
        # Check threshold 3.0
        s = stats[3.0]
        
        # 25 pixels decreased, 9 pixels increased
        # Each pixel is 10m x 10m = 100m² = 0.0001km²
        expected_decrease_km2 = 25 * 0.0001  # 0.0025 km²
        expected_increase_km2 = 9 * 0.0001   # 0.0009 km²
        
        assert abs(s.decrease_km2 - expected_decrease_km2) < 0.0001
        assert abs(s.increase_km2 - expected_increase_km2) < 0.0001
        
        # All pixels are valid
        assert s.valid_pixels == 100
        assert s.valid_fraction_of_bbox == 1.0

    def test_area_stats_valid_fraction(self):
        """Test valid_fraction_of_bbox calculation."""
        # Create array with 25% NaN
        diff_db = np.random.random((100, 100)).astype(np.float32)
        nan_mask = np.random.random((100, 100)) < 0.25
        diff_db[nan_mask] = np.nan
        
        spacing_m = 10.0
        thresholds_db = [3.0]
        
        stats = area_stats(diff_db, spacing_m, thresholds_db)
        s = stats[3.0]
        
        # Approximately 75% valid
        assert abs(s.valid_fraction_of_bbox - 0.75) < 0.05

    def test_area_stats_histogram(self):
        """Test histogram generation."""
        # Create array with values spread across range
        diff_db = np.linspace(-15, 15, 1000, dtype=np.float32)
        
        spacing_m = 10.0
        thresholds_db = [3.0]
        
        stats = area_stats(diff_db, spacing_m, thresholds_db)
        s = stats[3.0]
        
        # Histogram should have 60 bins
        assert len(s.histogram) == 60
        # All values should be in the histogram
        assert np.sum(s.histogram) == 1000


class TestRobustSigma:
    """Tests for robust_sigma function."""

    def test_robust_sigma_basic(self):
        """Test basic robust sigma."""
        # Create array with known MAD
        data = np.array([1, 2, 3, 4, 5], dtype=np.float32)
        sigma = robust_sigma(data)
        
        # Median is 3, MAD is 1, sigma = 1.4826 * 1 = 1.4826
        expected = 1.4826 * 1.0
        assert abs(sigma - expected) < 0.001

    def test_robust_sigma_with_nan(self):
        """Test robust sigma with NaN values."""
        data = np.array([1, 2, np.nan, 4, 5], dtype=np.float32)
        sigma = robust_sigma(data)
        
        # Should ignore NaN
        # MAD of [1,2,4,5]: median is 3, deviations are [2,1,1,2], MAD is 1.5
        # sigma = 1.4826 * 1.5 = 2.2239
        expected = 1.4826 * 1.5
        assert abs(sigma - expected) < 0.01


class TestHistogram:
    """Tests for histogram function."""

    def test_histogram_basic(self):
        """Test basic histogram."""
        data = np.array([-10, -5, 0, 5, 10], dtype=np.float32)
        hist = histogram(data, bins=60, range_min=-15, range_max=15)
        
        # Should have 60 bins
        assert len(hist) == 60
        # Should count the values
        assert np.sum(hist) == 5

    def test_histogram_with_nan(self):
        """Test histogram with NaN values."""
        data = np.array([-10, np.nan, 0, 5, np.nan], dtype=np.float32)
        hist = histogram(data, bins=60, range_min=-15, range_max=15)
        
        # Should count only valid values
        assert np.sum(hist) == 3
