"""Pydantic models for NISAR processing pipeline."""

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class SiteConfig(BaseModel):
    """Configuration for a site (from YAML file)."""
    
    id: str = Field(..., description="Site ID (slug)")
    title: str = Field(..., description="Short title for display")
    event_type: str = Field(..., description="Event type: flood | fire | agriculture | wetland | other")
    description: str = Field(..., description="Plain language description")
    caveat: str = Field(..., description="What this does NOT show")
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    stack: dict[str, Any] = Field(..., description="Stack configuration")
    polarizations: list[str] = Field(..., description="List of polarizations")
    smoothing_px: int = Field(default=3, ge=1, description="Boxcar smoothing kernel size (odd)")
    thresholds_db: list[float] = Field(default=[2.0, 3.0, 6.0], description="Precomputed mask levels")
    default_threshold_db: float = Field(default=3.0, description="Default threshold")
    pairs: list[dict[str, Any]] = Field(default_factory=list, description="Curated before→after comparisons")
    tiles: dict[str, Any] = Field(default_factory=dict, description="Tile configuration")
    
    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, v: list[float]) -> list[float]:
        """Validate bbox coordinates."""
        if len(v) != 4:
            raise ValueError("bbox must have 4 values: [min_lon, min_lat, max_lon, max_lat]")
        min_lon, min_lat, max_lon, max_lat = v
        if not (-180 <= min_lon < max_lon <= 180):
            raise ValueError("Invalid longitude range")
        if not (-90 <= min_lat < max_lat <= 90):
            raise ValueError("Invalid latitude range")
        return v
    
    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        """Validate event type."""
        valid_types = ["flood", "fire", "agriculture", "wetland", "other"]
        if v not in valid_types:
            raise ValueError(f"event_type must be one of {valid_types}, got {v}")
        return v
    
    @field_validator("smoothing_px")
    @classmethod
    def validate_smoothing_px(cls, v: int) -> int:
        """Validate smoothing_px is odd."""
        if v % 2 == 0:
            raise ValueError("smoothing_px must be odd")
        return v
    
    @field_validator("thresholds_db")
    @classmethod
    def validate_thresholds_db(cls, v: list[float]) -> list[float]:
        """Validate thresholds are ascending and positive."""
        if len(v) == 0:
            raise ValueError("thresholds_db must have at least one value")
        if not all(t > 0 for t in v):
            raise ValueError("All thresholds must be positive")
        if v != sorted(v):
            raise ValueError("thresholds_db must be in ascending order")
        return v
    
    @model_validator(mode="after")
    def validate_default_threshold(self) -> "SiteConfig":
        """Validate that default_threshold_db is in thresholds_db."""
        if self.default_threshold_db not in self.thresholds_db:
            raise ValueError(f"default_threshold_db ({self.default_threshold_db}) must be in thresholds_db")
        return self


class StackConfig(BaseModel):
    """Stack configuration."""
    
    track: int = Field(..., ge=1, le=173, description="Track number")
    frame: int = Field(..., ge=1, le=176, description="Frame number")
    direction: str = Field(..., pattern="^[AD]$", description="A or D")
    maturity: str = Field(default="PROVISIONAL", description="Data maturity")


class PairConfig(BaseModel):
    """A pair configuration."""
    
    id: str = Field(..., description="Pair ID")
    pre: str = Field(..., description="Pre-event date (YYYYMMDD)")
    post: str = Field(..., description="Post-event date (YYYYMMDD)")
    label: str = Field(..., description="Human-readable label")
    
    @model_validator(mode="after")
    def validate_dates(self) -> "PairConfig":
        """Validate that pre < post."""
        if self.pre >= self.post:
            raise ValueError("pre date must be before post date")
        return self


class TileConfig(BaseModel):
    """Tile configuration."""
    
    min_zoom: int = Field(default=8, ge=0, le=24, description="Minimum zoom level")
    max_zoom: int = Field(default=14, ge=0, le=24, description="Maximum zoom level")
    budget_mb: float = Field(default=120, ge=1, description="Tile budget in MB")
    
    @model_validator(mode="after")
    def validate_zooms(self) -> "TileConfig":
        """Validate that min_zoom <= max_zoom."""
        if self.min_zoom > self.max_zoom:
            raise ValueError("min_zoom must be <= max_zoom")
        return self


