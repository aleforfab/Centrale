"""Tests for the synthetic demo-site generator."""

import json
from pathlib import Path

import pytest
import yaml

from scripts import make_demo_site


def test_bbox_is_derived_from_the_grid():
    bbox = make_demo_site.bbox_from_grid(400, 20.0, inner_fraction=0.3)
    west, south, east, north = bbox
    assert -180 <= west < east <= 180
    assert -90 <= south < north <= 90
    # Inner 40% of an 8 km grid is roughly 3.2 km wide, about 0.03 degrees.
    assert 0.01 < (east - west) < 0.1


def test_polarization_codes_are_four_characters():
    assert make_demo_site.polarization_codes(["HH", "HV"]) == ["HHHH", "HVHV"]
    with pytest.raises(ValueError):
        make_demo_site.polarization_codes(["XX"])


def test_site_config_carries_the_synthetic_caveat():
    config = make_demo_site.build_site_config(
        "demo-fixture", 200, 20.0, ["HH"], "20260701", "20260713"
    )
    assert config["id"] == "demo-fixture"
    assert config["polarizations"] == ["HH"]
    assert config["pairs"][0]["pre"] == "20260701"
    assert "not a real observation" in config["caveat"]


def test_generated_site_validates_and_builds(tmp_path, monkeypatch):
    """The generator output must be accepted by the real site builder."""
    from nisar.config import Config
    from nisar.site_builder import build_site, verify_site

    output = tmp_path / "demo-input"
    exit_code = make_demo_site.main(
        ["--output", str(output), "--size", "120", "--polarizations", "HH"]
    )
    assert exit_code == 0

    config_path = output / "site.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert config["caveat"].startswith("Synthetic fixture data")
    assert "not a real observation" in config["caveat"]

    monkeypatch.setattr(Config, "PRODUCTS_DIR", tmp_path / "products")
    monkeypatch.setattr(Config, "CACHE_DIR", tmp_path / "cache")

    built = build_site(config_path, local_dir=output / "granules")
    manifest = json.loads((built / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["site"]["caveat"].startswith("Synthetic fixture data")
    assert len(manifest["acquisitions"]) == 2
    assert manifest["layers"], "expected at least one layer"

    messages = verify_site("demo-fixture")
    assert messages[0].startswith("Verified site demo-fixture")


def test_existing_output_requires_force(tmp_path):
    output = tmp_path / "demo-input"
    output.mkdir()
    (output / "leftover.txt").write_text("x", encoding="utf-8")
    assert make_demo_site.main(["--output", str(output), "--size", "80"]) == 1
    assert make_demo_site.main(["--output", str(output), "--size", "80", "--force"]) == 0
    assert Path(output / "site.yaml").exists()
