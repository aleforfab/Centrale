import json

import numpy as np
import pyproj
import pytest
import rasterio
import yaml
from rasterio.transform import from_origin

from nisar import site_builder
from nisar.config import Config
from nisar.export import estimate_tile_budget, render_tiles, write_cog
from nisar.naming import parse_granule_name
from nisar.site_builder import SiteBuildError, build_site, verify_site
from tests.fixtures.make_fake_gcov import create_fake_gcov_pair


def _fixture_bbox():
    to_wgs84 = pyproj.Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)
    west, south = to_wgs84.transform(600, 600)
    east, north = to_wgs84.transform(1400, 1400)
    return [west, south, east, north]


def test_write_cog_and_render_xyz_tile(tmp_path):
    array = np.arange(100, dtype=np.float32).reshape(10, 10)
    array[0, 0] = np.nan
    cog = write_cog(
        array,
        tmp_path / "products" / "test.tif",
        from_origin(-1000, 1000, 200, 200),
        "EPSG:3857",
    )

    with rasterio.open(cog) as dataset:
        assert dataset.count == 1
        assert dataset.dtypes == ("float32",)
        assert dataset.tags(ns="IMAGE_STRUCTURE").get("LAYOUT") == "COG"
        assert np.isnan(dataset.read(1)[0, 0])

    result = render_tiles(
        cog,
        tmp_path / "tiles",
        kind="backscatter",
        min_zoom=0,
        max_zoom=0,
        budget_mb=1,
        minimum=0,
        maximum=100,
    )
    assert result["tile_count"] == 1
    assert (tmp_path / "tiles" / "0" / "0" / "0.png").read_bytes().startswith(
        b"\x89PNG\r\n\x1a\n"
    )


def test_render_tiles_rejects_excessive_budget(tmp_path):
    cog = write_cog(
        np.ones((4, 4), dtype=np.float32),
        tmp_path / "tiny.tif",
        from_origin(-1000, 1000, 500, 500),
        "EPSG:3857",
    )
    with pytest.raises(ValueError, match="exceeds configured budget"):
        render_tiles(
            cog,
            tmp_path / "tiles",
            kind="backscatter",
            min_zoom=0,
            max_zoom=0,
            budget_mb=0,
        )
    assert estimate_tile_budget((-1000, -1000, 1000, 1000), 0, 0) > 0


def test_build_and_verify_fixture_site(tmp_path, monkeypatch):
    granule_dir = tmp_path / "granules"
    create_fake_gcov_pair(
        granule_dir,
        size=100,
        pixel_spacing_m=20,
        crs_epsg="EPSG:32646",
        pol_codes=["HHHH"],
        change_amount_db=-6,
    )

    config_file = tmp_path / "site.yaml"
    config_file.write_text(
        yaml.safe_dump(
            {
                "id": "fixture-site",
                "title": "Fixture site",
                "event_type": "flood",
                "description": "Synthetic test site",
                "caveat": "Synthetic data only",
                "bbox": _fixture_bbox(),
                "stack": {
                    "track": 122,
                    "frame": 67,
                    "direction": "D",
                    "maturity": "PROVISIONAL",
                },
                "polarizations": ["HH"],
                "smoothing_px": 3,
                "thresholds_db": [2],
                "default_threshold_db": 2,
                "pairs": [
                    {
                        "id": "test-pair",
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
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")

    output = build_site(config_file, local_dir=granule_dir)
    assert output == tmp_path / "products" / "fixture-site"
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["pairs"]) == 1
    assert len(manifest["layers"]) == 4
    assert list(manifest["pairs"][0]["stats"]["HH"]) == ["2"]
    assert verify_site("fixture-site") == [
        "Verified site fixture-site",
        "2 acquisitions, 4 layers",
        "Mission NISAR, maturity PROVISIONAL",
    ]


def test_max_acquisitions_cannot_omit_curated_pair_dates(tmp_path):
    granule_dir = tmp_path / "granules"
    create_fake_gcov_pair(granule_dir, size=40, pol_codes=["HHHH"])
    config_file = tmp_path / "site.yaml"
    config_file.write_text(
        yaml.safe_dump(
            {
                "id": "fixture-site",
                "title": "Fixture",
                "event_type": "flood",
                "description": "test",
                "caveat": "test",
                "bbox": _fixture_bbox(),
                "stack": {
                    "track": 122,
                    "frame": 67,
                    "direction": "D",
                    "maturity": "PROVISIONAL",
                },
                "polarizations": ["HH"],
                "pairs": [
                    {
                        "id": "test-pair",
                        "pre": "20260701",
                        "post": "20260713",
                        "label": "pair",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(SiteBuildError, match="smaller than the 2 acquisitions"):
        build_site(config_file, local_dir=granule_dir, max_acquisitions=1, dry_run=True)


def test_remote_dry_run_never_downloads_granules(tmp_path, monkeypatch):
    config_file = tmp_path / "site.yaml"
    config_file.write_text(
        yaml.safe_dump(
            {
                "id": "fixture-site",
                "title": "Fixture",
                "event_type": "flood",
                "description": "test",
                "caveat": "test",
                "bbox": _fixture_bbox(),
                "stack": {
                    "track": 122,
                    "frame": 67,
                    "direction": "D",
                    "maturity": "PROVISIONAL",
                },
                "polarizations": ["HH"],
                "pairs": [
                    {
                        "id": "test-pair",
                        "pre": "20260701",
                        "post": "20260713",
                        "label": "pair",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    names = [
        "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5",
        "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260713T160541_20260713T160541_P05023_P_F_J_002.h5",
    ]

    class Product:
        def __init__(self, name):
            self.properties = {"sceneName": name, "fileName": name}

        def download(self, *_args, **_kwargs):
            raise AssertionError("dry-run attempted to download an ASF product")

    products = [
        (Product(name), parse_granule_name(name), object())
        for name in names
    ]
    monkeypatch.setattr(site_builder, "_remote_granules", lambda *_args: products)

    result = build_site(config_file, dry_run=True)

    assert result["granules"] == names


def test_colourize_keeps_nan_transparent_without_invalid_cast():
    """NaN pixels become fully transparent with a defined RGB value.

    Regression test: NaN used to reach the uint8 cast, which is undefined
    behaviour and emitted 'invalid value encountered in cast' at build time.
    """
    import warnings

    import numpy as np

    from nisar.export import _colourize

    values = np.array([[1.0, np.nan], [-2.0, 0.0]], dtype=np.float32)
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        rgba = _colourize(values, "difference", minimum=-3, maximum=3)

    assert rgba.dtype == np.uint8
    assert rgba[..., 3][0, 1] == 0, "NaN pixel must be transparent"
    assert tuple(rgba[..., :3][0, 1]) == (0, 0, 0), "NaN pixel must not keep a stale colour"
    assert rgba[..., 3][0, 0] == 255
