"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DEFAULT_BBOX, isValidBbox } from "@/lib/timeMachine";

export type Bbox = [number, number, number, number];

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const HAS_MAPBOX_TOKEN = /^pk\.[A-Za-z0-9._-]{20,}$/.test(MAPBOX_TOKEN);

const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "dark-background",
      type: "background",
      paint: { "background-color": "#071018" },
    },
  ],
} as unknown as mapboxgl.Style;

const BASEMAP_STYLE = "mapbox://styles/mapbox/dark-v11";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function bboxFeature(bbox: Bbox | null): FeatureCollection<Polygon> {
  if (!bbox) return { type: "FeatureCollection", features: [] };
  const [west, south, east, north] = bbox;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]],
        },
      },
    ],
  };
}

function updateSelection(map: mapboxgl.Map | null, bbox: Bbox | null): void {
  if (!map) return;
  const source = map.getSource("selection") as mapboxgl.GeoJSONSource | undefined;
  source?.setData(bboxFeature(bbox));
}

function normalizeBbox(start: [number, number], end: [number, number]): Bbox {
  return [
    Math.min(start[0], end[0]),
    Math.min(start[1], end[1]),
    Math.max(start[0], end[0]),
    Math.max(start[1], end[1]),
  ];
}

interface RegionSelectorProps {
  initialBbox?: Bbox | null;
  onChange: (bbox: Bbox | null) => void;
}

