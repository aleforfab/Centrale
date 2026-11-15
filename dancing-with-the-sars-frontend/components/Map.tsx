"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { ProductLayer } from "@/lib/types";
import { api } from "@/lib/api";
import { resolveTileUrl } from "@/lib/tileUrl";
import { getMapboxToken, hasMapboxToken } from "@/lib/mapboxToken";

export type MapView = "optical" | "sar";

interface MapProps {
  bbox: number[];
  /**
   * Full set of product layers to mount. Must be referentially stable during
   * playback: mounted raster sources/layers are only add/removed when the
   * *set* changes, so Mapbox keeps its tile cache and frames never flash.
   */
  layers: ProductLayer[];
  /**
   * Optional playback cursor. When set, the matching layer is visible and all
   * other mounted product layers are hidden via `layout.visibility` — no
   * source/layer removal or re-add, ever, while this prop changes.
   */
  activeLayerId?: string;
  view: MapView;
  setView: (view: MapView) => void;
}

const MAPBOX_TOKEN = getMapboxToken();
mapboxgl.accessToken = MAPBOX_TOKEN;
const HAS_MAPBOX_TOKEN = hasMapboxToken();

const SATELLITE_STREETS_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const PRODUCT_LAYER_PREFIX = "nisar-layer-";
const PRODUCT_SOURCE_PREFIX = "nisar-source-";
const RASTER_OPACITY_OBSERVATION = 0.8;
const RASTER_OPACITY_DIFFERENCE = 0.72;
const SITE_FOOTPRINT_SOURCE = "site-bbox";
const SITE_FOOTPRINT_LAYER = "site-bbox-line";
const SITE_FOOTPRINT_COLOR = "#ff8a3d";
const SITE_FOOTPRINT_WIDTH = 2;

/*
 * Map chrome — REDESIGN_GUIDE §3 "on-imagery chips": the one dark exception.
 * Imagery is dark, so overlays are near-black chips with paper text instead of
 * paper chips. Values are the guide's literals (there is no token for them).
 * The page owns the `.plate` frame; this component draws no border of its own.
 */
const CHIP =
  "rounded-[2px] border border-[rgba(245,243,236,0.24)] bg-[rgba(13,12,10,0.88)] font-[family-name:var(--font-mono)] text-[#F5F3EC]";
const CHIP_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8A3D]";
/* Mapbox's own controls, squared off and de-shadowed to sit in the same system. */
const MAPBOX_CONTROLS =
  "[&_.mapboxgl-ctrl-group]:!rounded-[2px] [&_.mapboxgl-ctrl-group]:!shadow-none [&_.mapboxgl-ctrl-group]:border [&_.mapboxgl-ctrl-group]:border-[rgba(22,19,15,0.32)] [&_.mapboxgl-ctrl-scale]:!rounded-none [&_.mapboxgl-ctrl-scale]:font-[family-name:var(--font-mono)]";

const FALLBACK_STYLE = (dark: boolean): mapboxgl.Style =>
  ({
    version: 8,
    sources: {},
    layers: [
      {
        id: "dark-background",
        type: "background",
        paint: { "background-color": dark ? "#0D0C0A" : "#14120F" },
      },
    ],
  }) as unknown as mapboxgl.Style;

const styleForView = (view: MapView): string | mapboxgl.Style => {
  if (!HAS_MAPBOX_TOKEN) return FALLBACK_STYLE(view === "sar");
  // The SAR/NISAR view rides on real satellite context per maintainer decision;
  // both views share the satellite-streets basemap.
  return SATELLITE_STREETS_STYLE;
};

function bboxPolygon(bbox: number[]): GeoJSON.Feature<GeoJSON.Polygon> {
  const [w, s, e, n] = bbox;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
    },
  };
}

/**
 * Mount/update the exact site footprint (the `site-bbox` source and the
 * `site-bbox-line` layer). GeoJSON `setData` keeps the footprint cheap to move
 * when the site changes; it is re-added by the style.load handler after any
 * basemap switch, because `setStyle` drops runtime sources/layers.
 */
