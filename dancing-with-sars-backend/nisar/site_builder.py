"""Build and verify static NISAR site products."""

import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import rasterio
import yaml
from pydantic import ValidationError
from rasterio.warp import transform_bounds

from nisar.catalog import KNOWN_GAPS, bbox_to_wkt
from nisar.config import Config
from nisar.export import (
    render_tiles,
    write_acquisitions,
    write_cog,
    write_manifest,
    write_stats,
    write_timeseries,
)
from nisar.models import (
    Acquisition,
    KnownGap,
    Layer,
    Manifest,
    NormalizationInfo,
    PairManifest,
    PairStatsModel,
    PolarizationInfo,
    SiteConfig,
    SiteInfo,
    SourceInfo,
    StackConfig,
    TileConfig,
    TimeSeriesResponse,
)
from nisar.naming import NisarGranuleName, parse_granule_name
from nisar.normalize import (
    NormalizationProvenance,
    apply_gamma_to_sigma,
    combine_pair_normalization,
    summarize_site_normalization,
)
from nisar.processing import compute_time_series, process_pair, smooth_linear, to_db
from nisar.reader import GcovReader, InvalidFileError

logger = logging.getLogger(__name__)
POL_DATASETS = {"HH": "HHHH", "HV": "HVHV", "VH": "VHVH", "VV": "VVVV"}


class SiteBuildError(RuntimeError):
    """Raised when a site cannot be safely built from its configured inputs."""


def _date_key(value: str) -> str:
    normalized = value.replace("-", "")
    if not re.fullmatch(r"\d{8}", normalized):
        raise SiteBuildError(f"Invalid date {value!r}; expected YYYYMMDD or YYYY-MM-DD")
    return normalized


def _iso_date(date_key: str, *, end_of_day: bool = False) -> str:
    """Return an ISO timestamp for an ASF query boundary.

    ASF reads a date-only ``end`` as midnight at the *start* of that day, which
    silently excludes a granule acquired later the same day -- including the last
    acquisition of a stack. The upper bound therefore needs an end-of-day stamp.
    """
    stamp = f"{date_key[:4]}-{date_key[4:6]}-{date_key[6:8]}"
    return f"{stamp}T23:59:59Z" if end_of_day else f"{stamp}T00:00:00Z"


def _load_config(path: Path) -> tuple[SiteConfig, StackConfig, TileConfig]:
    with Path(path).open("r", encoding="utf-8") as stream:
        raw = yaml.safe_load(stream)
    if not isinstance(raw, dict):
        raise SiteBuildError("Site YAML must contain a mapping")
    try:
        config = SiteConfig.model_validate(raw)
        stack = StackConfig.model_validate(raw.get("stack", {}))
        tiles = TileConfig.model_validate(raw.get("tiles", {}))
    except ValidationError as exc:
        raise SiteBuildError(f"Invalid site configuration: {exc}") from exc
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", config.id):
        raise SiteBuildError("Site id must be a lowercase alphanumeric slug")
    if not config.polarizations or any(pol.upper() not in POL_DATASETS for pol in config.polarizations):
        raise SiteBuildError("polarizations must contain HH, HV, VH, and/or VV")
    if not config.pairs:
        raise SiteBuildError("Site configuration must include at least one curated pair")
    pair_ids = set()
    for pair in config.pairs:
        pair_id = str(pair.get("id", ""))
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", pair_id):
            raise SiteBuildError("Pair ids must be lowercase alphanumeric slugs")
        if pair_id in pair_ids:
            raise SiteBuildError(f"Duplicate pair id: {pair_id}")
        pair_ids.add(pair_id)
        if not isinstance(pair.get("label"), str) or not pair["label"].strip():
            raise SiteBuildError(f"Pair {pair_id} must have a non-empty label")
        pre, post = _date_key(str(pair.get("pre", ""))), _date_key(str(pair.get("post", "")))
        if pre >= post:
            raise SiteBuildError(f"Pair {pair_id} must have pre date before post date")
    return config, stack, tiles


def _matches_stack(parsed: NisarGranuleName, stack: StackConfig) -> bool:
    return (
        parsed.track == stack.track
        and parsed.frame == stack.frame
        and parsed.direction == stack.direction
        and parsed.maturity == stack.maturity
        and parsed.product == "GCOV"
    )


