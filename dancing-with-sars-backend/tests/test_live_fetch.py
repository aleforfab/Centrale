"""Tests for runtime, cache-aside NISAR fetching."""

import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pyproj
import pytest
from fastapi.testclient import TestClient

import main
from nisar import cache, live_fetch
from nisar.config import Config
from nisar.models import Acquisition, Layer, Manifest, SiteInfo, SourceInfo
from nisar.naming import parse_granule_name
from nisar.site_builder import verify_site
from schemas import LiveFetchRequest
from services import asf_service
from tests.fixtures.make_fake_gcov import create_fake_gcov_pair


def _fixture_bbox():
    to_wgs84 = pyproj.Transformer.from_crs("EPSG:32646", "EPSG:4326", always_xy=True)
    west, south = to_wgs84.transform(600, 600)
    east, north = to_wgs84.transform(1400, 1400)
    return [west, south, east, north]


BBOX = _fixture_bbox()
START = date(2026, 7, 1)
END = date(2026, 7, 14)
MATURITY = "PROVISIONAL"
POLS = ["HH"]
MAX_GRANULES = 2


def _site_id():
    return live_fetch.site_id_for(BBOX, START, END, MATURITY, POLS, MAX_GRANULES)


def _write_manifest(products_dir, site_id):
    layer = Layer(
        id="backscatter-hh-2026-07-01",
        kind="backscatter",
        tile_url_template=f"/products/{site_id}/tiles/backscatter-hh-2026-07-01/{{z}}/{{x}}/{{y}}.png",
        min_zoom=0,
        max_zoom=2,
    )
    acquisition = Acquisition(
        granule="NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5",
        cycle=4,
        date="2026-07-01",
        start="2026-07-01T16:05:41Z",
        end="2026-07-01T16:06:22Z",
        crid="P05023",
        coverage="F",
        polarizations=["HH"],
    )
    manifest = Manifest(
        site=SiteInfo(
            id=site_id,
            title="Cached live site",
            event_type="other",
            description="test",
            caveat="test",
            bbox=BBOX,
            center=[0.0, 0.0],
        ),
        source=SourceInfo(
            maturity=MATURITY,
            crid="P05023",
            pixel_spacing_m=20.0,
            crs="EPSG:32646",
        ),
        stack={},
        acquisitions=[acquisition],
        polarizations=[],
        layers=[layer],
        pairs=[],
        generated_at="2026-11-14T00:00:00+00:00",
        pipeline_version="0.1.0",
    )
    root = products_dir / site_id
    (root / "cogs").mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(manifest.model_dump_json(), encoding="utf-8")
    for name in ("acquisitions.json", "timeseries.json", "stats.json"):
        (root / name).write_text("{}", encoding="utf-8")
    (root / "cogs" / f"{layer.id}.tif").write_bytes(b"placeholder")
    return root


# ---------------------------------------------------------------------------
# Disk cache
# ---------------------------------------------------------------------------

def test_read_or_fetch_caches_and_invalidates(tmp_path):
    calls = {"n": 0}

    def fetch():
        calls["n"] += 1
        return ["granule-a"]

    key = cache.make_key("catalog", {"bbox": [0, 0, 1, 1], "start": "2026-01-01"})
    payload, meta = cache.read_or_fetch(tmp_path, key, 60, fetch)
    assert payload == ["granule-a"]
    assert meta["cached"] is False

    payload, meta = cache.read_or_fetch(tmp_path, key, 60, fetch)
    assert payload == ["granule-a"]
    assert meta["cached"] is True
    assert calls["n"] == 1

    assert cache.invalidate(tmp_path, key) is True
    _, meta = cache.read_or_fetch(tmp_path, key, 60, fetch)
    assert meta["cached"] is False
    assert calls["n"] == 2


def test_read_or_fetch_serves_stale_when_upstream_fails(tmp_path):
    key = cache.make_key("catalog", {"x": 1})
    cache.write_entry(tmp_path, key, ["old"])

    def fail():
        raise RuntimeError("ASF down")

    payload, meta = cache.read_or_fetch(tmp_path, key, 0, fail, allow_stale=True)
    assert payload == ["old"]
    assert meta["stale"] is True
    assert "ASF down" in meta["warning"]

    with pytest.raises(RuntimeError, match="ASF down"):
        cache.read_or_fetch(tmp_path, key, 0, fail, allow_stale=False)


def test_cache_rejects_unsafe_keys(tmp_path):
    with pytest.raises(ValueError):
        cache.make_key("../escape", {})
    with pytest.raises(ValueError):
        cache.write_entry(tmp_path, "../escape", {})


# ---------------------------------------------------------------------------
# Live catalog search (cache-aside)
# ---------------------------------------------------------------------------

def test_catalog_search_fetches_live_once_then_caches(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "LIVE_FETCH_TTL_SECONDS", 3600)
    calls = {"n": 0}

    def fake_search(bbox, start, end, maturity="PROVISIONAL", max_results=50):
        calls["n"] += 1
        return [{"granule": "NISAR-example"}]

    monkeypatch.setattr(asf_service, "search_nisar_granules", fake_search)
    first = asf_service.search_nisar_granules_cached(BBOX, START, END)
    second = asf_service.search_nisar_granules_cached(BBOX, START, END)

    assert calls["n"] == 1
    assert first["cached"] is False and second["cached"] is True
    assert first["count"] == 1 and second["granules"] == [{"granule": "NISAR-example"}]
    assert second["fetched_at"]


