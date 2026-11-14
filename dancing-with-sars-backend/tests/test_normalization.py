"""Tests for GCOV gamma0-to-sigma0 radiometric normalization."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from unittest.mock import patch

import h5py
import numpy as np
import pyproj
import pytest
import yaml
from affine import Affine

from nisar.config import Config
from nisar.normalize import (
    NORMALIZATION_METHOD,
    NORMALIZATION_SOURCE,
    NormalizedWindow,
    apply_gamma_to_sigma,
)
from nisar.processing import compute_time_series, process_pair, smooth_linear, to_db
from nisar.reader import GcovReader, Window
from nisar.site_builder import build_site, verify_site
from tests.fixtures.make_fake_gcov import (
    create_fake_gcov,
    create_fake_gcov_pair,
    make_varying_gamma_to_sigma_grid,
)

GRANULE_1 = (
    "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_"
    "20260701T160541_20260701T160541_P05023_P_F_J_001.h5"
)
GRANULE_2 = (
    "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_"
    "20260713T160541_20260713T160541_P05023_P_F_J_002.h5"
)


def _fixture_bbox(low_m: float = 400.0, high_m: float = 1600.0) -> list[float]:
    to_wgs84 = pyproj.Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)
    min_lon, min_lat = to_wgs84.transform(low_m, low_m)
    max_lon, max_lat = to_wgs84.transform(high_m, high_m)
    return [min_lon, min_lat, max_lon, max_lat]


def _make_window(
    power: np.ndarray,
    factor: np.ndarray | float | None,
    *,
    granule: str = GRANULE_1,
) -> Window:
    valid = np.isfinite(power) & (power > 0)
    return Window(
        power=power.astype(np.float32),
        valid=valid,
        transform=Affine.translation(0.0, 2000.0) @ Affine.scale(20.0, -20.0),
        crs="EPSG:32646",
        spacing_m=20.0,
        granule=granule,
        pol="HH",
        rtc_gamma_to_sigma=factor,
    )


def _write_site_yaml(path: Path, bbox: list[float]) -> Path:
    path.write_text(
        yaml.safe_dump(
            {
                "id": "norm-site",
                "title": "Normalization test site",
                "event_type": "other",
                "description": "Synthetic test site for gamma-to-sigma normalization",
                "caveat": (
                    "Synthetic fixture data: not a real observation, "
                    "not a real change, and not evidence of anything."
                ),
                "bbox": bbox,
                "stack": {
                    "track": 122,
                    "frame": 67,
                    "direction": "D",
                    "maturity": "PROVISIONAL",
                },
                "polarizations": ["HH"],
                "smoothing_px": 1,
                "thresholds_db": [2.0],
                "default_threshold_db": 2.0,
                "pairs": [
                    {
                        "id": "norm-pair",
                        "pre": "20260701",
                        "post": "20260713",
                        "label": "Before and after",
                    }
                ],
                "tiles": {"min_zoom": 0, "max_zoom": 0, "budget_mb": 5},
            }
        ),
        encoding="utf-8",
    )
    return path


class TestScalarAndGridNormalization:
    """Unit tests for apply_gamma_to_sigma convention and invalid-factor masking."""

    def test_scalar_factor_scales_power_and_shifts_db(self):
        """Scalar factor 0.8 scales power by 0.8 and shifts dB by 10*log10(0.8)."""
        raw_power = np.full((8, 8), 0.5, dtype=np.float32)
        window = _make_window(raw_power, factor=0.8)

        normalized = apply_gamma_to_sigma(window)
        assert isinstance(normalized, NormalizedWindow)
        assert normalized.normalization.applied is True
        assert normalized.normalization.method == NORMALIZATION_METHOD
        assert normalized.normalization.factor_kind == "scalar"
        assert normalized.normalization.source == NORMALIZATION_SOURCE

        expected_power = np.full((8, 8), 0.4, dtype=np.float32)
        np.testing.assert_allclose(normalized.power, expected_power, rtol=1e-6)
        assert normalized.valid.all()

        raw_db = to_db(window.power)
        norm_db = to_db(normalized.power)
        expected_shift_db = 10.0 * np.log10(0.8)
        np.testing.assert_allclose(norm_db - raw_db, expected_shift_db, atol=1e-5)

    def test_apply_gamma_to_sigma_is_idempotent(self):
        """Calling apply_gamma_to_sigma twice must not double-scale power."""
        window = _make_window(np.full((4, 4), 1.0, dtype=np.float32), factor=0.5)
        once = apply_gamma_to_sigma(window)
        twice = apply_gamma_to_sigma(once)
        assert twice is once
        np.testing.assert_allclose(twice.power, np.full((4, 4), 0.5, dtype=np.float32))

    def test_2d_grid_factor_elementwise_and_invalid_factor_masked(self, caplog):
        """2D factor applies element-wise; NaN/0/negative pixels are masked in valid."""
        raw_power = np.full((3, 3), 2.0, dtype=np.float32)
        factor_grid = np.array(
            [
                [0.5, 1.0, 1.5],
                [np.nan, 0.0, -0.4],
                [np.inf, 0.25, 2.0],
            ],
            dtype=np.float32,
        )
        window = _make_window(raw_power, factor=factor_grid)

        with caplog.at_level(logging.WARNING, logger="nisar.normalize"):
            normalized = apply_gamma_to_sigma(window)

        assert normalized.normalization.applied is True
        assert normalized.normalization.factor_kind == "grid"
        assert "Masked 4 pixel(s)" in caplog.text

        expected_valid = np.array(
            [
                [True, True, True],
                [False, False, False],
                [False, True, True],
            ]
        )
        np.testing.assert_array_equal(normalized.valid, expected_valid)

        np.testing.assert_allclose(normalized.power[0], [1.0, 2.0, 3.0], rtol=1e-6)
        np.testing.assert_allclose(normalized.power[2, 1:], [0.5, 4.0], rtol=1e-6)
        assert np.isnan(normalized.power[~expected_valid]).all()

        # Downstream smooth_linear and to_db keep masked pixels as NaN without poisoning neighbors.
        smoothed = smooth_linear(normalized.power, kernel_size=3)
        assert np.isfinite(smoothed[0, 0])
        db = to_db(normalized.power)
        assert np.isnan(db[~expected_valid]).all()
        assert np.isfinite(db[expected_valid]).all()

    def test_missing_factor_logs_warning_and_marks_unapplied(self, caplog):
        """Missing factor returns applied=False, logs a warning, and does not crash."""
        raw_power = np.full((4, 4), 0.25, dtype=np.float32)
        window = _make_window(raw_power, factor=None)

        with caplog.at_level(logging.WARNING, logger="nisar.normalize"):
            normalized = apply_gamma_to_sigma(window)

        assert normalized.normalization.applied is False
        assert normalized.normalization.factor_kind is None
        assert normalized.normalization.source == NORMALIZATION_SOURCE
        assert normalized.normalization.warning is not None
        assert "Missing rtcGammaToSigmaFactor" in caplog.text
        np.testing.assert_allclose(normalized.power, raw_power)

    def test_mismatched_grid_shape_raises(self):
        """Mismatched 2D factor grid shape fails explicitly."""
        window = _make_window(np.ones((4, 4), dtype=np.float32), factor=None)
        window.rtc_gamma_to_sigma = np.ones((2, 2), dtype=np.float32)
        with pytest.raises(ValueError, match="does not match"):
            apply_gamma_to_sigma(window)


class TestReaderFactorAndCache:
    """Tests for GcovReader extracting rtcGammaToSigmaFactor and .npz caching."""

    def test_reader_reads_2d_grid_and_survives_npz_cache(self, tmp_path):
        """Reader reads 2D factor grid, caches as real .npz, and restores factor."""
        path = tmp_path / GRANULE_1
        size = 100
        grid = make_varying_gamma_to_sigma_grid(size, min_factor=0.6, max_factor=1.2)
        create_fake_gcov(
            path=path,
            size=size,
            pixel_spacing_m=20.0,
            crs_epsg="EPSG:32646",
            pol_codes=["HHHH"],
            seed=42,
            gamma_to_sigma=grid,
        )

        cache_dir = tmp_path / "cache"
        reader = GcovReader(cache_dir=cache_dir, max_window_px=1000)
        bbox = _fixture_bbox()

        w1 = reader.read_window(path, bbox, pol="HH", use_cache=True)
        assert isinstance(w1.rtc_gamma_to_sigma, np.ndarray)
        assert w1.rtc_gamma_to_sigma.dtype == np.float32
        assert w1.rtc_gamma_to_sigma.shape == w1.power.shape
        # Check non-1 values were actually read from the grid.
        assert not np.allclose(w1.rtc_gamma_to_sigma, 1.0)

        cache_files = list(cache_dir.rglob("*.npz"))
        assert len(cache_files) == 1
        with np.load(cache_files[0], allow_pickle=False) as archive:
            assert int(archive["cache_version"]) == 2
            assert str(archive["rtc_gamma_to_sigma_kind"].item()) == "grid"

        with patch.object(reader, "_read_pol_window", wraps=reader._read_pol_window) as mock_read:
            w2 = reader.read_window(path, bbox, pol="HH", use_cache=True)
            mock_read.assert_not_called()

        assert isinstance(w2.rtc_gamma_to_sigma, np.ndarray)
        assert w2.rtc_gamma_to_sigma.dtype == np.float32
        np.testing.assert_allclose(w2.rtc_gamma_to_sigma, w1.rtc_gamma_to_sigma)
        assert np.array_equal(w2.power, w1.power, equal_nan=True)

    def test_reader_flips_2d_factor_grid_with_coordinates(self, tmp_path):
        """2D rtcGammaToSigmaFactor follows the same axis flips as power."""
        path = tmp_path / GRANULE_1
        size = 60
        grid = np.arange(size * size, dtype=np.float32).reshape(size, size) + 1.0
        create_fake_gcov(
            path=path,
            size=size,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma=grid,
            nan_fraction=0.0,
        )
        # Flip xCoordinates descending so reader must reverse columns on read.
        with h5py.File(path, "r+") as f:
            g = f["science/LSAR/GCOV/grids/frequencyA"]
            g["xCoordinates"][:] = g["xCoordinates"][:][::-1]

        reader = GcovReader(cache_dir=tmp_path / "cache")
        w = reader.read_window(path, _fixture_bbox(200.0, 1000.0), pol="HH", use_cache=False)
        assert isinstance(w.rtc_gamma_to_sigma, np.ndarray)
        # Rows were flipped for ascending y; cols were flipped for descending x.
        # In the original grid, column index increases left->right; after reversing x,
        # left columns correspond to higher original column indices (decreasing left->right).
        assert w.rtc_gamma_to_sigma[0, 0] > w.rtc_gamma_to_sigma[0, -1]
        # After flipping y from ascending to north-up (top row = largest y = largest row idx),
        # top row values exceed bottom row values.
        assert w.rtc_gamma_to_sigma[0, 0] > w.rtc_gamma_to_sigma[-1, 0]

    def test_reader_reads_scalar_and_survives_npz_cache(self, tmp_path):
        """Non-1 scalar factor is read accurately and preserved across cache hits."""
        path = tmp_path / GRANULE_1
        create_fake_gcov(
            path=path,
            size=100,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma=0.75,
        )
        reader = GcovReader(cache_dir=tmp_path / "cache")
        bbox = _fixture_bbox()

        w1 = reader.read_window(path, bbox, pol="HH", use_cache=True)
        assert isinstance(w1.rtc_gamma_to_sigma, float)
        assert np.isclose(w1.rtc_gamma_to_sigma, 0.75)

        w2 = reader.read_window(path, bbox, pol="HH", use_cache=True)
        assert isinstance(w2.rtc_gamma_to_sigma, float)
        assert np.isclose(w2.rtc_gamma_to_sigma, 0.75)

    def test_reader_missing_factor_logs_warning_and_caches_none(self, tmp_path, caplog):
        """Missing rtcGammaToSigmaFactor returns None + warning (no exception)."""
        path = tmp_path / GRANULE_1
        create_fake_gcov(
            path=path,
            size=100,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma=None,
        )
        reader = GcovReader(cache_dir=tmp_path / "cache")
        bbox = _fixture_bbox()

        with caplog.at_level(logging.WARNING, logger="nisar.reader"):
            w1 = reader.read_window(path, bbox, pol="HH", use_cache=True)

        assert w1.rtc_gamma_to_sigma is None
        assert "rtcGammaToSigmaFactor missing" in caplog.text

        w2 = reader.read_window(path, bbox, pol="HH", use_cache=True)
        assert w2.rtc_gamma_to_sigma is None


class TestProcessingAndPipeline:
    """Tests proving processing.py and site_builder.py normalize before dB conversion."""

    def test_process_pair_and_time_series_use_normalized_values(self):
        """Difference, stats, and time series reflect rtcGammaToSigmaFactor before dB."""
        pre = _make_window(np.full((10, 10), 1.0, dtype=np.float32), factor=0.5, granule=GRANULE_1)
        post = _make_window(np.full((10, 10), 1.0, dtype=np.float32), factor=1.0, granule=GRANULE_2)

        # Raw gamma would be 0 dB difference; normalized sigma is 10*log10(1.0 / 0.5) = +3.0103 dB.
        diff, stats, resampled = process_pair(
            pre,
            post,
            smoothing_px=1,
            thresholds_db=[2.0],
        )
        assert resampled is False
        expected_diff_db = 10.0 * np.log10(1.0 / 0.5)
        np.testing.assert_allclose(diff, expected_diff_db, atol=1e-4)
        assert np.isclose(stats[2.0].median_diff_db, expected_diff_db, atol=1e-4)
        assert stats[2.0].increase_pct == 100.0
        assert stats[2.0].decrease_pct == 0.0

        ts = compute_time_series([pre, post], smoothing_px=1)
        assert np.isclose(ts[0].backscatter_db, 10.0 * np.log10(0.5), atol=1e-4)
        assert np.isclose(ts[1].backscatter_db, 0.0, atol=1e-4)

    def test_site_builder_manifest_provenance_scalar_and_grid(self, tmp_path, monkeypatch):
        """site_builder records normalization provenance on source and every layer."""
        granule_dir = tmp_path / "granules"
        size = 100
        grid = make_varying_gamma_to_sigma_grid(size, min_factor=0.7, max_factor=1.1)
        create_fake_gcov_pair(
            granule_dir,
            size=size,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            change_amount_db=-6.0,
            gamma_to_sigma_1=0.8,
            gamma_to_sigma_2=grid,
        )
        config_path = _write_site_yaml(tmp_path / "site.yaml", _fixture_bbox(600.0, 1400.0))
        monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
        monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")

        output = build_site(config_path, local_dir=granule_dir)
        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))

        assert manifest["source"]["normalization"]["method"] == NORMALIZATION_METHOD
        assert manifest["source"]["normalization"]["source"] == NORMALIZATION_SOURCE
        assert manifest["source"]["normalization"]["applied"] is True
        assert manifest["source"]["normalization"]["factor_kind"] == "mixed"

        by_id = {layer["id"]: layer for layer in manifest["layers"]}
        assert by_id["backscatter-hh-2026-07-01"]["normalization"] == {
            "method": NORMALIZATION_METHOD,
            "factor_kind": "scalar",
            "source": NORMALIZATION_SOURCE,
            "applied": True,
            "warning": None,
        }
        assert by_id["backscatter-hh-2026-07-13"]["normalization"] == {
            "method": NORMALIZATION_METHOD,
            "factor_kind": "grid",
            "source": NORMALIZATION_SOURCE,
            "applied": True,
            "warning": None,
        }
        assert by_id["difference-norm-pair-hh"]["normalization"]["applied"] is True
        assert by_id["difference-norm-pair-hh"]["normalization"]["factor_kind"] == "mixed"
        assert by_id["mask-norm-pair-hh-2db"]["normalization"]["applied"] is True

        assert verify_site("norm-site")[0] == "Verified site norm-site"

    def test_site_builder_missing_factor_marks_applied_false(self, tmp_path, monkeypatch, caplog):
        """Missing rtcGammaToSigmaFactor produces applied=false provenance and warns."""
        granule_dir = tmp_path / "granules"
        create_fake_gcov_pair(
            granule_dir,
            size=100,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma_1=None,
            gamma_to_sigma_2=None,
        )
        config_path = _write_site_yaml(tmp_path / "site.yaml", _fixture_bbox(600.0, 1400.0))
        monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
        monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")

        with caplog.at_level(logging.WARNING):
            output = build_site(config_path, local_dir=granule_dir)

        manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["source"]["normalization"]["applied"] is False
        assert manifest["source"]["normalization"]["source"] == NORMALIZATION_SOURCE
        for layer in manifest["layers"]:
            assert layer["normalization"]["applied"] is False
            assert layer["normalization"]["source"] == NORMALIZATION_SOURCE
            assert layer["normalization"]["warning"]
        assert "rtcGammaToSigmaFactor" in caplog.text

    def test_regression_same_stack_varying_factor_reduces_angle_offset(self, tmp_path):
        """Two same-stack dates with spatially varying factors have reduced offset when normalized.

        Constructs two synthetic GCOV granules representing the same physical
        surface (constant true sigma0 = -10 dB background, plus a real -6 dB
        change in the center on date 2) observed under different spatially
        varying gamma-to-sigma factor grids.
        """
        size = 100
        # Physical true sigma0 = -10 dB -> linear 0.1 across background.
        true_sigma_db = -10.0
        true_sigma_linear = np.full((size, size), 10 ** (true_sigma_db / 10.0), dtype=np.float32)

        factor_1 = make_varying_gamma_to_sigma_grid(size, min_factor=0.5, max_factor=1.0)
        # Date 2 has an opposing spatial geometry factor gradient.
        factor_2 = make_varying_gamma_to_sigma_grid(size, min_factor=1.2, max_factor=0.7)

        # Since sigma0 = gamma0 * factor, the recorded GCOV gamma0 is sigma0 / factor.
        gamma_1 = (true_sigma_linear / factor_1).astype(np.float32)

        # Include a real -6 dB localized drop in the center on date 2.
        true_sigma_2 = true_sigma_linear.copy()
        true_sigma_2[35:65, 35:65] *= np.float32(10 ** (-6.0 / 10.0))
        gamma_2 = (true_sigma_2 / factor_2).astype(np.float32)

        p1 = tmp_path / GRANULE_1
        p2 = tmp_path / GRANULE_2
        create_fake_gcov(
            p1,
            size=size,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma=factor_1,
            nan_fraction=0.0,
        )
        create_fake_gcov(
            p2,
            size=size,
            pixel_spacing_m=20.0,
            pol_codes=["HHHH"],
            gamma_to_sigma=factor_2,
            nan_fraction=0.0,
        )
        # Overwrite HHHH datasets with exact gamma_1 and gamma_2 powers.
        with h5py.File(p1, "r+") as f1:
            f1["science/LSAR/GCOV/grids/frequencyA/HHHH"][:] = gamma_1
        with h5py.File(p2, "r+") as f2:
            f2["science/LSAR/GCOV/grids/frequencyA/HHHH"][:] = gamma_2

        reader = GcovReader(cache_dir=tmp_path / "cache")
        bbox = _fixture_bbox(200.0, 1800.0)
        w1 = reader.read_window(p1, bbox, pol="HH", use_cache=False)
        w2 = reader.read_window(p2, bbox, pol="HH", use_cache=False)

        # Raw gamma path (bypassing normalization by zeroing out factor attachment):
        w1_raw = Window(
            power=w1.power,
            valid=w1.valid,
            transform=w1.transform,
            crs=w1.crs,
            spacing_m=w1.spacing_m,
            granule=w1.granule,
            pol=w1.pol,
            rtc_gamma_to_sigma=None,
        )
        w2_raw = Window(
            power=w2.power,
            valid=w2.valid,
            transform=w2.transform,
            crs=w2.crs,
            spacing_m=w2.spacing_m,
            granule=w2.granule,
            pol=w2.pol,
            rtc_gamma_to_sigma=None,
        )

        raw_diff, raw_stats, _ = process_pair(w1_raw, w2_raw, smoothing_px=1, thresholds_db=[2.0])
        norm_diff, norm_stats, _ = process_pair(w1, w2, smoothing_px=1, thresholds_db=[2.0])

        # Normalized path removes the angle-driven dispersion and bias across background pixels.
        assert norm_stats[2.0].sigma_db < raw_stats[2.0].sigma_db * 0.1
        assert abs(norm_stats[2.0].median_diff_db) < 0.05
        # Background pixels (top row) are ~0 dB when normalized, vs biased in raw gamma.
        assert np.max(np.abs(norm_diff[:5, :])) < 0.01
        assert np.max(np.abs(raw_diff[:5, :])) > 1.0
        # Real -6 dB change in the center is preserved (not erased).
        center_r, center_c = norm_diff.shape[0] // 2, norm_diff.shape[1] // 2
        assert np.isclose(norm_diff[center_r, center_c], -6.0, atol=0.05)
