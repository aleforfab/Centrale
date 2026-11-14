"""Background job manager for on-demand NISAR product fetches.

A job runs ``live_fetch.fetch_products`` in a thread pool so HTTP requests do
not block on multi-gigabyte downloads. Progress is persisted as JSON under
``.cache/live/jobs/`` and can be polled through the API. Identical concurrent
requests are deduplicated by site id, and cancellation is cooperative (checked
between pipeline stages).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from nisar import live_fetch
from nisar.config import Config

logger = logging.getLogger(__name__)

JOB_ID_RE = re.compile(r"job-[0-9a-f]{12}")
ACTIVE_STATUSES = {"queued", "running"}
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _atomic_write(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
        os.replace(tmp, path)
    except (OSError, TypeError, ValueError):
        tmp.unlink(missing_ok=True)
        raise


def _as_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value))


def fetch_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """Rebuild typed ``fetch_products`` arguments from persisted job params."""
    return {
        "bbox": [float(value) for value in params["bbox"]],
        "start": _as_date(params["start"]),
        "end": _as_date(params["end"]),
        "maturity": str(params.get("maturity", "PROVISIONAL")),
        "polarizations": list(params.get("polarizations") or ["HH"]),
        "max_granules": int(params.get("max_granules") or Config.LIVE_FETCH_MAX_GRANULES),
        "refresh": bool(params.get("refresh", False)),
    }


class JobManager:
    """Thread-safe, disk-backed registry of live-fetch jobs."""

    def __init__(
        self,
        directory: Path | None = None,
        executor: ThreadPoolExecutor | None = None,
        runner: Any = None,
        retention_seconds: int | None = None,
    ) -> None:
        self.directory = Path(directory) if directory else Config.get_live_fetch_dir() / "jobs"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.executor = executor or _get_executor()
        self.runner = runner or live_fetch.fetch_products
        self.retention_seconds = (
            retention_seconds
            if retention_seconds is not None
            else Config.LIVE_FETCH_JOB_RETENTION_SECONDS
        )
        self._lock = threading.RLock()
        self._jobs: dict[str, dict[str, Any]] = {}
        self._load()

    # -- persistence -----------------------------------------------------

    def _load(self) -> None:
        for path in self.directory.glob("*.json"):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            if not isinstance(raw, dict) or not JOB_ID_RE.fullmatch(str(raw.get("job_id", ""))):
                continue
            job = dict(raw)
            if job.get("status") in ACTIVE_STATUSES:
                job.update({
                    "status": "failed",
                    "stage": "interrupted",
                    "message": "Job was interrupted by a process restart.",
                    "error": "Job was interrupted by a process restart; resubmit the fetch.",
                    "finished_at": _now(),
                })
                try:
                    _atomic_write(path, job)
                except OSError:
                    logger.warning("Could not update interrupted job %s", path)
            self._jobs[job["job_id"]] = job
        self._prune()

    def _prune(self) -> None:
        cutoff = time.time() - self.retention_seconds
        for job_id, job in list(self._jobs.items()):
            if job.get("status") not in TERMINAL_STATUSES:
                continue
            try:
                finished = datetime.fromisoformat(str(job["finished_at"])).timestamp()
            except (KeyError, TypeError, ValueError):
                continue
            if finished < cutoff:
                self._jobs.pop(job_id, None)
                (self.directory / f"{job_id}.json").unlink(missing_ok=True)

    def _persist(self, job: dict[str, Any]) -> None:
        try:
            _atomic_write(self.directory / f"{job['job_id']}.json", job)
        except (OSError, TypeError, ValueError) as exc:
            logger.warning("Could not persist job %s: %s", job["job_id"], exc)

    # -- public API ------------------------------------------------------

    def submit(self, params: dict[str, Any]) -> dict[str, Any]:
        """Enqueue a live fetch, or return an already-active job for the same site."""
        kwargs = fetch_kwargs(params)
        site_id = live_fetch.site_id_for(
            kwargs["bbox"], kwargs["start"], kwargs["end"],
            kwargs["maturity"], kwargs["polarizations"], kwargs["max_granules"],
        )
        # A forced rebuild must not attach itself to an in-flight normal build.
        dedupe_key = f"{site_id}-refresh" if kwargs["refresh"] else site_id
        with self._lock:
            active = self.active_for_site(dedupe_key)
            if active is not None:
                logger.info("Reusing active job %s for site %s", active["job_id"], site_id)
                return dict(active)

            now = _now()
            job: dict[str, Any] = {
                "job_id": f"job-{uuid.uuid4().hex[:12]}",
                "site_id": site_id,
                "dedupe_key": dedupe_key,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "Queued for live ASF fetch",
                "cancel_requested": False,
                "created_at": now,
                "updated_at": now,
                "started_at": None,
                "finished_at": None,
                "result": None,
                "error": None,
                "params": json.loads(json.dumps(params, default=str)),
            }
            self._jobs[job["job_id"]] = job
            self._persist(job)

        self.executor.submit(self._run, job["job_id"], kwargs)
        return dict(job)

    def active_for_site(self, dedupe_key: str) -> dict[str, Any] | None:
        for job in self._jobs.values():
            key = job.get("dedupe_key", job["site_id"])
            if key == dedupe_key and job["status"] in ACTIVE_STATUSES:
                return dict(job)
        return None

    def get(self, job_id: str) -> dict[str, Any] | None:
        if not JOB_ID_RE.fullmatch(job_id):
            return None
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job is not None else None

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            jobs = [dict(job) for job in self._jobs.values()]
        jobs.sort(key=lambda job: str(job.get("created_at", "")), reverse=True)
        return jobs[:max(1, min(limit, 200))]

    def count_active(self) -> int:
        with self._lock:
            return sum(job["status"] in ACTIVE_STATUSES for job in self._jobs.values())

    def update(self, job_id: str, **fields: Any) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["status"] in TERMINAL_STATUSES and "status" not in fields:
                return dict(job)
            job.update(fields)
            job["updated_at"] = _now()
            self._persist(job)
            return dict(job)

    def cancel(self, job_id: str) -> tuple[dict[str, Any] | None, bool]:
        """Request cancellation. Returns ``(job, accepted)``."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or not JOB_ID_RE.fullmatch(job_id):
                return None, False
            if job["status"] in TERMINAL_STATUSES:
                return dict(job), False
            job["cancel_requested"] = True
            job["message"] = "Cancellation requested; the job will stop at the next stage."
            job["updated_at"] = _now()
            self._persist(job)
            return dict(job), True

    # -- worker ----------------------------------------------------------

    def _run(self, job_id: str, kwargs: dict[str, Any]) -> None:
        self.update(
            job_id,
            status="running",
            stage="starting",
            progress=2,
            message="Starting live ASF fetch",
            started_at=_now(),
        )

        def progress(stage: str, percent: int, message: str) -> None:
            self.update(job_id, stage=stage, progress=percent, message=message)

        def cancelled() -> bool:
            job = self.get(job_id)
            return bool(job and job["cancel_requested"])

        try:
            result = self.runner(**kwargs, progress=progress, should_cancel=cancelled)
            if cancelled():
                raise live_fetch.LiveFetchCancelled("Live fetch was cancelled")
            self.update(
                job_id,
                status="succeeded",
                stage="done",
                progress=100,
                message="Products built and cached",
                result=result,
                finished_at=_now(),
            )
        except live_fetch.LiveFetchCancelled as exc:
            self.update(
                job_id,
                status="cancelled",
                stage="cancelled",
                message=str(exc),
                finished_at=_now(),
            )
        except Exception as exc:
            logger.exception("Live fetch job %s failed", job_id)
            self.update(
                job_id,
                status="failed",
                stage="failed",
                message=str(exc),
                error=str(exc),
                finished_at=_now(),
            )


_EXECUTOR: ThreadPoolExecutor | None = None
_MANAGER: JobManager | None = None
_MANAGER_LOCK = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _EXECUTOR
    if _EXECUTOR is None:
        _EXECUTOR = ThreadPoolExecutor(
            max_workers=Config.LIVE_FETCH_MAX_WORKERS,
            thread_name_prefix="nisar-fetch",
        )
    return _EXECUTOR


def get_job_manager() -> JobManager:
    """Lazily create the process-wide job manager."""
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = JobManager()
        return _MANAGER
