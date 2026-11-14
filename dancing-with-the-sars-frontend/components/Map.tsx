"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { ProductLayer } from "@/lib/types";
import { api } from "@/lib/api";
import { getMapboxToken, hasMapboxToken } from "@/lib/mapboxToken";

export type MapView = "optical" | "sar";

interface MapProps {
  bbox: number[];
  layers: ProductLayer[];
  view: MapView;
  setView: (view: MapView) => void;
}

const MAPBOX_TOKEN = getMapboxToken();
mapboxgl.accessToken = MAPBOX_TOKEN;
const HAS_MAPBOX_TOKEN = hasMapboxToken();

const FALLBACK_STYLE = (dark: boolean): mapboxgl.Style =>
  ({
    version: 8,
    sources: {},
    layers: [
      {
        id: "dark-background",
        type: "background",
        paint: { "background-color": dark ? "#071018" : "#0b1720" },
      },
    ],
  }) as unknown as mapboxgl.Style;

const styleForView = (view: MapView): string | mapboxgl.Style => {
  if (!HAS_MAPBOX_TOKEN) return FALLBACK_STYLE(view === "sar");
  return view === "optical"
    ? "mapbox://styles/mapbox/satellite-streets-v12"
    : "mapbox://styles/mapbox/dark-v11";
};

function syncProductLayers(map: mapboxgl.Map, layers: ProductLayer[]) {
  const activeLayerIds = new Set(layers.map((layer) => `nisar-layer-${layer.id}`));
  const activeSourceIds = new Set(layers.map((layer) => `nisar-source-${layer.id}`));
  for (const existing of map.getStyle().layers ?? []) {
    if (existing.id.startsWith("nisar-layer-") && !activeLayerIds.has(existing.id)) {
      map.removeLayer(existing.id);
    }
  }
  for (const existing of Object.keys(map.getStyle().sources ?? {})) {
    if (existing.startsWith("nisar-source-") && !activeSourceIds.has(existing)) {
      map.removeSource(existing);
    }
  }

  layers.forEach((layer, index) => {
    const sourceId = `nisar-source-${layer.id}`;
    const layerId = `nisar-layer-${layer.id}`;
    const tileUrl = api.baseUrl
      ? new URL(layer.tile_url_template, `${api.baseUrl}/`).toString()
      : new URL(layer.tile_url_template, window.location.origin).toString();
    const source = map.getSource(sourceId) as mapboxgl.RasterTileSource | undefined;
    if (source) {
      source.setTiles([tileUrl]);
      map.setPaintProperty(layerId, "raster-opacity", layer.kind === "difference" ? 0.72 : 0.9);
      return;
    }
    map.addSource(sourceId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      minzoom: layer.min_zoom,
      maxzoom: layer.max_zoom,
    });
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: { "raster-opacity": layer.kind === "difference" ? 0.72 : 0.9 },
    }, index ? `nisar-layer-${layers[index - 1].id}` : undefined);
  });
}

export const Map: React.FC<MapProps> = ({ bbox, layers, view, setView }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const currentLayers = useRef(layers);
  currentLayers.current = layers;

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
    map.current.on("load", () => {
      if (map.current) syncProductLayers(map.current, currentLayers.current);
    });
    map.current.on("style.load", () => {
      if (map.current) syncProductLayers(map.current, currentLayers.current);
    });
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
  }, []);

  useEffect(() => {
    if (!map.current || bbox.length !== 4) return;
    map.current.fitBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      { padding: 48, duration: 700 },
    );
  }, [bbox]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    currentMap.setStyle(styleForView(view));
    currentMap.once("style.load", () => {
      if (map.current) syncProductLayers(map.current, currentLayers.current);
    });
  }, [view]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (currentMap.isStyleLoaded()) {
      syncProductLayers(currentMap, layers);
    } else {
      currentMap.once("style.load", () => {
        if (map.current) syncProductLayers(map.current, currentLayers.current);
      });
    }
  }, [layers]);

  const selectedLayer = layers[0] ?? null;
  const layerColor = selectedLayer?.kind === "difference"
    ? "Blue = lower later return · Red = higher later return"
    : selectedLayer?.kind === "change_mask"
      ? "Blue = lower later return · Red = higher later return"
      : "Grayscale: brighter means stronger radar return";

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-lg border border-slate-700/80">
      <div ref={mapContainer} className="h-full w-full" />
      {!HAS_MAPBOX_TOKEN && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(125,216,236,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(125,216,236,0.12) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="absolute right-3 top-3 max-w-[240px] rounded-md border border-amber-700/50 bg-slate-950/90 px-2 py-1 text-[10px] leading-4 text-amber-100">
            Local canvas: product tiles remain visible; Mapbox basemap needs a real token.
          </div>
        </>
      )}
      <div className="absolute left-3 top-3 flex rounded-md border border-slate-600 bg-slate-950/95 p-1 text-xs shadow-lg">
        {(["optical", "sar"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
            className={`rounded px-3 py-1.5 capitalize ${
              view === mode ? "bg-slate-700 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            {mode === "optical" ? "Optical context" : "NISAR"}
          </button>
        ))}
      </div>
      <aside className="absolute bottom-3 left-3 max-w-[320px] rounded-md border border-slate-700 bg-slate-950/95 p-3 text-[11px] text-slate-300 shadow-lg">
        <h3 className="mb-1 text-xs font-semibold text-white">
          {layers.length > 1 ? `${layers.length} NISAR product layers` : selectedLayer?.title ?? "No product layer selected"}
        </h3>
        <p>{view === "optical" ? "Mapbox satellite imagery is visual context only, not a matched-date observation." : selectedLayer?.legend ?? layerColor}</p>
      </aside>
      <div className="absolute bottom-3 right-3 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-slate-300">
        {HAS_MAPBOX_TOKEN ? "Map imagery © Mapbox" : "Preview canvas · no external basemap"}
      </div>
    </div>
  );
};