def _local_granules(local_dir: Path, stack: StackConfig, start: str, end: str) -> list[tuple[Path, NisarGranuleName]]:
    matches = []
    for path in Path(local_dir).rglob("*.h5"):
        try:
            parsed = parse_granule_name(path.name)
        except ValueError:
            logger.debug("Ignoring non-NISAR HDF5 file %s", path.name)
            continue
        if _matches_stack(parsed, stack) and _date_key(start) <= parsed.start[:8] <= _date_key(end):
            matches.append((path, parsed))
    return sorted(matches, key=lambda item: (item[1].start, item[1].cycle, item[1].counter))


def _remote_granules(
    config: SiteConfig,
    stack: StackConfig,
    start: str,
    end: str,
    max_acquisitions: int | None = None,
) -> list[tuple[Any, NisarGranuleName, Any]]:
    try:
        import asf_search as asf
    except ImportError as exc:
        raise SiteBuildError("asf-search is required to fetch NISAR granules") from exc

    session = None
    token = os.getenv("EARTHDATA_TOKEN") or Config.EARTHDATA_TOKEN
    username = os.getenv("EARTHDATA_USERNAME") or Config.EARTHDATA_USERNAME
    password = os.getenv("EARTHDATA_PASSWORD") or Config.EARTHDATA_PASSWORD
    if token:
        session = asf.ASFSession().auth_with_token(token)
    elif username and password:
        session = asf.ASFSession().auth_with_creds(username, password)

    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        dataMaturity=stack.maturity,
        intersectsWith=bbox_to_wkt(config.bbox),
        start=_iso_date(start),
        end=_iso_date(end, end_of_day=True),
        maxResults=Config.MAX_RESULTS,
        session=session,
    )
    requested_polarizations = {pol.upper() for pol in config.polarizations}
    candidates = []
    for product in results:
        try:
            parsed = parse_granule_name(product.properties.get("sceneName", ""))
        except ValueError:
            continue
        if (
            _matches_stack(parsed, stack)
            and _date_key(start) <= parsed.start[:8] <= _date_key(end)
            and requested_polarizations.issubset(set(parsed.polarizations()))
        ):
            candidates.append((product, parsed, session))
    if not candidates:
        raise SiteBuildError("ASF found no NISAR GCOV granules matching the configured stack and dates")

    candidates = _select_candidates(
        candidates,
        config.pairs,
        max_acquisitions,
    )
    return sorted(candidates, key=lambda item: (item[1].start, item[1].cycle, item[1].counter))


def _download_remote_granules(
    candidates: list[tuple[Any, NisarGranuleName, Any]],
    download_dir: Path,
) -> list[tuple[Path, NisarGranuleName]]:
    download_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for product, parsed, session in candidates:
        filename = Path(str(product.properties.get("fileName", ""))).name
        if not filename or filename in {".", ".."}:
            raise SiteBuildError(
                f"ASF returned an invalid filename for granule "
                f"{product.properties.get('sceneName', 'unknown')}"
            )
        path = download_dir / filename
        if not path.exists():
            logger.info("Downloading NISAR granule %s", path.name)
            product.download(str(download_dir), session=session)
        if not path.is_file():
            raise SiteBuildError(f"ASF download did not create expected granule file {path.name}")
        downloaded.append((path, parsed))
    return downloaded


def _select_candidates(
    candidates: list[tuple[Any, ...]],
    pairs: list[dict[str, Any]],
    max_acquisitions: int | None,
) -> list[tuple[Any, ...]]:
    required_dates = {
        _date_key(str(value))
        for pair in pairs
        for value in (pair["pre"], pair["post"])
    }
    by_date = {parsed.date.replace("-", ""): item for item in candidates for parsed in [item[1]]}
    missing = sorted(required_dates.difference(by_date))
    if missing:
        raise SiteBuildError(f"Configured pair dates are missing from the selected stack: {', '.join(missing)}")
    if max_acquisitions is None:
        return candidates
    if max_acquisitions < 1:
        raise SiteBuildError("--max-acquisitions must be positive")
    if len(required_dates) > max_acquisitions:
        raise SiteBuildError(
            f"--max-acquisitions ({max_acquisitions}) is smaller than the "
            f"{len(required_dates)} acquisitions required by curated pairs"
        )
    selected = [by_date[day] for day in sorted(required_dates)]
    selected_dates = set(required_dates)
    for item in candidates:
        day = item[1].date.replace("-", "")
        if day not in selected_dates and len(selected) < max_acquisitions:
            selected.append(item)
            selected_dates.add(day)
    return sorted(selected, key=lambda item: (item[1].start, item[1].cycle, item[1].counter))


