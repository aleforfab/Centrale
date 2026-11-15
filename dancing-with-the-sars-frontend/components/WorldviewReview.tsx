"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { Map } from "@/components/Map";
import { framePhase, manifestToScanFrames, scanFrameDates } from "@/lib/scanFrames";
import type { SiteManifest } from "@/lib/types";

function trackFrame(granule: string): string {
  const match = granule.match(/_(\d{3})_(\d{3})_[AD]_/);
  return match ? `Track ${match[1]} · Frame ${match[2]}` : "Track/frame not encoded in granule name";
}

function entryNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function WorldviewReview({ manifest, polarization }: { manifest: SiteManifest; polarization: string }) {
  const frames = useMemo(() => manifestToScanFrames(manifest, polarization), [manifest, polarization]);
  // Referentially stable across playback ticks: Map mounts every frame's
  // raster source once and never re-adds sources while `index` advances.
  const playbackLayers = useMemo(() => frames.map((frame) => frame.layer), [frames]);
  // Date presets are derived from the loaded manifest's backscatter frames.
  const datePresets = useMemo(() => scanFrameDates(frames), [frames]);
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
    return <div className="colophon">No backscatter raster frames are available for {polarization}. Difference and change-mask layers are not used as playback frames.</div>;
  }

  return (
    <section className="space-y-5" aria-label="Worldview-style observation review">

      {/* Entry header */}
      <div className="plate">
        <div className="plate__header">
          <div>
            <span className="plate__tag">
              ENTRY {entryNumber(index)} — {mode === "playback" ? current?.date : `${beforeDate} → ${afterDate}`}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" className={`chapter-button ${mode === "playback" ? "" : "chapter-button--ghost"}`} aria-pressed={mode === "playback"} onClick={() => { setMode("playback"); setPlaying(false); }}>Animate stack</button>
            <button type="button" className={`chapter-button ${mode === "compare" ? "" : "chapter-button--ghost"}`} aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); setPlaying(false); }} disabled={frames.length < 2}>Before / after</button>
          </div>
        </div>
        <div className="plate__body">
          <p className="footnote">
            {polarization} · {frames.length} exact backscatter acquisition{frames.length === 1 ? "" : "s"} · {mode === "playback" ? `${framePhase(manifest, frames, current?.date ?? "")} · ${index + 1} of ${frames.length}` : "before / after"}
          </p>
        </div>
      </div>

      {mode === "playback" && current ? (
        <>
          {/* Map plate */}
          <section className="plate">
            <div className="plate__header">
              <span className="plate__tag">FIG. {entryNumber(index)} — {polarization} BACKSCATTER</span>
              <span className="plate__right-tag">{current.polarization} · {trackFrame(current.granule)}</span>
            </div>
            <div style={{ height: "28rem", overflow: "hidden" }}>
              <Map bbox={manifest.site.bbox} layers={playbackLayers} activeLayerId={current.layer.id} view={view} setView={setView} />
            </div>
            <div className="plate__caption">
              {current.layer.title ?? "Backscatter observation"}. Playback steps through installed observations only; there is no date interpolation.
            </div>
          </section>

          {/* Playback controls plate */}
          <section className="plate">
            <div className="plate__body">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="chapter-button chapter-button--primary" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause playback" : "Play playback"}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
                <span className="footnote">Frame {index + 1} / {frames.length} · {current.date}</span>
                <label className="field" style={{ marginLeft: "auto" }}>
                  <span>Exact date</span>
                  <input aria-label="Select exact acquisition date" type="date" value={current.date} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => {
                    const found = frames.findIndex((frame) => frame.date === event.target.value);
                    if (found < 0) setDateError(`No observation is installed on ${event.target.value}. Choose an exact acquisition date.`);
                    else { setIndex(found); setDateError(null); setPlaying(false); }
                  }} />
                </label>
              </div>
              <input className="mt-4 w-full" style={{ accentColor: "var(--accent)" }} type="range" min={0} max={frames.length - 1} step={1} value={index} onChange={(event) => { setIndex(Number(event.target.value)); setPlaying(false); }} aria-label="Observation timeline" />

              {/* Frame strip — mono date buttons */}
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Exact acquisition date presets">
                {datePresets.map((date) => {
                  const frameIndex = frames.findIndex((frame) => frame.date === date);
                  const isActive = frameIndex === index;
                  return <button type="button" key={date} className={`chapter-button${isActive ? "" : " chapter-button--ghost"}`} style={isActive ? { borderBottom: "2px solid var(--accent)" } : undefined} disabled={frameIndex < 0} title={`Select exact acquisition ${date}`} onClick={() => { if (frameIndex < 0) return; setIndex(frameIndex); setPlaying(false); }}>{date}{frameIndex < 0 ? " · unavailable" : ""}</button>;
                })}
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Compare controls plate */}
          <section className="plate">
            <div className="plate__body">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field">Before acquisition
                  <input type="date" value={beforeDate} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => selectCalendarDate(event.target.value, "before")} aria-label="Before acquisition date" />
                </label>
                <label className="field">After acquisition
                  <input type="date" value={afterDate} min={frames[0].date} max={frames[frames.length - 1].date} onChange={(event) => selectCalendarDate(event.target.value, "after")} aria-label="After acquisition date" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Exact date presets">
                {datePresets.map((date) => <button type="button" className={`chapter-button${date === beforeDate || date === afterDate ? "" : " chapter-button--ghost"}`} key={date} title={`Select exact date ${date}`} onClick={() => {
                  if (!beforeDate || beforeDate === afterDate) setBeforeDate(date);
                  else setAfterDate(date);
                  setDateError(null);
                }}>{date}</button>)}
              </div>
              {dateError && <p className="colophon mt-3" role="alert">{dateError}</p>}
              {(!compareDatesAvailable || dateError) && <p className="colophon mt-3">Choose two exact installed dates in chronological order. No substitute date or layer is used.</p>}
            </div>
          </section>
          {compareDatesAvailable && <ComparisonViewer manifest={compareManifest} pairId="time-machine-exact-selection" pol={polarization} />}
        </>
      )}

      {mode === "playback" && dateError && <p className="colophon" role="alert">{dateError}</p>}

      {/* Provenance disclosure — .rule-table */}
      <section className="plate">
        <div className="plate__body">
          <button type="button" className="footnote" style={{ color: "var(--accent)", cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline", textUnderlineOffset: "4px" }} aria-expanded={showProvenance} onClick={() => setShowProvenance((value) => !value)}>Exact acquisitions and provenance</button>
          {showProvenance && <div className="mt-3 overflow-x-auto">
            <table className="rule-table">
              <thead><tr><th>Acquisition date</th><th>Polarization</th><th>Product</th><th>CRID</th><th>Maturity</th><th>Source</th><th>Granule</th></tr></thead>
              <tbody>{frames.map((frame) => <tr key={`${frame.date}-${frame.layer.id}`}><td>{frame.date}</td><td>{frame.polarization}</td><td>{frame.layer.kind}</td><td>{frame.crid}</td><td>{frame.maturity}</td><td>{frame.source}</td><td style={{ fontFamily: "var(--font-mono)" }}>{frame.granule}</td></tr>)}</tbody>
            </table>
            <p className="footnote mt-3">Product maturity remains {manifest.source.maturity}; this UI does not claim validation or scientific review.</p>
          </div>}
        </div>
      </section>
    </section>
  );
}
