"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildComparison,
  clampReveal,
  observationPolarizations,
  processingIdentity,
  usablePairs,
} from "@/lib/comparison";
import type { ProductLayer, SiteManifest } from "@/lib/types";
import { mapStyleForView, type MapView } from "@/components/Map";
import { api } from "@/lib/api";
import { resolveTileUrl } from "@/lib/tileUrl";
import { setObservationPalette } from "@/lib/falseColor";
import { getMapboxToken, hasMapboxToken } from "@/lib/mapboxToken";

const MAPBOX_TOKEN = getMapboxToken();
mapboxgl.accessToken = MAPBOX_TOKEN;
const HAS_MAPBOX_TOKEN = hasMapboxToken();

/*
 * Visual vocabulary — REDESIGN_GUIDE §5/§6. The catalogue classes (`.plate*`,
 * `.rule-table`, `.colophon`, `.footnote`) are owned by `app/redesign.css`
 * and are used here by name only.
 */
const MONO = "font-[family-name:var(--font-mono)]";
const DISPLAY = "font-[family-name:var(--font-display)]";
const LABEL = `${MONO} text-[11px] uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink-mute)]`;
const PLATE = "plate";
const PLATE_CAPTION = "plate__caption";
const COLOPHON = "colophon";
const FOOTNOTE = "footnote";
/*
 * Label / value tables use `<th scope="row">`. `.rule-table th` is drawn for
 * column heads (strong rule), so row heads take the hairline the value cells use.
 */
const RULE_TABLE = "rule-table [&_td]:align-top [&_th]:align-top [&_tbody_th]:border-b-[color:var(--hairline)] [&_tbody_tr:last-child_th]:border-b-0";
/* Guide §3 on-imagery chip: the one dark exception (literal values, no token). */
const IMAGERY_CHIP = `${MONO} rounded-[2px] border border-[rgba(245,243,236,0.24)] bg-[rgba(13,12,10,0.88)] text-[#F5F3EC]`;

export interface ComparisonViewerProps {
  manifest: SiteManifest;
  pairId: string;
  pol: string;
  view?: MapView;
  setView?: (view: MapView) => void;
  falseColor?: boolean;
  onFalseColorChange?: (enabled: boolean) => void;
  /** Difference / change-mask products drawn over both dates. */
  overlayLayerIds?: string[];
}

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

/**
 * Mount or update one product raster on a comparison map.
 *
 * Deliberately does NOT gate on `map.isStyleLoaded()`: that waits for every
 * basemap source cache, so a `once("style.load")` handler that checks it
 * bails out (style.load fires before basemap tiles finish) and the raster
 * never appears. `style.load` means the style JSON is ready for
 * addSource/addLayer even while basemap tiles are still fetching.
 */
function syncRaster(
  map: mapboxgl.Map,
  sourceId: string,
  layerId: string,
  layer: ProductLayer,
  opacity: number,
  palette: boolean,
  mountedUrls: Map<string, string>,
) {
  const tiles = [resolveTileUrl(layer.tile_url_template, api.baseUrl)];
  const existing = map.getSource(sourceId) as mapboxgl.RasterTileSource | undefined;
  if (existing) {
    if (mountedUrls.get(sourceId) !== tiles[0]) {
      existing.setTiles(tiles);
      mountedUrls.set(sourceId, tiles[0]);
    }
    if (layer.kind === "backscatter") setObservationPalette(map, layerId, palette);
    return;
  }
  map.addSource(sourceId, {
    type: "raster",
    tiles,
    tileSize: 256,
    minzoom: layer.min_zoom,
    maxzoom: layer.max_zoom,
  });
  mountedUrls.set(sourceId, tiles[0]);
  map.addLayer({
    id: layerId,
    type: "raster",
    source: sourceId,
    paint: { "raster-opacity": opacity },
  });
  if (layer.kind === "backscatter") setObservationPalette(map, layerId, palette);
}

