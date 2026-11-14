from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


def validate_bbox(value: list[float]) -> list[float]:
    if len(value) != 4:
        raise ValueError("bbox must contain [min_lon, min_lat, max_lon, max_lat]")
    min_lon, min_lat, max_lon, max_lat = value
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise ValueError("bbox coordinates are invalid or out of bounds")
    return value


class DateRangeModel(BaseModel):
    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date >= self.end_date:
            raise ValueError("start_date must be earlier than end_date")
        return self


class ChangeDetectionRequest(BaseModel):
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    pre_start: date = Field(..., example="2018-10-01")
    pre_end: date = Field(..., example="2018-11-07")
    post_start: date = Field(..., example="2018-11-09")
    post_end: date = Field(..., example="2018-12-15")
    polarization: str = Field(default="VH", pattern="^(VH|VV|HH|HV)$")
    threshold_db: float = Field(default=-3.0, ge=-20, le=20)
    orbit_pass: str | None = Field(default="DESCENDING", pattern="^(ASCENDING|DESCENDING)$")

    _validate_bbox = field_validator("bbox")(validate_bbox)

    @model_validator(mode="after")
    def validate_windows(self):
        if self.pre_start >= self.pre_end:
            raise ValueError("pre_start must be earlier than pre_end")
        if self.post_start >= self.post_end:
            raise ValueError("post_start must be earlier than post_end")
        if self.pre_end > self.post_start:
            raise ValueError("pre-event window must end before the post-event window starts")
        return self


class TimeSeriesRequest(DateRangeModel):
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    start_date: date = Field(..., example="2018-06-01")
    end_date: date = Field(..., example="2019-06-01")
    polarization: str = Field(default="VH", pattern="^(VH|VV|HH|HV)$")
    orbit_pass: str | None = Field(default="DESCENDING", pattern="^(ASCENDING|DESCENDING)$")

    _validate_bbox = field_validator("bbox")(validate_bbox)


class SARQueryRequest(DateRangeModel):
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    start_date: date = Field(..., example="2018-10-01")
    end_date: date = Field(..., example="2018-12-15")
    platform: str | None = Field(default="Sentinel-1", example="Sentinel-1")
    max_results: int = Field(default=20, ge=1, le=100)

    _validate_bbox = field_validator("bbox")(validate_bbox)


class LiveFetchRequest(BaseModel):
    """Request body for on-demand NISAR product fetching (``POST /api/nisar/fetch``)."""

    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    start_date: date
    end_date: date
    maturity: str = Field(default="PROVISIONAL", pattern="^(PROVISIONAL|BETA)$")
    polarizations: list[str] = Field(
        default_factory=lambda: ["HH"],
        min_length=1,
        max_length=4,
        description="Requested polarizations, e.g. ['HH']",
    )
    max_granules: int = Field(default=6, ge=2, le=20)
    refresh: bool = Field(default=False, description="Ignore cached products and refetch")

    _validate_bbox = field_validator("bbox")(validate_bbox)

    @field_validator("polarizations")
    @classmethod
    def validate_polarizations(cls, value: list[str]) -> list[str]:
        normalized = sorted({pol.upper() for pol in value})
        if not set(normalized).issubset({"HH", "HV", "VH", "VV"}):
            raise ValueError("polarizations must be HH, HV, VH, and/or VV")
        return normalized

    @model_validator(mode="after")
    def validate_dates(self) -> "LiveFetchRequest":
        if self.start_date >= self.end_date:
            raise ValueError("start_date must be earlier than end_date")
        return self


class ObservationTileRequest(BaseModel):
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    date: date
    polarization: str = Field(default="VV", pattern="^(VH|VV|HH|HV)$")
    orbit_pass: str | None = Field(default=None, pattern="^(ASCENDING|DESCENDING)$")

    _validate_bbox = field_validator("bbox")(validate_bbox)


class ObservationComparisonRequest(BaseModel):
    bbox: list[float] = Field(..., description="[min_lon, min_lat, max_lon, max_lat]")
    start_date: date
    end_date: date
    polarization: str = Field(default="VV", pattern="^(VH|VV|HH|HV)$")
    orbit_pass: str | None = Field(default=None, pattern="^(ASCENDING|DESCENDING)$")

    _validate_bbox = field_validator("bbox")(validate_bbox)

    @model_validator(mode="after")
    def validate_comparison_dates(self):
        if self.start_date >= self.end_date:
            raise ValueError("Comparison finish date must be later than start date")
        return self