def plan_site(
    config_path: Path,
    local_dir: Path | None = None,
    max_acquisitions: int | None = None,
) -> dict[str, Any]:
    config, stack, _ = _load_config(config_path)
    pairs = config.pairs
    start = min(_date_key(str(pair["pre"])) for pair in pairs)
    end = max(_date_key(str(pair["post"])) for pair in pairs)
    if local_dir:
        matches = _local_granules(local_dir, stack, start, end)
        matches = _select_candidates(matches, pairs, max_acquisitions)
    else:
        matches = _remote_granules(config, stack, start, end, max_acquisitions)
    if not matches:
        raise SiteBuildError("No granules match the configured stack and pair dates")
    return {
        "config": config,
        "stack": stack,
        "matches": matches,
        "start": start,
        "end": end,
        "remote": local_dir is None,
    }


def _read_polarizations(path: Path) -> list[str]:
    with h5py.File(path, "r") as file:
        group_path = "science/LSAR/GCOV/grids/frequencyA"
        if group_path not in file:
            raise InvalidFileError(f"{path.name} does not contain /{group_path}")
        group = file[group_path]
        actual = [pol for pol, dataset in POL_DATASETS.items() if dataset in group]
        declared = group.get("listOfPolarizations")
        if declared is not None:
            raw = declared[()]
            if isinstance(raw, bytes):
                raw = raw.decode("ascii", errors="ignore")
            declared_text = str(raw)
            actual = [pol for pol in actual if pol in declared_text]
        return actual


