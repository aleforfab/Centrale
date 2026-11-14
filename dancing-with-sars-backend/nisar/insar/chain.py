"""Proposed InSAR chain orchestration with dictionary-only diagnostics.

The chain records parameters and caveats for coregistration, topographic phase
removal, coherence, filtering, atmosphere screening, unwrapping and LOS
scaling. It never returns a deformation map or a user-facing displacement
number. Every output is labelled proposed and unverified on real data.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from .atmosphere import screen_atmosphere
from .coherence import coherence_diagnostics
from .coregister import coregister_pair, estimate_shift
from .filtering import goldstein_filter
from .geometry import critical_baseline_check, los_scale_factor
from .topo import DEM, remove_topographic_phase
from .unwrap import unwrap_phase

CHAIN_ORDER = [
    "coregistration",
    "topo-removal",
    "coherence",
    "filtering",
    "unwrap",
    "atmos-screening",
    "los-scaling",
]


def _plain(value: Any) -> Any:
    """Recursively convert numpy scalars and reject arrays in diagnostics."""

    if isinstance(value, np.ndarray):
        raise TypeError("InSAR diagnostics must not contain numpy arrays")
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return value


@dataclass(frozen=True)
class InSarChainConfig:
    """Synthetic chain parameters; nothing here is a calibrated mission value."""

    wavelength_m: float = 0.24
    perpendicular_baseline_m: float = 150.0
    slant_range_m: float = 800_000.0
    incidence_angle_rad: float = math.radians(35.0)
    range_resolution_m: float = 10.0
    coherence_window: int = 5
    filter_alpha: float = 0.5
    filter_smoothing_window: int = 5
    coreg_window: tuple[int, int] = (32, 32)
    coreg_overlap: float = 0.5
    atmosphere_wet_rms_threshold: float = 0.25
    atmosphere_r_squared_threshold: float = 0.6
    atmosphere_trend_threshold: float = 0.05

    def as_dict(self) -> dict[str, Any]:
        return {
            "wavelength_m": self.wavelength_m,
            "perpendicular_baseline_m": self.perpendicular_baseline_m,
            "slant_range_m": self.slant_range_m,
            "incidence_angle_rad": self.incidence_angle_rad,
            "range_resolution_m": self.range_resolution_m,
            "coherence_window": self.coherence_window,
            "filter_alpha": self.filter_alpha,
            "filter_smoothing_window": self.filter_smoothing_window,
            "coreg_window": list(self.coreg_window),
            "coreg_overlap": self.coreg_overlap,
            "atmosphere_wet_rms_threshold": self.atmosphere_wet_rms_threshold,
            "atmosphere_r_squared_threshold": self.atmosphere_r_squared_threshold,
            "atmosphere_trend_threshold": self.atmosphere_trend_threshold,
        }


@dataclass(frozen=True)
class InSarDiagnostics:
    """Dictionary-only output for the proposed chain."""

    mode: str
    status: str
    chain_order: list[str]
    steps: list[dict[str, Any]]
    parameters: dict[str, Any]
    baseline_check: dict[str, Any]
    coregistration: dict[str, Any]
    topographic_removal: dict[str, Any]
    coherence: dict[str, Any]
    filtering: dict[str, Any]
    atmosphere: dict[str, Any]
    unwrap: dict[str, Any]
    los_scaling: dict[str, Any]
    caveats: list[str]

    def as_dict(self) -> dict[str, Any]:
        return _plain(
            {
                "mode": self.mode,
                "status": self.status,
                "chain_order": self.chain_order,
                "steps": self.steps,
                "parameters": self.parameters,
                "baseline_check": self.baseline_check,
                "coregistration": self.coregistration,
                "topographic_removal": self.topographic_removal,
                "coherence": self.coherence,
                "filtering": self.filtering,
                "atmosphere": self.atmosphere,
                "unwrap": self.unwrap,
                "los_scaling": self.los_scaling,
                "caveats": self.caveats,
                "user_facing_result": None,
                "not_verified_on_real_data": True,
                "scientific_review": False,
            }
        )


def _common_diagnostics(config: InSarChainConfig) -> dict[str, Any]:
    return {
        "baseline_check": critical_baseline_check(
            config.perpendicular_baseline_m,
            config.wavelength_m,
            config.slant_range_m,
            config.incidence_angle_rad,
            config.range_resolution_m,
        ).as_dict(),
        "los_scaling": {
            "scale_factor": los_scale_factor(
                config.wavelength_m,
                config.incidence_angle_rad,
            ),
            "formula": "d_vertical ~= (lambda/(4*pi)) * cos(theta_local) * DeltaPhi",
            "sign_convention": "positive phase means increased slant range; positive displacement away from sensor",
            "status": "proposed",
        },
    }


def _chain_caveats(mode: str) -> list[str]:
    return [
        f"{mode} chain is proposed only and is not enabled for users.",
        "GCOV is detected backscatter and carries no interferometric phase.",
        "Synthetic fixtures only; not verified on real data.",
        "No deformation map, displacement number or coherence value is exposed.",
        "Requires phase-capable products, a DEM, two real same-stack pairs and scientific review.",
    ]


def _magnitude_diagnostics(magnitude: np.ndarray, window: int) -> dict[str, Any]:
    values = np.clip(np.asarray(magnitude, dtype=np.float64), 0.0, 1.0)
    finite = np.isfinite(values)
    return {
        "mean_magnitude": float(np.mean(values[finite])) if finite.any() else 0.0,
        "min_magnitude": float(np.min(values[finite])) if finite.any() else 0.0,
        "max_magnitude": float(np.max(values[finite])) if finite.any() else 0.0,
        "valid_fraction": float(np.mean(finite)),
        "window": window,
        "status": "proposed",
    }


def run_slc_chain(
    reference: np.ndarray,
    secondary: np.ndarray,
    dem: DEM,
    config: InSarChainConfig | None = None,
) -> InSarDiagnostics:
    """Run the proposed local chain on a synthetic complex SLC pair."""

    settings = config or InSarChainConfig()
    ref = np.asarray(reference, dtype=np.complex128)
    sec = np.asarray(secondary, dtype=np.complex128)
    if ref.shape != sec.shape:
        raise ValueError("Reference and secondary SLC arrays must have the same shape")
    if np.asarray(dem.height_m).shape != ref.shape:
        raise ValueError("DEM shape must match the SLC arrays")

    shift = estimate_shift(ref, sec, settings.coreg_window, settings.coreg_overlap)
    aligned = coregister_pair(ref, sec, shift)
    interferogram = ref * np.conj(aligned)
    wrapped = np.angle(interferogram)

    topo = remove_topographic_phase(
        wrapped,
        dem,
        settings.wavelength_m,
        settings.perpendicular_baseline_m,
        settings.slant_range_m,
        settings.incidence_angle_rad,
    )
    coherence = coherence_diagnostics(ref, aligned, settings.coherence_window)
    filtered, filter_diagnostics = goldstein_filter(
        topo.residual_phase,
        settings.filter_alpha,
        settings.filter_smoothing_window,
    )
    atmosphere = screen_atmosphere(
        filtered,
        dem,
        settings.atmosphere_wet_rms_threshold,
        settings.atmosphere_r_squared_threshold,
        settings.atmosphere_trend_threshold,
    )
    unwrap = unwrap_phase(filtered)
    common = _common_diagnostics(settings)

    steps = [
        {
            "step": "coregistration",
            "parameters": shift.as_dict(),
            "caveats": ["Synthetic FFT estimate; real orbit/DEM registration is not validated."],
        },
        {
            "step": "topo-removal",
            "parameters": topo.diagnostics(),
            "caveats": ["Caller-provided DEM; residual topo phase requires real-pair validation."],
        },
        {
            "step": "coherence",
            "parameters": coherence.as_dict(),
            "caveats": ["Boxcar estimator only; no adaptive P/B window is implemented."],
        },
        {
            "step": "filtering",
            "parameters": filter_diagnostics.as_dict(),
            "caveats": ["Goldstein-inspired FFT equivalent; not a validated production filter."],
        },
        {
            "step": "unwrap",
            "parameters": unwrap.as_dict(),
            "caveats": unwrap.caveats(),
        },
        {
            "step": "atmos-screening",
            "parameters": atmosphere.as_dict(),
            "caveats": atmosphere.caveats(),
        },
        {
            "step": "los-scaling",
            "parameters": common["los_scaling"],
            "caveats": ["Scalar coefficient only; no deformation map is produced."],
        },
    ]

    return InSarDiagnostics(
        mode="slc-local-chain",
        status="proposed",
        chain_order=CHAIN_ORDER,
        steps=steps,
        parameters=settings.as_dict(),
        baseline_check=common["baseline_check"],
        coregistration=shift.as_dict(),
        topographic_removal=topo.diagnostics(),
        coherence=coherence.as_dict(),
        filtering=filter_diagnostics.as_dict(),
        atmosphere=atmosphere.as_dict(),
        unwrap=unwrap.as_dict(),
        los_scaling=common["los_scaling"],
        caveats=_chain_caveats("SLC"),
    )


def run_gunw_chain(
    unwrapped_phase: np.ndarray,
    coherence: np.ndarray,
    dem: DEM,
    config: InSarChainConfig | None = None,
) -> InSarDiagnostics:
    """Run the proposed GUNW pass-through chain on synthetic arrays."""

    settings = config or InSarChainConfig()
    phase = np.asarray(unwrapped_phase, dtype=np.float64)
    if phase.shape != np.asarray(dem.height_m).shape:
        raise ValueError("DEM shape must match the phase array")

    topo = remove_topographic_phase(
        phase,
        dem,
        settings.wavelength_m,
        settings.perpendicular_baseline_m,
        settings.slant_range_m,
        settings.incidence_angle_rad,
    )
    magnitude = _magnitude_diagnostics(coherence, settings.coherence_window)
    filtered, filter_diagnostics = goldstein_filter(
        topo.residual_phase,
        settings.filter_alpha,
        settings.filter_smoothing_window,
    )
    atmosphere = screen_atmosphere(
        filtered,
        dem,
        settings.atmosphere_wet_rms_threshold,
        settings.atmosphere_r_squared_threshold,
        settings.atmosphere_trend_threshold,
    )
    unwrap_diagnostics = {
        "resolved": True,
        "residue_count": 0,
        "conflict_count": 0,
        "unwrapped_phase_available": True,
        "algorithm": "GUNW pass-through: phase already unwrapped",
        "caveats": [
            "No local unwrapping was performed.",
            "Real GUNW phase continuity and geocoding are not verified here.",
        ],
        "status": "proposed",
    }
    coregistration = {
        "mode": "pass_through",
        "shift": [0.0, 0.0],
        "windows_used": 0,
        "caveats": ["GUNW-style products are assumed already coregistered; not verified."],
        "status": "proposed",
    }
    common = _common_diagnostics(settings)

    steps = [
        {"step": "coregistration", "parameters": coregistration, "caveats": coregistration["caveats"]},
        {
            "step": "topo-removal",
            "parameters": topo.diagnostics(),
            "caveats": ["Caller-provided DEM; residual topo phase requires real-pair validation."],
        },
        {
            "step": "coherence",
            "parameters": magnitude,
            "caveats": ["Passed-through GUNW coherence magnitude; not recomputed from SLCs."],
        },
        {
            "step": "filtering",
            "parameters": filter_diagnostics.as_dict(),
            "caveats": ["Goldstein-inspired FFT equivalent; not a validated production filter."],
        },
        {"step": "unwrap", "parameters": unwrap_diagnostics, "caveats": unwrap_diagnostics["caveats"]},
        {
            "step": "atmos-screening",
            "parameters": atmosphere.as_dict(),
            "caveats": atmosphere.caveats(),
        },
        {
            "step": "los-scaling",
            "parameters": common["los_scaling"],
            "caveats": ["Scalar coefficient only; no deformation map is produced."],
        },
    ]

    return InSarDiagnostics(
        mode="gunw-pass-through",
        status="proposed",
        chain_order=CHAIN_ORDER,
        steps=steps,
        parameters=settings.as_dict(),
        baseline_check=common["baseline_check"],
        coregistration=coregistration,
        topographic_removal=topo.diagnostics(),
        coherence=magnitude,
        filtering=filter_diagnostics.as_dict(),
        atmosphere=atmosphere.as_dict(),
        unwrap=unwrap_diagnostics,
        los_scaling=common["los_scaling"],
        caveats=_chain_caveats("GUNW"),
    )