function syncSiteFootprint(map: mapboxgl.Map, bbox: number[]) {
  if (bbox.length !== 4) return;
  const data = bboxPolygon(bbox);
  const source = map.getSource(SITE_FOOTPRINT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(SITE_FOOTPRINT_SOURCE, { type: "geojson", data });
  }
  if (!map.getLayer(SITE_FOOTPRINT_LAYER)) {
    map.addLayer({
      id: SITE_FOOTPRINT_LAYER,
      type: "line",
      source: SITE_FOOTPRINT_SOURCE,
      paint: { "line-color": SITE_FOOTPRINT_COLOR, "line-width": SITE_FOOTPRINT_WIDTH },
    });
  }
}

/**
 * Reconcile mounted product raster sources/layers with the requested *set*.
 * Runs on layer-set changes and after style reloads only — never per playback
 * tick. Existing layers get their opacity/visibility refreshed in place.
 */
function syncProductLayers(map: mapboxgl.Map, layers: ProductLayer[], activeLayerId?: string) {
  const wantedLayerIds = new Set(layers.map((layer) => `${PRODUCT_LAYER_PREFIX}${layer.id}`));
  const wantedSourceIds = new Set(layers.map((layer) => `${PRODUCT_SOURCE_PREFIX}${layer.id}`));
  for (const existing of map.getStyle().layers ?? []) {
    if (existing.id.startsWith(PRODUCT_LAYER_PREFIX) && !wantedLayerIds.has(existing.id)) {
      map.removeLayer(existing.id);
    }
  }
  for (const existing of Object.keys(map.getStyle().sources ?? {})) {
    if (existing.startsWith(PRODUCT_SOURCE_PREFIX) && !wantedSourceIds.has(existing)) {
      map.removeSource(existing);
    }
  }

  layers.forEach((layer, index) => {
    const sourceId = `${PRODUCT_SOURCE_PREFIX}${layer.id}`;
    const layerId = `${PRODUCT_LAYER_PREFIX}${layer.id}`;
    const tileUrl = resolveTileUrl(layer.tile_url_template, api.baseUrl);
    const opacity = layer.kind === "difference" ? RASTER_OPACITY_DIFFERENCE : RASTER_OPACITY_OBSERVATION;
    const visibility = activeLayerId == null || layer.id === activeLayerId ? "visible" : "none";

    const source = map.getSource(sourceId) as mapboxgl.RasterTileSource | undefined;
    if (source) {
      source.setTiles([tileUrl]);
    } else {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: layer.min_zoom,
        maxzoom: layer.max_zoom,
      });
    }

    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "raster-opacity", opacity);
      map.setLayoutProperty(layerId, "visibility", visibility);
      return;
    }
    // Insert each layer below its predecessor so the first entry in `layers`
    // renders on top — preserves the dashboard's selected-layer stacking.
    const previousId = index > 0 ? `${PRODUCT_LAYER_PREFIX}${layers[index - 1].id}` : undefined;
    const beforeId = previousId && map.getLayer(previousId) ? previousId : undefined;
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      layout: { visibility },
      paint: { "raster-opacity": opacity },
    }, beforeId);
  });
}

