"""Small on-disk TTL cache for live ASF catalog fetches.

Entries are JSON files keyed by a deterministic hash of the query. A cache
miss calls the upstream fetch; if the upstream fails, a stale entry can still
be served so an outage does not blank the UI. Writes are atomic (write to a
temporary file, then ``os.replace``).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

KEY_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


class CacheError(RuntimeError):
    """Raised when a cache entry cannot be written."""


@dataclass(frozen=True)
class CacheEntry:
    payload: Any
    fetched_at: str
    age_seconds: float
    stale: bool


def make_key(namespace: str, params: dict[str, Any]) -> str:
    """Build a filesystem-safe, deterministic key from query parameters."""
    if not KEY_RE.fullmatch(namespace):
        raise ValueError("cache namespace must be a lowercase slug")
    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return f"{namespace}-{digest}"


def _entry_path(cache_dir: Path, key: str) -> Path:
    if not KEY_RE.fullmatch(key):
        raise ValueError(f"invalid cache key: {key!r}")
    return Path(cache_dir) / f"{key}.json"


def read_entry(
    cache_dir: Path,
    key: str,
    ttl_seconds: float,
    *,
    allow_stale: bool = False,
) -> CacheEntry | None:
    """Return a cache entry if it is fresh (or stale and explicitly allowed)."""
    path = _entry_path(cache_dir, key)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        payload = raw["payload"]
        fetched_epoch = float(raw["fetched_at_epoch"])
        fetched_at = str(raw["fetched_at"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
    age = max(0.0, time.time() - fetched_epoch)
    fresh = age <= ttl_seconds
    if not fresh and not allow_stale:
        return None
    return CacheEntry(payload=payload, fetched_at=fetched_at, age_seconds=age, stale=not fresh)


def write_entry(cache_dir: Path, key: str, payload: Any) -> CacheEntry:
    """Atomically store a payload and return the resulting entry."""
    directory = Path(cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = _entry_path(directory, key)
    now = time.time()
    fetched_at = datetime.fromtimestamp(now, UTC).isoformat()
    body = {
        "schema_version": 1,
        "key": key,
        "fetched_at": fetched_at,
        "fetched_at_epoch": now,
        "payload": payload,
    }
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    try:
        tmp.write_text(json.dumps(body, default=str), encoding="utf-8")
        os.replace(tmp, path)
    except (OSError, TypeError, ValueError) as exc:
        tmp.unlink(missing_ok=True)
        raise CacheError(f"Could not write cache entry {key}: {exc}") from exc
    return CacheEntry(payload=payload, fetched_at=fetched_at, age_seconds=0.0, stale=False)


def invalidate(cache_dir: Path, key: str) -> bool:
    """Delete a cache entry so the next request must fetch live. Returns True if removed."""
    path = _entry_path(cache_dir, key)
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False


def read_or_fetch(
    cache_dir: Path,
    key: str,
    ttl_seconds: float,
    fetch: Callable[[], Any],
    *,
    refresh: bool = False,
    allow_stale: bool = True,
) -> tuple[Any, dict[str, Any]]:
    """Cache-aside helper. Returns ``(payload, metadata)``.

    ``fetch`` is only called on a miss (or when ``refresh=True``). If it raises
    and a stale entry exists, that entry is returned with ``stale=True``.
    """
    if not refresh:
        hit = read_entry(cache_dir, key, ttl_seconds)
        if hit is not None:
            return hit.payload, {
                "cached": True,
                "stale": False,
                "fetched_at": hit.fetched_at,
                "age_seconds": round(hit.age_seconds, 1),
            }

    try:
        payload = fetch()
    except Exception as exc:  # upstream network/auth failures are expected here
        stale = read_entry(cache_dir, key, ttl_seconds, allow_stale=True) if allow_stale else None
        if stale is not None:
            return stale.payload, {
                "cached": True,
                "stale": True,
                "fetched_at": stale.fetched_at,
                "age_seconds": round(stale.age_seconds, 1),
                "warning": f"Live fetch failed; serving cached results: {exc}",
            }
        raise

    entry = write_entry(cache_dir, key, payload)
    return payload, {
        "cached": False,
        "stale": False,
        "fetched_at": entry.fetched_at,
        "age_seconds": 0.0,
    }