/** Remove a previously mounted overlay raster, if present. */
function removeRaster(map: mapboxgl.Map, sourceId: string, layerId: string, mountedUrls: Map<string, string>) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  mountedUrls.delete(sourceId);
}

function camerasMatch(a: mapboxgl.Map, b: mapboxgl.Map): boolean {
  const ca = a.getCenter();
  const cb = b.getCenter();
  return (
    Math.abs(ca.lng - cb.lng) < 1e-9 &&
    Math.abs(ca.lat - cb.lat) < 1e-9 &&
    Math.abs(a.getZoom() - b.getZoom()) < 1e-9 &&
    Math.abs(a.getBearing() - b.getBearing()) < 1e-9 &&
    Math.abs(a.getPitch() - b.getPitch()) < 1e-9
  );
}

export function ComparisonViewer({ manifest, pairId, pol, view: controlledView, setView: onViewChange, falseColor: controlledColor, onFalseColorChange, overlayLayerIds = [] }: ComparisonViewerProps) {
  const [localColor, setLocalColor] = useState(false);
  const falseColor = controlledColor ?? localColor;
  const setFalseColor = (enabled: boolean) => { setLocalColor(enabled); onFalseColorChange?.(enabled); };
  const [localView, setLocalView] = useState<MapView>("sar");
  const view = controlledView ?? localView;
  const setView = (next: MapView) => { setLocalView(next); onViewChange?.(next); };
  const [reveal, setReveal] = useState(50);
  const [mapError, setMapError] = useState<string | null>(null);
  const beforeContainer = useRef<HTMLDivElement>(null);
  const afterContainer = useRef<HTMLDivElement>(null);
  const beforeMap = useRef<mapboxgl.Map | null>(null);
  const afterMap = useRef<mapboxgl.Map | null>(null);
  const mountedView = useRef<MapView | null>(null);
  const fallbackUsed = useRef(false);
  const mountedUrls = useRef(new Map<string, string>());
  // A map only accepts addSource/addLayer once its style JSON is ready. This
  // flag tracks `style.load` per map — deliberately not `isStyleLoaded()`,
  // which also waits for every basemap tile and so can stay false for a while.
  const styleReady = useRef({ before: false, after: false });

  const result = useMemo(() => buildComparison(manifest, pairId, pol), [manifest, pairId, pol]);
  const selection = result.ok ? result.selection : null;
  const availablePols = useMemo(() => observationPolarizations(manifest), [manifest]);
  const pairs = useMemo(() => usablePairs(manifest), [manifest]);

  const beforeLayerId = selection?.before.layer.id;
  const afterLayerId = selection?.after.layer.id;

  // Latest desired overlays, read by the permanent style.load handler that is
  // registered when the maps are created (see below).
  const desiredRef = useRef({ beforeLayerId, afterLayerId, overlayLayerIds, layers: manifest.layers, falseColor });
  desiredRef.current = { beforeLayerId, afterLayerId, overlayLayerIds, layers: manifest.layers, falseColor };

  const syncOverlays = () => {
    const desired = desiredRef.current;
    const sides: Array<[mapboxgl.Map | null, string | undefined]> = [
      [beforeMap.current, desired.beforeLayerId],
      [afterMap.current, desired.afterLayerId],
    ];
    const before = beforeMap.current;
    for (const [instance, layerId] of sides) {
      if (!instance || !layerId) continue;
      const ready = instance === before ? styleReady.current.before : styleReady.current.after;
      if (!ready) continue;
      const layer = desired.layers.find((item) => item.id === layerId);
      if (!layer) continue;
      const side = instance === before ? "before" : "after";
      syncRaster(instance, `comparison-${side}`, `comparison-${side}-raster`, layer, 0.92, desired.falseColor, mountedUrls.current);
      // Change-product overlays (difference / masks) drawn over both dates.
      const overlays = desired.layers.filter((item) => desired.overlayLayerIds.includes(item.id));
      for (const overlay of overlays) {
        syncRaster(instance, `comparison-overlay-${side}-${overlay.id}`, `comparison-overlay-${side}-${overlay.id}-raster`, overlay, 0.65, desired.falseColor, mountedUrls.current);
      }
      for (const mountedId of Array.from(mountedUrls.current.keys())) {
        if (!mountedId.startsWith(`comparison-overlay-${side}-`)) continue;
        const overlayId = mountedId.slice(`comparison-overlay-${side}-`.length);
        if (!desired.overlayLayerIds.includes(overlayId)) {
          removeRaster(instance, mountedId, `${mountedId}-raster`, mountedUrls.current);
        }
      }
    }
  };
  const syncOverlaysRef = useRef(syncOverlays);
  syncOverlaysRef.current = syncOverlays;

  // Create both maps once. Interaction stays enabled, but every camera change on
  // one map is mirrored to the other, so the two dates always show the same view.
  useEffect(() => {
    if (!beforeContainer.current || !afterContainer.current) return;
    if (beforeMap.current || afterMap.current) return;

    const bbox = manifest.site.bbox;
    const options: Omit<mapboxgl.MapOptions, "container"> = {
      style: mapStyleForView(view),
      attributionControl: false,
    };
    let first: mapboxgl.Map;
    let second: mapboxgl.Map;
    try {
      first = new mapboxgl.Map({ ...options, container: beforeContainer.current });
      second = new mapboxgl.Map({ ...options, container: afterContainer.current });
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "The basemap could not be created.");
      return;
    }
    beforeMap.current = first;
    afterMap.current = second;
    mountedView.current = view;

    const link = (source: mapboxgl.Map, target: mapboxgl.Map) => {
      source.on("move", () => {
        if (camerasMatch(source, target)) return;
        target.jumpTo({
          center: source.getCenter(),
          zoom: source.getZoom(),
          bearing: source.getBearing(),
          pitch: source.getPitch(),
        });
      });
    };
    link(first, second);
    link(second, first);

    styleReady.current = { before: false, after: false };
    for (const instance of [first, second]) {
      instance.on("load", () => {
        instance.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 24, duration: 0 },
        );
      });
      // Permanent handler: the style JSON is ready for addSource/addLayer as
      // soon as `style.load` fires, so re-mount the product rasters on the
      // first style load and after every later setStyle() (which clears them).
      instance.on("style.load", () => {
        if (instance === first) styleReady.current.before = true;
        else styleReady.current.after = true;
        mountedUrls.current.clear();
        syncOverlaysRef.current();
      });
      instance.on("error", (event) => {
        const message = (event as { error?: Error }).error?.message;
        if (!message) return;
        // A basemap style that cannot load would leave the plate blank forever:
        // fall back to a plain dark canvas so the product rasters stay visible.
        // Only before the style is ready, and never on a tile 404 — a missing
        // raster tile must not discard a working basemap.
        const ready = instance === first ? styleReady.current.before : styleReady.current.after;
        if (!ready && !fallbackUsed.current && /style|token|401|403|unauthori[sz]ed|forbidden/i.test(message)) {
          fallbackUsed.current = true;
          try {
            instance.setStyle(FALLBACK_STYLE(true));
            return;
          } catch {
            /* fall through to the visible error */
          }
        }
        setMapError(message);
      });
    }

    return () => {
      first.remove();
      second.remove();
      beforeMap.current = null;
      afterMap.current = null;
    };
  }, [manifest.site.bbox]);

  // Keep both comparison maps on the same context style as the timeline map.
  // A Mapbox style change clears custom raster layers; the source effect below
  // re-installs the exact before/after rasters once the new style has loaded.
  useEffect(() => {
    const instances = [beforeMap.current, afterMap.current];
    if (instances.some((instance) => !instance) || mountedView.current === view) return;
    mountedView.current = view;
    // setStyle drops runtime sources/layers; the style.load handler re-adds them.
    styleReady.current = { before: false, after: false };
    const style = mapStyleForView(view);
    for (const instance of instances) {
      if (!instance) continue;
      try {
        instance.setStyle(style);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "The basemap could not be changed.");
      }
    }
  }, [view]);

  // Mount / re-point the before, after and change-overlay rasters whenever the
  // selection, the view or the palette changes. The maps' own `style.load`
  // handler re-runs this after every style swap, so no work is lost here.
  useEffect(() => {
    syncOverlaysRef.current();
  }, [beforeLayerId, afterLayerId, overlayLayerIds, manifest.layers, view, falseColor]);

  if (!result.ok) {
    return (
      <div className={COLOPHON} role="status">
        <h2 className={`${DISPLAY} text-[16px] font-extrabold leading-tight tracking-[-0.02em] text-[color:var(--ink)]`}>
          This pair cannot be compared exactly
        </h2>
        <p className="mt-2">{result.problem.message}</p>
        {result.problem.available && result.problem.available.length > 0 && (
          <p className={`${FOOTNOTE} mt-2`}>Available: {result.problem.available.join(", ")}</p>
        )}
        <p className="mt-3">
          No substitute date, polarization or difference product is used to fill the gap.
        </p>
      </div>
    );
  }

  const active = result.selection;
  const clamped = clampReveal(reveal);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <section className="min-w-0 xl:col-span-8" aria-label="Before and after imagery">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className={`${IMAGERY_CHIP} flex gap-0.5 p-0.5`} role="group" aria-label="Map view">
            {(["optical", "sar"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={`rounded-[1px] px-2.5 py-1.5 text-[10px] uppercase leading-none tracking-[0.14em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8A3D] ${view === mode ? "bg-[#F5F3EC] text-[#16130F]" : "text-[rgba(245,243,236,0.72)] hover:text-[#F5F3EC]"}`}
              >
                {mode === "optical" ? "Optical context" : "NISAR"}
              </button>
            ))}
          </div>
          <button type="button" className="tm-button" aria-pressed={falseColor} onClick={() => setFalseColor(!falseColor)}>False colour: {falseColor ? "on" : "off"}</button>
          <span className={FOOTNOTE}>Observation display palette: purple through mauve to cream, from lower to higher radar return.</span>
        </div>
        <div className={PLATE}>
          <div className="relative h-[26rem] overflow-hidden bg-[#0D0C0A] sm:h-[32rem]">
            <>
              <div className="absolute inset-0">
                <div ref={beforeContainer} className="h-full w-full" data-testid="map-before" />
              </div>
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 0 0 ${clamped}%)` }}
                data-testid="map-after-clip"
              >
                <div ref={afterContainer} className="h-full w-full" data-testid="map-after" />
              </div>
              {!HAS_MAPBOX_TOKEN && (
                <div
                  className="pointer-events-none absolute inset-0"
                  aria-hidden="true"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(245,243,236,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(245,243,236,0.07) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                  }}
                />
              )}
              <div
                className={`${IMAGERY_CHIP} pointer-events-none absolute left-3 top-3 px-2 py-1 text-[11px] leading-[1.4]`}
                aria-hidden="true"
              >
                <span className="uppercase tracking-[0.18em]">Before</span> · {active.before.date}
              </div>
              <div
                className={`${IMAGERY_CHIP} pointer-events-none absolute right-3 top-3 px-2 py-1 text-[11px] leading-[1.4]`}
                aria-hidden="true"
              >
                <span className="uppercase tracking-[0.18em]">After</span> · {active.after.date}
              </div>
              <div className={`${IMAGERY_CHIP} absolute bottom-3 right-3 px-2 py-1 text-[10px]`}>Map imagery © Mapbox{!HAS_MAPBOX_TOKEN && " · local canvas"}</div>
              {/* Reveal marker: a 1px hairline with a paper tab. Display only — the range input below is the control. */}
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-[#F5F3EC]"
                style={{ left: `${clamped}%` }}
                aria-hidden="true"
              >
                <span className={`${MONO} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[rgba(22,19,15,0.32)] bg-[#FAF9F6] py-1.5 pl-[calc(0.5rem+0.18em)] pr-2 text-[9px] uppercase leading-none tracking-[0.18em] text-[#16130F]`}>
                  Reveal
                </span>
              </div>
            </>
            <span className="sr-only" id="before-label">
              Before imagery from {active.before.date}
            </span>
            <span className="sr-only" id="after-label">
              After imagery from {active.after.date}
            </span>
          </div>
          <div className={PLATE_CAPTION}>
            {/* Layout on an inner wrapper so the caption's own `display` cannot rearrange it. */}
            <div className="grid w-full grid-cols-2 gap-x-4">
              <p className="min-w-0">
                <span className="uppercase tracking-[0.18em]">Before</span>
                {" — "}<span className="text-[color:var(--ink)]">{active.before.date}</span>
                {" · "}{active.pol}
              </p>
              <p className="min-w-0 text-right">
                <span className="uppercase tracking-[0.18em]">After</span>
                {" — "}<span className="text-[color:var(--ink)]">{active.after.date}</span>
                {" · "}{active.pol}
              </p>
            </div>
          </div>
        </div>

        <label className={`${LABEL} mt-3 block`}>
          Reveal before and after imagery — {clamped.toFixed(0)}%
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={clamped}
            onChange={(event) => setReveal(clampReveal(Number(event.target.value)))}
            className="mt-2 block w-full accent-[color:var(--accent)]"
            aria-label="Reveal before and after imagery"
          />
        </label>
        <p className={`${FOOTNOTE} mt-2`}>
          Move the slider to reveal the later date; pan or zoom either map to update both views. Apparent brightness
          also depends on the display stretch applied to each layer, not only on the surface.
        </p>
        {mapError && (
          <p className={`${COLOPHON} mt-3 [overflow-wrap:anywhere]`} role="alert">
            Basemap message: {mapError}
          </p>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-5 xl:col-span-4">
        <div>
          <p className={LABEL}>Exact pair</p>
          <h2 className={`${DISPLAY} mt-1 text-[20px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[color:var(--ink)]`}>
            {active.siteTitle}
          </h2>
          <p className={`${FOOTNOTE} mt-1`}>
            {active.pairLabel} · {active.pol}
          </p>
          <table className={`${RULE_TABLE} mt-3`}>
            <tbody>
              <tr>
                <th scope="row">Before</th>
                <td>
                  {active.before.date} · {active.before.layer.id}
                </td>
              </tr>
              <tr>
                <th scope="row">After</th>
                <td>
                  {active.after.date} · {active.after.layer.id}
                </td>
              </tr>
              <tr>
                <th scope="row">Processing identity</th>
                <td>{processingIdentity(manifest)}</td>
              </tr>
              <tr>
                <th scope="row">Resampled by the builder</th>
                <td>
                  {active.resampled === null ? "not reported" : active.resampled ? "yes" : "no"}
                </td>
              </tr>
              <tr>
                <th scope="row">Acquisition IDs</th>
                <td className="break-all text-[10px]">
                  {active.before.acquisition?.granule ?? active.before.layer.id}
                  <br />
                  {active.after.acquisition?.granule ?? active.after.layer.id}
                </td>
              </tr>
              <tr>
                <th scope="row">Polarizations with observations</th>
                <td>{availablePols.join(", ") || "none"}</td>
              </tr>
              <tr>
                <th scope="row">Installed pair labels</th>
                <td>{pairs.map((item) => item.label).join(", ") || "none"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={COLOPHON}>
          <h2 className="m-0">
            <span className={`${MONO} block text-[11px] font-medium uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink)]`}>
              What this does not show
            </span>
          </h2>
          <p className="mt-2">
            Two dates show a measured difference in radar brightness. They do not by themselves identify the
            cause or extent of an event.
          </p>
        </div>
      </aside>
    </div>
  );
}
