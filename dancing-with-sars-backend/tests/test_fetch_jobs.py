"""Tests for background live-fetch jobs and the progress endpoints."""

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

import main
from nisar import jobs, live_fetch
from nisar.config import Config
from tests.test_live_fetch import BBOX, END, START, _site_id, _write_manifest

PARAMS = {
    "bbox": BBOX,
    "start": START,
    "end": END,
    "maturity": "PROVISIONAL",
    "polarizations": ["HH"],
    "max_granules": 2,
    "refresh": False,
}

PAYLOAD = {
    "bbox": BBOX,
    "start_date": START.isoformat(),
    "end_date": END.isoformat(),
    "polarizations": ["HH"],
    "max_granules": 2,
}


def _wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def _manager(directory, executor, runner):
    return jobs.JobManager(
        directory=directory,
        executor=executor,
        runner=runner,
        retention_seconds=3600,
    )


# ---------------------------------------------------------------------------
# Job manager lifecycle
# ---------------------------------------------------------------------------

def test_job_reports_progress_and_persists_result(tmp_path):
    def runner(**kwargs):
        assert kwargs["should_cancel"]() is False
        kwargs["progress"]("catalog", 20, "found granules")
        kwargs["progress"]("building", 70, "building products")
        return {"site_id": "live-test", "cached": False}

    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        job = manager.submit(PARAMS)
        assert job["status"] in {"queued", "running", "succeeded"}
        assert _wait_for(lambda: manager.get(job["job_id"])["status"] == "succeeded")

        final = manager.get(job["job_id"])
        assert final["progress"] == 100
        assert final["stage"] == "done"
        assert final["result"]["site_id"] == "live-test"
        assert final["started_at"] and final["finished_at"]
        assert final["error"] is None
        assert final["cancel_requested"] is False

        persisted = json.loads((tmp_path / "jobs" / f"{job['job_id']}.json").read_text())
        assert persisted["status"] == "succeeded"
        assert persisted["params"]["start"] == START.isoformat()


def test_job_failure_records_error(tmp_path):
    def runner(**kwargs):
        raise live_fetch.LiveFetchError("ASF unavailable")

    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        job = manager.submit(PARAMS)
        assert _wait_for(lambda: manager.get(job["job_id"])["status"] == "failed")
        final = manager.get(job["job_id"])
        assert "ASF unavailable" in final["error"]
        assert final["stage"] == "failed"
        assert final["result"] is None


def test_job_cancellation_is_cooperative(tmp_path):
    release = threading.Event()

    def runner(**kwargs):
        kwargs["progress"]("downloading", 45, "downloading granules")
        release.wait(3)
        if kwargs["should_cancel"]():
            raise live_fetch.LiveFetchCancelled("Live fetch was cancelled")
        return {"site_id": "should-not-happen"}

    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        job = manager.submit(PARAMS)
        assert _wait_for(lambda: manager.get(job["job_id"])["stage"] == "downloading")

        updated, accepted = manager.cancel(job["job_id"])
        assert accepted is True and updated["cancel_requested"] is True
        release.set()
        assert _wait_for(lambda: manager.get(job["job_id"])["status"] == "cancelled")
        assert manager.get(job["job_id"])["result"] is None


def test_identical_requests_reuse_the_active_job(tmp_path):
    release = threading.Event()

    def runner(**kwargs):
        release.wait(3)
        return {"site_id": "live-dedup"}

    with ThreadPoolExecutor(max_workers=2) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        first = manager.submit(PARAMS)
        second = manager.submit(PARAMS)
        assert first["job_id"] == second["job_id"]
        release.set()
        assert _wait_for(lambda: manager.get(first["job_id"])["status"] == "succeeded")


def test_refresh_request_does_not_reuse_a_normal_job(tmp_path):
    release = threading.Event()

    def runner(**kwargs):
        release.wait(3)
        return {"site_id": "live-refresh"}

    with ThreadPoolExecutor(max_workers=2) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        normal = manager.submit(PARAMS)
        refreshed = manager.submit({**PARAMS, "refresh": True})
        assert refreshed["job_id"] != normal["job_id"]
        release.set()
        assert _wait_for(
            lambda: all(
                manager.get(job["job_id"])["status"] == "succeeded"
                for job in (normal, refreshed)
            )
        )


def test_restart_marks_active_jobs_as_interrupted(tmp_path):
    release = threading.Event()

    def runner(**kwargs):
        release.wait(3)
        return {"site_id": "live-restart"}

    with ThreadPoolExecutor(max_workers=1) as executor:
        first = _manager(tmp_path / "jobs", executor, runner)
        job = first.submit(PARAMS)
        assert _wait_for(lambda: first.get(job["job_id"])["status"] == "running")

        restarted = _manager(tmp_path / "jobs", executor, runner)
        recovered = restarted.get(job["job_id"])
        assert recovered["status"] == "failed"
        assert "interrupted" in recovered["error"]

        release.set()
        assert _wait_for(lambda: first.get(job["job_id"])["status"] == "succeeded")


