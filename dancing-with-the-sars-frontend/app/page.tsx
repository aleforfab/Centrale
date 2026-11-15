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
 * The catalogue vocabulary (`.plate*`, `.index-row`, `.rule-table`, `.colophon`,
 * `.field*`, `.footnote`) is owned by `app/redesign.css` (slice 07) and is used
 * here by name only. Utilities add this page's own layout around it. That
 * stylesheet loads after Tailwind, so the few utilities that must beat one of
 * its rules carry the `!` modifier.
 */
const MONO = "font-[family-name:var(--font-mono)]";
const DISPLAY = "font-[family-name:var(--font-display)]";
/** Guide §4 label: 11px mono, 0.18em tracking, uppercase, ink-mute. */
const LABEL = `${MONO} text-[11px] uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink-mute)]`;
const PLATE = "plate";
const PLATE_TAG = "plate__tag";
const PLATE_HEADER = "plate__header gap-4";
const PLATE_RIGHT_TAG = "plate__right-tag shrink-0";
const PLATE_CAPTION = "plate__caption";
const COLOPHON = "colophon";
const FOOTNOTE = "footnote";
/* Separators and hover belong to `.index-row`; the active marker is drawn on the inner wrapper. */
const INDEX_ROW = "index-row";
/*
 * Layout lives on an inner wrapper wherever a vocabulary element needs one, so
 * the element's own `display` (redesign.css decides it) can never rearrange
 * the content. `col-span-full` only matters if the parent is a grid.
 */
const ROW = "col-span-full flex w-full min-w-0";
/*
 * Label / value tables use `<th scope="row">`. `.rule-table th` is drawn for
 * column heads (strong rule), so row heads take the hairline the value cells use.
 */
