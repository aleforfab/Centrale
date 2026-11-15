"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
import { AppShell } from "@/components/AppShell";
import { Map, type MapView } from "@/components/Map";
import { api } from "@/lib/api";
import { pairDates } from "@/lib/comparison";
import type {
  Pair,
  PairStats,
  ProductLayer,
  SiteManifest,
  SiteSummary,
} from "@/lib/types";

/*
 * The Observation Plate — REDESIGN_GUIDE §6 `/`.
 *
 * Vocabulary classes (`.plate`, `.plate__tag`, `.plate__caption`, `.index-row`,
 * `.rule-table`, `.colophon`, `.field`, `.footnote`) are owned by
 * `app/redesign.css`. The utilities next to them only restate the guide's fixed
 * token values and this page's own layout on the same element, so a vocabulary
 * rule and its utility never stack — whichever loads last wins with the same value.
 */
const MONO = "font-[family-name:var(--font-mono)]";
const DISPLAY = "font-[family-name:var(--font-display)]";
/** Guide §4 label: 11px mono, 0.18em tracking, uppercase, ink-mute. */
const LABEL = `${MONO} text-[11px] uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink-mute)]`;
const PLATE = "plate rounded-[var(--radius)] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)]";
const PLATE_TAG = `plate__tag ${MONO} border-b border-[color:var(--hairline)] px-3 py-2 text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-[color:var(--ink)]`;
const PLATE_TAG_ROW = "flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1";
const PLATE_CAPTION = `plate__caption ${MONO} border-t border-[color:var(--hairline)] px-3 py-2 text-[11px] leading-[1.5] text-[color:var(--ink-mute)]`;
const COLOPHON = "colophon border-l-[3px] border-[color:var(--accent-graphic)] bg-[color:var(--colophon)] px-3 py-2.5 text-[13px] leading-[1.55] text-[color:var(--ink)]";
const FOOTNOTE = `footnote ${MONO} text-[11px] leading-[1.55] text-[color:var(--ink-mute)]`;
/* Row separators and hover belong to `.index-row`; the list owns the horizontal inset. */
const INDEX_ROW = "index-row py-2.5";
/*
 * Layout lives on an inner wrapper wherever a vocabulary element needs one, so
 * the element's own `display` (flex, grid or block — redesign.css decides) can
 * never rearrange the content. `col-span-full` only matters if the parent is a grid.
 */
const ROW = "col-span-full flex w-full min-w-0";
const RULE_TABLE = "rule-table w-full border-collapse text-[12px]";
const RULE_CELL = "border-t border-[color:var(--hairline)] py-1.5 align-baseline";
const FIELD_LABEL = `${MONO} text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-mute)]`;
const FIELD_CONTROL = `${MONO} block w-full rounded-[var(--radius)] border border-[color:var(--hairline-strong)] bg-[color:var(--paper-2)] h-[38px] px-2.5 py-0 text-[13px] text-[color:var(--ink)] disabled:opacity-50`;
const CHIP = `tm-chip ${MONO} inline-flex items-center rounded-[var(--radius)] border border-[color:var(--hairline-strong)] px-1.5 py-0.5 text-[10px] uppercase leading-[1.4] tracking-[0.12em] text-[color:var(--ink-soft)]`;
const TEXT_LINK = `${MONO} text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent)] underline underline-offset-2`;
/* Guide §3 on-imagery chip: the one dark exception (literal values, no token). */
const IMAGERY_CHIP = `${MONO} rounded-[2px] border border-[rgba(245,243,236,0.22)] bg-[rgba(13,12,10,0.88)] text-[#F5F3EC]`;

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

function pairOf(layer: ProductLayer | null | undefined, manifest: SiteManifest | null): Pair | null {
  if (!layer?.pair_id || !manifest) return null;
  return manifest.pairs.find((item) => item.id === layer.pair_id) ?? null;
}

/**
 * The one date concept of a layer: its exact acquisition date, or — for a pair
 * product, which has no single date — the exact window of the two acquisitions
 * it was computed from. Null when the manifest reports neither.
 */
function layerWhen(layer: ProductLayer | null | undefined, manifest: SiteManifest | null): string | null {
  if (!layer) return null;
  if (layer.date) return layer.date;
  const pair = pairOf(layer, manifest);
  if (!pair) return null;
  const { pre, post } = pairDates(pair);
  return pre && post ? `${pre} → ${post}` : null;
}

function kindLabel(kind: ProductLayer["kind"]): string {
  return kind.replace(/_/g, " ");
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="field flex min-w-[11rem] flex-col gap-1">
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      {children}
    </div>
  );
}

