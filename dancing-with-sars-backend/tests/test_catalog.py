"""Tests for nisar.catalog module."""

from unittest.mock import MagicMock, patch

import pytest

from nisar.catalog import (
    KNOWN_GAPS,
    GranuleInfo,
    Stack,
    bbox_to_wkt,
    group_into_stacks,
    search_gcov,
)


class TestBboxToWkt:
    """Tests for bbox_to_wkt function."""

    def test_bbox_to_wkt(self):
        """Test bbox conversion to WKT."""
        bbox = [-108, -76, -100, -74.5]
        wkt = bbox_to_wkt(bbox)
        assert wkt == "POLYGON((-108 -76, -100 -76, -100 -74.5, -108 -74.5, -108 -76))"


class TestGranuleInfo:
    """Tests for GranuleInfo class."""

    def test_granule_info_parsing(self):
        """Test that GranuleInfo parses granule name correctly."""
        properties = {}
        geometry = None
        granule_info = GranuleInfo(
            granule_name="NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
            properties=properties,
            geometry=geometry,
        )
        
        assert granule_info.parsed.track == 122
        assert granule_info.parsed.frame == 67
        assert granule_info.parsed.direction == "D"
        assert granule_info.stack_key == (122, "D", 67)
        assert granule_info.maturity == "PROVISIONAL"
        assert granule_info.date == "2026-07-01"

    def test_granule_info_to_dict(self):
        """Test GranuleInfo to_dict method."""
        properties = {}
        granule_info = GranuleInfo(
            granule_name="NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
            properties=properties,
            geometry=None,
            urls=["https://example.com/granule.h5"],
        )
        
        result = granule_info.to_dict()
        assert result["granule"] == "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        assert result["track"] == 122
        assert result["frame"] == 67
        assert result["direction"] == "D"
        assert result["crid"] == "P05023"
        assert result["maturity"] == "PROVISIONAL"


class TestStack:
    """Tests for Stack class."""

    def test_stack_creation(self):
        """Test Stack creation."""
        stack = Stack(track=122, frame=67, direction="D")
        assert stack.track == 122
        assert stack.frame == 67
        assert stack.direction == "D"
        assert stack.stack_key == (122, "D", 67)
        assert stack.count == 0

    def test_stack_add_granule(self):
        """Test adding granules to a stack."""
        stack = Stack(track=122, frame=67, direction="D")
        
        granule1 = GranuleInfo(
            granule_name="NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
            properties={},
        )
        granule2 = GranuleInfo(
            granule_name="NISAR_L2_PR_GCOV_013_122_D_067_4005_DHDH_A_20260713T160541_20260713T160622_P05023_P_F_J_002",
            properties={},
        )
        
        stack.add_granule(granule1)
        stack.add_granule(granule2)
        
        assert stack.count == 2
        assert stack.dates == ["2026-07-01", "2026-07-13"]
        assert stack.cycles == [12, 13]

    def test_stack_to_dict(self):
        """Test Stack to_dict method."""
        stack = Stack(track=122, frame=67, direction="D")
        granule = GranuleInfo(
            granule_name="NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
            properties={},
        )
        stack.add_granule(granule)
        
        result = stack.to_dict()
        assert result["track"] == 122
        assert result["frame"] == 67
        assert result["direction"] == "D"
        assert result["granule_count"] == 1


class TestGroupIntoStacks:
    """Tests for group_into_stacks function."""

    def test_group_into_stacks(self):
        """Test grouping granules into stacks."""
        granules = [
            GranuleInfo(
                granule_name="NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
                properties={},
            ),
            GranuleInfo(
                granule_name="NISAR_L2_PR_GCOV_013_122_D_067_4005_DHDH_A_20260713T160541_20260713T160622_P05023_P_F_J_002",
                properties={},
            ),
            GranuleInfo(
                granule_name="NISAR_L2_PR_GCOV_012_123_A_068_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
                properties={},
            ),
        ]
        
        stacks = group_into_stacks(granules)
        
        assert len(stacks) == 2
        # Sort by count descending
        assert stacks[0].count == 2  # Stack 122,D,067 has 2 granules
        assert stacks[1].count == 1  # Stack 123,A,068 has 1 granule


class TestSearchGcov:
    """Tests for search_gcov function."""

    @patch("asf_search.search")
    @patch("asf_search.PLATFORM")
    @patch("asf_search.PRODUCT_TYPE")
    def test_search_gcov_mock(self, mock_product_type, mock_platform, mock_search):
        """Test search_gcov with mocked asf_search."""
        # Create mock result
        mock_result = MagicMock()
        mock_result.properties = {
            "sceneName": "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001",
            "bytes": 1000000,
        }
        mock_result.geometry = "POLYGON((-108 -76, -100 -76, -100 -74.5, -108 -74.5, -108 -76))"
        mock_result.get_urls.return_value = ["https://example.com/granule.h5"]
        
        mock_search.return_value = [mock_result]
        mock_platform.SENTINEL1 = "Sentinel-1"
        mock_product_type.GRD_HD = "GRD_HD"
        mock_product_type.GRD_MD = "GRD_MD"
        
        bbox = [-108, -76, -100, -74.5]
        granules = search_gcov(
            bbox=bbox,
            start="2026-07-01",
            end="2026-07-31",
            maturity="PROVISIONAL",
            max_results=10,
        )
        
        assert len(granules) == 1
        assert granules[0].granule_name == "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"

    def test_search_gcov_no_network(self):
        """Test search_gcov when asf_search is not available."""
        import builtins
        original_import = builtins.__import__
        
        def mock_import(name, *args, **kwargs):
            if name == "asf_search" or name.startswith("asf_search."):
                raise ImportError("No module named 'asf_search'")
            return original_import(name, *args, **kwargs)
        
        with (
            patch.object(builtins, "__import__", mock_import),
            pytest.raises(RuntimeError, match="asf_search package is required"),
        ):
            search_gcov(
                bbox=[-108, -76, -100, -74.5],
                start="2026-07-01",
                end="2026-07-31",
            )


class TestKnownGaps:
    """Tests for known gaps configuration."""

    def test_known_gaps_exist(self):
        """Test that known gaps are defined."""
        assert len(KNOWN_GAPS) > 0
        gap = KNOWN_GAPS[0]
        assert "start" in gap
        assert "end" in gap
        assert "reason" in gap
        assert gap["reason"] == "NISAR instrument data gap"
