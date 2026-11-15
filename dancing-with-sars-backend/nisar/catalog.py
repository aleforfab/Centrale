"""ASF catalog search and NISAR granule discovery."""

import json
import logging
from typing import Any

import shapely
from shapely.geometry import Polygon

from nisar.naming import NisarGranuleName, parse_granule_name

logger = logging.getLogger(__name__)

# Known instrument data gap
KNOWN_GAPS = [
    {
        "start": "2026-07-27T22:03:25Z",
        "end": "2026-08-10T00:55:27Z",
        "reason": "NISAR instrument data gap",
    }
]


class GranuleInfo:
    """Information about a discovered NISAR granule."""
    
    def __init__(
        self,
        granule_name: str,
        properties: dict[str, Any],
        geometry: shapely.Geometry | None = None,
        urls: list[str] | None = None,
    ):
        self.granule_name = granule_name
        self.properties = properties
        self.geometry = geometry
        self.urls = urls or []
        self._parsed: NisarGranuleName | None = None
    
    @property
    def parsed(self) -> NisarGranuleName:
        """Parse and cache the granule name."""
        if self._parsed is None:
            self._parsed = parse_granule_name(self.granule_name)
        return self._parsed
    
    @property
    def stack_key(self) -> tuple[int, str, int]:
        """Get the stack key for this granule."""
        return self.parsed.stack_key
    
    @property
    def maturity(self) -> str:
        """Get maturity level."""
        return self.parsed.maturity
    
    @property
    def date(self) -> str:
        """Get date in YYYY-MM-DD format."""
        return self.parsed.date
    
    @property
    def datetime_start(self) -> str:
        """Get start datetime in ISO format."""
        return self.parsed.datetime_start
    
    @property
    def cycle(self) -> int:
        """Get cycle number."""
        return self.parsed.cycle
    
    def contains_bbox(self, bbox: list[float]) -> bool:
        """Check if this granule's footprint fully contains the bbox."""
        if self.geometry is None:
            return False
        
        bbox_poly = Polygon([
            (bbox[0], bbox[1]),
            (bbox[2], bbox[1]),
            (bbox[2], bbox[3]),
            (bbox[0], bbox[3]),
            (bbox[0], bbox[1]),
        ])
        
        try:
            return self.geometry.contains(bbox_poly)
        except (shapely.errors.GEOSException, TypeError, ValueError) as exc:
            logger.warning("Error checking bbox containment: %s", exc)
            return False
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "granule": self.granule_name,
            "cycle": self.cycle,
            "date": self.date,
            "start": self.datetime_start,
            "end": self.parsed.datetime_end,
            "crid": self.parsed.crid,
            "maturity": self.maturity,
            "coverage": self.parsed.coverage,
            "track": self.parsed.track,
            "frame": self.parsed.frame,
            "direction": self.parsed.direction,
            "polarizations": self.parsed.polarizations(),
            "download_url": self.urls[0] if self.urls else None,
        }


