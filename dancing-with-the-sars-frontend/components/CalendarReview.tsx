"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Map, type MapView } from "@/components/Map";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { findObservation, normalizeDate, observationDates, observationPolarizations, pairDates, usablePairs } from "@/lib/comparison";
import type { SiteManifest } from "@/lib/types";

export function calendarDatesInRange(dates: string[], start: string, end: string): string[] {
  return dates.includes(start) && dates.includes(end) && start <= end
    ? dates.filter((date) => date >= start && date <= end) : [];
}

/** One exact-date workspace: playback and installed-pair or calendar comparison. */
export function CalendarReview({ manifest }: { manifest: SiteManifest }) {
  const pols = useMemo(() => observationPolarizations(manifest), [manifest]);
  const pairs = useMemo(() => usablePairs(manifest), [manifest]);
  const [pol, setPol] = useState(pols[0] ?? "");
  const dates = useMemo(() => observationDates(manifest, pol), [manifest, pol]);
  const [start, setStart] = useState(dates[0] ?? "");
  const [end, setEnd] = useState(dates[dates.length - 1] ?? "");
  const [index, setIndex] = useState(0);
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"playback" | "compare">("playback");
  const [comparisonMode, setComparisonMode] = useState<"curated" | "calendar">(pairs.length ? "curated" : "calendar");
  const [pairId, setPairId] = useState(pairs[0]?.id ?? "");
  const [falseColor, setFalseColor] = useState(false);
  const [view, setView] = useState<MapView>("sar");
  useEffect(() => {
    const readHash = () => { if (window.location.hash === "#compare") setMode("compare"); };
    readHash(); window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);
  useEffect(() => { setPol(pols[0] ?? ""); }, [pols]);
  useEffect(() => {
    setStart(dates[0] ?? ""); setEnd(dates[dates.length - 1] ?? "");
    setIndex(0); setPlaying(false);
  }, [dates]);
  const valid = dates.includes(start) && dates.includes(end) && start <= end;
  const selectedDates = useMemo(() => calendarDatesInRange(dates, start, end), [dates, start, end]);
  // Keep every installed observation mounted even when the selected range changes.
  const allFrames = useMemo(() => dates.map((date) => findObservation(manifest, pol, date)).filter((layer): layer is NonNullable<typeof layer> => layer !== null), [dates, manifest, pol]);
  const frames = useMemo(() => allFrames.filter((layer) => selectedDates.includes(layer.date ?? "")), [allFrames, selectedDates]);
  useEffect(() => { setIndex(0); setPlaying(false); }, [start, end, pol]);
  const current = frames[index] ?? frames[0];
  const displayed = allFrames.find((frame) => frame.id === displayedId) ?? current;
  const displayedIndex = frames.findIndex((frame) => frame.id === displayed?.id);
  useEffect(() => {
    if (!playing || frames.length < 2 || displayedId !== current?.id) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % frames.length), 1200);
    return () => window.clearTimeout(timer);
  }, [playing, frames.length, displayedId, current?.id]);
  const compareManifest = useMemo((): SiteManifest => ({ ...manifest, pairs: [{ id: "calendar-selection", pre: start.replace(/-/g, ""), post: end.replace(/-/g, ""), label: "Selected calendar dates", stats: {} }] }), [manifest, start, end]);
  const calendarError = !dates.length ? "No backscatter observation dates are available for this polarization." : !dates.includes(start) || !dates.includes(end) ? "Choose exact installed dates. No substitute date or polarization is used." : start > end ? "The before date must be on or before the after date." : null;
  return <section className="space-y-4" aria-label="Timeline and comparison workspace">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Review mode">
      <button type="button" className="tm-button" aria-pressed={mode === "playback"} onClick={() => { setMode("playback"); setPlaying(false); }}>Time Machine</button>
      <button type="button" className="tm-button" aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); setPlaying(false); }}>Before / after</button>
    </div>
    <div className="tm-calendar">
      <div className="tm-calendar__row">
        <label className="tm-calendar__label">Before date<input type="date" value={start} min={dates[0] ?? ""} max={dates[dates.length - 1] ?? ""} disabled={!dates.length} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="tm-calendar__label">After date<input type="date" value={end} min={dates[0] ?? ""} max={dates[dates.length - 1] ?? ""} disabled={!dates.length} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="tm-calendar__label">Polarization<select value={pol} onChange={(e) => setPol(e.target.value)} disabled={!pols.length}>{pols.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <p className="footnote">These dates set the playback range or calendar comparison; a curated comparison uses the pair selected below.</p>
      <p className="footnote">Available {pol} dates: {dates.join(" · ") || "none"}. Playback includes only installed observations; no dates are interpolated.</p>
    </div>
    {calendarError && (mode === "playback" || comparisonMode === "calendar") && <p className="tm-problem" role="status">{calendarError}</p>}
    {mode === "playback" && valid && current && <>
      <div className="h-[32rem] overflow-hidden rounded-lg"><Map bbox={manifest.site.bbox} layers={allFrames} activeLayerId={current.id} onActiveLayerChange={setDisplayedId} view={view} setView={setView} falseColor={falseColor} onFalseColorChange={setFalseColor} /></div>
      <div className="tm-panel"><div className="flex flex-wrap items-center gap-3">
        <button type="button" className="tm-button tm-button--primary" disabled={frames.length < 2} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause playback" : "Play playback"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <span>{displayedIndex >= 0 ? `Frame ${displayedIndex + 1} / ${frames.length}` : "Showing previous frame"} · {displayed?.date} · {pol}</span>
        {displayedId !== current.id && <span role="status">Loading {current.date}…</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose an exact observation date">{frames.map((frame, frameIndex) => <button type="button" key={frame.id} className="tm-button" aria-pressed={index === frameIndex} onClick={() => { setIndex(frameIndex); setPlaying(false); }}>{frame.date}</button>)}</div>
      <label className="mt-4 block text-xs">Observation timeline<input className="block w-full accent-sky-400" type="range" min={0} max={frames.length - 1} value={index} onChange={(e) => { setIndex(Number(e.target.value)); setPlaying(false); }} /></label>
      <p className="footnote mt-2">{displayed?.title ?? displayed?.id} · {displayed?.kind}. Frames stay on screen while the next tiles load.</p></div>
    </>}
    {mode === "compare" && <>
      <div className="tm-calendar__row">
        <label className="tm-calendar__label">Mode<select value={comparisonMode} onChange={(e) => setComparisonMode(e.target.value as "curated" | "calendar")}><option value="curated" disabled={!pairs.length}>Curated pair</option><option value="calendar">Calendar dates</option></select></label>
        {comparisonMode === "curated" && <label className="tm-calendar__label">Installed pair<select value={pairId} onChange={(e) => setPairId(e.target.value)}>{pairs.map((pair) => <option key={pair.id} value={pair.id}>{pairDates(pair).pre} → {pairDates(pair).post}</option>)}</select></label>}
      </div>
      {comparisonMode === "curated" && pairId ? <ComparisonViewer key={`${manifest.site.id}-${pairId}-${pol}`} manifest={manifest} pairId={pairId} pol={pol} showProducts falseColor={falseColor} onFalseColorChange={setFalseColor} /> : comparisonMode === "calendar" && <>
        <p className="footnote">Calendar mode shows observations only. Only installed pairs have measured difference products; select Curated pair to view them.</p>
        {valid && (start < end ? <ComparisonViewer key={`${start}-${end}-${pol}`} manifest={compareManifest} pairId="calendar-selection" pol={pol} falseColor={falseColor} onFalseColorChange={setFalseColor} /> : <p className="tm-problem">Choose two different exact dates for comparison.</p>)}
      </>}
    </>}
    <details className="tm-panel"><summary className="cursor-pointer text-sm">Exact acquisitions and provenance</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr><th>Date</th><th>Polarization</th><th>Product</th><th>CRID</th><th>Maturity</th><th>Source</th><th>Granule</th></tr></thead><tbody>{frames.map((layer) => { const acquisition = manifest.acquisitions.find((item) => normalizeDate(item.date.slice(0, 10)) === normalizeDate(layer.date)); return <tr key={layer.id} className="border-t border-slate-700"><td className="p-2">{layer.date}</td><td>{layer.pol}</td><td>{layer.kind}</td><td>{acquisition?.crid ?? manifest.source.crid}</td><td>{manifest.source.maturity}</td><td>{manifest.source.mission} · {manifest.source.product}</td><td className="font-mono">{acquisition?.granule ?? "Not listed in manifest"}</td></tr>; })}</tbody></table><p className="mt-3 text-xs">{manifest.site.caveat}</p></div></details>
  </section>;
}
