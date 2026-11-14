"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  buildComparison,
  clampReveal,
  observationPolarizations,
  processingIdentity,
  revealFromPointer,
  usablePairs,
} from "@/lib/comparison";
import type { SiteManifest } from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface ComparisonViewerProps {
  manifest: SiteManifest;
  pairId: string;
  pol: string;
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

export function ComparisonViewer({ manifest, pairId, pol }: ComparisonViewerProps) {
  const [reveal, setReveal] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const beforeContainer = useRef<HTMLDivElement>(null);
  const afterContainer = useRef<HTMLDivElement>(null);
  const beforeMap = useRef<mapboxgl.Map | null>(null);
  const afterMap = useRef<mapboxgl.Map | null>(null);

  const result = useMemo(() => buildComparison(manifest, pairId, pol), [manifest, pairId, pol]);
  const selection = result.ok ? result.selection : null;
  const availablePols = useMemo(() => observationPolarizations(manifest), [manifest]);
  const pairs = useMemo(() => usablePairs(manifest), [manifest]);

  const beforeLayerId = selection?.before.layer.id;
  const afterLayerId = selection?.after.layer.id;

  // Create both maps once. Interaction stays enabled, but every camera change on
  // one map is mirrored to the other, so the two dates always show the same view.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !beforeContainer.current || !afterContainer.current) return;
    if (beforeMap.current || afterMap.current) return;

    const bbox = manifest.site.bbox;
    const options: Omit<mapboxgl.MapOptions, "container"> = {
      style: "mapbox://styles/mapbox/dark-v11",
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
      instance.on("error", (event) => {
        const message = (event as { error?: Error }).error?.message;
        if (message) setMapError(message);
      });
    }

    return () => {
      first.remove();
      second.remove();
      beforeMap.current = null;
      afterMap.current = null;
    };
  }, [manifest.site.bbox]);

  // Keep the two raster sources pointing at the exact layers for the selection.
  useEffect(() => {
    const sources: Array<[mapboxgl.Map | null, string, string | undefined, string]> = [
      [beforeMap.current, "comparison-before", beforeLayerId, "before"],
      [afterMap.current, "comparison-after", afterLayerId, "after"],
    ];
    for (const [instance, sourceId, layerId, side] of sources) {
      if (!instance || !layerId) continue;
      const layer = manifest.layers.find((item) => item.id === layerId);
      if (!layer) continue;
      const tiles = [layer.tile_url_template];
      const apply = () => {
        const existing = instance.getSource(sourceId) as mapboxgl.RasterTileSource | undefined;
        if (existing) {
          existing.setTiles(tiles);
          return;
        }
        instance.addSource(sourceId, {
          type: "raster",
          tiles,
          tileSize: 256,
          minzoom: layer.min_zoom,
          maxzoom: layer.max_zoom,
        });
        instance.addLayer({
          id: `comparison-${side}-raster`,
          type: "raster",
          source: sourceId,
          paint: { "raster-opacity": 0.92 },
        });
      };
      if (instance.isStyleLoaded()) apply();
      else instance.once("load", apply);
    }
  }, [beforeLayerId, afterLayerId, manifest.layers]);

  const updateFromPointer = useCallback((clientX: number) => {
    const box = wrapper.current?.getBoundingClientRect();
    if (!box) return;
    setReveal(revealFromPointer(clientX, box.left, box.width));
  }, []);

  if (!result.ok) {
    return (
      <section
        className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-5 text-sm text-amber-100"
        role="status"
      >
        <h2 className="text-base font-semibold">This pair cannot be compared exactly</h2>
        <p className="mt-2 leading-6">{result.problem.message}</p>
        {result.problem.available && result.problem.available.length > 0 && (
          <p className="mt-2 text-xs text-amber-200/80">Available: {result.problem.available.join(", ")}</p>
        )}
        <p className="mt-3 text-xs text-amber-200/70">
          No substitute date, polarization or difference product is used to fill the gap.
        </p>
      </section>
    );
  }

  const active = result.selection;
  const clamped = clampReveal(reveal);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <section className="xl:col-span-8">
        <div
          ref={wrapper}
          className="relative h-[26rem] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 sm:h-[32rem]"
          onPointerDown={(event) => {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event.clientX);
          }}
          onPointerMove={(event) => {
            if (dragging) updateFromPointer(event.clientX);
          }}
          onPointerUp={(event) => {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => setDragging(false)}
        >
          {MAPBOX_TOKEN ? (
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
              <div
                className="pointer-events-none absolute left-3 top-3 rounded border border-slate-600 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-200"
                aria-hidden="true"
              >
                <span className="font-semibold uppercase tracking-wide">Before</span> · {active.before.date}
              </div>
              <div
                className="pointer-events-none absolute right-3 top-3 rounded border border-slate-600 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-200"
                aria-hidden="true"
              >
                <span className="font-semibold uppercase tracking-wide">After</span> · {active.after.date}
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white/70"
                style={{ left: `${clamped}%` }}
                aria-hidden="true"
              />
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <h2 className="text-base font-semibold text-slate-200">Map imagery cannot be displayed</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  No <code className="rounded bg-slate-800 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> is configured for
                  this build. The selected dates and provenance are still shown; only the basemap and raster
                  tiles are unavailable.
                </p>
              </div>
            </div>
          )}
          <span className="sr-only" id="before-label">
            Before imagery from {active.before.date}
          </span>
          <span className="sr-only" id="after-label">
            After imagery from {active.after.date}
          </span>
        </div>

        {mapError && (
          <p className="mt-3 rounded border border-red-800/70 bg-red-950/60 p-2 text-xs text-red-200" role="alert">
            Basemap message: {mapError}
          </p>
        )}

        <label className="mt-4 block text-xs text-slate-400">
          Reveal before and after imagery — {clamped.toFixed(0)}%
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={clamped}
            onChange={(event) => setReveal(clampReveal(Number(event.target.value)))}
            className="mt-2 block w-full accent-sky-500"
            aria-label="Reveal before and after imagery"
          />
        </label>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Drag on the map or use the slider. Both views share one camera so the dates stay aligned. Apparent
          brightness also depends on the display stretch applied to each layer, not only on the surface.
        </p>
      </section>

      <aside className="flex flex-col gap-4 xl:col-span-4">
        <article className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
          <h2 className="text-sm font-semibold">{active.siteTitle}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {active.pairLabel} · {active.pol}
          </p>
          <dl className="mt-4 space-y-2 text-xs">
            <div>
              <dt className="text-slate-500">Before</dt>
              <dd className="text-slate-200">
                {active.before.date} · {active.before.layer.id}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">After</dt>
              <dd className="text-slate-200">
                {active.after.date} · {active.after.layer.id}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Processing identity</dt>
              <dd className="text-slate-200">{processingIdentity(manifest)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Resampled by the builder</dt>
              <dd className="text-slate-200">
                {active.resampled === null ? "not reported" : active.resampled ? "yes" : "no"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Acquisition IDs</dt>
              <dd className="break-all font-mono text-[10px] leading-4 text-slate-300">
                {active.before.acquisition?.granule ?? active.before.layer.id}
                <br />
                {active.after.acquisition?.granule ?? active.after.layer.id}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Polarizations with observations</dt>
              <dd className="text-slate-200">{availablePols.join(", ") || "none"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Curated pairs</dt>
              <dd className="text-slate-200">{pairs.map((item) => item.id).join(", ") || "none"}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-xs leading-5 text-amber-100/90">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            What this does not show
          </h2>
          <p className="mt-2">{active.caveat}</p>
          <p className="mt-2 text-amber-200/70">
            Two dates show a measured difference in radar brightness. They do not by themselves identify the
            cause, the extent of an event, or damage.
          </p>
        </article>
      </aside>
    </div>
  );
}