const RULE_TABLE = "rule-table [&_td]:align-top [&_th]:align-top [&_tbody_th]:border-b-[color:var(--hairline)] [&_tbody_tr:last-child_th]:border-b-0";
/* `.field` styles its own label and control; this only equalises select and date-input heights. */
const FIELD_CONTROL = "h-[38px] w-full";
const CHIP = "tm-chip uppercase";
const TEXT_LINK = `${MONO} text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent)] underline underline-offset-2`;
/* Guide §3 on-imagery chip: the one dark exception (literal values, no token). */
const IMAGERY_CHIP = `${MONO} rounded-[2px] border border-[rgba(245,243,236,0.24)] bg-[rgba(13,12,10,0.88)] text-[#F5F3EC]`;

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
    ? (thresholds["6"] ? "6" : Object.keys(thresholds)[0])
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
    <div className="field min-w-[11rem]">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function RailSection({ id, tag, meta, children }: { id: string; tag: string; meta?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-b border-[color:var(--hairline)] py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 px-4">
        {/* The label styles sit on the inner span so a heading-level rule cannot restyle the tag. */}
        <h2 id={id} className="tm-panel__title !m-0"><span className={`block ${LABEL}`}>{tag}</span></h2>
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
        setSiteId((current) => current || siteList.find((site) => site.id === "anak-krakatau")?.id || siteList[0]?.id || "");
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
        const initialLayer = [...siteManifest.layers].filter((item) => item.kind === "backscatter" && item.pol === initialPol).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]
          ?? siteManifest.layers[0];
        setLayerSelection({ active: initialLayer?.id ?? "", visible: [] });
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
    const overlays = polLayers.filter((item) => visibleLayerIds.includes(item.id) && item.id !== layer?.id);
    return layer ? [...overlays, layer] : overlays;
  }, [layer, polLayers, visibleLayerIds]);
  const stats = selectedStats(layer, manifest, polarization);

  useEffect(() => {
    if (!layer || layer.id === layerId) return;
    setLayerSelection((current) => ({ ...current, active: layer.id }));
  }, [layer, layerId]);

  const selectLayer = (id: string) => setLayerSelection((current) => ({ ...current, active: id, visible: current.visible.filter((item) => item !== id) }));
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
    ? layer.threshold_db ?? (activePair.stats[polarization]?.["6"] ? "6" : Object.keys(activePair.stats[polarization] ?? {})[0])
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

      {manifest && <div className="mb-4 text-[13px] leading-5" role="status">
        <strong>Measured backscatter change, exact dates.</strong> {manifest.acquisitions.map((a) => a.date).join(" · ")}
        <p>{manifest.site.caveat}</p>
        {manifest.site.id === "anak-krakatau" && <p>NASA reports lava reaching the western and southwestern coast during early September; this map shows radar return, not a mapped lava boundary. <a className={TEXT_LINK} href="https://www.earthdata.nasa.gov/news/worldview-image-archive/anak-krakatau-grows" target="_blank" rel="noreferrer">NASA Worldview: Anak Krakatau Grows ↗</a></p>}
      </div>}
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
          <header className={PLATE_HEADER}>
            <p className={PLATE_TAG}>Catalogue</p>
            <p className={PLATE_RIGHT_TAG}>0 installed sites</p>
          </header>
          <div className="plate__body space-y-4">
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
            <header className={PLATE_HEADER}>
              <p className={PLATE_TAG}>
                FIG. 01
                <span className="text-[color:var(--ink)]">
                  {" — "}{manifest.site.title.toUpperCase()}
                  {layer
                    ? <>{" · "}{layer.pol ?? polarization}{" · "}{kindLabel(layer.kind)}{" · "}{activeWhen ?? "date not reported"}</>
                    : " · no layer selected"}
                </span>
              </p>
              <p className={PLATE_RIGHT_TAG}>{manifest.source.maturity}</p>
            </header>
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
            className="min-w-0 rounded-[var(--radius)] border border-[color:var(--hairline)] bg-[color:var(--paper)]"
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
                <p className="mt-2 px-4 text-[12px]">Radio: layer being drawn. Checkbox: extra overlay. The 6 dB mask is the recommended starting threshold; 2 dB can be dominated by open-water speckle.</p>
                {(() => {
                  const row = (item: ProductLayer) => {
                    const isActive = layer?.id === item.id;
                    return <li key={item.id} className={INDEX_ROW}>
                      <div className={`${ROW} items-start gap-3`}>
                        <label className="flex min-w-0 flex-1 items-start gap-2">
                          <input type="radio" name="active-layer" aria-label={`Draw ${item.kind === "backscatter" ? "observation" : item.kind === "difference" ? "difference" : `${item.threshold_db} dB mask`} ${layerWhen(item, manifest) ?? ""}`} checked={isActive} onChange={() => selectLayer(item.id)} className="mt-1 accent-[color:var(--accent)]" />
                          <span><span className="sr-only">Draw </span>{item.kind === "backscatter" ? `${item.date} · ${item.pol}` : item.kind === "difference" ? "Difference" : `${item.threshold_db} dB mask`}</span>
                        </label>
                        <label className={`${MONO} shrink-0 text-[10px] uppercase`}>
                          <input type="checkbox" checked={visibleLayerIds.includes(item.id)} disabled={isActive} onChange={(event) => setLayerSelection((current) => ({ ...current, visible: event.target.checked ? [...current.visible.filter((id) => id !== item.id), item.id] : current.visible.filter((id) => id !== item.id) }))} /> Extra overlay<span className="sr-only"> {item.title ?? item.id}</span>
                        </label>
                      </div>
                    </li>;
                  };
                  const observations = polLayers.filter((item) => item.kind === "backscatter");
                  return <div className="px-4 mt-3">
                    <h3 className={LABEL}>Observations ({observations.length})</h3>
                    <ul>{observations.map(row)}</ul>
                    <h3 className={`${LABEL} mt-4`}>Measured change ({manifest.pairs.length} pairs)</h3>
                    {manifest.pairs.map((pair) => {
                      const products = polLayers.filter((item) => item.pair_id === pair.id).sort((a, b) => a.kind === "difference" ? -1 : b.kind === "difference" ? 1 : (b.threshold_db ?? 0) - (a.threshold_db ?? 0));
                      return <details key={pair.id}><summary className="cursor-pointer py-2 text-[13px]">{pairDates(pair).pre} → {pairDates(pair).post}</summary><ul className="pl-3">{products.map(row)}</ul></details>;
                    })}
                  </div>;
                })()}
                {visibleLayers.some((item) => item.kind === "change_mask") && <p className={`${FOOTNOTE} mt-3 px-4`}>Blue = lower return · Red = higher return. Masks are categorical.</p>}
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
                  {stats && Number(activeThreshold) !== 2 ? (
                    <>
                      <table className={`${RULE_TABLE} mt-3`}>
                        <caption className={`${MONO} pb-2 text-left text-[11px] leading-[1.5] text-[color:var(--ink-soft)]`}>
                          {activePair?.label} · {polarization}
                          {layer?.pair_id ? ` · ${activeThreshold} dB threshold` : ""}
                        </caption>
                        <tbody>
                          {[
                            ["Lower return", "", `${stats.decrease_km2.toFixed(2)} km² (${stats.decrease_pct.toFixed(1)}%)`],
                            ["Higher return", "", `${stats.increase_km2.toFixed(2)} km² (${stats.increase_pct.toFixed(1)}%)`],
                            ["Valid coverage", "", formatPercent(stats.valid_fraction_of_bbox)],
                            ["Noise estimate", "σ", `${stats.sigma_db.toFixed(2)} dB`],
                          ].map(([label, symbol, value]) => (
                            <tr key={label}>
                              {/* The row label is uppercased by `.rule-table th`; σ must stay lower case (Σ would read as a sum). */}
                              <th scope="row">{label}{symbol && <> <span className="normal-case">{symbol}</span></>}</th>
                              <td>{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {stats.histogram.length > 0 && (
                        <div className="tm-spark" role="img" aria-label="Difference histogram">
                          {stats.histogram.map((count, index) => (
                            <i
                              key={index}
                              title={`Bin ${index + 1}: ${count} pixels`}
                              className="block ![background:var(--ink)] !rounded-none"
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
                      {Number(activeThreshold) === 2 ? "The 2 dB mask can be dominated by open-water speckle; select 6 dB to review statistics." : "No pair product is active. Select a difference or change-mask layer under Layers to read its measured statistics."}
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