class Stack:
    """A stack of granules sharing the same track/frame/direction."""
    
    def __init__(
        self,
        track: int,
        frame: int,
        direction: str,
    ):
        self.track = track
        self.frame = frame
        self.direction = direction
        self.granules: list[GranuleInfo] = []
    
    @property
    def stack_key(self) -> tuple[int, str, int]:
        """Get the stack key."""
        return (self.track, self.direction, self.frame)
    
    @property
    def count(self) -> int:
        """Get the number of granules in this stack."""
        return len(self.granules)
    
    @property
    def dates(self) -> list[str]:
        """Get sorted list of acquisition dates."""
        return sorted(g.date for g in self.granules)
    
    @property
    def cycles(self) -> list[int]:
        """Get sorted list of cycle numbers."""
        return sorted(g.cycle for g in self.granules)
    
    @property
    def crids(self) -> list[str]:
        """Get unique CRIDs."""
        return sorted({g.parsed.crid for g in self.granules})
    
    @property
    def maturities(self) -> list[str]:
        """Get unique maturities."""
        return sorted({g.maturity for g in self.granules})
    
    @property
    def coverage_types(self) -> list[str]:
        """Get unique coverage types."""
        return sorted({g.parsed.coverage for g in self.granules})
    
    @property
    def modes(self) -> list[str]:
        """Get unique modes."""
        return sorted({g.parsed.mode for g in self.granules})
    
    @property
    def pol_codes(self) -> list[str]:
        """Get unique polarization codes."""
        return sorted({g.parsed.pol_code for g in self.granules})
    
    def add_granule(self, granule: GranuleInfo) -> None:
        """Add a granule to this stack."""
        self.granules.append(granule)
    
    def get_granules_for_bbox(self, bbox: list[float]) -> list[GranuleInfo]:
        """Get granules that fully contain the bbox."""
        return [g for g in self.granules if g.contains_bbox(bbox)]
    
    def check_missing_cycles(self, expected_cycles: list[int]) -> list[int]:
        """Check for missing cycles in the expected range."""
        present_cycles = set(self.cycles)
        return [c for c in expected_cycles if c not in present_cycles]
    
    def overlaps_data_gap(self) -> bool:
        """Check if any granule overlaps the known data gap."""
        for granule in self.granules:
            start = granule.datetime_start
            end = granule.parsed.datetime_end
            for gap in KNOWN_GAPS:
                if start <= gap["end"] and end >= gap["start"]:
                    return True
        return False
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "track": self.track,
            "frame": self.frame,
            "direction": self.direction,
            "granule_count": self.count,
            "dates": self.dates,
            "cycles": self.cycles,
            "crids": self.crids,
            "maturities": self.maturities,
            "coverage_types": self.coverage_types,
            "modes": self.modes,
            "pol_codes": self.pol_codes,
            "overlaps_data_gap": self.overlaps_data_gap(),
        }


def bbox_to_wkt(bbox: list[float]) -> str:
    """Convert bbox to WKT polygon string."""
    min_lon, min_lat, max_lon, max_lat = bbox
    return (
        f"POLYGON(("
        f"{min_lon} {min_lat}, "
        f"{max_lon} {min_lat}, "
        f"{max_lon} {max_lat}, "
        f"{min_lon} {max_lat}, "
        f"{min_lon} {min_lat}))"
    )


def search_gcov(
    bbox: list[float],
    start: str,
    end: str,
    maturity: str = "PROVISIONAL",
    max_results: int = 500,
) -> list[GranuleInfo]:
    """
    Search ASF for NISAR GCOV granules.
    
    Args:
        bbox: [min_lon, min_lat, max_lon, max_lat]
        start: Start date in YYYY-MM-DD format
        end: End date in YYYY-MM-DD format
        maturity: Data maturity (PROVISIONAL or BETA)
        max_results: Maximum number of results to return
    
    Returns:
        List of GranuleInfo objects
    
    Raises:
        RuntimeError: If ASF search fails
    """
    try:
        import asf_search as asf
    except ImportError as e:
        raise RuntimeError("asf_search package is required for NISAR discovery") from e
    
    wkt_polygon = bbox_to_wkt(bbox)
    
    # Map maturity to ASF dataMaturity values
    maturity_map = {
        "PROVISIONAL": "PROVISIONAL",
        "BETA": "BETA",
    }
    asf_maturity = maturity_map.get(maturity.upper(), "PROVISIONAL")
    
    try:
        results = asf.search(
            dataset="NISAR",
            processingLevel="GCOV",
            dataMaturity=asf_maturity,
            intersectsWith=wkt_polygon,
            start=start,
            end=end,
            maxResults=max_results,
        )
    except Exception as e:
        logger.error(f"ASF search failed: {e}")
        raise RuntimeError(f"ASF search failed: {e}") from e
    
    granules = []
    for r in results:
        props = r.properties
        scene_name = props.get("sceneName", "Unknown")
        
        # Only process NISAR granules
        if not scene_name.startswith("NISAR_"):
            continue
        
        # Get geometry if available.
        # asf_search returns `geometry` as a GeoJSON-style dict; older callers
        # and tests may still pass WKT. Both are accepted so a real search never
        # silently degrades to geometry=None, which would make every stack fail
        # the bbox filter in group_into_stacks().
        geometry = None
        raw_geometry = getattr(r, "geometry", None)
        if raw_geometry:
            try:
                if isinstance(raw_geometry, dict):
                    geometry = shapely.geometry.shape(raw_geometry)
                else:
                    geometry = shapely.from_wkt(raw_geometry)
            except (AttributeError, shapely.errors.GEOSException, TypeError, ValueError) as exc:
                logger.warning("Unable to parse NISAR footprint: %s", exc)
        
        # Get URLs
        urls = []
        if hasattr(r, "get_urls"):
            urls = r.get_urls()
        
        granule_info = GranuleInfo(
            granule_name=scene_name,
            properties=props,
            geometry=geometry,
            urls=urls,
        )
        granules.append(granule_info)
    
    return granules


