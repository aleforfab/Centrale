"""Generate fake NISAR GCOV HDF5 files for testing.

This module creates synthetic HDF5 files that mimic the structure of
real NISAR GCOV products, based on the assumptions in CODEX_PLAN.md.

Assumptions (to be verified by T1.4):
- A1: Grid coordinate datasets exist at .../grids/frequencyA/xCoordinates and yCoordinates
- A2: Invalid pixels are NaN
- A5: Polarizations can be inferred from POLE code
"""

from pathlib import Path

import h5py
import numpy as np


def create_fake_gcov(
    path: Path,
    size: int = 400,
    pixel_spacing_m: float = 20.0,
    crs_epsg: str = "EPSG:32646",
    pol_codes: list[str] | None = None,
    seed: int = 42,
    change_region: tuple[int, int, int, int] | None = None,
    change_amount_db: float = -6.0,
) -> Path:
    """
    Create a fake NISAR GCOV HDF5 file.
    
    Args:
        path: Output file path
        size: Size of the array (size x size)
        pixel_spacing_m: Pixel spacing in meters
        crs_epsg: EPSG code for the CRS
        pol_codes: List of polarization codes to create (e.g., ["HHHH", "HVHV"])
        seed: Random seed for reproducibility
        change_region: Optional (x_start, y_start, width, height) for a region with changed values
        change_amount_db: Amount of change in dB for the change region
    
    Returns:
        Path to the created file
    """
    if pol_codes is None:
        pol_codes = ["HHHH", "HVHV"]
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # Generate base data with random noise
    rng = np.random.default_rng(seed)
    
    # Create coordinate arrays (meters from origin)
    # Assuming origin at (0, 0) for simplicity
    x_coords = np.linspace(0, size * pixel_spacing_m, size, dtype=np.float64)
    y_coords = np.linspace(0, size * pixel_spacing_m, size, dtype=np.float64)
    
    # Create projection information
    # In real files, this would be a structured dataset with CRS info
    # For now, we'll store the EPSG code as an attribute
    
    with h5py.File(path, "w") as f:
        # Create the science/LSAR/GCOV/grids/frequencyA group structure
        gcov_group = f.create_group("science/LSAR/GCOV/grids/frequencyA")
        
        # Store coordinate arrays (A1 assumption)
        gcov_group.create_dataset("xCoordinates", data=x_coords, dtype=np.float64)
        gcov_group.create_dataset("yCoordinates", data=y_coords, dtype=np.float64)
        
        # Store projection info as attributes on a dataset
        # In real files, this might be a separate dataset or group attributes
        projection_ds = gcov_group.create_dataset("projection", data=np.array([], dtype=np.uint8))
        projection_ds.attrs["EPSG"] = int(crs_epsg.split(":")[1])  # Store just the code number
        projection_ds.attrs["crs_wkt"] = f"EPSG:{crs_epsg}"
        
        # Store pixel spacing
        gcov_group.create_dataset("pixelSpacing", data=np.array([pixel_spacing_m, pixel_spacing_m], dtype=np.float32))
        
        # Create polarization datasets
        for pol_code in pol_codes:
            # Generate random power values (linear, gamma-0)
            # Real GCOV values are typically in the range of small positive numbers
            # Convert from dB to linear: 10^(dB/10)
            base_db = rng.uniform(-25, -5, size=(size, size))
            power = 10 ** (base_db / 10)
            
            # Add a change region if specified
            if change_region is not None:
                x_start, y_start, width, height = change_region
                x_end = x_start + width
                y_end = y_start + height
                
                # Ensure region is within bounds
                x_start = max(0, min(x_start, size))
                y_start = max(0, min(y_start, size))
                x_end = max(0, min(x_end, size))
                y_end = max(0, min(y_end, size))
                
                # Apply change (in linear power)
                change_factor = 10 ** (change_amount_db / 10)
                power[y_start:y_end, x_start:x_end] *= change_factor
            
            # Add some invalid pixels (NaN)
            # Set 5% of pixels to NaN
            nan_mask = rng.random((size, size)) < 0.05
            power[nan_mask] = np.nan
            
            # Store as float32
            gcov_group.create_dataset(
                pol_code,
                data=power.astype(np.float32),
                dtype=np.float32,
                # Real files would have chunking, but we'll skip for simplicity
            )
        
        # Create mask dataset (A2 assumption)
        # For now, create a simple mask where 0 = valid, 1 = invalid
        # This matches common conventions, but T1.4 will verify
        mask = np.zeros((size, size), dtype=np.uint8)
        mask[nan_mask] = 1
        gcov_group.create_dataset("mask", data=mask, dtype=np.uint8)
        
        # Create numberOfLooks dataset
        gcov_group.create_dataset(
            "numberOfLooks",
            data=np.ones((size, size), dtype=np.float32),
            dtype=np.float32,
        )
        
        # Create rtcGammaToSigmaFactor if it exists
        gcov_group.create_dataset(
            "rtcGammaToSigmaFactor",
            data=np.ones((), dtype=np.float32),
            dtype=np.float32,
        )
        
        # Store metadata as attributes on the root
        f.attrs["granule_name"] = path.name
        f.attrs["pixel_spacing_m"] = pixel_spacing_m
        f.attrs["crs"] = crs_epsg
        f.attrs["seed"] = seed
    
    return path


