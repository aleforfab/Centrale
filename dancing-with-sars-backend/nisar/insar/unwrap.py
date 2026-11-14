"""Proposed 2D phase unwrapping with residue detection.

Algorithm: Itoh-style row/column integration of wrapped phase differences, with
a 2x2 loop-integral residue check before integration. Residues or conflicting
integration paths are flagged and the affected pixels are set to NaN. The
algorithm does not silently unwrap a field with unresolved branch cuts.

This is a synthetic-test implementation, not a validated production unwrapper.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .utils import wrap_phase

TWO_PI = 2.0 * math.pi


@dataclass(frozen=True)
class UnwrapResult:
    """Unwrapped phase array plus scalar flags for the chain dictionary."""

    unwrapped_phase: np.ndarray
    residue_count: int
    conflict_count: int
    resolved: bool
    algorithm: str = "Itoh 1982 row-major integration + residue detection"
    status: str = "proposed"

    def caveats(self) -> list[str]:
        if self.resolved:
            return [
                "No residues or integration conflicts were detected in this synthetic field.",
                "Not verified on real interferograms; scientific review required.",
            ]
        return [
            "Residues or integration conflicts were detected; affected pixels are NaN.",
            "No continuous unwrapped result is claimed for this field.",
        ]

    def as_dict(self) -> dict[str, object]:
        return {
            "resolved": self.resolved,
            "residue_count": self.residue_count,
            "conflict_count": self.conflict_count,
            "unwrapped_phase_available": bool(self.resolved),
            "algorithm": self.algorithm,
            "caveats": self.caveats(),
            "status": self.status,
        }


def wrapped_differences(wrapped_phase: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return wrapped x/y finite differences for a 2D wrapped phase array."""

    phase = np.asarray(wrapped_phase, dtype=np.float64)
    return (
        wrap_phase(np.diff(phase, axis=1)),
        wrap_phase(np.diff(phase, axis=0)),
    )


def detect_residues(wrapped_phase: np.ndarray) -> np.ndarray:
    """Return integer loop-integral residues for every 2x2 pixel loop."""

    dx, dy = wrapped_differences(wrapped_phase)
    loop = dx[:-1, :] + dy[:, 1:] - dx[1:, :] - dy[:, :-1]
    return np.rint(loop / TWO_PI).astype(np.int8)


def unwrap_phase(phase: np.ndarray) -> UnwrapResult:
    """Unwrap a phase array and flag unresolved residues/conflicts."""

    wrapped = wrap_phase(np.asarray(phase, dtype=np.float64))
    if wrapped.ndim != 2:
        raise ValueError("Phase must be a two-dimensional array")
    if not np.isfinite(wrapped).all():
        raise ValueError("Phase must contain only finite values")

    dx, dy = wrapped_differences(wrapped)
    residues = detect_residues(wrapped)
    residue_mask = np.zeros(wrapped.shape, dtype=bool)
    residue_mask[: residues.shape[0], : residues.shape[1]] = residues != 0
    residue_count = int(np.count_nonzero(residues))

    height, width = wrapped.shape
    unwrapped = np.full(wrapped.shape, np.nan, dtype=np.float64)
    conflict_mask = np.zeros(wrapped.shape, dtype=bool)
    unwrapped[0, 0] = wrapped[0, 0]

    for column in range(1, width):
        unwrapped[0, column] = unwrapped[0, column - 1] + dx[0, column - 1]
    for row in range(1, height):
        unwrapped[row, 0] = unwrapped[row - 1, 0] + dy[row - 1, 0]

    for row in range(1, height):
        for column in range(1, width):
            from_left = unwrapped[row, column - 1] + dx[row, column - 1]
            from_top = unwrapped[row - 1, column] + dy[row - 1, column]
            branch_offset = np.rint((from_top - from_left) / TWO_PI)
            if branch_offset != 0:
                conflict_mask[row, column] = True
            unwrapped[row, column] = from_left

    conflict_count = int(np.count_nonzero(conflict_mask))
    resolved = bool(residue_count == 0 and conflict_count == 0)
    if not resolved:
        unwrapped[residue_mask | conflict_mask] = np.nan

    return UnwrapResult(
        unwrapped_phase=unwrapped,
        residue_count=residue_count,
        conflict_count=conflict_count,
        resolved=resolved,
    )