def group_into_stacks(
    granules: list[GranuleInfo],
    bbox: list[float] | None = None,
) -> list[Stack]:
    """
    Group granules into stacks by track/frame/direction.
    
    Args:
        granules: List of GranuleInfo objects
        bbox: Optional bbox to filter stacks that contain it
    
    Returns:
        List of Stack objects
    """
    stacks: dict[tuple[int, str, int], Stack] = {}
    
    for granule in granules:
        key = granule.stack_key
        if key not in stacks:
            stacks[key] = Stack(
                track=key[0],
                frame=key[2],
                direction=key[1],
            )
        stacks[key].add_granule(granule)
    
    result = list(stacks.values())
    
    # Sort by number of granules (descending)
    result.sort(key=lambda s: s.count, reverse=True)
    
    # Filter by bbox if provided
    if bbox is not None:
        result = [
            s for s in result
            if len(s.get_granules_for_bbox(bbox)) > 0
        ]
    
    return result


def discover_stacks(
    bbox: list[float],
    start: str,
    end: str,
    maturity: str = "PROVISIONAL",
    max_results: int = 500,
    allow_high_latitude: bool = False,
) -> list[Stack]:
    """
    Discover NISAR GCOV stacks for a given bbox and date range.
    
    Args:
        bbox: [min_lon, min_lat, max_lon, max_lat]
        start: Start date in YYYY-MM-DD format
        end: End date in YYYY-MM-DD format
        maturity: Data maturity (PROVISIONAL or BETA)
        max_results: Maximum number of results to return
        allow_high_latitude: Whether to allow bboxes above 60° latitude
    
    Returns:
        List of Stack objects
    
    Raises:
        ValueError: If bbox is at high latitude without allow_high_latitude
    """
    # Check latitude
    min_lat, max_lat = bbox[1], bbox[3]
    if abs(min_lat) > 60 or abs(max_lat) > 60:
        if not allow_high_latitude:
            raise ValueError(
                f"bbox latitude out of range for PROVISIONAL products: "
                f"{min_lat} to {max_lat}. Use --allow-high-latitude to override."
            )
        logger.warning(
            f"High latitude bbox ({min_lat} to {max_lat}) may have ionospheric issues"
        )
    
    # Search for granules
    granules = search_gcov(
        bbox=bbox,
        start=start,
        end=end,
        maturity=maturity,
        max_results=max_results,
    )
    
    # Group into stacks
    stacks = group_into_stacks(granules, bbox)
    
    return stacks


def format_stack_table(stacks: list[Stack]) -> str:
    """Format stacks as a markdown table."""
    if not stacks:
        return "No stacks found."
    
    lines = []
    lines.append("| Rank | Track | Frame | Dir | Count | Dates | CRIDs | Maturities | Overlaps Gap |")
    lines.append("|------|-------|-------|-----|-------|-------|-------|------------|--------------|")
    
    for i, stack in enumerate(stacks, 1):
        dates_str = ", ".join(stack.dates[:3])
        if len(stack.dates) > 3:
            dates_str += f" ... (+{len(stack.dates) - 3} more)"
        
        crids_str = ", ".join(stack.crids)
        maturities_str = ", ".join(stack.maturities)
        gap_str = "Yes" if stack.overlaps_data_gap() else "No"
        
        lines.append(
            f"| {i} | {stack.track:03d} | {stack.frame:03d} | {stack.direction} | "
            f"{stack.count:3d} | {dates_str} | {crids_str} | {maturities_str} | {gap_str} |"
        )
    
    return "\n".join(lines)


def save_stacks_json(stacks: list[Stack], path: str) -> None:
    """Save stacks to JSON file."""
    data = [stack.to_dict() for stack in stacks]
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