def test_unknown_job_ids_are_rejected(tmp_path):
    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, lambda **kwargs: {})
        assert manager.get("../escape") is None
        assert manager.cancel("job-unknown") == (None, False)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

def _enable_live_fetch(monkeypatch, tmp_path):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", True)
    monkeypatch.setattr(Config, "EARTHDATA_TOKEN", "test-token")


def test_fetch_endpoint_returns_202_and_progress_is_pollable(tmp_path, monkeypatch):
    _enable_live_fetch(monkeypatch, tmp_path)

    def runner(**kwargs):
        kwargs["progress"]("building", 70, "building products")
        return {"site_id": "live-job", "cached": False}

    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        monkeypatch.setattr(jobs, "get_job_manager", lambda: manager)
        with TestClient(main.app) as client:
            response = client.post("/api/nisar/fetch", json=PAYLOAD)
            assert response.status_code == 202
            body = response.json()
            assert response.headers["location"] == body["status_url"]
            assert body["job_id"].startswith("job-")

            assert _wait_for(
                lambda: client.get(body["status_url"]).json()["status"] == "succeeded"
            )
            final = client.get(body["status_url"]).json()
            assert final["progress"] == 100
            assert final["result"]["site_id"] == "live-job"
            assert client.get("/api/nisar/fetch/jobs").json()["count"] >= 1


def test_fetch_endpoint_cache_hit_never_enqueues_a_job(tmp_path, monkeypatch):
    products = tmp_path / "products"
    _write_manifest(products, _site_id())
    monkeypatch.setattr(Config, "PRODUCTS_DIR", products)
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)

    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch", json=PAYLOAD)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["cached"] is True
    assert body["job_id"] is None


def test_fetch_endpoint_fails_fast_when_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "ENABLE_LIVE_FETCH", False)
    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch", json=PAYLOAD)
    assert response.status_code == 404
    assert "ENABLE_LIVE_FETCH" in response.json()["detail"]


def test_fetch_endpoint_sync_mode_still_works(tmp_path, monkeypatch):
    _enable_live_fetch(monkeypatch, tmp_path)
    monkeypatch.setattr(
        live_fetch,
        "fetch_products",
        lambda **kwargs: {"site_id": "live-sync", "cached": False},
    )
    with TestClient(main.app) as client:
        response = client.post("/api/nisar/fetch?sync=true", json=PAYLOAD)
    assert response.status_code == 200
    assert response.json()["site_id"] == "live-sync"


def test_unknown_job_endpoints_return_404(tmp_path, monkeypatch):
    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, lambda **kwargs: {})
        monkeypatch.setattr(jobs, "get_job_manager", lambda: manager)
        with TestClient(main.app) as client:
            assert client.get("/api/nisar/fetch/jobs/job-unknown").status_code == 404
            assert client.post("/api/nisar/fetch/jobs/job-unknown/cancel").status_code == 404


def test_cancelling_a_finished_job_returns_409(tmp_path, monkeypatch):
    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, lambda **kwargs: {"site_id": "done"})
        job = manager.submit(PARAMS)
        assert _wait_for(lambda: manager.get(job["job_id"])["status"] == "succeeded")
        monkeypatch.setattr(jobs, "get_job_manager", lambda: manager)
        with TestClient(main.app) as client:
            response = client.post(f"/api/nisar/fetch/jobs/{job['job_id']}/cancel")
        assert response.status_code == 409


def test_cancel_endpoint_stops_a_running_job(tmp_path, monkeypatch):
    _enable_live_fetch(monkeypatch, tmp_path)
    release = threading.Event()

    def runner(**kwargs):
        kwargs["progress"]("downloading", 45, "downloading granules")
        release.wait(3)
        if kwargs["should_cancel"]():
            raise live_fetch.LiveFetchCancelled("Live fetch was cancelled")
        return {"site_id": "should-not-happen"}

    with ThreadPoolExecutor(max_workers=1) as executor:
        manager = _manager(tmp_path / "jobs", executor, runner)
        monkeypatch.setattr(jobs, "get_job_manager", lambda: manager)
        with TestClient(main.app) as client:
            response = client.post("/api/nisar/fetch", json=PAYLOAD)
            status_url = response.json()["status_url"]
            assert _wait_for(lambda: client.get(status_url).json()["stage"] == "downloading")

            cancelled = client.post(f"{status_url}/cancel")
            assert cancelled.status_code == 200
            assert cancelled.json()["cancel_requested"] is True

            release.set()
            assert _wait_for(lambda: client.get(status_url).json()["status"] == "cancelled")


def test_job_params_round_trip_dates():
    stored = json.loads(json.dumps(PARAMS, default=str))
    kwargs = jobs.fetch_kwargs(stored)
    assert kwargs["start"] == START and kwargs["end"] == END
    assert kwargs["max_granules"] == 2
    assert kwargs["polarizations"] == ["HH"]