def test_catalog_search_serves_stale_after_asf_outage(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "LIVE_FETCH_TTL_SECONDS", 0)
    monkeypatch.setattr(Config, "LIVE_FETCH_STALE_ON_ERROR", True)
    monkeypatch.setattr(
        asf_service, "search_nisar_granules", lambda *a, **k: [{"granule": "cached"}]
    )
    asf_service.search_nisar_granules_cached(BBOX, START, END)

    def fail(*args, **kwargs):
        raise RuntimeError("ASF unavailable")

    monkeypatch.setattr(asf_service, "search_nisar_granules", fail)
    result = asf_service.search_nisar_granules_cached(BBOX, START, END)
    assert result["stale"] is True
    assert result["granules"] == [{"granule": "cached"}]


def test_catalog_search_rejects_invalid_query_even_on_hit(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    with pytest.raises(ValueError, match="start must be on or before end"):
        asf_service.search_nisar_granules_cached(BBOX, END, START)


# ---------------------------------------------------------------------------
# On-demand product fetch
# ---------------------------------------------------------------------------

def test_fetch_products_returns_cached_site_without_network(tmp_path, monkeypatch):
    products = tmp_path / "products"
    _write_manifest(products, _site_id())
    monkeypatch.setattr(Config, "PRODUCTS_DIR", products)
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)

    def must_not_fetch(*args, **kwargs):
        raise AssertionError("cache hit must not call ASF")

    monkeypatch.setattr(asf_service, "search_nisar_granules_cached", must_not_fetch)
    result = live_fetch.fetch_products(
        BBOX, START, END, MATURITY, POLS, MAX_GRANULES
    )
    assert result["cached"] is True
    assert result["site_id"] == _site_id()
    assert "no network request" in result["message"]


def test_incomplete_cache_is_not_a_hit(tmp_path, monkeypatch):
    products = tmp_path / "products"
    root = _write_manifest(products, _site_id())
    (root / "cogs" / "backscatter-hh-2026-07-01.tif").unlink()
    monkeypatch.setattr(Config, "PRODUCTS_DIR", products)
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)
    with pytest.raises(live_fetch.LiveFetchDisabled):
        live_fetch.fetch_products(BBOX, START, END, MATURITY, POLS, MAX_GRANULES)


