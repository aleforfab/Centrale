"""Windowed GCOV reads for NISAR data.

This module provides functionality to read windows from NISAR GCOV HDF5 files,
both from local files and remote URLs.
"""

import hashlib
import logging
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import pyproj
from affine import Affine

from nisar.config import Config
from nisar.naming import parse_granule_name

logger = logging.getLogger(__name__)

# Error classes
class WindowTooLargeError(ValueError):
    """Raised when a window exceeds the maximum allowed size."""


class InvalidFileError(ValueError):
    """Raised when a file is not a valid NISAR GCOV file."""


class CoordinateSystemError(ValueError):
    """Raised when there's an error with the coordinate system."""


@dataclass
class Window:
    """A window of data from a GCOV file."""
    
    power: np.ndarray  # Linear power (float32)
    valid: np.ndarray  # Boolean mask of valid pixels
    transform: Affine  # Affine transform from pixel to projected coords
    crs: str  # CRS as EPSG code or WKT
    spacing_m: float  # Pixel spacing in meters
    granule: str  # Granule name
    pol: str  # Polarization code (e.g., "HH", "HV")
    mask: np.ndarray | None = None  # Optional mask layer from file
    rtc_gamma_to_sigma: np.ndarray | float | None = None  # Gamma0-to-sigma0 factor
    
    def __post_init__(self):
        """Ensure power is float32 and validate rtc_gamma_to_sigma."""
        if self.power.dtype != np.float32:
            self.power = self.power.astype(np.float32)
        if self.rtc_gamma_to_sigma is not None:
            if isinstance(self.rtc_gamma_to_sigma, np.ndarray):
                if self.rtc_gamma_to_sigma.ndim == 0:
                    self.rtc_gamma_to_sigma = float(self.rtc_gamma_to_sigma.item())
                elif self.rtc_gamma_to_sigma.ndim == 2:
                    if self.rtc_gamma_to_sigma.shape != self.power.shape:
                        raise ValueError(
                            f"rtc_gamma_to_sigma shape {self.rtc_gamma_to_sigma.shape} "
                            f"does not match power shape {self.power.shape}"
                        )
                    if self.rtc_gamma_to_sigma.dtype != np.float32:
                        self.rtc_gamma_to_sigma = self.rtc_gamma_to_sigma.astype(np.float32)
                else:
                    raise ValueError(
                        f"rtc_gamma_to_sigma array must be 0D or 2D, got {self.rtc_gamma_to_sigma.ndim}D"
                    )
            elif isinstance(self.rtc_gamma_to_sigma, (int, float, np.floating, np.integer)):
                self.rtc_gamma_to_sigma = float(self.rtc_gamma_to_sigma)
            else:
                raise TypeError(
                    f"rtc_gamma_to_sigma must be np.ndarray, float, or None, "
                    f"got {type(self.rtc_gamma_to_sigma).__name__}"
                )


