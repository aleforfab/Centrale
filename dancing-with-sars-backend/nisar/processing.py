"""SAR processing functions for NISAR GCOV data.

This module provides pure numpy functions for processing SAR backscatter data,
including dB conversion, smoothing, differencing, and classification.

Key principles:
- Smoothing and averaging are done in LINEAR power, never in dB
- Window cap: max 4000x4000 pixels
- Valid-pixel rule: np.isfinite(power) & (power > 0)
"""

import logging
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# Constants
DEFAULT_SMOOTHING_PX: int = 3
DEFAULT_THRESHOLDS_DB: list[float] = [2.0, 3.0, 6.0]


@dataclass
class PairStats:
    """Statistics for a pair of acquisitions."""
    
    valid_pixels: int
    valid_fraction_of_bbox: float
    decrease_km2: float
    increase_km2: float
    decrease_pct: float
    increase_pct: float
    sigma_db: float
    median_diff_db: float
    histogram: np.ndarray  # 60 bins over -15 to +15 dB
    resampled: bool = False


@dataclass
class TimeSeriesPoint:
    """A point in a time series."""
    
    date: str
    cycle: int
    backscatter_db: float
    n_valid: int
    maturity: str


class IncompatiblePairError(ValueError):
    """Raised when a pair of acquisitions are incompatible."""


def to_db(power: np.ndarray) -> np.ndarray:
    """
    Convert linear power to dB.
    
    Args:
        power: Array of linear power values
    
    Returns:
        Array of dB values. Invalid pixels (power <= 0 or not finite) become NaN.
    """
    # Handle invalid values
    valid = np.isfinite(power) & (power > 0)
    db = np.zeros_like(power, dtype=np.float32)
    db[valid] = 10 * np.log10(power[valid])
    db[~valid] = np.nan
    return db


def smooth_linear(
    power: np.ndarray,
    kernel_size: int = DEFAULT_SMOOTHING_PX,
) -> np.ndarray:
    """
    Apply NaN-aware boxcar smoothing to linear power.
    
    Uses normalized convolution: smooth = (sum(power * valid)) / (sum(valid))
    where valid pixels are finite and > 0.
    
    Args:
        power: Array of linear power values
        kernel_size: Size of the boxcar kernel in pixels (odd integer)
    
    Returns:
        Smoothed power array (same dtype as input)
    """
    if kernel_size == 1:
        return power.copy()
    
    if kernel_size % 2 == 0:
        raise ValueError(f"kernel_size must be odd, got {kernel_size}")
    
    # Ensure power is float
    power = power.astype(np.float32)
    
    # Create valid mask
    valid = np.isfinite(power) & (power > 0)
    
    # Use uniform_filter for normalized convolution
    # This is equivalent to: sum(power * valid) / sum(valid)
    if valid.all():
        # All pixels valid - simple boxcar average
        smoothed = ndimage.uniform_filter(power, size=kernel_size)
    else:
        # NaN-aware smoothing: normalized convolution.
        # Invalid pixels must be replaced by 0.0 *before* the boxcar sum.
        # Multiplying NaN by 0 still yields NaN, which would poison every
        # neighbourhood that touches an invalid pixel and silently erase most
        # of the valid data.
        power_float = np.where(valid, power, 0.0).astype(np.float64)
        valid_float = valid.astype(np.float64)

        # Mean of the valid values in each window (uniform_filter returns means).
        numerator = ndimage.uniform_filter(power_float, size=kernel_size)
        denominator = ndimage.uniform_filter(valid_float, size=kernel_size)

        # A window with no valid pixels has no defined mean; keep it NaN so the
        # gap propagates instead of becoming a plausible-looking zero.
        smoothed = np.full(power.shape, np.nan, dtype=np.float64)
        np.divide(numerator, denominator, out=smoothed, where=denominator > 0)
        smoothed = smoothed.astype(np.float32)
    
    return smoothed


