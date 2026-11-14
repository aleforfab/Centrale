"""Small shared numeric helpers for the proposed InSAR chain."""

from __future__ import annotations

import numpy as np


def wrap_phase(phase: np.ndarray) -> np.ndarray:
    """Wrap an unwrapped phase array into ``(-pi, pi]``."""

    return np.angle(np.exp(1j * np.asarray(phase, dtype=np.float64)))
