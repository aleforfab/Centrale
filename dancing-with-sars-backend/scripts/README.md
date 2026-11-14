# Live Smoke Test for NISAR Assumptions

`live_smoke_nisar.py` checks NISAR GCOV layout and remote-read assumptions against ASF.

It:
1. Authenticate with ASF using Earthdata credentials
2. Search for NISAR GCOV granules in a user-supplied bbox
3. Stream a window from the first granule
4. Inspect the file structure and record evidence for assumptions A1-A7
5. Write results to `docs/nisar_file_layout.md`

## Requirements

- `asf-search` package: `pip install asf-search`
- Earthdata credentials in the backend `.env` or process environment:
  - Earthdata token: Set `EARTHDATA_TOKEN` environment variable
  - Username/password: Set `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD` environment variables
- Network access to ASF DAAC
- `h5py` for HDF5 file inspection
- `fsspec` and `aiohttp` for streaming with authentication
- `pyproj` and `shapely` for locating a representative sample window

## Assumptions to Verify

### A1: Grid coordinate datasets
- Location: `.../grids/frequencyA/xCoordinates` and `yCoordinates`
- Type: 1-D arrays of projected meters
- CRS: Available in `projection` dataset attributes

### A2: Invalid pixel conventions
- Are invalid pixels NaN, 0, or a fill value?
- What does the `mask` layer contain?

### A3: ASF result properties
- Property names for track, frame, cycle, CRID
- Recommendation: Always parse from granule name, never from properties

### A4: Grid alignment across cycles
- Do same track+frame products have identical grids?
- If not, resampling will be required

### A5: Polarization list
- Is there a `listOfPolarizations` dataset?
- If not, infer from POLE code and dataset presence

### A6: Streaming performance
- Is windowed reading over HTTPS fast enough?
- Fallback: Download granules and read locally

### A7: ASF Vertex deep links
- Format: `https://search.asf.alaska.edu/#/?granule=<name>`
- Fallback: `https://search.earthdata.nasa.gov/search?q=<granule_name>`

## Running the Test

```bash
python -m scripts.live_smoke_nisar --bbox -108,-76,-100,-74.5 --start 2026-06-17 --end 2026-10-25
```

## Output

The script will write `docs/nisar_file_layout.md` with verification results.

## Status and next steps

The live test has run successfully and produced `docs/nisar_file_layout.md`.
It confirmed the coordinate arrays and EPSG code, observed a valid data sample,
and showed that remote window reads are slow (about 74 seconds for 64×64 pixels
in this run). Same-stack grid alignment still needs a second matching granule.

Run the test again with a date range and bbox that return multiple acquisitions
from the same track/frame/direction to check grid alignment. Treat mask values
as raw flags until their bit semantics are confirmed.