def test_live_fetch_is_enabled_by_default():
    """A fresh process with no ENABLE_LIVE_FETCH override must default to on."""
    env = {key: value for key, value in os.environ.items() if key != "ENABLE_LIVE_FETCH"}
    result = subprocess.run(
        [sys.executable, "-c", "from nisar.config import Config; print(Config.ENABLE_LIVE_FETCH)"],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip() == "True"


def test_fetch_products_rejects_explicit_opt_out(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)
    with pytest.raises(live_fetch.LiveFetchDisabled, match="ENABLE_LIVE_FETCH"):
        live_fetch.fetch_products(BBOX, START, END, MATURITY, POLS, MAX_GRANULES)


def test_fetch_products_builds_real_site_on_miss(tmp_path, monkeypatch):
    source_dir = tmp_path / "source_granules"
    paths = create_fake_gcov_pair(source_dir, size=100, pol_codes=["HHHH"])
    parsed = [parse_granule_name(path.name) for path in paths]
    granules = [
        {
            "granule": path.name,
            "date": item.date,
            "track": item.track,
            "frame": item.frame,
            "direction": item.direction,
            "maturity": item.maturity,
            "polarizations": item.polarizations(),
        }
        for path, item in zip(paths, parsed)
    ]
    products = tmp_path / "products"
    monkeypatch.setattr(Config, "PRODUCTS_DIR", products)
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", True)
    monkeypatch.setattr(Config, "EARTHDATA_TOKEN", "test-token")
    monkeypatch.setattr(Config, "LIVE_FETCH_MAX_GRANULES", 6)
    monkeypatch.setattr(Config, "LIVE_FETCH_MAX_BYTES", 10 * 1024 ** 2)
    monkeypatch.setattr(Config, "LIVE_FETCH_MIN_ZOOM", 0)
    monkeypatch.setattr(Config, "LIVE_FETCH_MAX_ZOOM", 2)
    monkeypatch.setattr(Config, "LIVE_FETCH_TILE_BUDGET_MB", 20.0)

    monkeypatch.setattr(
        live_fetch.asf_service,
        "search_nisar_granules_cached",
        lambda *a, **k: {
            "granules": granules,
            "count": len(granules),
            "cached": False,
            "stale": False,
            "fetched_at": "2026-11-14T00:00:00+00:00",
        },
    )
    matches = [
        (
            SimpleNamespace(
                properties={
                    "sceneName": path.name,
                    "fileName": path.name,
                    "bytes": 1024,
                }
            ),
            item,
            None,
        )
        for path, item in zip(paths, parsed)
    ]
    monkeypatch.setattr(live_fetch, "plan_site", lambda *a, **k: {"matches": matches})

    def fake_download(candidates, download_dir):
        download_dir.mkdir(parents=True, exist_ok=True)
        downloaded = []
        for path, item in zip(paths, parsed):
            target = download_dir / path.name
            shutil.copy(path, target)
            downloaded.append((target, item))
        return downloaded

    monkeypatch.setattr(live_fetch, "_download_remote_granules", fake_download)

    events: list[tuple[str, int, str]] = []
    result = live_fetch.fetch_products(
        BBOX, START, END, MATURITY, POLS, MAX_GRANULES,
        progress=lambda stage, percent, message: events.append((stage, percent, message)),
    )
    stages = [event[0] for event in events]
    assert "catalog" in stages and "downloading" in stages and "building" in stages
    assert stages[-1] == "done" and events[-1][1] == 100
    assert result["cached"] is False
    assert result["acquisition_count"] == 2
    assert result["layers"] >= 4
    assert result["catalog"]["cached"] is False
    manifest_path = products / _site_id() / "manifest.json"
    assert json.loads(manifest_path.read_text())["site"]["id"] == _site_id()
    assert verify_site(_site_id())[0] == f"Verified site {_site_id()}"

    # A repeated request is served from disk and never touches ASF again.
    def must_not_fetch(*args, **kwargs):
        raise AssertionError("second identical request must be a cache hit")

    monkeypatch.setattr(live_fetch.asf_service, "search_nisar_granules_cached", must_not_fetch)
    again = live_fetch.fetch_products(BBOX, START, END, MATURITY, POLS, MAX_GRANULES)
    assert again["cached"] is True


def test_fetch_products_refuses_unbounded_download(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", True)
    monkeypatch.setattr(Config, "EARTHDATA_TOKEN", "test-token")
    monkeypatch.setattr(Config, "LIVE_FETCH_MAX_BYTES", 1024)

    granule = {
        "granule": "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_20260701T160622_P05023_P_F_J_001.h5",
        "date": "2026-07-01",
        "track": 122,
        "frame": 67,
        "direction": "D",
        "maturity": "PROVISIONAL",
        "polarizations": ["HH"],
    }
    second = dict(granule)
    second["date"] = "2026-07-13"
    monkeypatch.setattr(
        live_fetch.asf_service,
        "search_nisar_granules_cached",
        lambda *a, **k: {"granules": [granule, second], "count": 2},
    )
    oversized = SimpleNamespace(properties={"bytes": 10 * 1024 ** 2})
    monkeypatch.setattr(
        live_fetch,
        "plan_site",
        lambda *a, **k: {"matches": [(oversized, None, None), (oversized, None, None)]},
    )
    with pytest.raises(live_fetch.LiveFetchError, match="exceeding the configured limit"):
        live_fetch.fetch_products(BBOX, START, END, MATURITY, POLS, MAX_GRANULES)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

def test_search_endpoint_caches_and_refresh_bypasses_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "LIVE_FETCH_TTL_SECONDS", 3600)
    calls = {"n": 0}

    def fake_search(*args, **kwargs):
        calls["n"] += 1
        return [{"granule": "NISAR-example"}]

    monkeypatch.setattr(asf_service, "search_nisar_granules", fake_search)
    params = {
        "bbox": ",".join(str(value) for value in BBOX),
        "start": START.isoformat(),
        "end": END.isoformat(),
    }
    with TestClient(main.app) as client:
        first = client.get("/api/nisar/search", params=params)
        second = client.get("/api/nisar/search", params=params)
        refreshed = client.get("/api/nisar/search", params={**params, "refresh": "true"})

    assert first.status_code == 200
    assert first.json()["cached"] is False
    assert second.json()["cached"] is True
    assert refreshed.json()["cached"] is False
    assert calls["n"] == 2


def test_fetch_endpoint_rejects_explicit_opt_out(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)
    payload = {
        "bbox": BBOX,
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
    }
    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch", json=payload)
    assert response.status_code == 404
    assert "ENABLE_LIVE_FETCH" in response.json()["detail"]


def test_fetch_endpoint_returns_products(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(
        live_fetch,
        "fetch_products",
        lambda **kwargs: {"site_id": "live-test", "cached": False},
    )
    payload = {
        "bbox": BBOX,
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "polarizations": ["HH"],
        "max_granules": 2,
    }
    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch?sync=true", json=payload)
    assert response.status_code == 200
    assert response.json()["site_id"] == "live-test"


def test_fetch_endpoint_validates_request(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    payload = {
        "bbox": BBOX,
        "start_date": END.isoformat(),
        "end_date": START.isoformat(),
    }
    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch", json=payload)
    assert response.status_code == 422


def test_live_fetch_request_rejects_unknown_polarization():
    with pytest.raises(ValueError):
        LiveFetchRequest(
            bbox=[0, 0, 1, 1],
            start_date=START,
            end_date=END,
            polarizations=["XX"],
        )
