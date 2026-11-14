"""Tests for nisar.reader module."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import h5py
import numpy as np
import pyproj
import pytest

from nisar.reader import (
    GcovReader,
    InvalidFileError,
    WindowTooLargeError,
    get_reader,
)
from tests.fixtures.make_fake_gcov import create_fake_gcov


def _fixture_bbox() -> list[float]:
    to_wgs84 = pyproj.Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)
    min_lon, min_lat = to_wgs84.transform(400, 400)
    max_lon, max_lat = to_wgs84.transform(1600, 1600)
    return [min_lon, min_lat, max_lon, max_lat]


class TestGcovReader:
    """Tests for GcovReader class."""

    def test_read_window_local_file(self, tmp_path):
        """Test reading a window from a local file."""
        path = tmp_path / "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5"
        create_fake_gcov(
            path=path,
            size=100,
            pixel_spacing_m=20.0,
            crs_epsg="EPSG:32646",
            pol_codes=["HHHH"],
            seed=42,
        )
        
        reader = GcovReader(max_window_px=1000)
        
        bbox = _fixture_bbox()
        
        window = reader.read_window(
            path=path,
            bbox=bbox,
            pol="HH",
            frequency="A",
            use_cache=False,
        )

        assert window.power.dtype == np.float32
        assert window.valid.dtype == bool
        assert window.spacing_m == 20.0
        assert window.crs == "EPSG:32646"
        assert window.power.shape[0] <= 1000
        assert window.power.shape[1] <= 1000
        assert window.transform.e < 0
        assert window.mask is not None
        assert window.mask.dtype == np.uint8
    
    def test_read_window_cache(self):
        """Test that windows are cached and reused."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            cache_dir = tmpdir / "cache"
            
            # Create a fake GCOV file
            path = tmpdir / "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5"
            create_fake_gcov(
                path=path,
                size=100,
                pixel_spacing_m=20.0,
                crs_epsg="EPSG:32646",
                pol_codes=["HHHH"],
                seed=42,
            )
            
            reader = GcovReader(cache_dir=cache_dir)
            
            bbox = _fixture_bbox()
            
            # First read
            window1 = reader.read_window(
                path=path,
                bbox=bbox,
                pol="HH",
                frequency="A",
            )
            
            # Check cache exists
            cache_files = list(cache_dir.rglob("*.npz"))
            assert len(cache_files) > 0
            
            # Second read should use cache
            with patch.object(reader, "_read_pol_window", wraps=reader._read_pol_window) as mock_read:
                window2 = reader.read_window(
                    path=path,
                    bbox=bbox,
                    pol="HH",
                    frequency="A",
                )
                
                # _read_pol_window should not be called on second read
                # (it should use cache)
                # Note: This might not work if the cache key changes
                mock_read.assert_not_called()
            
            # Both windows should have the same data
            assert np.array_equal(window1.power, window2.power, equal_nan=True)
    
    def test_read_window_invalid_pol(self):
        """Test that invalid polarization raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            
            # Create a fake GCOV file with only HHHH
            path = tmpdir / "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5"
            create_fake_gcov(
                path=path,
                size=100,
                pixel_spacing_m=20.0,
                crs_epsg="EPSG:32646",
                pol_codes=["HHHH"],
                seed=42,
            )
            
            reader = GcovReader()
            
            bbox = _fixture_bbox()
            
            with pytest.raises(InvalidFileError, match="Polarization"):
                reader.read_window(
                    path=path,
                    bbox=bbox,
                    pol="VV",  # Not in the file
                    frequency="A",
                )

    def test_projection_info_from_nisar_attributes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "projection.h5"
            with h5py.File(path, "w") as file:
                group = file.create_group("frequencyA")
                group.create_dataset("xCoordinates", data=[10.0, 20.0, 30.0])
                group.create_dataset("yCoordinates", data=[30.0, 20.0, 10.0])
                group.create_dataset("xCoordinateSpacing", data=10.0)
                group.create_dataset("yCoordinateSpacing", data=-10.0)
                projection = group.create_dataset("projection", data=np.array([], dtype=np.uint8))
                projection.attrs["epsg_code"] = "3031"
                projection.attrs["spatial_ref"] = "EPSG:3031"

                crs, spacing, transform = GcovReader()._read_projection_info(group)

            assert crs == "EPSG:3031"
            assert spacing == 10.0
            assert transform.a == 10.0
            assert transform.e == -10.0
            assert transform.c == 10.0
            assert transform.f == 30.0
    
    def test_read_window_too_large(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5"
            create_fake_gcov(path=path, size=100, pol_codes=["HHHH"])

            with pytest.raises(WindowTooLargeError):
                GcovReader(cache_dir=Path(tmpdir) / "cache", max_window_px=10).read_window(
                    path=path,
                    bbox=_fixture_bbox(),
                    pol="HH",
                    use_cache=False,
                )


class TestWindow:
    """Tests for Window dataclass."""

    def test_window_creation(self):
        """Test Window creation."""
        # Use the internal Window class (not directly accessible, but we can test via reader)
        # Tested implicitly in other tests


class TestGetReader:
    """Tests for get_reader function."""

    def test_get_reader_default(self):
        """Test getting a reader with default settings."""
        reader = get_reader()
        assert isinstance(reader, GcovReader)
        assert reader.max_window_px == 4000

    def test_get_reader_custom(self):
        """Test getting a reader with custom settings."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_dir = Path(tmpdir) / "cache"
            reader = get_reader(cache_dir=cache_dir, max_window_px=1000)
            assert isinstance(reader, GcovReader)
            assert reader.max_window_px == 1000
            assert reader.cache_dir == cache_dir
