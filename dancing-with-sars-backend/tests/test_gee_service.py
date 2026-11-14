import json
from unittest.mock import patch

import pytest

from services.gee_service import initialize_gee


def test_initialize_gee_loads_configured_service_account_file(tmp_path, monkeypatch):
    key_file = tmp_path / "service-account.json"
    key_file.write_text(
        json.dumps({"project_id": "test-project", "private_key": "test-key"}),
        encoding="utf-8",
    )
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT", "service@test-project.iam.gserviceaccount.com")
    monkeypatch.setenv("GEE_PRIVATE_KEY_FILE", str(key_file))
    monkeypatch.delenv("EE_SERVICE_ACCOUNT", raising=False)
    monkeypatch.delenv("EE_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("EE_PROJECT", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)

    with (
        patch("services.gee_service.ee.ServiceAccountCredentials", return_value="credentials") as creds,
        patch("services.gee_service.ee.Initialize") as initialize,
    ):
        initialize_gee()

    creds.assert_called_once_with(
        "service@test-project.iam.gserviceaccount.com",
        key_data=key_file.read_text(encoding="utf-8"),
    )
    initialize.assert_called_once_with("credentials", project="test-project")


def test_initialize_gee_reports_missing_configured_key_file(monkeypatch):
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT", "service@test-project.iam.gserviceaccount.com")
    monkeypatch.setenv("GEE_PRIVATE_KEY_FILE", "missing-service-account.json")
    monkeypatch.setenv("EE_PROJECT", "test-project")
    monkeypatch.delenv("EE_SERVICE_ACCOUNT", raising=False)
    monkeypatch.delenv("EE_PRIVATE_KEY", raising=False)

    with (
        patch("services.gee_service.ee.data.get_persistent_credentials", return_value=None),
        patch("services.gee_service.ee.Initialize") as initialize,
        pytest.raises(RuntimeError, match="key file was not found"),
    ):
        initialize_gee()

    initialize.assert_not_called()


def test_initialize_gee_uses_saved_oauth_when_key_file_is_missing(monkeypatch):
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT", "service@test-project.iam.gserviceaccount.com")
    monkeypatch.setenv("GEE_PRIVATE_KEY_FILE", "missing-service-account.json")
    monkeypatch.setenv("EE_PROJECT", "test-project")
    monkeypatch.delenv("EE_SERVICE_ACCOUNT", raising=False)
    monkeypatch.delenv("EE_PRIVATE_KEY", raising=False)

    with (
        patch("services.gee_service.ee.data.get_persistent_credentials", return_value="oauth"),
        patch("services.gee_service.ee.Initialize") as initialize,
    ):
        initialize_gee()

    initialize.assert_called_once_with(credentials="oauth", project="test-project")
