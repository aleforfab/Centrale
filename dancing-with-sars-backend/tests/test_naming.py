"""Tests for nisar.naming module."""

import pytest

from nisar.naming import (
    parse_granule_name,
    validate_granule_name,
)


class TestParseGranuleName:
    """Tests for parse_granule_name function."""

    def test_parse_provisional_style(self):
        """Test parsing a PROVISIONAL-style granule name."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result = parse_granule_name(name)
        
        assert result.instrument == "L"
        assert result.level == "2"
        assert result.ptype == "PR"
        assert result.product == "GCOV"
        assert result.cycle == 12
        assert result.track == 122
        assert result.direction == "D"
        assert result.frame == 67
        assert result.mode == "4005"
        assert result.pol_code == "DHDH"
        assert result.source == "A"
        assert result.start == "20260701T160541"
        assert result.end == "20260701T160622"
        assert result.crid == "P05023"
        assert result.accuracy == "P"
        assert result.coverage == "F"
        assert result.loc == "J"
        assert result.counter == 1

    def test_parse_beta_style(self):
        """Test parsing a BETA-era style granule name."""
        name = "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20251106T160541_20251106T160622_X05009_N_F_J_001"
        result = parse_granule_name(name)
        
        assert result.crid == "X05009"
        assert result.accuracy == "N"
        assert result.is_beta is True
        assert result.is_provisional is False

    def test_parse_with_h5_extension(self):
        """Test parsing with .h5 extension."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5"
        result = parse_granule_name(name)
        
        assert result.crid == "P05023"
        assert result.counter == 1

    def test_parse_urgent_response(self):
        """Test parsing UR (urgent response) ptype."""
        name = "NISAR_L2_UR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result = parse_granule_name(name)
        
        assert result.ptype == "UR"

    def test_stack_key(self):
        """Test stack_key property."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result = parse_granule_name(name)
        
        assert result.stack_key == (122, "D", 67)

    def test_date_property(self):
        """Test date property extraction."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result = parse_granule_name(name)
        
        assert result.date == "2026-07-01"

    def test_datetime_properties(self):
        """Test datetime property extraction."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result = parse_granule_name(name)
        
        assert result.datetime_start == "2026-07-01T16:05:41Z"
        assert result.datetime_end == "2026-07-01T16:06:22Z"

    def test_maturity_property(self):
        """Test maturity property."""
        # PROVISIONAL
        name_prov = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        result_prov = parse_granule_name(name_prov)
        assert result_prov.maturity == "PROVISIONAL"
        
        # BETA
        name_beta = "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20251106T160541_20251106T160622_X05009_N_F_J_001"
        result_beta = parse_granule_name(name_beta)
        assert result_beta.maturity == "BETA"

    def test_invalid_name_missing_counter(self):
        """Test that malformed names raise ValueError."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J"
        with pytest.raises(ValueError, match="Invalid NISAR granule name"):
            parse_granule_name(name)

    def test_invalid_name_lowercase(self):
        """Test that lowercase names raise ValueError."""
        name = "nisar_l2_pr_gcov_012_122_d_067_4005_dhdh_a_20260701t160541_20260701t160622_p05023_p_f_j_001"
        with pytest.raises(ValueError, match="Invalid NISAR granule name"):
            parse_granule_name(name)

    def test_invalid_name_5digit_frame(self):
        """Test that 5-digit frame raises ValueError."""
        name = "NISAR_L2_PR_GCOV_012_122_D_0067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        with pytest.raises(ValueError, match="Invalid NISAR granule name"):
            parse_granule_name(name)


class TestValidateGranuleName:
    """Tests for validate_granule_name function."""

    def test_valid_name(self):
        """Test that valid names return True."""
        name = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        assert validate_granule_name(name) is True

    def test_invalid_name(self):
        """Test that invalid names return False."""
        name = "invalid_name"
        assert validate_granule_name(name) is False


class TestStackKeyEquality:
    """Tests for stack key equality."""

    def test_same_stack_key(self):
        """Test that granules with same track/direction/frame have same stack_key."""
        name1 = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        name2 = "NISAR_L2_PR_GCOV_013_122_D_067_4005_DHDH_A_20260713T160541_20260713T160622_P05023_P_F_J_002"
        
        result1 = parse_granule_name(name1)
        result2 = parse_granule_name(name2)
        
        assert result1.stack_key == result2.stack_key

    def test_different_stack_key(self):
        """Test that granules with different track have different stack_key."""
        name1 = "NISAR_L2_PR_GCOV_012_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        name2 = "NISAR_L2_PR_GCOV_012_123_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001"
        
        result1 = parse_granule_name(name1)
        result2 = parse_granule_name(name2)
        
        assert result1.stack_key != result2.stack_key