def build_site(
    config_path: Path,
    *,
    local_dir: Path | None = None,
    max_acquisitions: int | None = None,
    dry_run: bool = False,
) -> Path | dict[str, Any]:
    if max_acquisitions is not None and max_acquisitions < 1:
        raise SiteBuildError("--max-acquisitions must be positive")
    plan = plan_site(config_path, local_dir, max_acquisitions)
    config: SiteConfig = plan["config"]
    stack: StackConfig = plan["stack"]
    matches = plan["matches"]
    if dry_run:
        return {
            "site": config.id,
            "granules": [
                candidate[0].name if isinstance(candidate[0], Path)
                else candidate[0].properties.get("sceneName", candidate[0].properties.get("fileName", "unknown"))
                for candidate in matches
            ],
            "pairs": config.pairs,
            "polarizations": config.polarizations,
        }
    if plan["remote"]:
        matches = _download_remote_granules(
            matches,
            Config.get_cache_dir() / "granules",
        )
    matches = [(Path(path), parsed) for path, parsed, *_ in matches]

    granule_by_date = {parsed.date.replace("-", ""): (path, parsed) for path, parsed in matches}
    requested_dates = {
        _date_key(str(value))
        for pair in config.pairs
        for value in (pair["pre"], pair["post"])
    }
    missing_dates = sorted(requested_dates.difference(granule_by_date))
    if missing_dates:
        raise SiteBuildError(f"Configured pair dates are missing from the selected stack: {', '.join(missing_dates)}")

    output_dir = Config.get_products_dir() / config.id
    output_dir.mkdir(parents=True, exist_ok=True)
    reader = GcovReader(max_window_px=Config.MAX_WINDOW_PX)
    windows: dict[str, dict[str, Any]] = {pol: {} for pol in config.polarizations}
    acquisitions: list[Acquisition] = []
    first_window = None
    normalization_provenances: list[NormalizationProvenance] = []

    for path, parsed in matches:
        actual_pols = _read_polarizations(path)
        requested = [pol.upper() for pol in config.polarizations]
        available = [pol for pol in requested if pol in actual_pols]
        if not available:
            logger.warning("Granule %s has none of the requested polarizations", path.name)
            continue
        acquisition = Acquisition(
            granule=path.name,
            cycle=parsed.cycle,
            date=parsed.date,
            start=parsed.datetime_start,
            end=parsed.datetime_end,
            crid=parsed.crid,
            coverage=parsed.coverage,
            polarizations=available,
            download_url=f"https://search.asf.alaska.edu/#/?granule={path.name}",
            links={"asf": f"https://search.asf.alaska.edu/#/?granule={path.name}"},
        )
        acquisitions.append(acquisition)
        for pol in available:
            window = reader.read_window(path, config.bbox, pol=pol, use_cache=True)
            normalized = apply_gamma_to_sigma(window)
            normalization_provenances.append(normalized.normalization)
            windows[pol][parsed.date.replace("-", "")] = (normalized, parsed)
            if first_window is None:
                first_window = normalized

    if first_window is None:
        raise SiteBuildError("None of the selected granules have the configured polarizations")

    tile_config = TileConfig.model_validate(config.tiles)
    remaining_budget = tile_config.budget_mb
    layers: list[Layer] = []
    polarization_info: list[PolarizationInfo] = []
    timeseries_json: dict[str, list[dict[str, Any]]] = {}
    stats_json: dict[str, Any] = {}
    pair_manifests: list[PairManifest] = []

    def export_layer(
        layer_id: str,
        title: str,
        pol: str,
        array: np.ndarray,
        transform: Any,
        crs: str,
        kind: str,
        *,
        date_value: str | None = None,
        pair_id: str | None = None,
        threshold: float | None = None,
        sign: str | None = None,
        minimum: float | None = None,
        maximum: float | None = None,
        legend: str | None = None,
        normalization: NormalizationInfo | None = None,
    ) -> None:
        nonlocal remaining_budget
        cog_relative = Path("cogs") / f"{layer_id}.tif"
        cog_path = output_dir / cog_relative
        write_cog(array, cog_path, transform, crs)
        tile_relative = Path("tiles") / layer_id
        tile_result = render_tiles(
            cog_path,
            output_dir / tile_relative,
            kind="difference_diverging" if config.id == "anak-krakatau" and kind == "difference" else kind,
            min_zoom=tile_config.min_zoom,
            max_zoom=tile_config.max_zoom,
            budget_mb=remaining_budget,
            minimum=minimum,
            maximum=maximum,
        )
        remaining_budget -= tile_result["estimated_mb"]
        layers.append(Layer(
            id=layer_id,
            kind=kind,
            title=title,
            pol=pol,
            date=date_value,
            pair_id=pair_id,
            threshold_db=threshold,
            sign=sign,
            tile_url_template=f"/products/{config.id}/{tile_relative.as_posix()}/{{z}}/{{x}}/{{y}}.png",
            min_zoom=tile_config.min_zoom,
            max_zoom=tile_config.max_zoom,
            legend=legend,
            normalization=normalization,
        ))

    for pol in config.polarizations:
        pol = pol.upper()
        pol_windows = windows[pol]
        if not pol_windows:
            continue
        ordered_windows = sorted(pol_windows.items())
        db_arrays = []
        for date_key, (window, parsed) in ordered_windows:
            smoothed = smooth_linear(window.power, config.smoothing_px)
            backscatter = to_db(smoothed)
            db_arrays.append(backscatter)
            layer_id = f"backscatter-{pol.lower()}-{parsed.date}"
            export_layer(
                layer_id,
                f"{pol} backscatter · {parsed.date}",
                pol,
                backscatter,
                window.transform,
                window.crs,
                "backscatter",
                date_value=parsed.date,
                minimum=-30,
                maximum=0,
                legend="Backscatter (dB, normalized sigma0), brighter means a stronger return",
                normalization=window.normalization.to_model(),
            )
        valid_chunks = [array[np.isfinite(array)] for array in db_arrays if np.isfinite(array).any()]
        if not valid_chunks:
            raise SiteBuildError(f"No valid {pol} backscatter pixels are available")
        valid_values = np.concatenate(valid_chunks)
        polarization_info.append(PolarizationInfo(
            pol=pol,
            stretch_db=[
                float(np.percentile(valid_values, 2)),
                float(np.percentile(valid_values, 98)),
            ],
        ))
        ts_points = compute_time_series(
            [window for _, (window, _) in ordered_windows],
            smoothing_px=config.smoothing_px,
        )
        timeseries_json[pol] = [
            {
                "date": point.date,
                "cycle": point.cycle,
                "backscatter_db": point.backscatter_db,
                "n_valid": point.n_valid,
                "maturity": point.maturity,
            }
            for point in ts_points
        ]

    for pair in config.pairs:
        pre_key, post_key = _date_key(str(pair["pre"])), _date_key(str(pair["post"]))
        pair_stats_by_pol: dict[str, dict[str, PairStatsModel]] = {}
        serialized_stats: dict[str, Any] = {}
        for pol in config.polarizations:
            pol = pol.upper()
            pol_windows = windows[pol]
            if pre_key not in pol_windows or post_key not in pol_windows:
                raise SiteBuildError(
                    f"Pair {pair['id']} lacks polarization {pol} for {pre_key} or {post_key}"
                )
            pre_window, _ = pol_windows[pre_key]
            post_window, _ = pol_windows[post_key]
            pair_norm = combine_pair_normalization(
                pre_window.normalization,
                post_window.normalization,
            ).to_model()
            diff, per_threshold, resampled = process_pair(
                pre_window,
                post_window,
                smoothing_px=config.smoothing_px,
                thresholds_db=config.thresholds_db,
            )
            diff_id = f"difference-{pair['id']}-{pol.lower()}"
            export_layer(
                diff_id,
                f"{pair['label']} · {pol} difference",
                pol,
                diff,
                pre_window.transform,
                pre_window.crs,
                "difference",
                pair_id=str(pair["id"]),
                minimum=-8 if config.id == "anak-krakatau" else -15,
                maximum=8 if config.id == "anak-krakatau" else 15,
                legend=("Finish minus start (dB): −8 blue, 0 neutral, +8 red" if config.id == "anak-krakatau" else "Finish minus start backscatter (dB): blue lower, red higher"),
                normalization=pair_norm,
            )
            pair_stats_by_pol[pol] = {}
            serialized_stats[pol] = {}
            for threshold, stats in per_threshold.items():
                mask = np.full(diff.shape, np.nan, dtype=np.float32)
                mask[np.isfinite(diff) & (diff <= -threshold)] = -1
                mask[np.isfinite(diff) & (diff >= threshold)] = 1
                mask_id = f"mask-{pair['id']}-{pol.lower()}-{threshold:g}db"
                export_layer(
                    mask_id,
                    f"{pair['label']} · {pol} ±{threshold:g} dB change",
                    pol,
                    mask,
                    pre_window.transform,
                    pre_window.crs,
                    "change_mask",
                    pair_id=str(pair["id"]),
                    threshold=float(threshold),
                    minimum=-1,
                    maximum=1,
                    legend="Blue = lower return, red = higher return",
                    normalization=pair_norm,
                )
                stats_model = PairStatsModel(
                    valid_pixels=stats.valid_pixels,
                    valid_fraction_of_bbox=stats.valid_fraction_of_bbox,
                    decrease_km2=stats.decrease_km2,
                    increase_km2=stats.increase_km2,
                    decrease_pct=stats.decrease_pct,
                    increase_pct=stats.increase_pct,
                    sigma_db=stats.sigma_db,
                    median_diff_db=stats.median_diff_db,
                    histogram=stats.histogram.tolist(),
                    resampled=resampled,
                )
                threshold_key = f"{threshold:g}"
                pair_stats_by_pol[pol][threshold_key] = stats_model
                serialized_stats[pol][threshold_key] = stats_model.model_dump(mode="json")
        pair_manifests.append(PairManifest(
            id=str(pair["id"]),
            pre=pre_key,
            post=post_key,
            label=str(pair["label"]),
            stats=pair_stats_by_pol,
        ))
        stats_json[str(pair["id"])] = serialized_stats

    manifest = Manifest(
        site=SiteInfo(
            id=config.id,
            title=config.title,
            event_type=config.event_type,
            description=config.description,
            caveat=config.caveat,
            bbox=config.bbox,
            center=[(config.bbox[0] + config.bbox[2]) / 2, (config.bbox[1] + config.bbox[3]) / 2],
        ),
        source=SourceInfo(
            maturity=stack.maturity,
            crid=acquisitions[0].crid,
            pixel_spacing_m=first_window.spacing_m,
            crs=first_window.crs,
            frequency="A",
            normalization=summarize_site_normalization(
                normalization_provenances
            ).to_model(),
        ),
        stack={
            "track": stack.track,
            "frame": stack.frame,
            "direction": stack.direction,
            "maturity": stack.maturity,
        },
        known_gaps=[KnownGap.model_validate(gap) for gap in KNOWN_GAPS],
        acquisitions=acquisitions,
        polarizations=polarization_info,
        layers=layers,
        pairs=pair_manifests,
        timeseries={pol: f"/products/{config.id}/timeseries.json#{pol}" for pol in timeseries_json},
        generated_at=datetime.now(UTC).isoformat(),
        pipeline_version="0.1.0",
    )
    write_manifest(output_dir / "manifest.json", manifest)
    write_acquisitions(output_dir / "acquisitions.json", [item.model_dump(mode="json") for item in acquisitions])
    write_timeseries(output_dir / "timeseries.json", timeseries_json)
    write_stats(output_dir / "stats.json", stats_json)
    return output_dir