# Manifest models
class NormalizationInfo(BaseModel):
    """Radiometric normalization provenance."""

    method: str = Field(..., description="Normalization method identifier")
    factor_kind: str | None = Field(
        default=None,
        description="Kind of factor applied: scalar | grid | mixed | None",
    )
    source: str = Field(
        default="gcov.rtcGammaToSigmaFactor",
        description="Source dataset for normalization factor",
    )
    applied: bool = Field(..., description="Whether normalization was applied")
    warning: str | None = Field(
        default=None,
        description="Warning recorded when normalization was skipped or masked pixels",
    )


class SourceInfo(BaseModel):
    """Source information for a site."""
    
    mission: str = Field(default="NISAR", description="Mission name")
    band: str = Field(default="L", description="Frequency band")
    product: str = Field(default="GCOV", description="Product type")
    maturity: str = Field(..., description="Data maturity")
    crid: str = Field(..., description="CRID")
    frequency: str = Field(default="A", description="Frequency A or B")
    pixel_spacing_m: float = Field(..., description="Pixel spacing in meters")
    crs: str = Field(..., description="Coordinate reference system")
    normalization: NormalizationInfo | None = Field(
        default=None,
        description="Summary radiometric normalization provenance",
    )


class SiteInfo(BaseModel):
    """Site information in manifest."""
    
    id: str = Field(..., description="Site ID")
    title: str = Field(..., description="Site title")
    event_type: str = Field(..., description="Event type")
    description: str = Field(..., description="Site description")
    caveat: str = Field(..., description="Caveat")
    bbox: list[float] = Field(..., description="Bounding box")
    center: list[float] = Field(..., description="Center coordinates [lon, lat]")


class KnownGap(BaseModel):
    """A known data gap."""
    
    start: str = Field(..., description="Start of gap (ISO format)")
    end: str = Field(..., description="End of gap (ISO format)")
    reason: str = Field(..., description="Reason for gap")


class Acquisition(BaseModel):
    """An acquisition in the stack."""
    
    granule: str = Field(..., description="Granule name")
    cycle: int = Field(..., description="Cycle number")
    date: str = Field(..., description="Date in YYYY-MM-DD")
    start: str = Field(..., description="Start datetime (ISO)")
    end: str = Field(..., description="End datetime (ISO)")
    crid: str = Field(..., description="CRID")
    coverage: str = Field(..., description="Coverage (F or P)")
    polarizations: list[str] = Field(..., description="Available polarizations")
    download_url: str | None = Field(default=None, description="Download URL")
    links: dict[str, str] = Field(default_factory=dict, description="Links to external resources")


class PolarizationInfo(BaseModel):
    """Polarization information."""
    
    pol: str = Field(..., description="Polarization (HH, HV, VV)")
    stretch_db: list[float] = Field(..., description="Display stretch [min, max] in dB")


class Layer(BaseModel):
    """A layer definition."""
    
    id: str = Field(..., description="Layer ID")
    kind: str = Field(..., description="Kind: backscatter | difference | change_mask")
    title: str | None = Field(default=None, description="Display title")
    pol: str | None = Field(default=None, description="Polarization")
    date: str | None = Field(default=None, description="Date (for backscatter)")
    pair_id: str | None = Field(default=None, description="Pair ID (for difference/mask)")
    threshold_db: float | None = Field(default=None, description="Threshold in dB (for mask)")
    sign: str | None = Field(default=None, description="Sign: increase | decrease (for mask)")
    tile_url_template: str = Field(..., description="Tile URL template")
    min_zoom: int = Field(..., description="Minimum zoom")
    max_zoom: int = Field(..., description="Maximum zoom")
    legend: str | None = Field(default=None, description="Legend text")
    normalization: NormalizationInfo | None = Field(
        default=None,
        description="Radiometric normalization provenance",
    )
    
    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        """Validate layer kind."""
        valid_kinds = ["backscatter", "difference", "change_mask"]
        if v not in valid_kinds:
            raise ValueError(f"kind must be one of {valid_kinds}, got {v}")
        return v
    
    @field_validator("sign")
    @classmethod
    def validate_sign(cls, v: str | None) -> str | None:
        """Validate sign."""
        if v is None:
            return v
        valid_signs = ["increase", "decrease"]
        if v not in valid_signs:
            raise ValueError(f"sign must be one of {valid_signs}, got {v}")
        return v