export function RegionSelector({ initialBbox = DEFAULT_BBOX, onChange }: RegionSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onChangeRef = useRef(onChange);
  const initialRef = useRef<Bbox | null>(initialBbox);
  const drawModeRef = useRef(true);
  const fallbackAppliedRef = useRef(false);
  const [drawMode, setDrawMode] = useState(true);
  const [usingFallback, setUsingFallback] = useState(!HAS_MAPBOX_TOKEN);
  const [bbox, setBbox] = useState<Bbox | null>(initialBbox);
  const [manualText, setManualText] = useState(
    initialBbox ? initialBbox.map((value) => value.toFixed(3)).join(", ") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  onChangeRef.current = onChange;

  const applyBbox = useCallback((next: Bbox | null) => {
    setBbox(next);
    setManualText(next ? next.map((value) => value.toFixed(3)).join(", ") : "");
    updateSelection(mapRef.current, next);
    onChangeRef.current(next);
  }, []);

  const applyBboxRef = useRef(applyBbox);
  applyBboxRef.current = applyBbox;

  useEffect(() => {
    onChangeRef.current(initialRef.current);
  }, []);

  useEffect(() => {
    drawModeRef.current = drawMode;
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = drawMode ? "crosshair" : "grab";
    }
  }, [drawMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN || "pk.prototype-no-token";
    fallbackAppliedRef.current = !HAS_MAPBOX_TOKEN;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: HAS_MAPBOX_TOKEN ? BASEMAP_STYLE : FALLBACK_STYLE,
        center: [
          ((initialRef.current ?? DEFAULT_BBOX)[0] + (initialRef.current ?? DEFAULT_BBOX)[2]) / 2,
          ((initialRef.current ?? DEFAULT_BBOX)[1] + (initialRef.current ?? DEFAULT_BBOX)[3]) / 2,
        ],
        zoom: 4,
        attributionControl: false,
        boxZoom: false,
        doubleClickZoom: false,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Mapbox could not be created.");
      return;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().style.cursor = "crosshair";
    drawModeRef.current = drawMode;

    const ensureSelection = () => {
      if (!map.getSource("selection")) {
        map.addSource("selection", { type: "geojson", data: bboxFeature(initialRef.current) });
      }
      if (!map.getLayer("selection-fill")) {
        map.addLayer({
          id: "selection-fill",
          type: "fill",
          source: "selection",
          paint: { "fill-color": "#ff8a4c", "fill-opacity": 0.16 },
        });
      }
      if (!map.getLayer("selection-line")) {
        map.addLayer({
          id: "selection-line",
          type: "line",
          source: "selection",
          paint: { "line-color": "#ff8a4c", "line-width": 2 },
        });
      }
    };

    map.on("load", () => {
      setReady(true);
      ensureSelection();
      if (initialRef.current) {
        map.fitBounds(
          [
            [initialRef.current[0], initialRef.current[1]],
            [initialRef.current[2], initialRef.current[3]],
          ],
          { padding: 26, duration: 0 },
        );
      }
    });

    map.on("style.load", ensureSelection);

    map.on("error", (event) => {
      const message = (event as { error?: Error }).error?.message ?? "";
      if (!message) return;
      if (!fallbackAppliedRef.current && /token|401|403|style|failed/i.test(message)) {
        fallbackAppliedRef.current = true;
        setUsingFallback(true);
        map.setStyle(FALLBACK_STYLE);
        return;
      }
      setError(message);
    });

    let dragging = false;
    let start: [number, number] | null = null;

    const toLngLat = (point: { x: number; y: number }): [number, number] => {
      const position = map.unproject([point.x, point.y]);
      return [clamp(position.lng, -180, 180), clamp(position.lat, -90, 90)];
    };

    const onDown = (event: mapboxgl.MapMouseEvent) => {
      if (!drawModeRef.current) return;
      dragging = true;
      start = toLngLat(event.point);
      map.dragPan.disable();
      setError(null);
    };
    const onMove = (event: mapboxgl.MapMouseEvent) => {
      if (!dragging || !start) return;
      applyBboxRef.current(normalizeBbox(start, toLngLat(event.point)));
    };
    const onUp = (event: mapboxgl.MapMouseEvent) => {
      if (dragging && start) {
        applyBboxRef.current(normalizeBbox(start, toLngLat(event.point)));
      }
      dragging = false;
      start = null;
      map.dragPan.enable();
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const useCurrentView = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const next: Bbox = [
      clamp(bounds.getWest(), -180, 180),
      clamp(bounds.getSouth(), -90, 90),
      clamp(bounds.getEast(), -180, 180),
      clamp(bounds.getNorth(), -90, 90),
    ];
    if (isValidBbox(next)) applyBboxRef.current(next);
  };

  const applyManual = () => {
    const values = manualText.split(",").map((item) => Number(item.trim()));
    if (!isValidBbox(values)) {
      setError("Enter four finite numbers as west, south, east, north with west < east and south < north.");
      return;
    }
    setError(null);
    applyBboxRef.current(values as Bbox);
  };

  return (
    <section className="tm-panel">
      <h2 className="tm-panel__title">1 · Select a region</h2>
      <div className="tm-map">
        <div ref={containerRef} className="tm-map__canvas" aria-label="Mapbox region selector" />
        <div className="tm-map__grid" aria-hidden="true" />
        <div className="tm-map__hint">
          {drawMode
            ? "Drag on the Mapbox canvas to draw a bounding box"
            : "Pan mode: drag to reposition, then use the current view"}
        </div>
      </div>

      {bbox ? (
        <div className="tm-bbox" aria-label="Selected bounding box">
          <span>W {bbox[0].toFixed(3)}</span>
          <span>S {bbox[1].toFixed(3)}</span>
          <span>E {bbox[2].toFixed(3)}</span>
          <span>N {bbox[3].toFixed(3)}</span>
        </div>
      ) : (
        <p className="tm-muted">No region selected. Draw a box, use the current view, or enter coordinates.</p>
      )}

      <div className="tm-actions">
        <button
          type="button"
          className="tm-button"
          aria-pressed={drawMode}
          onClick={() => setDrawMode(true)}
        >
          Draw region
        </button>
        <button
          type="button"
          className="tm-button tm-button--ghost"
          aria-pressed={!drawMode}
          onClick={() => setDrawMode(false)}
        >
          Pan map
        </button>
        <button type="button" className="tm-button" onClick={useCurrentView} disabled={!ready}>
          Use current view
        </button>
        <button type="button" className="tm-button tm-button--ghost" onClick={() => applyBboxRef.current(null)}>
          Clear
        </button>
      </div>

      <label className="tm-muted" style={{ display: "grid", gap: 6, marginTop: 12 }}>
        Manual bbox
        <input
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="west, south, east, north"
          className="tm-controls__input"
          aria-label="Manual bounding box"
        />
      </label>
      <div className="tm-actions">
        <button type="button" className="tm-button" onClick={applyManual}>
          Apply coordinates
        </button>
      </div>

      {error && (
        <p className="tm-problem" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      <p className="tm-muted" style={{ marginTop: 10 }}>
        The Mapbox GL canvas provides the region geometry. This prototype uses procedural frames, so the selected
        bbox changes the query and viewport, not real satellite measurements.
        {usingFallback && " A local dark grid stands in for the basemap because no URL-restricted Mapbox token is configured in this preview."}
      </p>
    </section>
  );
}
