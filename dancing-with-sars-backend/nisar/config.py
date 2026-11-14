"""Configuration for NISAR processing pipeline."""

import os
from pathlib import Path
from typing import ClassVar


class Config:
    """Configuration settings for NISAR processing."""
    
    # Environment variables
    EARTHDATA_USERNAME: str | None = os.getenv("EARTHDATA_USERNAME")
    EARTHDATA_PASSWORD: str | None = os.getenv("EARTHDATA_PASSWORD")
    EARTHDATA_TOKEN: str | None = os.getenv("EARTHDATA_TOKEN")
    PRODUCTS_DIR: Path = Path(os.getenv("PRODUCTS_DIR", "./products"))
    CACHE_DIR: Path = Path(os.getenv("CACHE_DIR", "./.cache"))
    ENABLE_SENTINEL1_FALLBACK: bool = os.getenv("ENABLE_SENTINEL1_FALLBACK", "false").lower() == "true"
    
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