def ensure_same_grid(
    pre_power: np.ndarray,
    pre_transform: np.ndarray,
    pre_spacing: float,
    post_power: np.ndarray,
    post_transform: np.ndarray,
    post_spacing: float,
    pre_crs: str = "EPSG:4326",
    post_crs: str = "EPSG:4326",
) -> tuple[np.ndarray, bool]:
    """
    Ensure both grids have the same shape and transform.
    
    If they match, return the post_power unchanged.
    If they don't match, resample post_power onto pre grid.
    
    Args:
        pre_power: Pre-event power array
        pre_transform: Pre-event affine transform
        pre_spacing: Pre-event pixel spacing
        post_power: Post-event power array
        post_transform: Post-event affine transform
        post_spacing: Post-event pixel spacing
    
    Returns:
        Tuple of (resampled_post_power, resampled_flag)
    """
    # Check if transforms and shapes match
    if (pre_power.shape == post_power.shape and 
        np.allclose(pre_transform, post_transform) and
        np.isclose(pre_spacing, post_spacing) and
        pre_crs == post_crs):
        return post_power, False
    
    # Need to resample
    logger.warning(
        f"Grids differ: pre shape={pre_power.shape}, post shape={post_power.shape}. "
        f"Resampling post onto pre grid."
    )
    
    try:
        from rasterio.warp import Resampling, reproject
    except ImportError:
        raise RuntimeError(
            "rasterio is required for grid resampling. "
            "Install it with: pip install rasterio"
        )
    
    # Create destination array
    dst_power = np.full_like(pre_power, np.nan, dtype=np.float32)
    
    # Create source and destination transforms
    # For simplicity, we'll use the affine transforms directly
    src_transform = post_transform
    dst_transform = pre_transform
    
    # Reproject
    reproject(
        source=post_power,
        destination=dst_power,
        src_transform=src_transform,
        src_crs=post_crs,
        src_nodata=np.nan,
        dst_transform=dst_transform,
        dst_crs=pre_crs,
        dst_nodata=np.nan,
        resampling=Resampling.average,
    )
    
    return dst_power, True


def diff_db(
    pre_db: np.ndarray,
    post_db: np.ndarray,
) -> np.ndarray:
    """
    Compute difference in dB (post - pre).
    
    Args:
        pre_db: Pre-event dB array
        post_db: Post-event dB array
    
    Returns:
        Difference array (post_db - pre_db). Pixels where either is NaN become NaN.
    """
    valid = np.isfinite(pre_db) & np.isfinite(post_db)
    diff = np.full_like(pre_db, np.nan, dtype=np.float32)
    diff[valid] = post_db[valid] - pre_db[valid]
    return diff


def classify(
    diff_db: np.ndarray,
    thresholds_db: list[float],
) -> dict[float, tuple[np.ndarray, np.ndarray]]:
    """
    Classify difference into decrease and increase masks for each threshold.
    
    Args:
        diff_db: Difference array in dB
        thresholds_db: List of thresholds in dB
    
    Returns:
        Dictionary mapping threshold to (decrease_mask, increase_mask) tuple.
        Both masks are boolean arrays where True indicates the pixel meets the threshold.
        Invalid pixels (NaN in diff_db) are excluded from both masks.
    """
    valid = np.isfinite(diff_db)
    
    result = {}
    for t in thresholds_db:
        decrease = np.zeros(diff_db.shape, dtype=bool)
        increase = np.zeros(diff_db.shape, dtype=bool)
        
        decrease[valid] = diff_db[valid] <= -t
        increase[valid] = diff_db[valid] >= +t
        
        result[t] = (decrease, increase)
    
    return result


def area_stats(
    diff_db: np.ndarray,
    spacing_m: float,
    thresholds_db: list[float],
    resampled: bool = False,
) -> dict[float, PairStats]:
    """
    Compute area statistics for a pair of acquisitions.
    
    Args:
        diff_db: Difference array in dB
        spacing_m: Pixel spacing in meters
        thresholds_db: List of thresholds in dB
        resampled: Whether the grids were resampled
    
    Returns:
        Dictionary mapping threshold to PairStats
    """
    valid = np.isfinite(diff_db)
    total_valid = np.sum(valid)
    total_pixels = diff_db.size
    valid_fraction = total_valid / total_pixels if total_pixels > 0 else 0.0
    
    # Pixel area in m²
    pixel_area_m2 = spacing_m ** 2
    pixel_area_km2 = pixel_area_m2 / 1e6
    
    result = {}
    for t in thresholds_db:
        decrease, increase = classify(diff_db, [t])[t]
        
        decrease_pixels = np.sum(decrease)
        increase_pixels = np.sum(increase)
        
        decrease_km2 = decrease_pixels * pixel_area_km2
        increase_km2 = increase_pixels * pixel_area_km2
        
        decrease_pct = (decrease_pixels / total_valid * 100) if total_valid > 0 else 0.0
        increase_pct = (increase_pixels / total_valid * 100) if total_valid > 0 else 0.0
        
        # Noise estimate: 1.4826 * MAD of diff_db over valid pixels
        diff_valid = diff_db[valid]
        if len(diff_valid) > 0:
            mad = np.median(np.abs(diff_valid - np.median(diff_valid)))
            sigma_db = 1.4826 * mad
            median_diff_db = float(np.median(diff_valid))
        else:
            sigma_db = 0.0
            median_diff_db = 0.0
        
        # Histogram: 60 bins over -15 to +15 dB
        hist, _ = np.histogram(
            diff_valid,
            bins=60,
            range=(-15, 15),
        )
        
        result[t] = PairStats(
            valid_pixels=int(total_valid),
            valid_fraction_of_bbox=float(valid_fraction),
            decrease_km2=float(decrease_km2),
            increase_km2=float(increase_km2),
            decrease_pct=float(decrease_pct),
            increase_pct=float(increase_pct),
            sigma_db=float(sigma_db),
            median_diff_db=float(median_diff_db),
            histogram=hist.astype(np.int64),
            resampled=resampled,
        )
    
    return result


