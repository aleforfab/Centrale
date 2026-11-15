"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
import { AppShell } from "@/components/AppShell";
import { Map, type MapView } from "@/components/Map";
import { api } from "@/lib/api";
import type {
  PairStats,
  ProductLayer,
  SiteManifest,
  SiteSummary,
} from "@/lib/types";

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
  const [layerSelection, setLayerSelection] = useState<{ active: string; visible: string[] }>({ active: "", visible: [] });
  const { active: layerId, visible: visibleLayerIds } = layerSelection;
  const [builtId, setBuiltId] = useState("");
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<MapView>("optical");
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.sites()
      .then((siteList) => {
        if (!active) return;
        setSites(siteList);
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
      return;
    }
    let active = true;
    setIsLoadingManifest(true);
    setManifest(null);
    setError(null);
    api.site(siteId)
      .then((siteManifest) => {
        if (!active) return;
        setManifest(siteManifest);
        const initialPol = siteManifest.polarizations[0]?.pol ?? "";
        setPolarization(initialPol);
        const initialLayer = [...siteManifest.layers].reverse().find((item) => item.kind === "backscatter")
          ?? siteManifest.layers[0];
        setLayerSelection({ active: initialLayer?.id ?? "", visible: initialLayer ? [initialLayer.id] : [] });
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
  }, [siteId, revision]);

  const polLayers = useMemo(
    () => manifest?.layers.filter((layer) => !layer.pol || layer.pol === polarization) ?? [],
    [manifest, polarization],
  );
  const layer = polLayers.find((item) => item.id === layerId) ?? polLayers[0] ?? null;
  const visibleLayers = useMemo(() => {
    const active = polLayers.filter((item) => visibleLayerIds.includes(item.id));
    return layer && active.includes(layer) ? [layer, ...active.filter((item) => item.id !== layer.id)] : active;
  }, [layer, polLayers, visibleLayerIds]);
  const stats = selectedStats(layer, manifest, polarization);

  useEffect(() => {
    if (!layer || layer.id === layerId) return;
    setLayerSelection((current) => ({ ...current, active: layer.id, visible: current.visible.includes(layer.id) ? current.visible : [...current.visible, layer.id] }));
  }, [layer, layerId]);

  const selectLayer = (id: string) => setLayerSelection((current) => ({ active: id, visible: current.visible.includes(id) ? current.visible : [...current.visible, id] }));
  const selectAcquisition = (date: string) => {
    const backscatterLayer = polLayers.find((item) => item.kind === "backscatter" && item.date === date);
    if (backscatterLayer) selectLayer(backscatterLayer.id);
  };
  const built = async (id: string) => {
    const list = await api.sites();
    if (!list.some((site) => site.id === id)) throw new Error("Built site is not yet in the product catalog.");
    setSites(list); setBuiltId(id); setSiteId(id); setRevision((value) => value + 1);
  };

  return (
    <AppShell
      current="/"
      eyebrow="Map-first explorer"
      title="Dancing with the SARs"
      subtitle="Installed NISAR product layers, exact dates and measured change products in a cinematic radar workspace."
    >
      <section className="tm-panel mb-4"><p className="tm-muted">Explore installed dated radar products and their provenance.</p></section>
          <div className="tm-dashboard-controls">
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
            <label>Site
              <select value={siteId} onChange={(event) => { setBuiltId(""); setSiteId(event.target.value); }} className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
                {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
              </select>
            </label>
          </div>
      <details className="tm-panel mb-4"><summary className="cursor-pointer">Fetch new observations (live)</summary><div className="mt-4"><LiveScanPanel idPrefix="dashboard-scan" compact onBuilt={built} /></div></details>
      {manifest && builtId === siteId && <BuiltProductsBanner manifest={manifest} />}

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
          <p className="tm-muted">Loading product catalog…</p>
        </div>
      ) : sites.length === 0 ? (
        <section className="tm-panel tm-notice" style={{ margin: "48px auto", maxWidth: 720, textAlign: "center", padding: 32 }}>
          <h2>No precomputed products yet</h2>
          <p className="tm-muted" style={{ marginTop: 12 }}>
            The viewer displays built NISAR products and does not substitute Sentinel-1 analysis. A live fetch can be explicitly requested above.
          </p>
          <p className="mt-4 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300">
            python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
          </p>
        </section>
      ) : (
        <>
          <fieldset className="tm-dashboard-overlays">
            <legend>Layers</legend>
            <p className="tm-muted mb-2">Choose an active layer and toggle visibility independently. A hidden active layer remains selected.</p>
            <div className="space-y-2">{polLayers.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="flex items-center gap-2"><input type="radio" name="active-layer" checked={layer?.id === item.id} onChange={() => selectLayer(item.id)} /> <span>{item.title ?? item.id}{layer?.id === item.id && !visibleLayerIds.includes(item.id) ? " (hidden)" : ""}</span></label>
              <label><input type="checkbox" checked={visibleLayerIds.includes(item.id)} onChange={(event) => setLayerSelection((current) => ({ ...current, visible: event.target.checked ? [...current.visible.filter((id) => id !== item.id), item.id] : current.visible.filter((id) => id !== item.id) }))} /> Visible</label>
              <span className="tm-chip">{item.date ?? "undated"}</span><span className="tm-chip">{item.pol ?? "all pols"}</span><span className="tm-chip">{item.kind}</span>
            </div>)}</div>
            {layer?.legend && <p className="mt-3 text-xs text-slate-400">{layer.legend}</p>}
          </fieldset>

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
                    <strong>{layer?.date ?? (layer?.kind === "difference" ? manifest.pairs.find((pair) => pair.id === layer.pair_id)?.label : null) ?? "Date not reported"}</strong>
                    <small>{polarization} · {layer?.title ?? "No layer selected"}</small>
                  </div>
                  <span className="tm-stage__badge" style={{ position: "static" }}>
                    {manifest.source.maturity}
                  </span>
                </div>
                <div className="tm-dashboard-map__footer">
                  <span>{manifest.site.caveat}</span>

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
                          <span className="mt-1 block text-[10px] text-slate-500">{acquisition.coverage} coverage</span>
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

              </aside>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
