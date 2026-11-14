"""Proposed phase-capable InSAR adapter and chain.

This package is library-only. It is not enabled for users, it does not prove a
real interferometric result, and it must not be used to display deformation or
coherence numbers until real phase-capable products and scientific review are
available.
"""

from .chain import InSarChainConfig, InSarDiagnostics, run_gunw_chain, run_slc_chain
from .geometry import Baseline, BaselineCheck, OrbitState, compute_baseline
from .source import ProductKind, detect_product_identity

__all__ = [
    "Baseline",
    "BaselineCheck",
    "InSarChainConfig",
    "InSarDiagnostics",
    "OrbitState",
    "ProductKind",
    "compute_baseline",
    "detect_product_identity",
    "run_gunw_chain",
    "run_slc_chain",
]
