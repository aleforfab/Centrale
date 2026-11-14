"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { Map } from "@/components/Map";
import { KRAKATAU_STACK_DATES, manifestToScanFrames } from "@/lib/scanFrames";
import type { SiteManifest } from "@/lib/types";

function trackFrame(granule: string): string {
  const match = granule.match(/_(\d{3})_(\d{3})_[AD]_/);
  return match ? `Track ${match[1]} · Frame ${match[2]}` : "Track/frame not encoded in granule name";
}

function eventPhase(date: string): string {
  if (date < "2026-09-06") return "Before event";
  if (date === "2026-09-06") return "Event date";
  if (date <= "2026-10-06") return "Month after event";
  return "Later acquisition";
}

export function WorldviewReview({ manifest, polarization }: { manifest: SiteManifest; polarization: string }) {
  const frames = useMemo(() => manifestToScanFrames(manifest, polarization), [manifest, polarization]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"playback" | "compare">("playback");
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [showProvenance, setShowProvenance] = useState(false);
  const [view, setView] = useState<"optical" | "sar">("sar");

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
    setBeforeDate(frames[0]?.date ?? "");
    setAfterDate(frames[frames.length - 1]?.date ?? "");
  }, [frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % frames.length), 1200);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  const current = frames[index];
  const compareDatesAvailable = frames.some((frame) => frame.date === beforeDate)
    && frames.some((frame) => frame.date === afterDate)
    && beforeDate < afterDate;
  const compareManifest = useMemo((): SiteManifest => ({
    ...manifest,
    // This pair only points at the exact selected observation dates. ComparisonViewer
    // independently resolves both sides from kind="backscatter" layers.
    pairs: [{
      id: "time-machine-exact-selection",
      pre: beforeDate.replace(/-/g, ""),
      post: afterDate.replace(/-/g, ""),
      label: "Selected exact acquisitions",
      stats: {},
    }],
  }), [manifest, beforeDate, afterDate]);

  const selectCalendarDate = (value: string, side: "before" | "after") => {
    if (!frames.some((frame) => frame.date === value)) {
      setDateError(`No ${polarization} backscatter observation is installed on ${value || "that date"}. No substitute date is used.`);
      return;
    }
    setDateError(null);
    if (side === "before") setBeforeDate(value);
    else setAfterDate(value);
  };

  if (frames.length === 0) {
    return <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-5 text-sm text-amber-100">No backscatter raster frames are available for {polarization}. Difference and change-mask layers are not used as playback frames.</div>;
  }

  return (
    <section className="space-y-4" aria-label="Worldview-style observation review">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-[#111a24] p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">{manifest.site.title}</p>
          <h2 className="mt-1 text-lg font-semibold">{mode === "playback" ? current?.date : `${beforeDate} → ${afterDate}`}</h2>
          <p className="mt-1 text-xs text-slate-400">{polarization} polarization · {frames.length} exact backscatter acquisition{frames.length === 1 ? "" : "s"} · {mode === "playback" ? `${eventPhase(current?.date ?? "")} · ${index + 1} of ${frames.length}` : "before / after"}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`tm-button ${mode === "playback" ? "" : "tm-button--ghost"}`} aria-pressed={mode === "playback"} onClick={() => { setMode("playback"); setPlaying(false); }}>Animate stack</button>
          <button type="button" className={`tm-button ${mode === "compare" ? "" : "tm-button--ghost"}`} aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); setPlaying(false); }} disabled={frames.length < 2}>Before / after</button>
        </div>
      </div>

      {mode === "playback" && current ? (
        <>
          <div className="h-[28rem] overflow-hidden rounded-lg">
            <Map bbox={manifest.site.bbox} layers={[current.layer]} view={view} setView={setView} />
          </div>
          <div className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="tm-button tm-button--primary" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause playback" : "Play playback"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
              <span className="text-sm font-medium">Frame {index + 1} / {frames.length}</span>
              <span className="text-sm text-slate-300">{current.date} · {current.polarization} · {trackFrame(current.granule)}</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-300">Exact date
                <input aria-label="Select exact acquisition date" type="date" value={current.date} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => {
                  const found = frames.findIndex((frame) => frame.date === event.target.value);
                  if (found < 0) setDateError(`No observation is installed on ${event.target.value}. Choose an exact acquisition date.`);
                  else { setIndex(found); setDateError(null); setPlaying(false); }
                }} />
              </label>
            </div>
            <input className="mt-4 w-full accent-sky-400" type="range" min={0} max={frames.length - 1} step={1} value={index} onChange={(event) => { setIndex(Number(event.target.value)); setPlaying(false); }} aria-label="Observation timeline" />
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Exact acquisition date presets">
              {KRAKATAU_STACK_DATES.map((date) => {
                const frameIndex = frames.findIndex((frame) => frame.date === date);
                return <button type="button" key={date} className={`tm-chip ${frameIndex === index ? "tm-chip--active" : ""}`} disabled={frameIndex < 0} title={frameIndex < 0 ? "No exact observation for this date was returned" : `Select exact acquisition ${date}`} onClick={() => { setIndex(frameIndex); setPlaying(false); }}>{date}{frameIndex < 0 ? " · unavailable" : ""}</button>;
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">{current.layer.title ?? "Backscatter observation"}. Playback steps through installed observations only; there is no date interpolation.</p>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="tm-calendar__label">Before acquisition
                <input type="date" value={beforeDate} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => selectCalendarDate(event.target.value, "before")} aria-label="Before acquisition date" />
              </label>
              <label className="tm-calendar__label">After acquisition
                <input type="date" value={afterDate} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => selectCalendarDate(event.target.value, "after")} aria-label="After acquisition date" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Exact date presets">
              {KRAKATAU_STACK_DATES.map((date) => <button type="button" className="tm-chip" key={date} disabled={!frames.some((frame) => frame.date === date)} title={frames.some((frame) => frame.date === date) ? `Select exact date ${date}` : `No exact observation for ${date} is installed`} onClick={() => {
                if (!beforeDate || beforeDate === afterDate) setBeforeDate(date);
                else setAfterDate(date);
                setDateError(null);
              }}>{date}{frames.some((frame) => frame.date === date) ? "" : " · unavailable"}</button>)}
            </div>
            {dateError && <p className="mt-3 text-sm text-amber-200" role="alert">{dateError}</p>}
            {(!compareDatesAvailable || dateError) && <p className="mt-3 text-sm text-amber-200">Choose two exact installed dates in chronological order. No substitute date or layer is used.</p>}
          </div>
          {compareDatesAvailable && <ComparisonViewer manifest={compareManifest} pairId="time-machine-exact-selection" pol={polarization} />}
        </>
      )}

      {mode === "playback" && dateError && <p className="text-sm text-amber-200" role="alert">{dateError}</p>}

      <div className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
        <button type="button" className="text-sm font-medium text-sky-300 underline underline-offset-4" aria-expanded={showProvenance} onClick={() => setShowProvenance((value) => !value)}>Exact acquisitions and provenance</button>
        {showProvenance && <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-slate-400"><tr><th className="p-2">Acquisition date</th><th className="p-2">Polarization</th><th className="p-2">Product</th><th className="p-2">CRID</th><th className="p-2">Maturity</th><th className="p-2">Source</th><th className="p-2">Granule</th></tr></thead>
            <tbody>{frames.map((frame) => <tr key={`${frame.date}-${frame.layer.id}`} className="border-t border-slate-700"><td className="p-2">{frame.date}</td><td className="p-2">{frame.polarization}</td><td className="p-2">{frame.layer.kind}</td><td className="p-2">{frame.crid}</td><td className="p-2">{frame.maturity}</td><td className="p-2">{frame.source}</td><td className="p-2 font-mono">{frame.granule}</td></tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">{manifest.site.caveat} Product maturity remains {manifest.source.maturity}; this UI does not claim validation or scientific review.</p>
        </div>}
      </div>
    </section>
  );
}
