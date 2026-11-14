"""Phase-capable source adapters (proposed only).

The current product pipeline reads NISAR GCOV, which is detected radiometrically
terrain-corrected backscatter and carries no interferometric phase. This module
describes the source shapes a future InSAR chain would need: GUNW-style
geocoded unwrapped interferograms, SLC pairs for a local chain, and a clearly
marked external interferogram-service hook.

No adapter performs a network request in tests. The HTTPS/S3 code path exists
for a future deployment with Earthdata credentials; tests use local synthetic
HDF5 fixtures generated under ``tests/fixtures``.
"""

from __future__ import annotations

import io
import re
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Protocol

import h5py
import numpy as np

PROPOSED = "proposed"
CRID_RE = re.compile(r"(?<![A-Za-z0-9])([PX]\d{5})(?![A-Za-z0-9])")


class ProductKind(str, Enum):
    """Recognised phase-capable or phase-related product families."""

    GUNW = "gunw"
    GSLC = "gslc"
    SLC = "slc"
    HYP3 = "hyp3"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ProductIdentity:
    """Non-scientific identity metadata for a proposed InSAR source."""

    name: str
    kind: ProductKind
    crid: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)

    @property
    def status(self) -> str:
        return PROPOSED

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind.value,
            "crid": self.crid,
            "status": self.status,
            "attributes": {key: str(value) for key, value in self.attributes.items()},
        }


def extract_crid(name: str, attributes: dict[str, Any] | None = None) -> str | None:
    """Extract a NISAR-like CRID from a filename or product attributes."""

    upper_name = name.upper()
    match = CRID_RE.search(upper_name)
    if match:
        return match.group(1)
    if not attributes:
        return None
    for key in ("CRID", "crid", "processing_id", "ProcessingID"):
        value = attributes.get(key)
        if value is None:
            continue
        text = str(value).upper()
        candidate = CRID_RE.search(text)
        if candidate:
            return candidate.group(1)
    return None


def detect_product_kind(name: str, attributes: dict[str, Any] | None = None) -> ProductKind:
    """Detect a proposed source family from filename/attribute conventions."""

    upper_name = name.upper()
    normalised = {
        str(key).upper(): str(value).upper()
        for key, value in (attributes or {}).items()
    }
    declared = normalised.get("PRODUCT") or normalised.get("PRODUCT_TYPE") or ""
    if "_GUNW_" in upper_name or declared == "GUNW" or "UNWRAPPED_INTERFEROGRAM" in declared:
        return ProductKind.GUNW
    if "_GSLC_" in upper_name or declared == "GSLC":
        return ProductKind.GSLC
    if "HYP3" in upper_name or "HYP3" in declared or "INSAR_GAMMA" in declared:
        return ProductKind.HYP3
    if "_SLC_" in upper_name or declared == "SLC":
        return ProductKind.SLC
    return ProductKind.UNKNOWN


def detect_product_identity(
    name: str,
    attributes: dict[str, Any] | None = None,
) -> ProductIdentity:
    """Return the proposed identity for a phase-capable source."""

    attrs = dict(attributes or {})
    return ProductIdentity(
        name=name,
        kind=detect_product_kind(name, attrs),
        crid=extract_crid(name, attrs),
        attributes=attrs,
    )


@dataclass(frozen=True)
class EarthdataAuth:
    """Credential carrier for a future HTTPS code path; never populated in tests."""

    token: str | None = None
    username: str | None = None
    password: str | None = None

    def authorization_header(self) -> dict[str, str]:
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}


def open_earthdata_url(url: str, auth: EarthdataAuth | None = None, timeout: float = 30.0) -> bytes:
    """Read an HTTPS product with a bearer token.

    This is a deployment code path only. It is deliberately not exercised by
    the synthetic test suite and no credentials are stored in this repository.
    """

    headers = auth.authorization_header() if auth else {}
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def read_phase_bytes(source: str | Path, auth: EarthdataAuth | None = None) -> bytes:
    """Read local, HTTPS or S3 product bytes without a service-specific SDK."""

    text = str(source)
    if text.startswith(("http://", "https://")):
        return open_earthdata_url(text, auth)
    if text.startswith("s3://"):
        import fsspec

        with fsspec.open(text, "rb", anon=False) as handle:
            return handle.read()
    return Path(source).read_bytes()


