import json

from fastapi.testclient import TestClient

import main
from nisar.config import Config
from routers import nisar as nisar_router


def _write_site(products_dir):
    site = products_dir / "test-site"
    site.mkdir(parents=True)
    (site / "manifest.json").write_text(
        json.dumps(
            {
                "site": {
                    "id": "test-site",
                    "title": "Test site",
                    "event_type": "flood",
                    "description": "Fixture",
                    "caveat": "Synthetic",
                    "bbox": [-1, -1, 1, 1],
                    "center": [0, 0],
                },
                "source": {
                    "mission": "NISAR",
                    "maturity": "PROVISIONAL",
                    "crid": "P05023",
                    "pixel_spacing_m": 10,
                    "crs": "EPSG:3031",
                },
                "stack": {"track": 1, "frame": 1, "direction": "D"},
                "acquisitions": [
                    {"granule": "first.h5", "cycle": 1, "date": "2026-07-01",
                     "start": "2026-07-01T00:00:00Z", "end": "2026-07-01T00:01:00Z",
                     "crid": "P05023", "coverage": "F", "polarizations": ["HH"]},
                    {"granule": "second.h5", "cycle": 2, "date": "2026-07-13",
                     "start": "2026-07-13T00:00:00Z", "end": "2026-07-13T00:01:00Z",
                     "crid": "P05023", "coverage": "F", "polarizations": ["HH"]},
                ],
                "polarizations": [{"pol": "HH", "stretch_db": [-25, -5]}],
                "generated_at": "2026-07-14T00:00:00Z",
                "pipeline_version": "0.1.0",
            }
        ),
        encoding="utf-8",
    )
    (site / "timeseries.json").write_text(
        json.dumps(
            {
                "HH": [
                    {
                        "date": "2026-07-01",
                        "cycle": 1,
                        "backscatter_db": -15.5,
                        "n_valid": 50,
                        "maturity": "PROVISIONAL",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )


def test_site_endpoints_and_dynamic_status(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path)
    monkeypatch.setattr(Config, "ENABLE_SENTINEL1_FALLBACK", False)
    _write_site(tmp_path)

    with TestClient(main.app) as client:
        summaries = client.get("/api/sites")
        assert summaries.status_code == 200
        assert summaries.json()[0]["id"] == "test-site"
        assert summaries.json()[0]["date_range"] == ["2026-07-01", "2026-07-13"]

        manifest = client.get("/api/sites/test-site")
        assert manifest.status_code == 200
        assert manifest.json()["source"]["mission"] == "NISAR"

        timeseries = client.get("/api/sites/test-site/timeseries", params={"pol": "hh"})
        assert timeseries.status_code == 200
        assert timeseries.json()[0]["backscatter_db"] == -15.5

        missing = client.get("/api/sites/not-here")
        assert missing.status_code == 404
        assert missing.json()["detail"]["valid_site_ids"] == ["test-site"]

        status = client.get("/api/data-status").json()
        assert status["nisar_ready"] is True
        assert status["active_source"] == "NISAR"


def test_legacy_fallback_is_disabled_by_default(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path)
    monkeypatch.setattr(Config, "ENABLE_SENTINEL1_FALLBACK", False)
    monkeypatch.setattr(main, "gee_ready", True)

    payload = {
        "bbox": [-1, -1, 1, 1],
        "pre_start": "2020-01-01",
        "pre_end": "2020-01-10",
        "post_start": "2020-02-01",
        "post_end": "2020-02-10",
    }
    with TestClient(main.app) as client:
        response = client.post("/api/gee/change-detection", json=payload)
        assert response.status_code == 404


def test_product_tiles_are_served_with_cors_headers(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path)
    tile = tmp_path / "test-site" / "tiles" / "layer" / "0" / "0" / "0.png"
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"\x89PNG\r\n\x1a\nfixture")
    product_mount = next(route for route in main.app.routes if getattr(route, "path", None) == "/products")
    monkeypatch.setattr(product_mount.app, "directory", str(tmp_path))
    monkeypatch.setattr(product_mount.app, "all_directories", [str(tmp_path)])
    monkeypatch.setattr(product_mount.app, "config_checked", False)

    with TestClient(main.app) as client:
        response = client.get(
            "/products/test-site/tiles/layer/0/0/0.png",
            headers={"Origin": "http://localhost:3000"},
        )
        assert response.status_code == 200
        assert response.content.startswith(b"\x89PNG")
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_nisar_search_endpoint_returns_normalized_catalog_results(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path)
    monkeypatch.setattr(
        nisar_router,
        "search_nisar_granules",
        lambda bbox, start, end, maturity, max_results: [
            {"granule": "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160541_P05023_P_F_J_001.h5"}
        ],
    )
    with TestClient(main.app) as client:
        response = client.get(
            "/api/nisar/search",
            params={
                "bbox": "-108,-76,-100,-74.5",
                "start": "2026-06-01",
                "end": "2026-07-31",
            },
        )
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["maturity"] == "PROVISIONAL"


def test_nisar_search_service_failure_is_503(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path)

    def fail_search(*args, **kwargs):
        raise RuntimeError("ASF NISAR search is temporarily unavailable")

    monkeypatch.setattr(nisar_router, "search_nisar_granules", fail_search)
    with TestClient(main.app) as client:
        response = client.get(
            "/api/nisar/search",
            params={
                "bbox": "-108,-76,-100,-74.5",
                "start": "2026-06-01",
                "end": "2026-07-31",
            },
        )
    assert response.status_code == 503