def robust_sigma(diff_db: np.ndarray) -> float:
    """
    Compute robust standard deviation estimate using MAD.
    
    Args:
        diff_db: Difference array in dB
    
    Returns:
        Robust sigma estimate: 1.4826 * MAD
    """
    valid = np.isfinite(diff_db)
    if np.sum(valid) == 0:
        return 0.0
    
    diff_valid = diff_db[valid]
    median = np.median(diff_valid)
    mad = np.median(np.abs(diff_valid - median))
    return 1.4826 * mad


def histogram(
    diff_db: np.ndarray,
    bins: int = 60,
    range_min: float = -15.0,
    range_max: float = 15.0,
) -> np.ndarray:
    """
    Compute histogram of difference values.
    
    Args:
        diff_db: Difference array in dB
        bins: Number of bins
        range_min: Minimum value for histogram range
        range_max: Maximum value for histogram range
    
    Returns:
        Histogram counts as array of length bins
    """
    valid = np.isfinite(diff_db)
    diff_valid = diff_db[valid]
    
    hist, _ = np.histogram(
        diff_valid,
        bins=bins,
        range=(range_min, range_max),
    )
    return hist.astype(np.int64)


def process_pair(
    pre_window: object,  # Window from reader
    post_window: object,  # Window from reader
    smoothing_px: int = DEFAULT_SMOOTHING_PX,
    thresholds_db: list[float] = DEFAULT_THRESHOLDS_DB,
) -> tuple[np.ndarray, np.ndarray, dict[float, PairStats], bool]:
    """
    Process a pair of windows to compute difference and statistics.
    
    Args:
        pre_window: Window from pre-event
        post_window: Window from post-event
        smoothing_px: Smoothing kernel size in pixels
        thresholds_db: List of thresholds in dB
    
    Returns:
        Tuple of:
        - diff_db: Difference array in dB
        - diff_map: Visualization-ready difference array (for export)
        - stats: Dictionary mapping threshold to PairStats
        - resampled: Whether grids were resampled
    """
    # Check if grids match
    grids_match = (
        pre_window.power.shape == post_window.power.shape and
        np.allclose(pre_window.transform, post_window.transform) and
        pre_window.crs == post_window.crs
    )
    
    # Smooth and convert to dB
    pre_power = pre_window.power.copy()
    post_power = post_window.power.copy()
    
    # Apply smoothing in linear power
    if smoothing_px > 1:
        pre_power = smooth_linear(pre_power, smoothing_px)
        post_power = smooth_linear(post_power, smoothing_px)
    
    # Ensure same grid
    resampled = False
    if not grids_match:
        post_power, resampled = ensure_same_grid(
            pre_power=pre_power,
            pre_transform=pre_window.transform,
            pre_spacing=pre_window.spacing_m,
            post_power=post_power,
            post_transform=post_window.transform,
            post_spacing=post_window.spacing_m,
            pre_crs=pre_window.crs,
            post_crs=post_window.crs,
        )

    # Convert to dB only after resampling linear power.
    pre_db = to_db(pre_power)
    post_db = to_db(post_power)
    
    # Compute difference
    diff_db_array = diff_db(pre_db, post_db)
    
    # Compute stats
    stats = area_stats(
        diff_db_array,
        spacing_m=pre_window.spacing_m,
        thresholds_db=thresholds_db,
        resampled=resampled,
    )
    
    return diff_db_array, stats, resampled


def compute_time_series(
    windows: list[object],  # List of Window objects
    smoothing_px: int = DEFAULT_SMOOTHING_PX,
) -> list[TimeSeriesPoint]:
    """
    Compute time series of mean backscatter for a stack of windows.
    
    Args:
        windows: List of Window objects for each acquisition
        smoothing_px: Smoothing kernel size in pixels
    
    Returns:
        List of TimeSeriesPoint objects
    """
    from nisar.naming import parse_granule_name

    points = []
    
    for window in windows:
        granule = parse_granule_name(window.granule)
        # Apply smoothing
        power = window.power.copy()
        if smoothing_px > 1:
            power = smooth_linear(power, smoothing_px)
        
        # Convert to dB
        db = to_db(power)
        
        # Compute mean over valid pixels
        valid = np.isfinite(db)
        n_valid = np.sum(valid)
        
        if n_valid > 0:
            mean_db = float(np.mean(db[valid]))
        else:
            raise ValueError(
                f"No valid pixels in time-series acquisition "
                f"{granule.date}"
            )

        points.append(TimeSeriesPoint(
            date=granule.date,
            cycle=granule.cycle,
            backscatter_db=mean_db,
            n_valid=int(n_valid),
            maturity=granule.maturity,
        ))
    
    return points