function RailSection({ id, tag, meta, children }: { id: string; tag: string; meta?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-b border-[color:var(--hairline)] py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 px-4">
        {/* The label styles sit on the inner span so a heading-level rule cannot restyle the tag. */}
        <h2 id={id} className="tm-panel__title m-0"><span className={`block ${LABEL}`}>{tag}</span></h2>
        {meta && <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-mute)]`}>{meta}</span>}
      </div>
      {children}
    </section>
  );
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
  const [openGranule, setOpenGranule] = useState<string | null>(null);

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

  const activePair = pairOf(layer, manifest);
  const activeWhen = layerWhen(layer, manifest);
  const activeThreshold = activePair && layer
    ? layer.threshold_db ?? Object.keys(activePair.stats[polarization] ?? {})[0]
    : null;
  const histogramPeak = stats ? Math.max(...stats.histogram, 1) : 1;

  return (
    <AppShell
      current="/"
      eyebrow="Observation plate"
      title="Dancing with the SARs"
      subtitle="Installed NISAR product layers, exact dates and measured change products."
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field id="dashboard-site" label="Site">
          <select
            id="dashboard-site"
            value={siteId}
            onChange={(event) => { setBuiltId(""); setSiteId(event.target.value); }}
            className={FIELD_CONTROL}
          >
            {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
          </select>
        </Field>
        <Field id="dashboard-polarization" label="Polarization">
          <select
            id="dashboard-polarization"
            value={polarization}
            onChange={(event) => setPolarization(event.target.value)}
            disabled={!manifest}
            className={FIELD_CONTROL}
          >
            {manifest?.polarizations.map((item) => <option key={item.pol} value={item.pol}>{item.pol}</option>)}
          </select>
        </Field>
        <p className={`${FOOTNOTE} sm:ml-auto sm:text-right`}>Installed dated radar products and their provenance.</p>
      </div>

      <details className="mb-5 border-y border-[color:var(--hairline)] py-2.5">
        <summary className={`${LABEL} cursor-pointer`}>Fetch new observations (live)</summary>
        <div className="mt-4"><LiveScanPanel idPrefix="dashboard-scan" compact onBuilt={built} /></div>
      </details>
      {manifest && builtId === siteId && <BuiltProductsBanner manifest={manifest} />}

      {error && (
        <div className={`${COLOPHON} mb-5`} role="alert">
          <div className={`${ROW} items-start justify-between gap-4`}>
            <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
            <button type="button" onClick={() => setError(null)} className={`${TEXT_LINK} shrink-0`}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isLoadingSites ? (
        <div className={`${PLATE} grid min-h-[320px] place-items-center`}>
          <p className={LABEL}>Loading product catalog…</p>
        </div>
      ) : sites.length === 0 ? (
        <section className={`${PLATE} mx-auto my-12 max-w-[720px]`} aria-labelledby="dashboard-empty-title">
          <p className={PLATE_TAG}>
            <span className={PLATE_TAG_ROW}>
              <span>Catalogue</span>
              <span className="text-[color:var(--ink-mute)]">0 installed sites</span>
            </span>
          </p>
          <div className="space-y-4 p-5">
            <h2 id="dashboard-empty-title" className={`${DISPLAY} text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[color:var(--ink)]`}>
              No precomputed products yet
            </h2>
            <p className={COLOPHON}>
              The viewer displays built NISAR products and does not substitute Sentinel-1 analysis. A live fetch can be explicitly requested above.
            </p>
            <p className={`${MONO} overflow-x-auto rounded-[var(--radius)] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]`}>
              python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
            </p>
          </div>
        </section>
      ) : isLoadingManifest ? (
        <div className={`${PLATE} grid min-h-[420px] place-items-center`}>
          <p className={LABEL}>Loading site manifest…</p>
        </div>
      ) : manifest ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className={`${PLATE} min-w-0 lg:[@media(min-height:640px)]:sticky lg:top-4`} aria-label="Installed NISAR product map">
            <p className={PLATE_TAG}>
              <span className={PLATE_TAG_ROW}>
                <span>
                  <span className="text-[color:var(--accent)]">FIG. 01</span>
                  {" — "}{manifest.site.title.toUpperCase()}
                  {layer
                    ? <>{" · "}{layer.pol ?? polarization}{" · "}{kindLabel(layer.kind)}{" · "}{activeWhen ?? "date not reported"}</>
                    : " · no layer selected"}
                </span>
                <span className="text-[color:var(--ink-mute)]">{manifest.source.maturity}</span>
              </span>
            </p>
            <div className="relative h-[clamp(440px,66vh,760px)]">
              <Map
                bbox={manifest.site.bbox}
                layers={visibleLayers}
                view={view}
                setView={setView}
              />
              {/* Below the Map's own view toggle (top-left); inline so the position never depends on the legacy `.tm-*` rule. */}
              <div
                className="tm-dashboard-map__hud pointer-events-none"
                style={{ position: "absolute", top: 52, left: 12, right: "auto", bottom: "auto", display: "block" }}
              >
                <p className={`${IMAGERY_CHIP} max-w-[min(340px,70vw)] px-2.5 py-2`}>
                  <span className="block text-[10px] uppercase leading-[1.4] tracking-[0.18em] opacity-70">
                    {layer?.kind === "backscatter" ? "Observation" : "Product"}
                  </span>
                  <strong className="block text-[13px] font-medium leading-[1.4]">
                    {activeWhen ?? (layer?.kind === "difference" ? activePair?.label : null) ?? "Date not reported"}
                  </strong>
                  <span className="block text-[10px] leading-[1.4] opacity-70">{polarization} · {layer?.title ?? "No layer selected"}</span>
                </p>
              </div>
            </div>
            <p className={PLATE_CAPTION}>{manifest.site.caveat}</p>
          </section>

          <aside
            className="min-w-0 rounded-[var(--radius)] border border-[color:var(--hairline)] bg-[color:var(--paper-2)]"
            aria-label="Catalogue index for this site"
          >
            <RailSection id="rail-site" tag="Site">
              <div className="px-4">
                <h3 className={`${DISPLAY} mt-3 text-[20px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[color:var(--ink)]`}>
                  {manifest.site.title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.55] text-[color:var(--ink-soft)]">{manifest.site.description}</p>
                <p className={`${COLOPHON} mt-3`}>{manifest.site.caveat}</p>
                <div className="tm-chip-row mt-3 flex flex-wrap gap-1.5">
                  {[manifest.source.mission, `${manifest.source.band}-band`, manifest.source.product, manifest.source.maturity, `CRID ${manifest.source.crid}`].map((tag) => (
                    <span key={tag} className={CHIP}>{tag}</span>
                  ))}
                </div>
              </div>
            </RailSection>

            <RailSection id="rail-layers" tag="Layers" meta={`${polLayers.length} · ${polarization}`}>
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="sr-only">Layers</legend>
                <p className="mt-2 px-4 text-[12px] leading-[1.5] text-[color:var(--ink-mute)]">
                  Choose an active layer and toggle visibility independently. A hidden active layer remains selected.
                </p>
                <ul className="mt-2 px-4">
                  {polLayers.map((item) => {
                    const isActive = layer?.id === item.id;
                    const isVisible = visibleLayerIds.includes(item.id);
                    return (
                      <li key={item.id} className={INDEX_ROW}>
                        <div className={`${ROW} items-start gap-3`}>
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                            <input
                              type="radio"
                              name="active-layer"
                              checked={isActive}
                              onChange={() => selectLayer(item.id)}
                              className="mt-[3px] shrink-0 accent-[color:var(--accent)]"
                            />
                            <span className="min-w-0">
                              <span className={`${MONO} flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-[1.4] text-[color:var(--ink)]`}>
                                <span>{layerWhen(item, manifest) ?? "undated"}</span>
                                <span aria-hidden="true">·</span>
                                <span>{item.pol ?? "all pols"}</span>
                                <span className={CHIP}>{kindLabel(item.kind)}</span>
                              </span>
                              <span className={`mt-1 block text-[13px] leading-[1.35] ${isActive ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-soft)]"}`}>
                                {item.title ?? item.id}{isActive && !isVisible ? " (hidden)" : ""}
                              </span>
                            </span>
                          </label>
                          <label className={`${MONO} flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] uppercase leading-[1.4] tracking-[0.14em] text-[color:var(--ink-mute)]`}>
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(event) => setLayerSelection((current) => ({ ...current, visible: event.target.checked ? [...current.visible.filter((id) => id !== item.id), item.id] : current.visible.filter((id) => id !== item.id) }))}
                              className="accent-[color:var(--accent)]"
                            />
                            Visible
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {layer?.legend && (
                  <p className={`${FOOTNOTE} mt-3 px-4`}>
                    <span className="uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">Legend</span>
                    {" — "}{layer.legend}
                  </p>
                )}
              </fieldset>
            </RailSection>

            <RailSection id="rail-acquisitions" tag="Acquisitions" meta={`${manifest.acquisitions.length} scenes`}>
              <ol className="mt-2 px-4">
                {manifest.acquisitions.map((acquisition, index) => {
                  const isOpen = openGranule === acquisition.granule;
                  const isCurrent = layer?.kind === "backscatter" && layer.date === acquisition.date;
                  return (
                    <li key={acquisition.granule} className={INDEX_ROW}>
                      <div className={`${ROW} items-start gap-3`}>
                        <span
                          className={`${MONO} w-5 shrink-0 text-[11px] leading-[1.5] ${isCurrent ? "text-[color:var(--accent)]" : "text-[color:var(--ink-mute)]"}`}
                          aria-hidden="true"
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => {
                              selectAcquisition(acquisition.date);
                              setOpenGranule(isOpen ? null : acquisition.granule);
                            }}
                            aria-expanded={isOpen}
                            aria-current={isCurrent ? "true" : undefined}
                            title={`Select the ${acquisition.date} observation and ${isOpen ? "shorten" : "show"} the full granule name`}
                            className="block w-full text-left"
                          >
                            <span className={`${MONO} block text-[12px] leading-[1.5] text-[color:var(--ink)]`}>
                              {acquisition.date} · Cycle {acquisition.cycle} · CRID {acquisition.crid}
                            </span>
                            <span
                              className={`${MONO} mt-0.5 block text-[10px] leading-[1.5] text-[color:var(--ink-mute)] ${isOpen ? "break-all" : "truncate"}`}
                              title={acquisition.granule}
                            >
                              {acquisition.granule}
                            </span>
                          </button>
                          <p className={`${MONO} mt-1 text-[10px] leading-[1.5] text-[color:var(--ink-mute)]`}>
                            {acquisition.coverage} coverage{" · "}
                            <a
                              href={acquisition.links.asf ?? acquisition.download_url ?? `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(acquisition.granule)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[color:var(--accent)] underline underline-offset-2"
                            >
                              View at ASF
                            </a>
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </RailSection>

            {manifest.pairs.length > 0 && (
              <RailSection id="rail-measured-change" tag="Measured change" meta={stats && activeThreshold != null ? `±${activeThreshold} dB` : undefined}>
                <div className="px-4">
                  {stats ? (
                    <>
                      <table className={`${RULE_TABLE} mt-3`}>
                        <caption className={`${MONO} pb-2 text-left text-[11px] leading-[1.5] text-[color:var(--ink-soft)]`}>
                          {activePair?.label} · {polarization}
                          {layer?.pair_id ? ` · ${activeThreshold} dB threshold` : ""}
                        </caption>
                        <tbody>
                          {[
                            ["Lower return", `${stats.decrease_km2.toFixed(2)} km² (${stats.decrease_pct.toFixed(1)}%)`],
                            ["Higher return", `${stats.increase_km2.toFixed(2)} km² (${stats.increase_pct.toFixed(1)}%)`],
                            ["Valid coverage", formatPercent(stats.valid_fraction_of_bbox)],
                            ["Noise estimate σ", `${stats.sigma_db.toFixed(2)} dB`],
                          ].map(([label, value]) => (
                            <tr key={label}>
                              <th scope="row" className={`${RULE_CELL} pr-3 text-left font-normal text-[color:var(--ink-soft)]`}>{label}</th>
                              <td className={`${RULE_CELL} ${MONO} text-right tabular-nums text-[color:var(--ink)]`}>{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {stats.histogram.length > 0 && (
                        <div className="tm-spark mt-4 flex h-[54px] items-end gap-[2px]" role="img" aria-label="Difference histogram">
                          {stats.histogram.map((count, index) => (
                            <i
                              key={index}
                              title={`Bin ${index + 1}: ${count} pixels`}
                              className="block min-h-[2px] flex-1 bg-[color:var(--ink)]"
                              style={{ height: `${Math.max(4, count / histogramPeak * 100)}%` }}
                            />
                          ))}
                        </div>
                      )}
                      <p className={`${FOOTNOTE} mt-3`}>
                        {stats.resampled ? "Post-event data were resampled to the pre-event grid." : "Acquisition grids were aligned."}
                        {" "}Backscatter change does not determine its cause. These are measured outputs, not a
                        validated scientific result.
                      </p>
                    </>
                  ) : (
                    <p className={`${FOOTNOTE} mt-3`}>
                      No pair product is active. Select a difference or change-mask layer under Layers to read its measured statistics.
                    </p>
                  )}
                </div>
              </RailSection>
            )}
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}
