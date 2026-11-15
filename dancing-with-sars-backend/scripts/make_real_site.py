"""Generate a real-data site YAML from the ASF catalogue.

This is the operator-side counterpart to ``scripts/make_demo_site.py``: instead
of fabricating a fixture, it queries ASF for a known NISAR GCOV stack, picks a
small analysis box inside the overlap of the real footprints, and writes a
``site.yaml`` that ``nisar.cli build-site`` can consume.

It downloads nothing. It only reports which granules a build would fetch and
how large they are, so an operator can check disk space before committing to a
multi-gigabyte download.

Usage (from ``dancing-with-sars-backend``)::

    python -m scripts.make_real_site --track 139 --frame 92 --direction D \\
        --max-dates 10 --out /tmp/real-site.yaml

Then::

    python -m nisar.cli build-site --config /tmp/real-site.yaml \\
        --max-acquisitions 10 --dry-run

The default ``--bbox`` is the footprint of the verified track-139/frame-092
stack (Atlantic off NE Brazil). Override it to target another area.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import asf_search as asf
from shapely.geometry import shape

DEFAULT_BBOX = "-36.3523,-8.3349,-33.6252,-5.5448"
CAVEAT = (
    "Real NISAR L2 GCOV (PROVISIONAL) radar backscatter change, not a validated "
    "hazard product. Backscatter change alone is not evidence of flooding, damage "
    "or subsidence. GCOV carries detected amplitude only, so no interferometric "
    "phase, no deformation measurement, and no ground truth have been used. "
    "Maturity is PROVISIONAL: the products are not validated and may be reprocessed "
    "by NASA."
)


def parse_bbox(text: str) -> list[float]:
    values = [float(part) for part in text.split(",")]
    if len(values) != 4:
        raise SystemExit(f"--bbox needs W,S,E,N; got {text!r}")
    return values


def bbox_to_polygon(bbox: list[float]) -> str:
    w, s, e, n = bbox
    return f"POLYGON (({w} {s}, {e} {s}, {e} {n}, {w} {n}, {w} {s}))"


def granule_date(product) -> str | None:
    """Return the YYYYMMDD start date from the scene name, or None."""
    name = str(product.properties.get("sceneName", ""))
    parts = name.split("_")
    for part in parts:
        if len(part) == 15 and part[8] == "T" and part[:8].isdigit():
            return part[:8]
    return None


def granule_h5_bytes(product) -> int:
    """Sum the HDF5 payload sizes reported by ASF.

    ``properties['bytes']`` is a dict keyed by filename, where each value is
    itself a dict (``{'bytes': ..., 'format': ...}``). Browse PNGs are excluded.
    """
    raw = product.properties.get("bytes")
    if isinstance(raw, dict):
        total = 0
        for name, item in raw.items():
            if str(name).lower().endswith(".h5") and isinstance(item, dict):
                total += int(item.get("bytes", 0) or 0)
        return total
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Write a real-data site YAML from ASF")
    parser.add_argument("--track", type=int, required=True)
    parser.add_argument("--frame", type=int, required=True)
    parser.add_argument("--direction", default="D", choices=["A", "D"])
    parser.add_argument("--maturity", default="PROVISIONAL", choices=["PROVISIONAL", "BETA"])
    parser.add_argument("--start", default="2025-06-01")
    parser.add_argument("--end", default="2026-11-15")
    parser.add_argument("--bbox", default=DEFAULT_BBOX, help="search area: W,S,E,N")
    parser.add_argument("--box-deg", type=float, default=0.10, help="analysis box size, degrees")
    parser.add_argument("--center-lon", type=float, default=None,
                        help="place the box centre here instead of the footprint centroid")
    parser.add_argument("--center-lat", type=float, default=None,
                        help="place the box centre here instead of the footprint centroid")
    parser.add_argument("--max-dates", type=int, default=10, help="how many dates to require")
    parser.add_argument("--site-id", default="ne-brazil-139-092")
    parser.add_argument("--title", default="NISAR backscatter change - NE Brazil")
    parser.add_argument("--out", default="/tmp/real-site.yaml")
    parser.add_argument("--force", action="store_true", help="overwrite the output file")
    args = parser.parse_args()

    out = Path(args.out)
    if out.exists() and not args.force:
        print(f"refusing to overwrite {out} (pass --force)", file=sys.stderr)
        return 1

    search_bbox = parse_bbox(args.bbox)
    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        dataMaturity=args.maturity,
        intersectsWith=bbox_to_polygon(search_bbox),
        start=f"{args.start}T00:00:00Z",
        end=f"{args.end}T23:59:59Z",
        maxResults=500,
    )

    by_date: dict[str, list] = defaultdict(list)
    for product in results:
        name = str(product.properties.get("sceneName", ""))
        parts = name.split("_")
        try:
            track = int(parts[5])
            direction = parts[6]
            frame = int(parts[7])
        except (IndexError, ValueError):
            continue
        if (track, direction, frame) != (args.track, args.direction, args.frame):
            continue
        date = granule_date(product)
        if date:
            by_date[date].append(product)

    if not by_date:
        print(f"no {args.maturity} granules for track {args.track} "
              f"{args.direction} frame {args.frame} in that window", file=sys.stderr)
        print("try a wider --start/--end or a different --bbox", file=sys.stderr)
        return 1

    dates = sorted(by_date)[-args.max_dates:]
    if len(dates) < 2:
        print(f"only one date available ({dates}); a pair needs two", file=sys.stderr)
        return 1

    chosen = [by_date[date][0] for date in dates]
    total_bytes = sum(granule_h5_bytes(product) for product in chosen)

    geometries = [shape(product.geometry) for product in chosen]
    overlap = geometries[0]
    for geometry in geometries[1:]:
        overlap = overlap.intersection(geometry)
    if overlap.is_empty:
        print("footprints do not overlap; cannot place a box", file=sys.stderr)
        return 1
    minx, miny, maxx, maxy = overlap.bounds
    if args.center_lon is not None and args.center_lat is not None:
        cx, cy = args.center_lon, args.center_lat
        if not (minx <= cx <= maxx and miny <= cy <= maxy):
            print(f"centre ({cx}, {cy}) is outside the granule overlap "
                  f"[{minx:.3f}, {miny:.3f}, {maxx:.3f}, {maxy:.3f}]", file=sys.stderr)
            return 1
    else:
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    half = args.box_deg / 2
    bbox = [
        round(max(minx, cx - half), 4),
        round(max(miny, cy - half), 4),
        round(min(maxx, cx + half), 4),
        round(min(maxy, cy + half), 4),
    ]

    pairs = []
    for index in range(len(dates) - 1):
        pre, post = dates[index], dates[index + 1]
        pairs.append(
            {
                "id": f"pair-{pre}-{post}",
                "pre": pre,
                "post": post,
                "label": f"{pre} to {post}",
            }
        )

    pair_lines = "\n".join(
        f'  - id: {pair["id"]}\n    pre: "{pair["pre"]}"\n'
        f'    post: "{pair["post"]}"\n    label: "{pair["label"]}"'
        for pair in pairs
    )

    yaml_text = f"""id: {args.site_id}
