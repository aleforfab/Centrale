# Anak Krakatau presentation deployment

The frontend reads the installed manifest; live fetch is not needed. Deploy the
frontend and backend code in the usual way. This repository checkout does not
contain the real products or the granule cache. Leave the five granules in
`/srv/dancing-sars/cache/granules` and out of git.

To update the existing site's difference tiles without downloading or rerunning
the analysis, run on the product host from `dancing-with-sars-backend`, using
its Python environment and the actual site directory under `PRODUCTS_DIR`:

```sh
python -m scripts.recolour_anak_krakatau /srv/dancing-sars/products/anak-krakatau
```

Confirm the configured product directory first; the example path may differ.
The script reads the installed difference COGs, writes a continuous blue–neutral–red
ramp at −8 / 0 / +8 dB under a new versioned tile path, then atomically updates
only the difference URLs and legends in the manifest. It does not change COGs,
statistics, masks, thresholds, pairing or smoothing. It fails if a COG is
missing or the versioned directory already exists. If it is interrupted after
publishing the directory but before updating the manifest, inspect the manifest
and remove that unreferenced directory before retrying; do not remove the old
`tiles` directory. Existing old tiles remain available for rollback. Future
builds of this site use the same display ramp; other sites retain their existing
presentation.

After deployment, reload the manifest and check the four difference URLs point to
`tiles-diverging-v1`. On the deployed device, check both map views with the browser
console open (including `map.getStyle().layers.length` before and after the toggle
if inspecting the map instance), then check curated-pair difference and 6 dB
mask, map attribution, the five-frame unified Timeline & compare page with live fetch disabled, and
the manifest caveat. The recolour cannot be confirmed until it is run on the host.

`/compare` redirects to the comparison view of `/time-machine`. Test the
clickable date buttons, playback after tiles load, and the observation-only false
colour palette. Difference and categorical-mask colours are intentionally unchanged.
