"""Configuration for NISAR processing pipeline."""

import os
from pathlib import Path
from typing import ClassVar


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    """Read a bounded integer setting without crashing on a bad value."""
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        return default
    return value if value >= minimum else default


class Config:
    """Configuration settings for NISAR processing."""
    
    # Environment variables
    EARTHDATA_USERNAME: str | None = os.getenv("EARTHDATA_USERNAME")
    EARTHDATA_PASSWORD: str | None = os.getenv("EARTHDATA_PASSWORD")
    EARTHDATA_TOKEN: str | None = os.getenv("EARTHDATA_TOKEN")
    PRODUCTS_DIR: Path = Path(os.getenv("PRODUCTS_DIR", "./products"))
    CACHE_DIR: Path = Path(os.getenv("CACHE_DIR", "./.cache"))
    ENABLE_SENTINEL1_FALLBACK: bool = os.getenv("ENABLE_SENTINEL1_FALLBACK", "false").lower() == "true"

    # Runtime live fetch is ON by default. Set ENABLE_LIVE_FETCH=false to force
    # the app to serve only precomputed products. Live builds are still gated by
    # Earthdata credentials and the download-size cap below.
    ENABLE_LIVE_FETCH: bool = os.getenv("ENABLE_LIVE_FETCH", "true").lower() == "true"
    LIVE_FETCH_TTL_SECONDS: int = _env_int("LIVE_FETCH_TTL_SECONDS", 3600)
    LIVE_FETCH_MAX_GRANULES: int = _env_int("LIVE_FETCH_MAX_GRANULES", 6)
    LIVE_FETCH_MAX_BYTES: int = _env_int("LIVE_FETCH_MAX_BYTES", 2 * 1024 ** 3)
    LIVE_FETCH_MIN_ZOOM: int = _env_int("LIVE_FETCH_MIN_ZOOM", 6, minimum=0)
    LIVE_FETCH_MAX_ZOOM: int = _env_int("LIVE_FETCH_MAX_ZOOM", 10, minimum=0)
    LIVE_FETCH_TILE_BUDGET_MB: float = float(_env_int("LIVE_FETCH_TILE_BUDGET_MB", 60))
    LIVE_FETCH_STALE_ON_ERROR: bool = os.getenv("LIVE_FETCH_STALE_ON_ERROR", "true").lower() == "true"
    LIVE_FETCH_MAX_WORKERS: int = _env_int("LIVE_FETCH_MAX_WORKERS", 2)
    LIVE_FETCH_JOB_RETENTION_SECONDS: int = _env_int("LIVE_FETCH_JOB_RETENTION_SECONDS", 86400)

    # ASF search defaults
    MAX_RESULTS: int = 500
    DEFAULT_MATURITY: str = "PROVISIONAL"
    
    # Processing defaults
    MAX_WINDOW_PX: int = 4000
    DEFAULT_SMOOTHING_PX: int = 3
    DEFAULT_THRESHOLDS_DB: ClassVar[list[float]] = [2.0, 3.0, 6.0]
    DEFAULT_THRESHOLD_DB: float = 3.0
    
    # Known instrument data gap
    DATA_GAP_START: str = "2026-07-27T22:03:25Z"
    DATA_GAP_END: str = "2026-08-10T00:55:27Z"
    
    @classmethod
    def get_products_dir(cls) -> Path:
        """Get and ensure products directory exists."""
        cls.PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
        return cls.PRODUCTS_DIR
    
    @classmethod
    def get_cache_dir(cls) -> Path:
        """Get and ensure cache directory exists."""
        cls.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        return cls.CACHE_DIR

    @classmethod
    def get_catalog_cache_dir(cls) -> Path:
        """Directory holding cached ASF catalog search responses."""
        path = cls.get_cache_dir() / "catalog"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def get_live_fetch_dir(cls) -> Path:
        """Directory holding generated site configs and downloaded granules."""
        path = cls.get_cache_dir() / "live"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def has_earthdata_creds(cls) -> bool:
        """Check if Earthdata credentials are available (token or username/password)."""
        # Check token first (preferred method)
        if cls.EARTHDATA_TOKEN:
            return True
        # Check username/password
        return bool(cls.EARTHDATA_USERNAME and cls.EARTHDATA_PASSWORD)


def get_config() -> Config:
    """Get the current configuration."""
    return Config
