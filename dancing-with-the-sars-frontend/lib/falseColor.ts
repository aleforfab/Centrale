import type mapboxgl from "mapbox-gl";

// A display-only palette over the already stretched grayscale observation PNGs.
// It is not an RGB composite and does not derive any new measured product.
export const OBSERVATION_FALSE_COLOR: mapboxgl.ExpressionSpecification = [
  "interpolate", ["linear"], ["raster-value"],
  0, "#1b123c",
  0.35, "#7154a5",
  0.7, "#f2a663",
  1, "#fff4bd",
];

export function setObservationPalette(map: mapboxgl.Map, layerId: string, enabled: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, "raster-color", enabled ? OBSERVATION_FALSE_COLOR : undefined);
}
