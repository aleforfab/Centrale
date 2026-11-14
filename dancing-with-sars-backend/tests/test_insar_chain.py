from __future__ import annotations

import math
from typing import Any

import numpy as np
import pytest

from nisar.insar.chain import (
    CHAIN_ORDER,
    InSarChainConfig,
    run_gunw_chain,
    run_slc_chain,
)
from nisar.insar.topo import DEM
from tests.fixtures.make_synthetic_insar import (
    complex_slc_pair,
    gaussian_bump,
    plane_dem,
)


def _contains_array(value: Any) -> bool:
    if isinstance(value, np.ndarray):
        return True
    if isinstance(value, dict):
        return any(_contains_array(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_array(item) for item in value)
    return False


def _contains_key(value: Any, key: str) -> bool:
    if isinstance(value, dict):
        return key in value or any(_contains_key(item, key) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_key(item, key) for item in value)
    return False


def _assert_proposed_diagnostics(payload: dict[str, Any], mode: str) -> None:
    assert payload["status"] == "proposed"
    assert payload["mode"] == mode
    assert payload["chain_order"] == CHAIN_ORDER
    assert len(payload["steps"]) == 7
    assert payload["user_facing_result"] is None
    assert payload["not_verified_on_real_data"] is True
    assert payload["scientific_review"] is False
    assert not _contains_array(payload)
    assert not _contains_key(payload, "deformation_map")
    assert payload["los_scaling"]["scale_factor"] == pytest.approx(
        0.24 / (4 * math.pi) * math.cos(math.radians(35.0))
    )
    assert "Synthetic fixtures only; not verified on real data." in payload["caveats"]


def test_slc_chain_returns_dictionary_only_proposed_diagnostics() -> None:
    reference, secondary = complex_slc_pair((64, 64), shift=(2, -3))
    dem = DEM(plane_dem((64, 64)))
    payload = run_slc_chain(reference, secondary, dem, InSarChainConfig()).as_dict()
    _assert_proposed_diagnostics(payload, "slc-local-chain")
    assert payload["coregistration"]["dy"] == pytest.approx(2.0, abs=0.05)
    assert payload["coregistration"]["dx"] == pytest.approx(-3.0, abs=0.05)
    assert payload["unwrap"]["status"] == "proposed"


def test_gunw_chain_passes_through_unwrapped_phase() -> None:
    phase = gaussian_bump((64, 64), amplitude=2.0, sigma=8.0)
    coherence = np.ones_like(phase) * 0.8
    dem = DEM(plane_dem((64, 64)))
    payload = run_gunw_chain(phase, coherence, dem, InSarChainConfig()).as_dict()
    _assert_proposed_diagnostics(payload, "gunw-pass-through")
    assert payload["coregistration"]["mode"] == "pass_through"
    assert payload["unwrap"]["algorithm"] == "GUNW pass-through: phase already unwrapped"
    assert payload["coherence"]["mean_magnitude"] == pytest.approx(0.8)
    assert "GUNW-style products are assumed already coregistered" in payload["coregistration"]["caveats"][0]
