"""NISAR granule name parsing and validation."""

import re
from dataclasses import dataclass

# Regex pattern for NISAR granule names
# Based on Appendix A of CODEX_PLAN.md
NAME_RE = re.compile(
    r"^NISAR_(?P<inst>[LS])(?P<level>\d)_(?P<ptype>[A-Z]{2})_(?P<prod>[A-Z0-9]{4})"
    r"_(?P<cycle>\d{3})_(?P<track>\d{3})_(?P<dir>[AD])_(?P<frame>\d{3})"
    r"_(?P<mode>\d{4})_(?P<pol>[A-Z]{4})_(?P<source>[AM])"
    r"_(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})"
    r"_(?P<crid>[A-Z]\d{5})_(?P<acc>[PMNF])_(?P<cov>[FP])_(?P<loc>[A-Z])_(?P<ctr>\d{3})(?:\.h5)?$"
)


@dataclass(frozen=True)
class NisarGranuleName:
    """Parsed NISAR granule name components."""
    
    instrument: str  # L or S
    level: str  # digit
    ptype: str  # PR, UR, OD
    product: str  # e.g., GCOV
    cycle: int
    track: int
    direction: str  # A or D
    frame: int
    mode: str  # 4 digits
    pol_code: str  # e.g., DHDH
    source: str  # A or M
    start: str  # YYYYMMDDTHHMMSS
    end: str  # YYYYMMDDTHHMMSS
    crid: str  # e.g., P05023
    accuracy: str  # P, M, N, F
    coverage: str  # F or P
    loc: str  # e.g., J
    counter: int
    
    @property
    def stack_key(self) -> tuple[int, str, int]:
        """Return the stack key (track, direction, frame) for grouping."""
        return (self.track, self.direction, self.frame)
    
    @property
    def is_provisional(self) -> bool:
        """Check if this is a PROVISIONAL maturity product."""
        return self.crid.startswith("P")
    
    @property
    def is_beta(self) -> bool:
        """Check if this is a BETA maturity product."""
        return self.crid.startswith("X")
    
    @property
    def maturity(self) -> str:
        """Return maturity level based on CRID."""
        if self.is_provisional:
            return "PROVISIONAL"
        elif self.is_beta:
            return "BETA"
        return "UNKNOWN"
    
    @property
    def date(self) -> str:
        """Return the start date in YYYY-MM-DD format."""
        return f"{self.start[:4]}-{self.start[4:6]}-{self.start[6:8]}"
    
    @property
    def datetime_start(self) -> str:
        """Return full start datetime in ISO format."""
        return f"{self.start[:4]}-{self.start[4:6]}-{self.start[6:8]}T{self.start[9:11]}:{self.start[11:13]}:{self.start[13:15]}Z"
    
    @property
    def datetime_end(self) -> str:
        """Return full end datetime in ISO format."""
        return f"{self.end[:4]}-{self.end[4:6]}-{self.end[6:8]}T{self.end[9:11]}:{self.end[11:13]}:{self.end[13:15]}Z"
    
    def polarizations(self) -> list[str]:
        """Return the GCOV backscatter channels encoded by the granule mode."""
        # The mode in a granule name is not itself a raster polarization. For
        # example, NISAR's DHDH dual-pol products contain HHHH and HVHV datasets.
        # SHSH is the single-pol HH mode observed in the inspected ASF granule.
        pol_map = {
            "SHSH": ["HH"],
            "SVSV": ["VV"],
            "DHDH": ["HH", "HV"],
            "DVVH": ["VV"],
            "DHHV": ["HH", "HV"],
            "DVHV": ["VV", "HV"],
            "QHDV": ["HH", "HV", "VH", "VV"],
        }
        return pol_map.get(self.pol_code, [])


def parse_granule_name(name: str) -> NisarGranuleName:
    """
    Parse a NISAR granule name into its components.
    
    Args:
        name: The granule name string (with or without .h5 extension)
    
    Returns:
        NisarGranuleName dataclass with all parsed components
    
    Raises:
        ValueError: If the name doesn't match the expected pattern
    """
    name = name.removesuffix(".h5")
    
    match = NAME_RE.match(name)
    if not match:
        raise ValueError(
            f"Invalid NISAR granule name: '{name}'. "
            f"Expected format: NISAR_L2_PR_GCOV_004_122_D_067_4005_DHDH_A_20251106T160541_20251106T160622_X05009_N_F_J_001"
        )
    
    return NisarGranuleName(
        instrument=match.group("inst"),
        level=match.group("level"),
        ptype=match.group("ptype"),
        product=match.group("prod"),
        cycle=int(match.group("cycle")),
        track=int(match.group("track")),
        direction=match.group("dir"),
        frame=int(match.group("frame")),
        mode=match.group("mode"),
        pol_code=match.group("pol"),
        source=match.group("source"),
        start=match.group("start"),
        end=match.group("end"),
        crid=match.group("crid"),
        accuracy=match.group("acc"),
        coverage=match.group("cov"),
        loc=match.group("loc"),
        counter=int(match.group("ctr")),
    )


def validate_granule_name(name: str) -> bool:
    """
    Validate that a string is a valid NISAR granule name.
    
    Args:
        name: The granule name string
    
    Returns:
        True if valid, False otherwise
    """
    try:
        parse_granule_name(name)
        return True
    except ValueError:
        return False