def create_fake_gcov_pair(
    dir_path: Path,
    prefix: str = "NISAR_L2_PR_GCOV",
    size: int = 400,
    pixel_spacing_m: float = 20.0,
    crs_epsg: str = "EPSG:32646",
    pol_codes: list[str] | None = None,
    date1: str = "20260701T160541",
    date2: str = "20260713T160541",
    crid: str = "P05023",
    track: int = 122,
    frame: int = 67,
    direction: str = "D",
    mode: str = "4005",
    pol_code: str = "DHDH",
    source: str = "A",
    accuracy: str = "P",
    coverage: str = "F",
    loc: str = "J",
    change_amount_db: float = -6.0,
    cycle: int = 4,
) -> tuple[Path, Path]:
    """
    Create a pair of fake GCOV files for before/after comparison testing.
    
    The second file will have a region with decreased backscatter.
    
    Args:
        dir_path: Directory to create files in
        prefix: Prefix for the granule names
        size: Size of the arrays
        pixel_spacing_m: Pixel spacing in meters
        crs_epsg: EPSG code for the CRS
        pol_codes: List of polarization codes
        date1: Start date for first granule
        date2: Start date for second granule
        crid: CRID to use
        track: Track number
        frame: Frame number
        direction: Direction (A or D)
        mode: Mode code
        pol_code: Polarization code
        source: Source (A or M)
        accuracy: Accuracy (P, M, N, F)
        coverage: Coverage (F or P)
        loc: Location code
        change_amount_db: Amount of change in dB for the change region
    
    Returns:
        Tuple of (path1, path2)
    """
    if pol_codes is None:
        pol_codes = ["HHHH", "HVHV"]
    dir_path.mkdir(parents=True, exist_ok=True)
    
    # Create first granule (before)
    name1 = (
        f"{prefix}_{cycle:03d}_{track:03d}_{direction}_{frame:03d}_{mode}_{pol_code}_{source}_{date1}_{date1}_"
        f"{crid}_{accuracy}_{coverage}_{loc}_001"
    )
    path1 = dir_path / f"{name1}.h5"
    create_fake_gcov(
        path=path1,
        size=size,
        pixel_spacing_m=pixel_spacing_m,
        crs_epsg=crs_epsg,
        pol_codes=pol_codes,
        seed=42,
    )
    
    # Create second granule (after) with change region
    name2 = (
        f"{prefix}_{cycle:03d}_{track:03d}_{direction}_{frame:03d}_{mode}_{pol_code}_{source}_{date2}_{date2}_"
        f"{crid}_{accuracy}_{coverage}_{loc}_002"
    )
    path2 = dir_path / f"{name2}.h5"
    
    # Add change region in the center
    change_region = (size // 4, size // 4, size // 2, size // 2)
    create_fake_gcov(
        path=path2,
        size=size,
        pixel_spacing_m=pixel_spacing_m,
        crs_epsg=crs_epsg,
        pol_codes=pol_codes,
        seed=43,  # Different seed for different random values
        change_region=change_region,
        change_amount_db=change_amount_db,
    )
    
    return path1, path2


def get_fixture_path() -> Path:
    """Get the path to the fixtures directory."""
    return Path(__file__).parent


def main():
    """Generate test fixtures if run as a script."""
    fixture_dir = get_fixture_path() / "gcov_files"
    
    print(f"Creating test fixtures in {fixture_dir}")
    
    # Create a pair of files for testing
    path1, path2 = create_fake_gcov_pair(
        dir_path=fixture_dir,
        size=400,
        pixel_spacing_m=20.0,
        crs_epsg="EPSG:32646",
        pol_codes=["HHHH", "HVHV"],
        change_amount_db=-6.0,
    )
    
    print(f"Created {path1}")
    print(f"Created {path2}")
    
    # Verify files can be read
    with h5py.File(path1, "r") as f:
        print(f"\n{path1.name} structure:")
        def print_struct(name, obj):
            print(f"  {name}: {obj.shape if hasattr(obj, 'shape') else type(obj)}")
        f["science/LSAR/GCOV/grids/frequencyA"].visititems(print_struct)
    
    with h5py.File(path2, "r") as f:
        print(f"\n{path2.name} structure:")
        f["science/LSAR/GCOV/grids/frequencyA"].visititems(print_struct)


if __name__ == "__main__":
    main()
