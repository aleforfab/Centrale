# SAR Time Machine — local prototype

A standalone image-based player, separate from the repository's Next.js frontend and FastAPI backend. Python 3 is the only requirement.

```sh
cd sar-time-machine-prototype
python3 server.py
```

Open http://localhost:8765. Use `--port 8000` to change the port and `--host 127.0.0.1` to restrict access to your own machine. The server generates its synthetic frames in memory on startup; it makes no external requests. Use `python3 synthetic.py --output frames/` only if you want copies on disk.

**The images are synthetic illustrations, not satellite observations or evidence of an actual eruption.** Their dates and spacing are illustrative. The grid and coordinates approximate a linearly mapped bounding box; this is not a projected map or a scientific measurement tool.

## Controls

Play/pause, step, select a date on the timeline, adjust speed and loop. Playback gives each observation equal screen time, regardless of the number of days between acquisitions. Swipe compare shows a chosen baseline on the left and the current frame on the right. Zoom with the buttons or mouse wheel and pan by dragging; both layers stay aligned. Use Space and the arrow keys outside controls; the swipe handle also supports arrow keys, Home and End. Reduced-motion preferences disable crossfades.

## Future integration

The demo server emulates `GET /api/series` with `{site, bbox: [west, south, east, north], display_range, notice, frames: [{date, url, polarization}]}`. Images must be ordered, coregistered, equally sized, and represent the same extent and display stretch. The frontend preloads them before enabling playback. A real catalog and imagery are **not implemented here**.

The existing project instead exposes `/api/sites/{id}` and raster tile URL templates in site manifests. Integrating this player requires adapting that contract and handling tiled map loading, projection, camera synchronization and real data attribution; simply substituting tile URLs for image URLs will not work. No existing application files were changed.
