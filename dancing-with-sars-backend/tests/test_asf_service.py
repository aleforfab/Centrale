from datetime import date
from types import SimpleNamespace

import pytest

from nisar.config import Config
from services import asf_service


def test_search_nisar_granules_parses_provenance(monkeypatch):
    name = (
        "NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20260701T160541_"
        "20260701T160622_P05023_P_F_J_001.h5"
    )
    monkeypatch.setattr(Config, "EARTHDATA_TOKEN", None)
    monkeypatch.setattr(Config, "EARTHDATA_USERNAME", None)
    monkeypatch.setattr(Config, "EARTHDATA_PASSWORD", None)
    monkeypatch.setattr(
        asf_service.asf,
        "search",
        lambda **kwargs: [SimpleNamespace(properties={"sceneName": name, "url": "https://example.invalid/file"})],
    )

    results = asf_service.search_nisar_granules(
        [-108, -76, -100, -74.5],
        date(2026, 6, 1),
        date(2026, 7, 31),
    )

    assert results[0]["cycle"] == 4
    assert results[0]["track"] == 122
    assert results[0]["frame"] == 67
    assert results[0]["maturity"] == "PROVISIONAL"
    assert results[0]["polarizations"] == ["HH"]
    assert results[0]["asf_url"].endswith(name)


def test_search_nisar_granules_rejects_invalid_query():
    with pytest.raises(ValueError, match="start must be on or before end"):
        asf_service.search_nisar_granules(
            [-108, -76, -100, -74.5],
            date(2026, 7, 2),
            date(2026, 7, 1),
        )