class GcovReader:
    """Reader for NISAR GCOV HDF5 files."""
    
    def __init__(
        self,
        cache_dir: Path | None = None,
        max_window_px: int = 4000,
    ):
        """
        Initialize the reader.
        
        Args:
            cache_dir: Directory for caching windows (default: from config)
            max_window_px: Maximum window size in pixels
        """
        self.cache_dir = cache_dir or Config.get_cache_dir() / "windows"
        self.max_window_px = max_window_px
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_cache_path(self, granule: str, bbox_hash: str, pol: str) -> Path:
        """Get the cache path for a window."""
        return self.cache_dir / granule / f"{bbox_hash}_{pol}.npz"
    
    def _compute_bbox_hash(self, bbox: list[float]) -> str:
        """Compute a hash for a bbox."""
        bbox_str = ",".join(f"{x:.6f}" for x in bbox)
        return hashlib.md5(bbox_str.encode()).hexdigest()[:16]
    
    def _read_projection_info(
        self,
        group,
    ) -> tuple[str, float, Affine]:
        """
        Read projection information from the file.
        
        Returns:
            Tuple of (crs, pixel_spacing, affine_transform)
        """
        # Coordinates and projection metadata follow the GCOV frequency grid.
        x_coords = group["xCoordinates"][:]
        y_coords = group["yCoordinates"][:]
        if x_coords.size < 2 or y_coords.size < 2:
            raise CoordinateSystemError("GCOV coordinate arrays must each contain at least two values")

        if "projection" in group:
            proj_ds = group["projection"]
            epsg_attr = proj_ds.attrs.get("EPSG", proj_ds.attrs.get("epsg_code"))
            wkt_attr = proj_ds.attrs.get("crs_wkt", proj_ds.attrs.get("spatial_ref"))
            if epsg_attr is not None:
                if isinstance(epsg_attr, bytes):
                    epsg_attr = epsg_attr.decode("ascii")
                if isinstance(epsg_attr, (int, np.integer)) or str(epsg_attr).isdigit():
                    crs = f"EPSG:{int(epsg_attr)}"
                elif isinstance(epsg_attr, str) and epsg_attr.upper().startswith("EPSG:"):
                    crs = epsg_attr
                else:
                    raise CoordinateSystemError(f"Invalid EPSG attribute value: {epsg_attr!r}")
            elif wkt_attr is not None:
                crs = wkt_attr.decode("utf-8") if isinstance(wkt_attr, bytes) else str(wkt_attr)
            else:
                raise CoordinateSystemError("No CRS information found in projection dataset")
        elif "EPSG" in group.attrs:
            epsg_attr = group.attrs["EPSG"]
            if isinstance(epsg_attr, bytes):
                epsg_attr = epsg_attr.decode("ascii")
            crs = f"EPSG:{int(epsg_attr)}"
        else:
            raise CoordinateSystemError("No CRS information found in projection metadata")
        
        x_step = float(np.median(np.diff(x_coords)))
        y_step = float(np.median(np.diff(y_coords)))
        if x_step == 0 or y_step == 0:
            raise CoordinateSystemError("GCOV coordinate arrays contain zero pixel spacing")
        if not (np.all(np.diff(x_coords) * x_step > 0) and np.all(np.diff(y_coords) * y_step > 0)):
            raise CoordinateSystemError("GCOV coordinate arrays must be strictly monotonic")

        if "pixelSpacing" in group:
            pixel_spacing_arr = group["pixelSpacing"][:]
            spacing_m = abs(float(pixel_spacing_arr[0]))
        elif "xCoordinateSpacing" in group:
            spacing_m = abs(float(np.asarray(group["xCoordinateSpacing"][()]).reshape(-1)[0]))
        else:
            spacing_m = abs(x_step)

        left = x_coords[0] if x_step > 0 else x_coords[-1]
        top = y_coords[-1] if y_step > 0 else y_coords[0]
        transform = Affine.translation(left, top) @ Affine.scale(abs(x_step), -abs(y_step))
        
        return crs, spacing_m, transform
    
    def _read_pol_window(
        self,
        group,
        pol_dataset_name: str,
        row_slice: slice,
        col_slice: slice,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Read a window from a polarization dataset.
        
        Returns:
            Tuple of (power_array, valid_mask)
        """
        # Read the polarization data (e.g., HHHH, HVHV)
        pol_data = group[pol_dataset_name]
        window_data = pol_data[row_slice, col_slice]
        
        # Convert to float32 if needed
        if window_data.dtype != np.float32:
            window_data = window_data.astype(np.float32)
        
        # Valid pixels: finite and > 0 (A2 assumption - will be verified by T1.4)
        valid = np.isfinite(window_data) & (window_data > 0)
        
        # Ensure valid is bool
        valid = valid.astype(bool)
        
        return window_data, valid
    
    def _read_mask_window(
        self,
        group,
        row_slice: slice,
        col_slice: slice,
    ) -> np.ndarray | None:
        """
        Read raw mask values for a window without assuming their bit semantics.
        
        Returns:
            Mask array or None if not available
        """
        if "mask" in group:
            mask_data = group["mask"]
            mask_window = mask_data[row_slice, col_slice]
            return mask_window
        return None

    def _read_gamma_to_sigma_window(
        self,
        group,
        row_slice: slice,
        col_slice: slice,
        *,
        expected_full_shape: tuple[int, ...],
        granule_name: str,
    ) -> np.ndarray | float | None:
        """Read ``rtcGammaToSigmaFactor`` as a scalar float, 2D float32 grid, or None."""
        if "rtcGammaToSigmaFactor" not in group:
            logger.warning(
                "Dataset rtcGammaToSigmaFactor missing in %s; gamma-to-sigma normalization skipped",
                granule_name,
            )
            return None

        ds = group["rtcGammaToSigmaFactor"]
        if ds.ndim == 0:
            return float(ds[()])
        if ds.ndim == 1 and ds.size == 1:
            return float(ds[0])
        if ds.ndim == 2:
            if ds.shape != expected_full_shape:
                raise InvalidFileError(
                    f"rtcGammaToSigmaFactor shape {ds.shape} does not match "
                    f"covariance grid shape {expected_full_shape}"
                )
            arr = ds[row_slice, col_slice]
            if arr.dtype != np.float32:
                arr = arr.astype(np.float32)
            return arr
        raise InvalidFileError(
            f"Unsupported rtcGammaToSigmaFactor shape {ds.shape} in {granule_name}"
        )

    def _load_window_cache(self, cache_path: Path) -> Window | None:
        """Load a cached Window from an .npz archive, or None on miss/legacy format."""
        try:
            with np.load(cache_path, allow_pickle=False) as data:
                if "cache_version" not in data or int(data["cache_version"]) != 2:
                    return None
                t = data["transform"]
                transform = Affine(
                    float(t[0]), float(t[1]), float(t[2]),
                    float(t[3]), float(t[4]), float(t[5]),
                )
                mask = data["mask"] if bool(data["has_mask"]) else None
                kind = str(data["rtc_gamma_to_sigma_kind"].item())
                if kind == "none":
                    rtc_gamma_to_sigma: np.ndarray | float | None = None
                elif kind == "scalar":
                    rtc_gamma_to_sigma = float(data["rtc_gamma_to_sigma"].item())
                elif kind == "grid":
                    rtc_gamma_to_sigma = data["rtc_gamma_to_sigma"].astype(np.float32, copy=False)
                else:
                    return None
                return Window(
                    power=data["power"],
                    valid=data["valid"],
                    transform=transform,
                    crs=str(data["crs"].item()),
                    spacing_m=float(data["spacing_m"].item()),
                    granule=str(data["granule"].item()),
                    pol=str(data["pol"].item()),
                    mask=mask,
                    rtc_gamma_to_sigma=rtc_gamma_to_sigma,
                )
        except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile):
            logger.debug("Ignoring unreadable or legacy cache entry at %s", cache_path)
            return None

    def _save_window_cache(self, cache_path: Path, window: Window) -> None:
        """Save a Window (including rtc_gamma_to_sigma) atomically to .npz."""
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload: dict[str, Any] = {
            "cache_version": np.array(2, dtype=np.int32),
            "power": window.power.astype(np.float32, copy=False),
            "valid": window.valid.astype(bool, copy=False),
            "transform": np.array(
                [
                    window.transform.a,
                    window.transform.b,
                    window.transform.c,
                    window.transform.d,
                    window.transform.e,
                    window.transform.f,
                ],
                dtype=np.float64,
            ),
            "crs": np.array(window.crs),
            "spacing_m": np.array(window.spacing_m, dtype=np.float64),
            "granule": np.array(window.granule),
            "pol": np.array(window.pol),
            "has_mask": np.array(window.mask is not None, dtype=bool),
        }
        if window.mask is not None:
            payload["mask"] = window.mask
        if window.rtc_gamma_to_sigma is None:
            payload["rtc_gamma_to_sigma_kind"] = np.array("none")
        elif isinstance(window.rtc_gamma_to_sigma, np.ndarray):
            payload["rtc_gamma_to_sigma_kind"] = np.array("grid")
            payload["rtc_gamma_to_sigma"] = window.rtc_gamma_to_sigma.astype(
                np.float32, copy=False
            )
        else:
            payload["rtc_gamma_to_sigma_kind"] = np.array("scalar")
            payload["rtc_gamma_to_sigma"] = np.array(
                float(window.rtc_gamma_to_sigma), dtype=np.float64
            )

        tmp_path = cache_path.with_suffix(".tmp.npz")
        try:
            with open(tmp_path, "wb") as f:
                np.savez_compressed(f, **payload)
            tmp_path.replace(cache_path)
        finally:
            tmp_path.unlink(missing_ok=True)
    
    def read_window(
        self,
        path: str | Path,
        bbox: list[float],
        pol: str = "HH",
        frequency: str = "A",
        use_cache: bool = True,
    ) -> Window:
        """
        Read a window from a GCOV file.
        
        Args:
            path: Path to the HDF5 file (local or URL)
            bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
            pol: Polarization (e.g., "HH", "HV")
            frequency: Frequency band ("A" or "B")
            use_cache: Whether to use cached windows
        
        Returns:
            Window dataclass with the data
        
        Raises:
            WindowTooLargeError: If the window exceeds max_window_px
            InvalidFileError: If the file is not a valid GCOV file
            FileNotFoundError: If the file doesn't exist
        """
        path = Path(path)
        
        # Compute bbox hash for caching
        bbox_hash = self._compute_bbox_hash(bbox)
        
        # Try to get from cache
        if use_cache:
            granule_name = path.name
            cache_path = self._get_cache_path(granule_name, bbox_hash, pol)
            if cache_path.exists():
                cached = self._load_window_cache(cache_path)
                if cached is not None:
                    logger.debug(f"Cache hit for {granule_name} bbox={bbox_hash} pol={pol}")
                    return cached
        
        # Parse granule name to extract info
        try:
            parsed = parse_granule_name(path.name)
        except ValueError:
            # Maybe it's a URL - try to extract name from path
            if "NISAR_" in str(path):
                # Try to parse from the path
                name = Path(path).name
                parsed = parse_granule_name(name)
            else:
                raise InvalidFileError(f"Cannot parse granule name from {path}")
        
        # Map pol to dataset name
        pol_map = {
            "HH": "HHHH",
            "HV": "HVHV",
            "VV": "VVVV",
            "VH": "VHVH",
        }
        pol_dataset_name = pol_map.get(pol.upper(), pol.upper())
        
        # Open the file
        try:
            if isinstance(path, str) and path.startswith(("http://", "https://")):
                # Remote URL - would use fsspec + auth (to be implemented)
                raise NotImplementedError("Remote URL reading not yet implemented")
            else:
                # Local file
                with h5py.File(path, "r") as f:
                    # Navigate to the GCOV group
                    gcov_path = f"science/LSAR/GCOV/grids/frequency{frequency}"
                    if gcov_path not in f:
                        raise InvalidFileError(
                            f"File {path} does not contain expected GCOV structure at {gcov_path}"
                        )
                    
                    group = f[gcov_path]
                    
                    # Read projection info
                    crs, spacing_m, _transform = self._read_projection_info(group)
                    
                    # Get coordinate arrays
                    x_coords = group["xCoordinates"][:]
                    y_coords = group["yCoordinates"][:]
                    x_step = float(np.median(np.diff(x_coords)))
                    y_step = float(np.median(np.diff(y_coords)))
                    
                    # Convert bbox from lon/lat to projected coordinates
                    # Get the CRS transformer
                    if crs.startswith("EPSG:"):
                        epsg_code = int(crs.split(":")[1])
                        # Create transformer from WGS84 (EPSG:4326) to target CRS
                        transformer = pyproj.Transformer.from_crs(
                            pyproj.CRS("EPSG:4326"),
                            pyproj.CRS(epsg_code),
                            always_xy=True,
                        )
                    else:
                        # Try to create transformer from WKT
                        try:
                            target_crs = pyproj.CRS(crs)
                            transformer = pyproj.Transformer.from_crs(
                                pyproj.CRS("EPSG:4326"),
                                target_crs,
                                always_xy=True,
                            )
                        except (pyproj.exceptions.CRSError, pyproj.exceptions.ProjError, ValueError) as e:
                            raise CoordinateSystemError(f"Cannot create transformer for CRS {crs}: {e}")
                    
                    # Transform bbox corners to projected coordinates
                    bbox_pts = [
                        (bbox[0], bbox[1]),  # SW
                        (bbox[2], bbox[1]),  # SE
                        (bbox[2], bbox[3]),  # NE
                        (bbox[0], bbox[3]),  # NW
                    ]
                    
                    proj_pts = [transformer.transform(lon, lat) for lon, lat in bbox_pts]
                    
                    # Get min/max in projected coordinates
                    proj_x = [p[0] for p in proj_pts]
                    proj_y = [p[1] for p in proj_pts]
                    min_x, max_x = min(proj_x), max(proj_x)
                    min_y, max_y = min(proj_y), max(proj_y)
                    
                    # Locate the bbox in either ascending or descending coordinate arrays.
                    if x_coords[0] < x_coords[-1]:
                        col_start = np.searchsorted(x_coords, min_x, side="left")
                        col_end = np.searchsorted(x_coords, max_x, side="right")
                    else:
                        col_start = np.searchsorted(-x_coords, -max_x, side="left")
                        col_end = np.searchsorted(-x_coords, -min_x, side="right")
                    if y_coords[0] < y_coords[-1]:
                        row_start = np.searchsorted(y_coords, min_y, side="left")
                        row_end = np.searchsorted(y_coords, max_y, side="right")
                    else:
                        row_start = np.searchsorted(-y_coords, -max_y, side="left")
                        row_end = np.searchsorted(-y_coords, -min_y, side="right")
                    
                    # Clamp to valid range
                    row_start = max(0, min(row_start, len(y_coords)))
                    row_end = max(0, min(row_end, len(y_coords)))
                    col_start = max(0, min(col_start, len(x_coords)))
                    col_end = max(0, min(col_end, len(x_coords)))
                    
                    # Check window size
                    window_rows = row_end - row_start
                    window_cols = col_end - col_start

                    if window_rows <= 0 or window_cols <= 0:
                        raise InvalidFileError(
                            f"Bounding box {bbox} does not overlap the GCOV grid"
                        )
                    
                    if window_rows > self.max_window_px or window_cols > self.max_window_px:
                        raise WindowTooLargeError(
                            f"Window size {window_rows}x{window_cols} exceeds maximum {self.max_window_px}x{self.max_window_px}. "
                            f"Actual size: {window_rows * spacing_m:.0f}m x {window_cols * spacing_m:.0f}m. "
                            f"Shrink the bbox or increase max_window_px."
                        )
                    
                    # Check if pol dataset exists
                    if pol_dataset_name not in group:
                        available = [k for k in group if not k.startswith("_")]
                        raise InvalidFileError(
                            f"Polarization {pol_dataset_name} not found in file. "
                            f"Available datasets: {available}"
                        )
                    
                    # Read the window
                    row_slice = slice(row_start, row_end)
                    col_slice = slice(col_start, col_end)
                    
                    power, valid = self._read_pol_window(
                        group, pol_dataset_name, row_slice, col_slice
                    )
                    
                    # Read mask and radiometric gamma-to-sigma factor
                    mask = self._read_mask_window(group, row_slice, col_slice)
                    rtc_gamma_to_sigma = self._read_gamma_to_sigma_window(
                        group,
                        row_slice,
                        col_slice,
                        expected_full_shape=group[pol_dataset_name].shape,
                        granule_name=path.name,
                    )
                    if x_coords[0] > x_coords[-1]:
                        power = power[:, ::-1]
                        valid = valid[:, ::-1]
                        if mask is not None:
                            mask = mask[:, ::-1]
                        if isinstance(rtc_gamma_to_sigma, np.ndarray):
                            rtc_gamma_to_sigma = rtc_gamma_to_sigma[:, ::-1]
                    if y_coords[0] < y_coords[-1]:
                        power = power[::-1, :]
                        valid = valid[::-1, :]
                        if mask is not None:
                            mask = mask[::-1, :]
                        if isinstance(rtc_gamma_to_sigma, np.ndarray):
                            rtc_gamma_to_sigma = rtc_gamma_to_sigma[::-1, :]

                    left = x_coords[col_end - 1] if x_coords[0] > x_coords[-1] else x_coords[col_start]
                    top = y_coords[row_end - 1] if y_coords[0] < y_coords[-1] else y_coords[row_start]
                    window_transform = (
                        Affine.translation(left, top)
                        @ Affine.scale(abs(x_step), -abs(y_step))
                    )
                    
                    # Create Window object
                    window = Window(
                        power=power,
                        valid=valid,
                        transform=window_transform,
                        crs=crs,
                        spacing_m=spacing_m,
                        granule=parsed.granule_name if hasattr(parsed, 'granule_name') else path.name,
                        pol=pol.upper(),
                        mask=mask,
                        rtc_gamma_to_sigma=rtc_gamma_to_sigma,
                    )
                    
                    # Cache the window
                    if use_cache:
                        cache_path = self._get_cache_path(path.name, bbox_hash, pol)
                        self._save_window_cache(cache_path, window)
                        logger.debug(f"Cached window to {cache_path}")
                    
                    return window
        
        except Exception:
            # Clean up partial cache if needed
            if use_cache:
                cache_path = self._get_cache_path(path.name, bbox_hash, pol)
                if cache_path.exists():
                    cache_path.unlink()
            raise
    
    def read_window_from_url(
        self,
        url: str,
        bbox: list[float],
        pol: str = "HH",
        frequency: str = "A",
        use_cache: bool = True,
    ) -> Window:
        """
        Read a window from a remote URL.
        
        This method uses fsspec with Earthdata credentials for authentication.
        
        Args:
            url: URL to the HDF5 file
            bbox: Bounding box [min_lon, min_lat, max_lon, max_lat]
            pol: Polarization
            frequency: Frequency band
            use_cache: Whether to use cached windows
        
        Returns:
            Window dataclass with the data
        
        Raises:
            NotImplementedError: If fsspec is not configured
        """
        # This would use fsspec + aiohttp for authenticated streaming
        # For now, we'll raise NotImplementedError
        raise NotImplementedError("Remote URL reading with fsspec not yet implemented")


def get_reader(
    cache_dir: Path | None = None,
    max_window_px: int = 4000,
) -> GcovReader:
    """
    Get a GcovReader instance with default or custom settings.
    
    Args:
        cache_dir: Optional cache directory
        max_window_px: Maximum window size in pixels
    
    Returns:
        GcovReader instance
    """
    return GcovReader(cache_dir=cache_dir, max_window_px=max_window_px)