export const Map: React.FC<MapProps> = ({ bbox, layers, activeLayerId, view, setView }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const currentLayers = useRef(layers);
  currentLayers.current = layers;
  const currentBbox = useRef(bbox);
  currentBbox.current = bbox;
  const currentActiveLayerId = useRef(activeLayerId);
  currentActiveLayerId.current = activeLayerId;

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleForView(view),
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      zoom: 5,
      attributionControl: false,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
    // One permanent style-load handler re-mounts every overlay (product
    // layers + footprint) with the latest props after any style switch.
    const resyncOverlays = () => {
      if (!map.current) return;
      syncProductLayers(map.current, currentLayers.current, currentActiveLayerId.current);
      syncSiteFootprint(map.current, currentBbox.current);
    };
    map.current.on("load", resyncOverlays);
    map.current.on("style.load", resyncOverlays);
    map.current.on("error", (event) => {
      const message = (event as { error?: Error }).error?.message ?? "";
      if (map.current && /token|401|403|style|failed/i.test(message)) {
        map.current.setStyle(FALLBACK_STYLE(true));
      }
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || bbox.length !== 4) return;
    currentMap.fitBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      { padding: 80, maxZoom: 12, duration: 700 },
    );
    if (currentMap.isStyleLoaded()) syncSiteFootprint(currentMap, bbox);
  }, [bbox]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    // The permanent style.load handler re-syncs all overlays once loaded.
    currentMap.setStyle(styleForView(view));
  }, [view]);

  // Layer-set reconciliation: add/remove only when the *set* changes, which
  // never happens during playback (callers memoize the mounted set).
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !currentMap.isStyleLoaded()) return;
    syncProductLayers(currentMap, layers, currentActiveLayerId.current);
  }, [layers]);

  // Playback cursor: flips `layout.visibility` on already-mounted layers only.
  // No addSource/removeSource/addLayer/removeLayer/setTiles runs on this path.
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !currentMap.isStyleLoaded()) return;
    for (const layer of currentLayers.current) {
      const layerId = `${PRODUCT_LAYER_PREFIX}${layer.id}`;
      if (!currentMap.getLayer(layerId)) continue;
      currentMap.setLayoutProperty(
        layerId,
        "visibility",
        activeLayerId == null || layer.id === activeLayerId ? "visible" : "none",
      );
    }
  }, [activeLayerId]);

  const selectedLayer = (activeLayerId ? layers.find((layer) => layer.id === activeLayerId) : undefined) ?? layers[0] ?? null;
  const selectedTitle = activeLayerId
    ? selectedLayer?.title ?? "Selected frame"
    : layers.length > 1
      ? `${layers.length} NISAR product layers`
      : selectedLayer?.title ?? "No product layer selected";
  const layerColor = selectedLayer?.kind === "difference"
    ? "Blue = lower later return · Red = higher later return"
    : selectedLayer?.kind === "change_mask"
      ? "Blue = lower later return · Red = higher later return"
      : "Grayscale: brighter means stronger radar return";

  return (
    <div className={`relative h-full min-h-[420px] w-full overflow-hidden bg-[#0D0C0A] ${MAPBOX_CONTROLS}`}>
      <div ref={mapContainer} className="h-full w-full" />
      {!HAS_MAPBOX_TOKEN && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(245,243,236,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(245,243,236,0.07) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className={`${CHIP} absolute right-14 top-3 max-w-[240px] px-2 py-1 text-[10px] leading-4`}>
            Local canvas: product tiles remain visible; Mapbox basemap needs a real token.
          </div>
        </>
      )}
      <div className={`${CHIP} absolute left-3 top-3 flex gap-0.5 p-0.5`} role="group" aria-label="Map view">
        {(["optical", "sar"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
            className={`rounded-[1px] px-2.5 py-1.5 text-[10px] uppercase leading-none tracking-[0.14em] ${CHIP_FOCUS} ${
              view === mode
                ? "bg-[#F5F3EC] text-[#16130F]"
                : "text-[rgba(245,243,236,0.72)] hover:text-[#F5F3EC]"
            }`}
          >
            {mode === "optical" ? "Optical context" : "NISAR"}
          </button>
        ))}
      </div>
      <aside
        className={`${CHIP} absolute bottom-[4.5rem] left-3 max-w-[min(320px,calc(100%-1.5rem))] sm:bottom-11 px-3 py-2.5 text-[10.5px] leading-[1.5]`}
        aria-label="Map legend"
      >
        <p className="mb-1 text-[11px] font-medium">{selectedTitle}</p>
        <p className="opacity-80">Satellite basemap is visual context only, not a matched-date observation.{view !== "optical" ? ` ${selectedLayer?.legend ?? layerColor}` : ""}</p>
      </aside>
      <div className={`${CHIP} absolute bottom-10 right-3 px-2 py-1 text-[10px] leading-4`}>
        {HAS_MAPBOX_TOKEN ? "Map imagery © Mapbox" : "Preview canvas · no external basemap"}
      </div>
    </div>
  );
};
