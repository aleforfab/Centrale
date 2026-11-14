"""Radiometric gamma0-to-sigma0 normalization for NISAR GCOV windows.

Implements conversion from terrain-flattened gamma-nought backscatter (γ⁰) to
ellipsoidal/local sigma-nought backscatter (σ⁰) using the GCOV product's
``rtcGammaToSigmaFactor`` dataset before any smoothing, resampling, dB
conversion, differencing, or statistics.

Convention implemented (see ``docs/NORMALIZATION.md``):
    σ⁰ = γ⁰ × rtcGammaToSigmaFactor
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
from affine import Affine

from nisar.models import NormalizationInfo

logger = logging.getLogger(__name__)

NORMALIZATION_METHOD = "gamma_to_sigma_gcov_factor"
NORMALIZATION_SOURCE = "gcov.rtcGammaToSigmaFactor"


@dataclass(frozen=True)
class NormalizationProvenance:
    """Provenance metadata describing how a window or layer was normalized."""

    method: str = NORMALIZATION_METHOD
    factor_kind: str | None = None
    source: str = NORMALIZATION_SOURCE
    applied: bool = False
    warning: str | None = None

    def to_model(self) -> NormalizationInfo:
        """Convert to the Pydantic manifest model."""
        return NormalizationInfo(
            method=self.method,
            factor_kind=self.factor_kind,
            source=self.source,
            applied=self.applied,
            warning=self.warning,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-compatible dictionary."""
        return self.to_model().model_dump(mode="json")


@dataclass
class NormalizedWindow:
    """A GCOV window whose linear power has passed through gamma0->sigma0 normalization."""

    power: np.ndarray
    valid: np.ndarray
    transform: Affine | None
    crs: str
    spacing_m: float
    granule: str
    pol: str
    mask: np.ndarray | None = None
    normalization: NormalizationProvenance = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.power.dtype != np.float32:
            self.power = self.power.astype(np.float32)
        if self.valid.dtype != bool:
            self.valid = self.valid.astype(bool)
        if self.normalization is None:
            self.normalization = NormalizationProvenance()


def normalize_power(
    power: np.ndarray,
    factor: np.ndarray | float | None,
    *,
    valid: np.ndarray | None = None,
    granule: str = "unknown",
) -> tuple[np.ndarray, np.ndarray, NormalizationProvenance]:
    """Convert linear gamma0 power to sigma0 power using ``rtcGammaToSigmaFactor``.

    Non-finite, zero, or negative factor pixels are masked out (marked ``False``
    in ``valid`` and set to ``NaN`` in the output power array). When ``factor``
    is ``None``, a warning is logged and the input power is returned with
    ``applied=False``.
    """
    power_f32 = np.asarray(power, dtype=np.float32)
    base_valid = np.isfinite(power_f32) & (power_f32 > 0)
    if valid is not None:
        base_valid = base_valid & np.asarray(valid, dtype=bool)

    if factor is None:
        warning = (
            f"Missing rtcGammaToSigmaFactor for {granule}; "
            "leaving backscatter unnormalized (gamma0)"
        )
        logger.warning(warning)
        out_power = power_f32.copy()
        out_power[~base_valid] = np.nan
        return (
            out_power,
            base_valid,
            NormalizationProvenance(
                method=NORMALIZATION_METHOD,
                factor_kind=None,
                source=NORMALIZATION_SOURCE,
                applied=False,
                warning=warning,
            ),
        )

    if isinstance(factor, (int, float, np.floating, np.integer)) or (
        isinstance(factor, np.ndarray) and factor.ndim == 0
    ):
        factor_val = float(factor)
        if not np.isfinite(factor_val) or factor_val <= 0.0:
            warning = (
                f"Non-positive or non-finite scalar rtcGammaToSigmaFactor "
                f"({factor_val!r}) for {granule}; masking all pixels"
            )
            logger.warning(warning)
            return (
                np.full(power_f32.shape, np.nan, dtype=np.float32),
                np.zeros(power_f32.shape, dtype=bool),
                NormalizationProvenance(
                    method=NORMALIZATION_METHOD,
                    factor_kind="scalar",
                    source=NORMALIZATION_SOURCE,
                    applied=True,
                    warning=warning,
                ),
            )

        out_power = np.full(power_f32.shape, np.nan, dtype=np.float32)
        out_power[base_valid] = (
            power_f32[base_valid] * np.float32(factor_val)
        ).astype(np.float32)
        out_valid = base_valid & np.isfinite(out_power) & (out_power > 0)
        out_power[~out_valid] = np.nan
        return (
            out_power,
            out_valid,
            NormalizationProvenance(
                method=NORMALIZATION_METHOD,
                factor_kind="scalar",
                source=NORMALIZATION_SOURCE,
                applied=True,
            ),
        )

    if isinstance(factor, np.ndarray) and factor.ndim == 2:
        factor_arr = np.asarray(factor, dtype=np.float32)
        if factor_arr.shape != power_f32.shape:
            raise ValueError(
                f"rtcGammaToSigmaFactor grid shape {factor_arr.shape} does not match "
                f"power shape {power_f32.shape}"
            )
        factor_valid = np.isfinite(factor_arr) & (factor_arr > 0.0)
        masked_count = int(np.sum(base_valid & ~factor_valid))
        warning: str | None = None
        if masked_count > 0:
            warning = (
                f"Masked {masked_count} pixel(s) with non-finite or non-positive "
                f"rtcGammaToSigmaFactor in {granule}"
            )
            logger.warning(warning)

        combined_valid = base_valid & factor_valid
        out_power = np.full(power_f32.shape, np.nan, dtype=np.float32)
        out_power[combined_valid] = (
            power_f32[combined_valid] * factor_arr[combined_valid]
        ).astype(np.float32)
        out_valid = combined_valid & np.isfinite(out_power) & (out_power > 0)
        out_power[~out_valid] = np.nan
        return (
            out_power,
            out_valid,
            NormalizationProvenance(
                method=NORMALIZATION_METHOD,
                factor_kind="grid",
                source=NORMALIZATION_SOURCE,
                applied=True,
                warning=warning,
            ),
        )

    raise ValueError(
        f"Unsupported rtcGammaToSigmaFactor type/shape: {type(factor).__name__}"
    )


