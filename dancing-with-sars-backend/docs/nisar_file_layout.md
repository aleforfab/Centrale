# NISAR GCOV live file-layout smoke test

Run date: 2026-10-25

## Query

- Granules returned with file URLs: 5
- Bbox: `[-108.0, -76.0, -100.0, -74.5]`
- Date range: `2026-06-17` to `2026-10-25`
- Requested maturity: `PROVISIONAL`
- Inspected granule: `NISAR_L2_PR_GCOV_033_120_A_141_4005_SHSH_A_20261020T132745_20261020T132822_P05023_N_F_J_001`
- Stack: track `120`, frame `141`, direction `A`
- Cycle / CRID / maturity: `33` / `P05023` / `PROVISIONAL`

## Assumptions

| Assumption | Result | Observation |
|---|---|---|
| A1: Coordinate arrays and CRS | PASS | x=[37440] [-1926715.0, -1552325.0], y=[37800] [-170645.0, -548635.0]; spacing x/y=10.0/-10.0; EPSG:3031; projection attributes: `{'description': 'Product map grid projection: EPSG code, with additional projection information as HDF5 Attributes', 'ellipsoid': 'WGS84', 'epsg_code': '3031', 'false_easting': '0.0', 'false_northing': '0.0', 'grid_mapping_name': 'polar_stereographic', 'inverse_flattening': '298.257223563', 'latitude_of_projection_origin': '-90.0', 'longitude_of_projection_origin': '0.0', 'semi_major_axis': '6378137.0', 'spatial_ref': 'PROJCS["WGS 84 / Antarctic Polar Stereographic",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-71],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",NORTH],AXIS["Northing",NORTH],AUTHORITY["EPSG","3031"]]', 'standard_parallel': '-71.0', 'straight_vertical_longitude_from_pole': '0.0'}` |
| A2: Invalid values and mask | OBSERVED | Sample near `(-102.43497213542807, -74.6703975499231)` (inside grid: True): 0 NaN, 0 zero, fill value `0.0`; mask dtype `uint8`, values `[1]` |
| A3: ASF properties | OBSERVED | Available property keys: `additionalUrls, beamModeType, browse, bytes, centerLat, centerLon, collectionName, conceptID, crid, fileID, fileName, flightDirection, frameCoverage, frameNumber, granuleType, groupID, jointObservation, mainBandPolarization, md5sum, orbit, orbitType, pathNumber, pgeVersion, platform, polarization, processingDate, processingLevel, productionConfiguration, rangeBandwidth, s3Urls, sceneName, sensor, sideBandPolarization, startTime, stopTime, url`. Granule identity parsed from the name. |
| A4: Same-stack grid alignment | NOT VERIFIED | No second same-stack, same-maturity granule was returned. |
| A5: Polarization discovery | OBSERVED | GCOV datasets: `['HHHH']`; listOfPolarizations: `HH` |
| A6: HTTPS windowed read | OBSERVED | Read 64x64 sample in 74.47 seconds using fsspec/HDF5 remote access. |
| A7: ASF Vertex link | DOCUMENTED | `https://search.asf.alaska.edu/#/?granule=NISAR_L2_PR_GCOV_033_120_A_141_4005_SHSH_A_20261020T132745_20261020T132822_P05023_N_F_J_001` |

## HDF5 layout

Inspected polarization datasets are under `/science/LSAR/GCOV/grids/frequencyA`. Dataset paths discovered:
- `/HHHH`
- `/inputDataExceptionMask`
- `/listOfCovarianceTerms`
- `/listOfPolarizations`
- `/mask`
- `/numberOfLooks`
- `/numberOfSubSwaths`
- `/projection`
- `/rtcGammaToSigmaFactor`
- `/xCoordinateSpacing`
- `/xCoordinates`
- `/yCoordinateSpacing`
- `/yCoordinates`

## Data sample

- Dataset: `HHHH`
- Sample shape: `[64, 64]`
- Sample pixel offset: `[18976, 29049]` (near bbox/footprint intersection)
- Finite samples: 4096
- Minimum positive sample: `0.0024088025093078613`
- Remote sample read time: 74.47 seconds

## Notes

This report records observations only; coordinate conventions, mask semantics,
and performance should be confirmed against additional granules before treating
the reader assumptions as validated.
