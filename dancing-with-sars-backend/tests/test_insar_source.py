from __future__ import annotations

import numpy as np

from nisar.insar.source import (
    GunwHdf5Adapter,
    Hyp3StyleServiceHook,
    PhaseProduct,
    ProductKind,
    SlcPairAdapter,
    detect_product_identity,
)
from tests.fixtures.make_synthetic_insar import (
    complex_slc_pair,
    gaussian_bump,
    write_gunw_hdf5,
    write_slc_pair_hdf5,
)


def test_product_detection_and_crid_extraction() -> None:
    expected = {
        "NISAR_L2_GUNW_P05023.h5": ProductKind.GUNW,
        "NISAR_L2_GSLC_P05023.h5": ProductKind.GSLC,
        "NISAR_L2_SLC_P05023.h5": ProductKind.SLC,
        "HYP3_job.h5": ProductKind.HYP3,
        "unknown.h5": ProductKind.UNKNOWN,
    }
    for name, kind in expected.items():
        identity = detect_product_identity(name)
        assert identity.kind is kind
        assert identity.status == "proposed"
    assert detect_product_identity("NISAR_L2_GUNW_P05023.h5").crid == "P05023"
    assert detect_product_identity("item.h5", {"crid": "X05009"}).crid == "X05009"


def test_gunw_and_slc_hdf5_adapters_read_synthetic_fixtures(tmp_path) -> None:
    phase = gaussian_bump((64, 64), amplitude=2.0, sigma=8.0)
    coherence = np.ones_like(phase) * 0.7
    incidence = np.ones_like(phase) * 0.6
    gunw_path = write_gunw_hdf5(
        tmp_path / "NISAR_L2_GUNW_P05023.h5",
        phase,
        coherence,
        incidence,
        attrs={"crid": "P05023", "product": "GUNW"},
    )
    gunw = GunwHdf5Adapter().load(gunw_path)
    assert gunw.kind is ProductKind.GUNW
    assert gunw.status == "proposed"
    assert gunw.unwrapped_phase is not None
    assert gunw.coherence is not None
    assert gunw.unwrapped_phase.shape == (64, 64)
    assert gunw.wavelength_m == 0.24
    assert gunw.diagnostics()["has_unwrapped_phase"] is True
    assert gunw.diagnostics()["verified_on_real_data"] is False

    reference, secondary = complex_slc_pair((64, 64), shift=(2, -3))
    slc_path = write_slc_pair_hdf5(
        tmp_path / "NISAR_L2_SLC_P05023.h5",
        reference,
        secondary,
        attrs={"crid": "P05023", "product": "SLC"},
    )
    slc = SlcPairAdapter().load(slc_path)
    assert np.iscomplexobj(slc.reference)
    assert slc.reference.shape == (64, 64)
    assert slc.status == "proposed"
    assert slc.diagnostics()["verified_on_real_data"] is False


def test_external_service_hook_is_callable_only() -> None:
    product = PhaseProduct(kind=ProductKind.HYP3)
    hook = Hyp3StyleServiceHook(
        submit_fn=lambda request: "job-1",
        fetch_fn=lambda job_id, auth: product,
    )
    assert hook.submit({"pair": "synthetic"}) == "job-1"
    assert hook.fetch("job-1") is product
    assert hook.label.startswith("HyP3-style")
