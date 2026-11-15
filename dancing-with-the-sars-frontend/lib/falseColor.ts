import type mapboxgl from "mapbox-gl";

// A display-only sequential palette for the normalized grayscale observation tiles.
// Evenly spaced stops create a smoother transition through the display range.
export const OBSERVATION_FALSE_COLOR: mapboxgl.ExpressionSpecification = [
  "interpolate", ["linear"], ["raster-value"],
  0, "#211438",
  0.125, "#30224f",
  0.25, "#443768",
  0.375, "#5b507d",
  0.5, "#756b8f",
  0.625, "#95889e",
  0.75, "#b5a69f",
  0.875, "#d2c3a3",
  1, "#efe5bb",
];

export function setObservationPalette(map: mapboxgl.Map, layerId: string, enabled: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setPaintProperty(layerId, "raster-color", enabled ? OBSERVATION_FALSE_COLOR : undefined);
}