def verify_site(site_id: str, products_dir: Path | None = None) -> list[str]:
    """Check manifest validity, matching stack provenance, and referenced products."""
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", site_id):
        raise SiteBuildError("Site id must be a lowercase alphanumeric slug")
    root = Path(products_dir or Config.get_products_dir()) / site_id
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        raise SiteBuildError(f"Site manifest not found for '{site_id}'")
    try:
        manifest = Manifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    except (ValidationError, ValueError) as exc:
        raise SiteBuildError(f"Invalid site manifest: {exc}") from exc
    if manifest.site.id != site_id:
        raise SiteBuildError("Manifest site id does not match its product directory")
    valid_names = {acquisition.granule for acquisition in manifest.acquisitions}
    parsed_names = [parse_granule_name(name) for name in valid_names]
    if any(item.maturity != manifest.source.maturity for item in parsed_names):
        raise SiteBuildError("Manifest mixes data maturities")
    expected_stack = (
        manifest.stack.get("track"),
        manifest.stack.get("direction"),
        manifest.stack.get("frame"),
    )
    if any((item.track, item.direction, item.frame) != expected_stack for item in parsed_names):
        raise SiteBuildError("Manifest contains granules from different stacks")
    failures: list[str] = []
    for layer in manifest.layers:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", layer.id):
            failures.append(f"Layer has invalid id {layer.id!r}")
            continue
        tile_root = root / "tiles" / layer.id
        if not tile_root.is_dir() or not any(tile_root.rglob("*.png")):
            failures.append(f"Layer {layer.id} has no rendered tile files")
        cog = root / "cogs" / f"{layer.id}.tif"
        if not cog.is_file():
            failures.append(f"Layer {layer.id} has no COG")
            continue
        try:
            with rasterio.open(cog) as dataset:
                pixel_x, pixel_y = dataset.res
                bounds = transform_bounds(
                    dataset.crs,
                    "EPSG:4326",
                    dataset.bounds.left - abs(pixel_x),
                    dataset.bounds.bottom - abs(pixel_y),
                    dataset.bounds.right + abs(pixel_x),
                    dataset.bounds.top + abs(pixel_y),
                    densify_pts=21,
                )
            west, south, east, north = manifest.site.bbox
            if bounds[0] > west or bounds[1] > south or bounds[2] < east or bounds[3] < north:
                failures.append(f"Layer {layer.id} COG does not cover the configured site bbox")
        except (rasterio.errors.RasterioError, ValueError) as exc:
            failures.append(f"Layer {layer.id} has an unreadable COG: {exc}")
    for required in ("acquisitions.json", "timeseries.json", "stats.json"):
        if not (root / required).is_file():
            failures.append(f"Missing {required}")
    if not failures:
        try:
            acquisitions = json.loads((root / "acquisitions.json").read_text(encoding="utf-8"))
            if [Acquisition.model_validate(item) for item in acquisitions] != manifest.acquisitions:
                failures.append("acquisitions.json does not match the manifest")
            timeseries = json.loads((root / "timeseries.json").read_text(encoding="utf-8"))
            if not isinstance(timeseries, dict):
                raise TypeError("timeseries.json must be an object keyed by polarization")
            for points in timeseries.values():
                if not isinstance(points, list):
                    raise TypeError("each time-series value must be a list")
                for point in points:
                    TimeSeriesResponse.model_validate(point)
            stats = json.loads((root / "stats.json").read_text(encoding="utf-8"))
            if not isinstance(stats, dict):
                raise TypeError("stats.json must be an object")
        except (OSError, json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
            failures.append(f"Invalid product JSON: {exc}")
    if failures:
        raise SiteBuildError("; ".join(failures))
    return [
        f"Verified site {site_id}",
        f"{len(manifest.acquisitions)} acquisitions, {len(manifest.layers)} layers",
        f"Mission {manifest.source.mission}, maturity {manifest.source.maturity}",
    ]
