"""Synthetic SAR-like frame generator for the standalone prototype.

Pure-stdlib (no PIL / numpy) so the prototype runs anywhere with Python 3.11+.

What this is:
  A deterministic, procedurally generated stand-in for dated, coregistered
  SAR backscatter frames. It exists so the browser player (preload,
  crossfade, timeline, swipe) can be exercised end-to-end without real
  NISAR data. It is NOT a real observation.

What this is not:
  - Not NISAR, not Sentinel-1, not evidence of any real change.
  - The island growth is a simple radial model + speckle, not physics.

Frame contract (what the frontend expects):
  - All frames share the same size (640x480, 4:3) and bbox.
  - Dates are irregularly spaced (4-21 days) to exercise the 1-30 day
    cadence the real stack will have.
  - Each frame is an 8-bit grayscale PNG: brighter = stronger return
    after the display stretch. Ocean is dark, land/crater is brighter.

Usage:
  python synthetic.py --output frames/     # write PNGs to disk
  python synthetic.py --info               # print the catalog JSON
"""

from __future__ import annotations

import argparse
import json
import math
import random
import struct
import zlib
from datetime import date, timedelta
from pathlib import Path

WIDTH = 640
HEIGHT = 480

# Anak Krakatau area, WGS84 [west, south, east, north].
BBOX = [105.40, -6.15, 105.55, -6.03]

# Irregular cadence: gaps in days between consecutive frames.
GAPS_DAYS = [6, 12, 4, 18, 9, 21, 12]
START_DATE = date(2026, 9, 1)

DISPLAY_RANGE_DB = [-25.0, -5.0]
POLARIZATION = "HH"

NOTICE = (
    "These frames are procedurally generated to demonstrate the interaction. "
    "They are not NISAR observations and do not reconstruct the real eruption."
)


def frame_dates() -> list[date]:
    dates = [START_DATE]
    current = START_DATE
    for gap in GAPS_DAYS:
        current = current + timedelta(days=gap)
        dates.append(current)
    return dates


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc)


def encode_png_grayscale(width: int, height: int, pixels: bytes) -> bytes:
    """Encode 8-bit grayscale pixels (row-major, no padding) as PNG bytes."""
    if len(pixels) != width * height:
        raise ValueError(f"expected {width * height} pixels, got {len(pixels)}")
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    raw = bytearray()
    stride = width
    for y in range(height):
        raw.append(0)  # filter type 0 (None) for this scanline
        raw.extend(pixels[y * stride : (y + 1) * stride])
    idat = zlib.compress(bytes(raw), level=6)
    return (
        signature
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )


def _frame_pixels(index: int, total: int) -> bytes:
    """Return grayscale pixel bytes for frame `index` of `total`."""
    rng = random.Random(1000 + index * 7919)
    cx = WIDTH * 0.52
    cy = HEIGHT * 0.48
    # Island base radius grows over the sequence.
    t = index / max(total - 1, 1)
    base_radius = 22 + 46 * t  # 22 -> 68 px
    # Crater offset drifts slightly south-east as the island grows.
    crater_cx = cx + 4 + 6 * t
    crater_cy = cy + 2 + 5 * t
    crater_r = 7 + 9 * t

    pixels = bytearray(WIDTH * HEIGHT)
    # Precompute per-angle edge wobble so the island outline is stable
    # within a frame but evolves between frames.
    angle_seed = index * 1.7

    for y in range(HEIGHT):
        dy = y - cy
        for x in range(WIDTH):
            dx = x - cx
            dist = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)
            wobble = (
                1.0
                + 0.22 * math.sin(3 * angle + angle_seed)
                + 0.13 * math.sin(7 * angle + angle_seed * 2.0)
                + 0.07 * math.sin(13 * angle)
            )
            edge = base_radius * wobble
            # Speckle: deterministic per-frame noise in [-1, 1].
            speckle = rng.random() * 2.0 - 1.0

            if dist < edge:
                # Land: brighter, textured. Crater is brightest.
                crater_dist = math.hypot(x - crater_cx, y - crater_cy)
                if crater_dist < crater_r:
                    # Crater rim / fresh deposit.
                    value = 165 + 45 * speckle + 25 * (1 - crater_dist / crater_r)
                else:
                    # Island flank with radial shading.
                    shade = 1.0 - 0.35 * (dist / max(edge, 1.0))
                    value = (95 + 35 * speckle) * shade + 18
                # Lava flow: bright streak to the south-east, length grows.
                flow_len = 30 + 110 * t
                flow_dx = x - cx
                flow_dy = y - cy
                # Project onto flow direction (approx 35 degrees below horizontal).
                flow_dir_x, flow_dir_y = 0.82, 0.57
                along = flow_dx * flow_dir_x + flow_dy * flow_dir_y
                across = -flow_dx * flow_dir_y + flow_dy * flow_dir_x
                if 0 < along < flow_len and abs(across) < 9 + 10 * t:
                    falloff = 1.0 - abs(across) / (9 + 10 * t)
                    value = max(value, 140 + 40 * falloff + 30 * speckle)
            else:
                # Ocean: dark with gentle swell + speckle.
                swell = 6 * math.sin(x * 0.018 + y * 0.011 + index * 0.6)
                value = 38 + swell + 16 * speckle
                # Faint wake / current streak north of the island.
                if abs(y - (cy - base_radius - 18)) < 3 and abs(x - cx) < 120:
                    value += 8

            # Clamp to 0..255.
            if value < 0:
                value = 0
            elif value > 255:
                value = 255
            pixels[y * WIDTH + x] = int(value)
    return bytes(pixels)


_FRAME_CACHE: dict[int, bytes] = {}


def get_frame_png(index: int) -> bytes:
    """Return PNG bytes for frame `index`, generating and caching on demand."""
    total = len(frame_dates())
    if not 0 <= index < total:
        raise IndexError(f"frame index {index} out of range 0..{total - 1}")
    if index not in _FRAME_CACHE:
        _FRAME_CACHE[index] = encode_png_grayscale(WIDTH, HEIGHT, _frame_pixels(index, total))
    return _FRAME_CACHE[index]


def series_catalog() -> dict:
    """Return the /api/series JSON payload the frontend consumes."""
    dates = frame_dates()
    frames = []
    for i, d in enumerate(dates):
        frames.append(
            {
                "date": d.isoformat(),
                "url": f"/frames/frame-{i:02d}.png",
                "polarization": POLARIZATION,
            }
        )
    return {
        "site": {
            "id": "anak-krakatau-synthetic",
            "title": "Anak Krakatau · Indonesia",
            "event_type": "volcano",
        },
        "bbox": BBOX,
        "display_range": DISPLAY_RANGE_DB,
        "notice": NOTICE,
        "frames": frames,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic SAR prototype frames.")
    parser.add_argument("--output", type=Path, default=Path("frames"), help="Output directory for PNGs")
    parser.add_argument("--info", action="store_true", help="Print catalog JSON and exit")
    args = parser.parse_args(argv)

    if args.info:
        print(json.dumps(series_catalog(), indent=2))
        return 0

    args.output.mkdir(parents=True, exist_ok=True)
    dates = frame_dates()
    for i, d in enumerate(dates):
        png = get_frame_png(i)
        out = args.output / f"frame-{i:02d}.png"
        out.write_bytes(png)
        print(f"wrote {out} ({len(png)} bytes, {d.isoformat()})")
    print()
    print("Synthetic data. The notice in the catalog must stay visible in the UI.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
