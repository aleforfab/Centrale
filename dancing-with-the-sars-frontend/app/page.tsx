"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
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

  const statusLabel = status
    ? status.nisar_ready
      ? `NISAR products ready · ${status.sites_count} site${status.sites_count === 1 ? "" : "s"}`
      : status.active_source
    : "Checking data availability…";

  return (
    <AppShell
      current="/"
      eyebrow="Map-first explorer"
      title="Dancing with the SARs"
      subtitle="Installed NISAR product layers, exact dates and measured change products in a cinematic radar workspace."
      status={<span>{statusLabel}</span>}
    >
      <section className="tm-hero">
        <div>
          <p className="tm-hero__eyebrow">Mission workspace · installed products</p>
          <h2>Explore a dated radar stack, then step into the Time Machine.</h2>
          <p>
            The map stays dominant. Controls are compact, dates are explicit, and the synthetic caveat travels
            with every product view.
          </p>
        </div>
        <div className="tm-hero__actions">
          <Link href="/time-machine" className="tm-button tm-button--primary">
            Open Time Machine →
          </Link>
          <Link href="/compare" className="tm-button">
            Exact before / after
          </Link>
        </div>
      </section>

      {error && (
        <div className="tm-problem" role="alert" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isLoadingSites ? (
        <div className="tm-panel" style={{ display: "grid", minHeight: 320, placeItems: "center" }}>
          <p className="tm-muted">Loading NISAR site catalog…</p>
        </div>
      ) : sites.length === 0 ? (
        <section className="tm-panel tm-notice" style={{ margin: "48px auto", maxWidth: 720, textAlign: "center", padding: 32 }}>
          <h2>No precomputed NISAR sites yet</h2>
          <p className="tm-muted" style={{ marginTop: 12 }}>
            This interface only displays built NISAR products; it does not substitute Sentinel-1 analysis or
            create results on demand.
          </p>
          <p className="mt-4 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300">
            python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
          </p>
          {status && <p className="tm-muted" style={{ marginTop: 12 }}>{status.message}</p>}
        </section>
      ) : (
        <>
          <div className="tm-dashboard-controls">
            <label>
              NISAR site
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
              </select>
            </label>
            <label>
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
            <label>
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
            <div className="tm-dashboard-controls__meta">
              <span>{manifest?.acquisitions.length ?? 0} acquisitions</span>
              <span>{polLayers.length} layers</span>
              <span>{view === "sar" ? "NISAR view" : "Optical context"}</span>
            </div>
          </div>

          {polLayers.length > 1 && (
            <fieldset className="tm-dashboard-overlays">
              <legend>Visible map overlays</legend>
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
            <div className="tm-panel" style={{ display: "grid", minHeight: 420, placeItems: "center" }}>
              <p className="tm-muted">Loading site manifest…</p>
            </div>
          ) : manifest ? (
            <div className="tm-dashboard-grid">
              <section className="tm-dashboard-map" aria-label="Installed NISAR product map">
                <div className="tm-dashboard-map__canvas">
                  <Map
                    bbox={manifest.site.bbox}
                    layers={visibleLayers}
                    view={view}
                    setView={setView}
                  />
                </div>
                <div className="tm-dashboard-map__hud">
                  <div className="tm-dashboard-map__date">
                    <span>{layer?.kind === "backscatter" ? "Observation" : "Product"}</span>
                    <strong>{layer?.date ?? manifest.pairs[0]?.label ?? manifest.site.title}</strong>
                    <small>{polarization} · {layer?.title ?? "No layer selected"}</small>
                  </div>
                  <span className="tm-stage__badge" style={{ position: "static" }}>
                    Synthetic fixture
                  </span>
                </div>
                <div className="tm-dashboard-map__footer">
                  <span>{manifest.site.caveat}</span>
                  <Link href="/time-machine" className="tm-button tm-button--primary">
                    Play the Time Machine →
                  </Link>
                </div>
              </section>

              <aside className="tm-dashboard-info">
                <article className="tm-panel">
                  <h2 className="tm-panel__title">Site record</h2>
                  <h3>{manifest.site.title}</h3>
                  <p className="tm-muted" style={{ marginTop: 8 }}>{manifest.site.description}</p>
                  <p className="tm-muted tm-notice" style={{ marginTop: 12, padding: 10, borderRadius: 10 }}>
                    {manifest.site.caveat}
                  </p>
                  <div className="tm-chip-row">
                    {[manifest.source.mission, `${manifest.source.band}-band`, manifest.source.product, manifest.source.maturity, `CRID ${manifest.source.crid}`].map((tag) => (
                      <span key={tag} className="tm-chip">{tag}</span>
                    ))}
                  </div>
                </article>

                <DanceChart
                  data={chartData}
                  polarization={polarization}
                  selectedDate={layer?.date ?? undefined}
                />

                {stats && (
                  <article className="tm-panel">
                    <h2 className="tm-panel__title">Change statistics</h2>
                    <p className="tm-muted">
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
                    <p className="tm-muted" style={{ marginTop: 12 }}>
                      {stats.resampled ? "Post-event data were resampled to the pre-event grid." : "Acquisition grids were aligned."}
                      {" "}Backscatter change does not determine its cause. These are measured outputs, not a
                      validated scientific result.
                    </p>
                    {stats.histogram.length > 0 && (
                      <div className="tm-spark" aria-label="Difference histogram">
                        {stats.histogram.map((count, index) => (
                          <i
                            key={index}
                            title={`Bin ${index + 1}: ${count} pixels`}
                            style={{ height: `${Math.max(4, count / Math.max(...stats.histogram, 1) * 100)}%` }}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                )}

                <section className="tm-panel">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="tm-panel__title" style={{ margin: 0 }}>Acquisitions</h2>
                    <span className="tm-muted">{manifest.acquisitions.length} scenes</span>
                  </div>
                  <ul className="max-h-56 space-y-2 overflow-auto">
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

                <section className="tm-panel">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="tm-panel__title" style={{ margin: 0 }}>Regional time series</h2>
                      <p className="tm-muted" style={{ marginTop: 4 }}>
                        Mean {polarization} backscatter from the precomputed site stack. Select a point by clicking
                        its acquisition below.
                      </p>
                    </div>
                    <span className="tm-muted" role="status">
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
                          className={`tm-button ${layer?.date === point.date ? "" : "tm-button--ghost"}`}
                          style={{ minHeight: 28, padding: "5px 9px", fontSize: 10 }}
                        >
                          {point.date} · Cycle {point.cycle} · {point.backscatter_db.toFixed(1)} dB · {point.maturity}
                        </button>
                      ))}
                    </div>
                  )}
                  {!timeSeries.length && !isLoadingSeries && (
                    <p className="tm-muted" style={{ marginTop: 16 }}>
                      No time-series observations are available for this polarization.
                    </p>
                  )}
                </section>

                {currentSite && (
                  <p className="tm-muted">
                    {currentSite.acquisition_count} acquisitions · {currentSite.date_range.join(" to ")} · Source:
                    ASF DAAC NISAR GCOV.
                  </p>
                )}
              </aside>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
