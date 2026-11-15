"""Re-render the installed Anak Krakatau difference COGs, without re-analysis.

Run from the backend directory on the product host:
    python -m scripts.recolour_anak_krakatau /srv/dancing-sars/products/anak-krakatau

The path is the installed site directory (check PRODUCTS_DIR on the host).
Original tiles and COGs are left intact. New tiles are published under a new
URL before the manifest is atomically updated. No granules or network needed.
"""
from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path

from nisar.export import render_tiles, write_json


def recolour(site_dir: Path, budget_mb: float = 1024) -> None:
    site_dir = site_dir.resolve()
    manifest_path = site_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["site"]["id"] != "anak-krakatau":
        raise ValueError("This operation is restricted to the Anak Krakatau site")
    layers = [layer for layer in manifest["layers"] if layer["kind"] == "difference"]
    if not layers:
        raise ValueError("No installed difference products")
    for layer in layers:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", layer["id"]):
            raise ValueError("Unsafe layer id")
        if not (site_dir / "cogs" / f"{layer['id']}.tif").is_file():
            raise FileNotFoundError(f"Missing COG for {layer['id']}")
    destination = site_dir / "tiles-diverging-v1"
    if destination.exists():
        raise FileExistsError(f"{destination} already exists; inspect the manifest before rerunning")
    with tempfile.TemporaryDirectory(prefix=".recolour-", dir=site_dir) as temp:
        staged = Path(temp) / "tiles-diverging-v1"
        for layer in layers:
            render_tiles(site_dir / "cogs" / f"{layer['id']}.tif", staged / layer["id"],
                         kind="difference_diverging", min_zoom=layer["min_zoom"],
                         max_zoom=layer["max_zoom"], budget_mb=budget_mb, minimum=-8, maximum=8)
            layer["tile_url_template"] = f"/products/anak-krakatau/tiles-diverging-v1/{layer['id']}/{{z}}/{{x}}/{{y}}.png"
            layer["legend"] = "Finish minus start (dB): −8 blue, 0 neutral, +8 red"
        staged.rename(destination)
        write_json(manifest_path, manifest)
    print(f"Published {len(layers)} difference products at {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site_dir", type=Path)
    parser.add_argument("--budget-mb", type=float, default=1024, help="tile estimate limit per layer")
    args = parser.parse_args()
    recolour(args.site_dir, args.budget_mb)


if __name__ == "__main__":
    main()
