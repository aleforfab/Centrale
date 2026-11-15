"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Map, type MapView } from "@/components/Map";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { findObservation, normalizeDate, observationDates, observationPolarizations } from "@/lib/comparison";
import type { SiteManifest } from "@/lib/types";

/** Filter only exact installed dates; invalid endpoints do not select a range. */
export function calendarDatesInRange(dates: string[], start: string, end: string): string[] {
  return dates.includes(start) && dates.includes(end) && start <= end
    ? dates.filter((date) => date >= start && date <= end)
    : [];
}

/** A calendar range never fabricates intermediate observations. */
export function CalendarReview({ manifest }: { manifest: SiteManifest }) {
  const pols = useMemo(() => observationPolarizations(manifest), [manifest]);
  const [pol, setPol] = useState(pols[0] ?? "");
  const dates = useMemo(() => observationDates(manifest, pol), [manifest, pol]);
  const [start, setStart] = useState(dates[0] ?? "");
  const [end, setEnd] = useState(dates[dates.length - 1] ?? "");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"playback" | "compare">("playback");
  const [view, setView] = useState<MapView>("sar");
  useEffect(() => { setPol(pols[0] ?? ""); }, [pols]);
  useEffect(() => {
    setStart(dates[0] ?? ""); setEnd(dates[dates.length - 1] ?? "");
    setIndex(0); setPlaying(false);
  }, [dates]);
  const valid = dates.includes(start) && dates.includes(end) && start <= end;
  const selectedDates = useMemo(() => calendarDatesInRange(dates, start, end), [dates, start, end, valid]);
  const frames = useMemo(() => selectedDates.map((date) => findObservation(manifest, pol, date)).filter((layer): layer is NonNullable<typeof layer> => layer !== null), [selectedDates, manifest, pol]);
  useEffect(() => { setIndex(0); setPlaying(false); }, [start, end, pol]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPlaying(false); return; }
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 1200);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);
  const current = frames[index] ?? frames[0];
  const mapLayers = useMemo(() => current ? [current] : [], [current]);
  const compareManifest = useMemo((): SiteManifest => ({ ...manifest, pairs: [{ id: "time-machine-calendar", pre: start.replace(/-/g, ""), post: end.replace(/-/g, ""), label: "Selected calendar dates", stats: {} }] }), [manifest, start, end]);
  const calendarError = !dates.length ? "No backscatter observation dates are available for this polarization." : !dates.includes(start) || !dates.includes(end) ? "Choose exact installed dates. No substitute date or polarization is used." : start > end ? "The before date must be on or before the after date." : null;
  return <section className="space-y-4" aria-label="Time Machine observation review">
    <div className="tm-calendar">
      <div className="tm-calendar__row">
        <label className="tm-calendar__label">Before date<input type="date" value={start} min={dates[0] ?? ""} max={dates[dates.length - 1] ?? ""} disabled={!dates.length} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="tm-calendar__label">After date<input type="date" value={end} min={dates[0] ?? ""} max={dates[dates.length - 1] ?? ""} disabled={!dates.length} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="tm-calendar__label">Polarization<select value={pol} onChange={(e) => setPol(e.target.value)} disabled={!pols.length}>{pols.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <p className="text-xs text-slate-400">Available {pol} dates: {dates.join(" · ") || "none"}</p>
      <p className="text-xs text-slate-400">Playback includes only installed backscatter observations between the selected dates, inclusive. Missing dates are not interpolated.</p>
    </div>
    {calendarError && <p className="tm-problem" role="status">{calendarError}</p>}
    <div className="flex gap-2"><button type="button" className="tm-button" aria-pressed={mode === "playback"} onClick={() => { setMode("playback"); setPlaying(false); }}>Animate stack</button><button type="button" className="tm-button" aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); setPlaying(false); }}>Before / after</button></div>
    {valid && mode === "playback" && current && <>
      <div className="h-[28rem] overflow-hidden rounded-lg"><Map bbox={manifest.site.bbox} layers={mapLayers} view={view} setView={setView} /></div>
      <div className="tm-panel"><div className="flex flex-wrap items-center gap-3">
        <button type="button" className="tm-button tm-button--primary" disabled={frames.length < 2} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause playback" : "Play playback"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
        <span>Frame {index + 1} / {frames.length} · {selectedDates[index]} · {pol}</span>
      </div><label className="mt-4 block text-xs text-slate-400">Observation timeline<input className="block w-full accent-sky-400" type="range" min={0} max={frames.length - 1} value={index} onChange={(e) => { setIndex(Number(e.target.value)); setPlaying(false); }} /></label>
      <p className="mt-2 text-xs text-slate-400">{current.title ?? current.id} · {current.kind}</p></div>
    </>}
    {valid && mode === "compare" && (start < end ? <ComparisonViewer manifest={compareManifest} pairId="time-machine-calendar" pol={pol} /> : <p className="tm-problem">Choose two different exact dates for comparison.</p>)}
    <details className="tm-panel"><summary className="cursor-pointer text-sm text-sky-300">Exact acquisitions and provenance</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr><th>Date</th><th>Polarization</th><th>Product</th><th>CRID</th><th>Maturity</th><th>Source</th><th>Granule</th></tr></thead><tbody>{frames.map((layer) => { const acquisition = manifest.acquisitions.find((item) => normalizeDate(item.date.slice(0, 10)) === normalizeDate(layer.date)); return <tr key={layer.id} className="border-t border-slate-700"><td className="p-2">{layer.date}</td><td>{layer.pol}</td><td>{layer.kind}</td><td>{acquisition?.crid ?? manifest.source.crid}</td><td>{manifest.source.maturity}</td><td>{manifest.source.mission} · {manifest.source.product}</td><td className="font-mono">{acquisition?.granule ?? "Not listed in manifest"}</td></tr>; })}</tbody></table><p className="mt-3 text-xs text-slate-400">{manifest.site.caveat}</p></div></details>
  </section>;
}