@dataclass
class PhaseProduct:
    """GUNW-style arrays loaded from a proposed phase-capable source."""

    kind: ProductKind
    status: str = PROPOSED
    unwrapped_phase: np.ndarray | None = None
    coherence: np.ndarray | None = None
    incidence_angle: np.ndarray | float | None = None
    wavelength_m: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def diagnostics(self) -> dict[str, Any]:
        """Return scalar-only diagnostics; arrays are never a user-facing result."""

        return {
            "status": self.status,
            "kind": self.kind.value,
            "has_unwrapped_phase": self.unwrapped_phase is not None,
            "has_coherence": self.coherence is not None,
            "wavelength_m": self.wavelength_m,
            "metadata": {key: str(value) for key, value in self.metadata.items()},
            "verified_on_real_data": False,
        }


@dataclass
class SlcPair:
    """Complex SLC pair for a proposed local interferometric chain."""

    reference: np.ndarray
    secondary: np.ndarray
    wavelength_m: float
    status: str = PROPOSED
    metadata: dict[str, Any] = field(default_factory=dict)

    def diagnostics(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "shape": list(self.reference.shape),
            "wavelength_m": self.wavelength_m,
            "metadata": {key: str(value) for key, value in self.metadata.items()},
            "verified_on_real_data": False,
        }


class SourceAdapter(Protocol):
    """Interface every proposed phase-capable source adapter follows."""

    def load(self, source: str | Path, auth: EarthdataAuth | None = None) -> PhaseProduct | SlcPair:
        """Load a phase-capable product from a local path or future remote URL."""


class GunwHdf5Adapter:
    """Read a synthetic GUNW-like HDF5 interferogram.

    Expected datasets: ``unwrappedPhase``, ``coherence`` and optional
    ``incidenceAngle``. Expected attributes include ``wavelength_m``. Real GUNW
    layouts must be confirmed before this adapter is used outside tests.
    """

    kind = ProductKind.GUNW

    def load(self, source: str | Path, auth: EarthdataAuth | None = None) -> PhaseProduct:
        payload = read_phase_bytes(source, auth)
        with h5py.File(io.BytesIO(payload), "r") as handle:
            phase = np.asarray(handle["unwrappedPhase"][()], dtype=np.float64)
            coherence = np.asarray(handle["coherence"][()], dtype=np.float64)
            incidence = (
                np.asarray(handle["incidenceAngle"][()])
                if "incidenceAngle" in handle
                else None
            )
            wavelength = float(handle.attrs.get("wavelength_m", 0.24))
            metadata = {
                key: str(handle.attrs[key])
                for key in handle.attrs
                if key != "wavelength_m"
            }
        identity = detect_product_identity(Path(source).name, metadata)
        metadata.update(identity.as_dict())
        return PhaseProduct(
            kind=ProductKind.GUNW,
            unwrapped_phase=phase,
            coherence=coherence,
            incidence_angle=incidence,
            wavelength_m=wavelength,
            metadata=metadata,
        )


class SlcPairAdapter:
    """Read a synthetic complex SLC pair from HDF5 (no network in tests)."""

    kind = ProductKind.SLC

    def load(self, source: str | Path, auth: EarthdataAuth | None = None) -> SlcPair:
        payload = read_phase_bytes(source, auth)
        with h5py.File(io.BytesIO(payload), "r") as handle:
            reference = np.asarray(handle["reference"][()], dtype=np.complex128)
            secondary = np.asarray(handle["secondary"][()], dtype=np.complex128)
            wavelength = float(handle.attrs.get("wavelength_m", 0.24))
            metadata = {
                key: str(handle.attrs[key])
                for key in handle.attrs
                if key != "wavelength_m"
            }
        identity = detect_product_identity(Path(source).name, metadata)
        metadata.update(identity.as_dict())
        return SlcPair(
            reference=reference,
            secondary=secondary,
            wavelength_m=wavelength,
            metadata=metadata,
        )


class ExternalInterferogramService(Protocol):
    """HyP3-style service hook; no implementation or dependency is bundled."""

    def submit(self, request: dict[str, Any]) -> str:
        """Return an opaque job id for a future external interferogram."""

    def fetch(self, job_id: str, auth: EarthdataAuth | None = None) -> PhaseProduct:
        """Fetch a finished interferogram; never called by the static API."""


@dataclass
class Hyp3StyleServiceHook:
    """Callable-backed placeholder for a future external interferogram service."""

    submit_fn: Callable[[dict[str, Any]], str]
    fetch_fn: Callable[[str, EarthdataAuth | None], PhaseProduct]
    label: str = "HyP3-style external interferogram service (proposed)"

    def submit(self, request: dict[str, Any]) -> str:
        return self.submit_fn(request)

    def fetch(self, job_id: str, auth: EarthdataAuth | None = None) -> PhaseProduct:
        return self.fetch_fn(job_id, auth)
