from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from routers.insar import STATUS_PAYLOAD


def test_insar_status_is_static_proposed_and_200() -> None:
    client = TestClient(app)
    response = client.get("/api/insar/status")
    assert response.status_code == 200
    assert response.json() == STATUS_PAYLOAD
    assert response.json()["enabled"] is False
    assert response.json()["status"] == "proposed"


def test_no_insar_compute_endpoint_is_registered() -> None:
    paths = sorted(
        path for path in app.openapi()["paths"] if path.startswith("/api/insar")
    )
    assert paths == ["/api/insar/status"]
    client = TestClient(app)
    assert client.post("/api/insar/status").status_code == 405
