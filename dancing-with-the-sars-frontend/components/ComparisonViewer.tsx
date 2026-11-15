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
import type { SiteManifest } from "@/lib/types";
import { getMapboxToken, hasMapboxToken } from "@/lib/mapboxToken";

const MAPBOX_TOKEN = getMapboxToken();
mapboxgl.accessToken = MAPBOX_TOKEN;
const HAS_MAPBOX_TOKEN = hasMapboxToken();

const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "dark-background",
      type: "background",
      paint: { "background-color": "#0D0C0A" },
    },
  ],
} as unknown as mapboxgl.Style;

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
  const [mapError, setMapError] = useState<string | null>(null);
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
    if (!beforeContainer.current || !afterContainer.current) return;
    if (beforeMap.current || afterMap.current) return;

    const bbox = manifest.site.bbox;
    const options: Omit<mapboxgl.MapOptions, "container"> = {
      style: HAS_MAPBOX_TOKEN ? "mapbox://styles/mapbox/dark-v11" : FALLBACK_STYLE,
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
              {!HAS_MAPBOX_TOKEN && (
                <div className={`${IMAGERY_CHIP} pointer-events-none absolute bottom-3 right-3 px-2 py-1 text-[10px] leading-4`}>
                  Local canvas · exact product tiles retained · no Mapbox basemap
                </div>
              )}
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

        {mapError && (
          <p className={`${COLOPHON} mt-3 [overflow-wrap:anywhere]`} role="alert">
            Basemap message: {mapError}
          </p>
        )}

        <label className={`${LABEL} mt-4 block`}>
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
          Use the slider below to reveal the later date; clicking or dragging on the imagery does not change the
          view. Apparent brightness also depends on the display stretch applied to each layer, not only on the
          surface.
        </p>
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
          <p className="mt-2">{active.caveat}</p>
          <p className="mt-2">
            Two dates show a measured difference in radar brightness. They do not by themselves identify the
            cause, the extent of an event, or damage.
          </p>
        </div>
      </aside>
    </div>
  );
}
