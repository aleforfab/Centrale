"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DanceChart } from "@/components/DanceChart";
import { Map, type MapView } from "@/components/Map";
import { api } from "@/lib/api";
import type {
  DataStatus,
  PairStats,
  ProductLayer,
  SiteManifest,
  SiteSummary,
  TimeSeriesPoint as ApiTimeSeriesPoint,
} from "@/lib/types";

interface ChartPoint {
  date: string;
  backscatter: number;
  cycle: number;
  maturity: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected request error occurred.";
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function selectedStats(layer: ProductLayer | null, manifest: SiteManifest | null, pol: string): PairStats | null {
  if (!layer?.pair_id || !manifest) return null;
  const pair = manifest.pairs.find((item) => item.id === layer.pair_id);
  const thresholds = pair?.stats[pol];
  if (!thresholds) return null;
  const threshold = layer.threshold_db === null || layer.threshold_db === undefined
    ? Object.keys(thresholds)[0]
    : layer.threshold_db.toString();
  return thresholds[threshold] ?? null;
}

export default function Home() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [polarization, setPolarization] = useState("");
  const [layerId, setLayerId] = useState("");
  const [visibleLayerIds, setVisibleLayerIds] = useState<string[]>([]);
  const [timeSeries, setTimeSeries] = useState<ApiTimeSeriesPoint[]>([]);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [view, setView] = useState<MapView>("sar");
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.sites(), api.dataStatus()])
      .then(([siteList, dataStatus]) => {
        if (!active) return;
        setSites(siteList);
        setStatus(dataStatus);
        setSiteId((current) => current || siteList[0]?.id || "");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setIsLoadingSites(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siteId) {
      setManifest(null);
      setTimeSeries([]);
      return;
    }
    let active = true;
    setIsLoadingManifest(true);
    setManifest(null);
    setTimeSeries([]);
    setError(null);
    api.site(siteId)
      .then((siteManifest) => {
        if (!active) return;
        setManifest(siteManifest);
        const initialPol = siteManifest.polarizations[0]?.pol ?? "";
        setPolarization(initialPol);
        const initialLayer = [...siteManifest.layers].reverse().find((item) => item.kind === "backscatter")
          ?? siteManifest.layers[0];
        setLayerId(initialLayer?.id ?? "");
        setVisibleLayerIds(initialLayer ? [initialLayer.id] : []);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setIsLoadingManifest(false);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  useEffect(() => {
    if (!manifest || !polarization) return;
    let active = true;
    setIsLoadingSeries(true);
    api.timeseries(manifest.site.id, polarization)
      .then((points) => {
        if (active) setTimeSeries(points);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setIsLoadingSeries(false);
      });
    return () => {
      active = false;
    };
  }, [manifest, polarization]);

  const polLayers = useMemo(
    () => manifest?.layers.filter((layer) => !layer.pol || layer.pol === polarization) ?? [],
    [manifest, polarization],
  );
  const layer = polLayers.find((item) => item.id === layerId) ?? polLayers[0] ?? null;
  const visibleLayers = useMemo(() => {
    const active = polLayers.filter((item) => visibleLayerIds.includes(item.id));
    return layer && active.includes(layer) ? [layer, ...active.filter((item) => item.id !== layer.id)] : active;
  }, [layer, polLayers, visibleLayerIds]);
  const chartData: ChartPoint[] = timeSeries.map((point) => ({
    date: point.date,
    backscatter: point.backscatter_db,
    cycle: point.cycle,
    maturity: point.maturity,
  }));
  const stats = selectedStats(layer, manifest, polarization);
  const currentSite = sites.find((site) => site.id === siteId);

  useEffect(() => {
    if (!layer || layer.id === layerId) return;
    setLayerId(layer.id);
  }, [layer, layerId]);

  useEffect(() => {
    setVisibleLayerIds((current) => {
      const visibleForPol = current.filter((id) => polLayers.some((item) => item.id === id));
      return visibleForPol.length || !layer ? visibleForPol : [layer.id];
    });
  }, [polarization, manifest?.site.id]);

  const selectAcquisition = (date: string) => {
    const backscatterLayer = polLayers.find((item) => item.kind === "backscatter" && item.date === date);
    if (backscatterLayer) setLayerId(backscatterLayer.id);
  };

  return (
    <main className="min-h-screen bg-[#0b1118] p-4 text-slate-100 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-slate-700/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Earth observation workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dancing with the SARs</h1>
          <p className="mt-1 text-sm text-slate-400">Precomputed NISAR L-band observations and change products</p>
        </div>
        <div className="max-w-lg rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300" role="status">
          {status
            ? status.nisar_ready
              ? `NISAR products ready · ${status.sites_count} site${status.sites_count === 1 ? "" : "s"}`
              : status.active_source
            : "Checking data availability…"}
        </div>
      </header>

      {error && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-md border border-red-700/60 bg-red-950/80 p-4 text-sm text-red-200" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline underline-offset-2">Dismiss</button>
        </div>
      )}

      {isLoadingSites ? (
        <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading NISAR site catalog…</div>
      ) : sites.length === 0 ? (
        <section className="mx-auto mt-16 max-w-2xl rounded-xl border border-slate-700 bg-[#111a24] p-8 text-center">
          <h2 className="text-lg font-semibold">No precomputed NISAR sites yet</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This interface only displays built NISAR products; it does not substitute Sentinel-1 analysis or create results on demand.
          </p>
          <p className="mt-4 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300">
            python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
          </p>
          {status && <p className="mt-3 text-xs text-slate-500">{status.message}</p>}
        </section>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-xs font-medium text-slate-400">
              NISAR site
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-400">
              Polarization
              <select
                value={polarization}
                onChange={(event) => setPolarization(event.target.value)}
                disabled={!manifest}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {manifest?.polarizations.map((item) => <option key={item.pol} value={item.pol}>{item.pol}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-400">
              Product layer
              <select
                value={layer?.id ?? ""}
                onChange={(event) => {
                  setLayerId(event.target.value);
                  setVisibleLayerIds((current) => current.includes(event.target.value)
                    ? current
                    : [...current, event.target.value]);
                }}
                disabled={!polLayers.length}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {polLayers.map((item) => <option key={item.id} value={item.id}>{item.title ?? item.id}</option>)}
              </select>
            </label>
          </div>
          {polLayers.length > 1 && (
            <fieldset className="mb-5 rounded-lg border border-slate-700 bg-[#111a24] px-4 py-3">
              <legend className="px-1 text-xs font-medium text-slate-400">Visible map overlays</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {polLayers.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={visibleLayerIds.includes(item.id)}
                      onChange={(event) => setVisibleLayerIds((current) => event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id))}
                      className="accent-sky-500"
                    />
                    {item.title ?? item.id}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {isLoadingManifest ? (
            <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading site manifest…</div>
          ) : manifest ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              <section className="flex flex-col gap-5 xl:col-span-4">
                <article className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
                  <h2 className="text-lg font-semibold">{manifest.site.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{manifest.site.description}</p>
                  <p className="mt-3 text-xs leading-5 text-amber-200/90">{manifest.site.caveat}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                    {[manifest.source.mission, `${manifest.source.band}-band`, manifest.source.product, manifest.source.maturity, `CRID ${manifest.source.crid}`].map((tag) => (
                      <span key={tag} className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200">{tag}</span>
                    ))}
                  </div>
                </article>

                <DanceChart
                  data={chartData}
                  polarization={polarization}
                  selectedDate={layer?.date ?? undefined}
                />

                {stats && (
                  <article className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
                    <h2 className="text-sm font-semibold">Change statistics</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {manifest.pairs.find((pair) => pair.id === layer?.pair_id)?.label} · {polarization}
                      {layer?.pair_id
                        ? ` · ${layer.threshold_db ?? Object.keys(manifest.pairs.find((pair) => pair.id === layer.pair_id)?.stats[polarization] ?? {})[0]} dB threshold`
                        : ""}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div><dt className="text-slate-500">Lower return</dt><dd>{stats.decrease_km2.toFixed(2)} km² ({stats.decrease_pct.toFixed(1)}%)</dd></div>
                      <div><dt className="text-slate-500">Higher return</dt><dd>{stats.increase_km2.toFixed(2)} km² ({stats.increase_pct.toFixed(1)}%)</dd></div>
                      <div><dt className="text-slate-500">Valid coverage</dt><dd>{formatPercent(stats.valid_fraction_of_bbox)}</dd></div>
                      <div><dt className="text-slate-500">Noise estimate</dt><dd>{stats.sigma_db.toFixed(2)} dB</dd></div>
                    </dl>
                    <p className="mt-3 text-[10px] text-slate-500">
                      {stats.resampled ? "Post-event data were resampled to the pre-event grid." : "Acquisition grids were aligned."}
                      {" "}Backscatter change does not determine its cause.
                    </p>
                    {stats.histogram.length > 0 && (
                      <div className="mt-4 flex h-12 items-end gap-px" aria-label="Difference histogram">
                        {stats.histogram.map((count, index) => (
                          <span
                            key={index}
                            title={`Bin ${index + 1}: ${count} pixels`}
                            className={`flex-1 ${index < stats.histogram.length / 2 ? "bg-blue-500/80" : "bg-red-400/80"}`}
                            style={{ height: `${Math.max(2, count / Math.max(...stats.histogram, 1) * 100)}%` }}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                )}

                <section className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Acquisitions</h2>
                    <span className="text-xs text-slate-400">{manifest.acquisitions.length} scenes</span>
                  </div>
                  <ul className="max-h-64 space-y-2 overflow-auto">
                    {manifest.acquisitions.map((acquisition) => (
                      <li key={acquisition.granule} className="rounded border border-slate-700 bg-slate-900/70 p-3">
                        <button
                          type="button"
                          onClick={() => selectAcquisition(acquisition.date)}
                          className="w-full text-left"
                        >
                          <span className="block text-xs font-semibold text-slate-100">{acquisition.date} · Cycle {acquisition.cycle}</span>
                          <span className="mt-1 block break-all font-mono text-[10px] text-slate-400">{acquisition.granule}</span>
                          <span className="mt-1 block text-[10px] text-slate-500">{acquisition.crid} · {acquisition.coverage} coverage</span>
                        </button>
                        <a
                          href={acquisition.links.asf ?? acquisition.download_url ?? `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(acquisition.granule)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-[10px] text-sky-400 underline"
                        >
                          View at ASF
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              </section>

              <section className="flex flex-col gap-5 xl:col-span-8">
                <article className="h-[min(68vh,760px)] min-h-[420px]">
                  <Map
                    bbox={manifest.site.bbox}
                    layers={visibleLayers}
                    view={view}
                    setView={setView}
                  />
                </article>
                <section className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">Regional backscatter time series</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Mean {polarization} backscatter from the precomputed site stack. Select a point by clicking its acquisition below.
                      </p>
                    </div>
                    <span className="text-xs text-slate-500" role="status">
                      {isLoadingSeries ? "Loading…" : `${timeSeries.length} observations`}
                    </span>
                  </div>
                  {timeSeries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {timeSeries.map((point) => (
                        <button
                          key={`${point.date}-${point.cycle}`}
                          type="button"
                          onClick={() => selectAcquisition(point.date)}
                          className={`rounded border px-2 py-1 text-[10px] ${
                            layer?.date === point.date ? "border-sky-500 bg-sky-950 text-white" : "border-slate-700 bg-slate-900 text-slate-300"
                          }`}
                        >
                          {point.date} · Cycle {point.cycle} · {point.backscatter_db.toFixed(1)} dB · {point.maturity}
                        </button>
                      ))}
                    </div>
                  )}
                  {!timeSeries.length && !isLoadingSeries && (
                    <p className="mt-4 text-xs text-slate-500">No time-series observations are available for this polarization.</p>
                  )}
                </section>
                {currentSite && (
                  <p className="text-[10px] text-slate-500">
                    {currentSite.acquisition_count} acquisitions · {currentSite.date_range.join(" to ")} · Source: ASF DAAC NISAR GCOV.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