class PairStatsModel(BaseModel):
    """Statistics for a pair at a specific threshold."""
    
    valid_pixels: int = Field(..., description="Number of valid pixels")
    valid_fraction_of_bbox: float = Field(..., description="Fraction of bbox that is valid")
    decrease_km2: float = Field(..., description="Area of decrease in km²")
    increase_km2: float = Field(..., description="Area of increase in km²")
    decrease_pct: float = Field(..., description="Percentage of valid area decreased")
    increase_pct: float = Field(..., description="Percentage of valid area increased")
    sigma_db: float = Field(..., description="Noise estimate in dB")
    median_diff_db: float = Field(..., description="Median difference in dB")
    histogram: list[int] = Field(..., description="Histogram counts (60 bins)")
    resampled: bool = Field(default=False, description="Whether grids were resampled")


class PairManifest(BaseModel):
    """A pair in the manifest."""
    
    id: str = Field(..., description="Pair ID")
    pre: str = Field(..., description="Pre-event date")
    post: str = Field(..., description="Post-event date")
    label: str = Field(..., description="Human-readable label")
    stats: dict[str, dict[str, PairStatsModel]] = Field(
        default_factory=dict,
        description="Stats per polarization and threshold"
    )


class Manifest(BaseModel):
    """Full manifest for a site."""
    
    schema_version: int = Field(default=1, description="Schema version")
    site: SiteInfo = Field(..., description="Site information")
    source: SourceInfo = Field(..., description="Source information")
    stack: dict[str, Any] = Field(..., description="Stack information")
    known_gaps: list[KnownGap] = Field(default_factory=list, description="Known data gaps")
    acquisitions: list[Acquisition] = Field(default_factory=list, description="List of acquisitions")
    polarizations: list[PolarizationInfo] = Field(
        default_factory=list,
        description="Polarization information"
    )
    layers: list[Layer] = Field(default_factory=list, description="List of layers")
    pairs: list[PairManifest] = Field(default_factory=list, description="List of pairs")
    timeseries: dict[str, Any] = Field(
        default_factory=dict,
        description="Time series reference"
    )
    generated_at: str = Field(..., description="Generation timestamp (ISO)")
    pipeline_version: str = Field(..., description="Pipeline version")


# API response models
class SiteSummary(BaseModel):
    """Summary of a site for the /api/sites endpoint."""
    
    id: str = Field(..., description="Site ID")
    title: str = Field(..., description="Site title")
    event_type: str = Field(..., description="Event type")
    bbox: list[float] = Field(..., description="Bounding box")
    center: list[float] = Field(..., description="Center coordinates")
    source: dict[str, Any] = Field(..., description="Source information")
    date_range: list[str] = Field(..., description="Date range [start, end]")
    acquisition_count: int = Field(..., description="Number of acquisitions")
    pairs: list[dict[str, Any]] = Field(default_factory=list, description="List of pairs")


class DataStatusResponse(BaseModel):
    """Response for /api/data-status endpoint."""
    
    primary_mission: str = Field(default="NISAR", description="Primary mission")
    nisar_ready: bool = Field(..., description="Whether NISAR data is ready")
    active_source: str = Field(..., description="Active data source")
    message: str = Field(..., description="Status message")
    sites_count: int = Field(default=0, description="Number of sites")


class TimeSeriesResponse(BaseModel):
    """Response for /api/sites/{id}/timeseries endpoint."""
    
    date: str = Field(..., description="Date in YYYY-MM-DD")
    cycle: int = Field(..., description="Cycle number")
    backscatter_db: float = Field(..., description="Mean backscatter in dB")
    n_valid: int = Field(..., description="Number of valid pixels")
    maturity: str = Field(..., description="Data maturity")