def apply_gamma_to_sigma(window: Any) -> NormalizedWindow:
    """Normalize a ``Window`` (or duck-typed window object) from gamma0 to sigma0.

    Calling this on an already-normalized ``NormalizedWindow`` is a no-op and
    returns it unchanged so downstream callers cannot double-normalize.
    """
    if isinstance(window, NormalizedWindow):
        return window

    granule = getattr(window, "granule", "unknown")
    factor = getattr(window, "rtc_gamma_to_sigma", None)
    raw_valid = getattr(window, "valid", None)

    sigma_power, valid, provenance = normalize_power(
        window.power,
        factor,
        valid=raw_valid,
        granule=granule,
    )
    return NormalizedWindow(
        power=sigma_power,
        valid=valid,
        transform=getattr(window, "transform", None),
        crs=getattr(window, "crs", ""),
        spacing_m=float(getattr(window, "spacing_m", 0.0)),
        granule=granule,
        pol=getattr(window, "pol", ""),
        mask=getattr(window, "mask", None),
        normalization=provenance,
    )


def combine_pair_normalization(
    pre: NormalizationProvenance,
    post: NormalizationProvenance,
) -> NormalizationProvenance:
    """Combine pre/post normalization provenance for difference and mask layers."""
    if pre.applied and post.applied:
        kind = pre.factor_kind if pre.factor_kind == post.factor_kind else "mixed"
        warnings = [w for w in (pre.warning, post.warning) if w]
        return NormalizationProvenance(
            method=NORMALIZATION_METHOD,
            factor_kind=kind,
            source=NORMALIZATION_SOURCE,
            applied=True,
            warning="; ".join(warnings) if warnings else None,
        )

    kinds = {p.factor_kind for p in (pre, post) if p.factor_kind is not None}
    factor_kind = next(iter(kinds)) if len(kinds) == 1 else ("mixed" if kinds else None)
    warnings = [w for w in (pre.warning, post.warning) if w]
    if not warnings:
        warnings.append("One or both acquisitions lacked rtcGammaToSigmaFactor")
    return NormalizationProvenance(
        method=NORMALIZATION_METHOD,
        factor_kind=factor_kind,
        source=NORMALIZATION_SOURCE,
        applied=False,
        warning="; ".join(warnings),
    )


def summarize_site_normalization(
    provenances: list[NormalizationProvenance],
) -> NormalizationProvenance:
    """Summarize normalization provenance across all layers/windows in a site build."""
    if not provenances:
        return NormalizationProvenance(applied=False)
    all_applied = all(item.applied for item in provenances)
    kinds = {item.factor_kind for item in provenances if item.factor_kind is not None}
    if not kinds:
        factor_kind = None
    elif len(kinds) == 1:
        factor_kind = next(iter(kinds))
    else:
        factor_kind = "mixed"
    warnings = list(dict.fromkeys(item.warning for item in provenances if item.warning))
    return NormalizationProvenance(
        method=NORMALIZATION_METHOD,
        factor_kind=factor_kind,
        source=NORMALIZATION_SOURCE,
        applied=all_applied,
        warning="; ".join(warnings) if warnings else None,
    )