title: "{args.title}"
event_type: other
description: >-
  Real NISAR L2 GCOV (PROVISIONAL) radar backscatter over track {args.track}, frame
  {args.frame}, {args.direction} direction, comparing {len(dates)} consecutive
  acquisitions spaced by the 12-day NISAR repeat cycle.
caveat: >-
  {CAVEAT}
bbox: {bbox}
polarizations:
  - HH
smoothing_px: 3
thresholds_db:
  - 2.0
  - 3.0
  - 6.0
default_threshold_db: 3.0
stack:
  track: {args.track}
  frame: {args.frame}
  direction: {args.direction}
  maturity: {args.maturity}
pairs:
{pair_lines}
tiles:
  min_zoom: 8
  max_zoom: 14
  budget_mb: 150
"""

    out.write_text(yaml_text, encoding="utf-8")

    free = shutil.disk_usage("/srv" if Path("/srv").exists() else ".").free
    print(f"stack      : track {args.track} {args.direction} frame {args.frame} ({args.maturity})")
    print(f"dates      : {len(dates)}  {dates[0]} .. {dates[-1]}")
    print(f"granules   : {len(chosen)}")
    print(f"download   : {total_bytes / 1024 ** 3:.2f} GiB")
    print(f"disk free  : {free / 1024 ** 3:.1f} GiB")
    print(f"overlap    : {[round(v, 4) for v in (minx, miny, maxx, maxy)]}")
    print(f"bbox       : {bbox}")
    print(f"wrote      : {out}")
    print()
    for date, product in zip(dates, chosen):
        size = granule_h5_bytes(product) / 1024 ** 2
        print(f"  {date}  {size:7.0f} MiB  {product.properties.get('sceneName')}")
    print()
    print("next:")
    print(f"  python -m nisar.cli build-site --config {out} "
          f"--max-acquisitions {len(chosen)} --dry-run")
    if total_bytes > free * 0.8:
        print("\nWARNING: this download would use most of the free disk space")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
