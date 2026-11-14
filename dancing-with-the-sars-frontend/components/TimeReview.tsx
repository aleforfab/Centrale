"use client";

import React, { useEffect, useMemo, useState } from "react";
import { buildComparison, clampReveal } from "@/lib/comparison";
import {
  SYNTHETIC_NOTICE,
  buildMockManifest,
  formatBbox,
  type ScanResult,
} from "@/lib/timeMachine";

type ReviewMode = "single" | "pair";

interface TimeReviewProps {
  scan: ScanResult | null;
  loading: boolean;
}

export function TimeReview({ scan, loading }: TimeReviewProps) {
  const [mode, setMode] = useState<ReviewMode>("single");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [eventLabel, setEventLabel] = useState<"before" | "after">("before");
  const [beforeDate, setBeforeDate] = useState<string>("");
  const [afterDate, setAfterDate] = useState<string>("");
  const [reveal, setReveal] = useState(50);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const dates = scan?.dates ?? [];
  const frames = useMemo(
    () => new Map((scan?.frames ?? []).map((frame) => [frame.date, frame])),
    [scan],
  );
  const safeIndex = Math.min(index, Math.max(0, dates.length - 1));
  const singleDate = dates[safeIndex] ?? "";
  const currentFrame = frames.get(singleDate);
  const beforeFrame = frames.get(beforeDate);
  const afterFrame = frames.get(afterDate);
  const hasBackscatter = Boolean(scan?.features.includes("backscatter"));
  const hasPlayback = Boolean(scan?.features.includes("playback"));
  const hasCompare = Boolean(scan?.features.includes("compare"));
  const hasProvenance = Boolean(scan?.features.includes("provenance"));
  const exactPairDates = dates.includes(beforeDate) && dates.includes(afterDate);
  const pairOrderValid = exactPairDates && Boolean(beforeDate && afterDate && beforeDate < afterDate);
  const clampedReveal = clampReveal(reveal);

  const mockManifest = useMemo(
    () => (scan && pairOrderValid ? buildMockManifest(scan, beforeDate, afterDate, scan.pol) : null),
    [scan, beforeDate, afterDate, pairOrderValid],
  );
  const comparison = useMemo(
    () => (mockManifest && scan ? buildComparison(mockManifest, "selected-pair", scan.pol) : null),
    [mockManifest, scan],
  );

  useEffect(() => {
    if (!scan) return;
    setIndex(0);
    setPlaying(false);
    setBeforeDate(scan.beforeDate ?? scan.dates[0]);
    setAfterDate(scan.afterDate ?? scan.dates[scan.dates.length - 1]);
    setMode(scan.dateMode === "pair" ? "pair" : "single");
    setReveal(50);
    setCalendarError(null);
  }, [scan]);

  useEffect(() => {
    if (scan && !hasCompare && mode === "pair") setMode("single");
    if (scan && !hasPlayback) setPlaying(false);
  }, [scan, hasCompare, hasPlayback, mode]);

  useEffect(() => {
    if (!scan || mode !== "single" || !playing || dates.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % dates.length),
      Math.max(250, 1600 / speed),
    );
    return () => window.clearInterval(timer);
  }, [scan, mode, playing, speed, dates.length]);

  const selectExactDate = (value: string) => {
    const exactIndex = dates.indexOf(value);
    if (exactIndex < 0) {
      setCalendarError(
        `No observation exists on ${value || "that date"}. Choose one of the exact dates; no substitute is used.`,
      );
      return;
    }
    setCalendarError(null);
    setIndex(exactIndex);
    setPlaying(false);
  };

  const stage = () => {
    if (loading) {
      return (
        <div className="tm-stage">
          <div className="tm-stage__empty">
            <div>
              <h2>Scanning selected region…</h2>
              <p className="tm-muted">Preparing ordered synthetic frames. No real granules are downloaded.</p>
              <div className="tm-progress" style={{ marginTop: 14 }}><i /></div>
            </div>
          </div>
        </div>
      );
    }
    if (!scan) {
      return (
        <div className="tm-stage">
          <div className="tm-stage__empty">
            <div>
              <h2>No scan yet</h2>
              <p className="tm-muted">Select a region and feature set, then press “Start scan”.</p>
            </div>
          </div>
        </div>
      );
    }
    if (!hasBackscatter) {
      return (
        <div className="tm-stage">
          <div className="tm-stage__empty">
            <div>
              <h2>Backscatter view is off</h2>
              <p className="tm-muted">Enable “Backscatter observations” in the feature choices to see frames.</p>
            </div>
          </div>
        </div>
      );
    }

    if (mode === "pair") {
      if (!hasCompare) {
        return (
          <div className="tm-stage">
            <div className="tm-stage__empty"><p className="tm-muted">Enable “Two-date compare” to use this mode.</p></div>
          </div>
        );
      }
      if (!pairOrderValid) {
        return (
          <div className="tm-stage">
            <div className="tm-stage__empty">
              <div className="tm-problem">
                Choose two exact installed dates in chronological order. No substitute date, polarization or
                difference layer is used.
              </div>
            </div>
          </div>
        );
      }
      if (!comparison?.ok || !beforeFrame || !afterFrame) {
        return (
          <div className="tm-stage">
            <div className="tm-stage__empty">
              <div className="tm-problem">
                {comparison && !comparison.ok
                  ? comparison.problem.message
                  : "The selected pair cannot be compared exactly. No substitute date, polarization or difference layer is used."}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="tm-stage">
          <img className="tm-compare__img" src={beforeFrame.url} alt={`Synthetic before frame for ${beforeDate}`} />
          <img
            className="tm-compare__img tm-compare__after"
            src={afterFrame.url}
            alt={`Synthetic after frame for ${afterDate}`}
            style={{ clipPath: `inset(0 0 0 ${clampedReveal}%)` }}
          />
          <div className="tm-stage__overlay" />
          <div className="tm-stage__date">
            <span>Before</span>
            <strong>{beforeDate}</strong>
          </div>
          <div className="tm-stage__badge">Exact dates · synthetic</div>
          <div className="tm-stage__date" style={{ left: "auto", right: 20, textAlign: "right" }}>
            <span>After</span>
            <strong>{afterDate}</strong>
          </div>
          <div className="tm-compare__divider" style={{ left: `${clampedReveal}%` }} aria-hidden="true" />
          <div className="tm-compare__handle" style={{ left: `${clampedReveal}%` }} aria-hidden="true">
            ↔
          </div>
          <div className="tm-stage__legend"><span>Weak</span><i /><span>Strong return</span></div>
        </div>
      );
    }

    return (
      <div className="tm-stage">
        <img
          key={singleDate}
          className="tm-stage__frame"
          src={currentFrame?.url ?? ""}
          alt={`Synthetic radar-like frame for ${singleDate}`}
        />
        <div className="tm-stage__overlay" />
        <div className="tm-stage__date">
          <span>{eventLabel === "before" ? "Before event" : "After event"}</span>
          <strong>{singleDate}</strong>
        </div>
        <div className="tm-stage__badge">Synthetic demo</div>
        <div className="tm-stage__legend"><span>Weak</span><i /><span>Strong return</span></div>
      </div>
    );
  };

  return (
    <div>
      {stage()}

      <section className="tm-controls" aria-label="Time review controls">
        <div className="tm-controls__row">
          <button
            type="button"
            className={`tm-button ${mode === "single" ? "" : "tm-button--ghost"}`}
            aria-pressed={mode === "single"}
            onClick={() => { setMode("single"); setPlaying(false); setCalendarError(null); }}
          >
            One event date
          </button>
          <button
            type="button"
            className={`tm-button ${mode === "pair" ? "" : "tm-button--ghost"}`}
            aria-pressed={mode === "pair"}
            onClick={() => { setMode("pair"); setPlaying(false); setCalendarError(null); }}
            disabled={!scan || !hasCompare}
          >
            Two dates to compare
          </button>
          <span className="tm-muted" style={{ marginLeft: "auto" }}>
            {scan ? `${scan.pol} · ${scan.dates.length} ordered dates · bbox ${formatBbox(scan.bbox)}` : "Awaiting scan"}
          </span>
        </div>

        {mode === "single" ? (
          <>
            <div className="tm-calendar__row">
              <label className="tm-calendar__label">
                Event date
                <input
                  type="date"
                  value={singleDate}
                  min={dates[0] ?? ""}
                  max={dates[dates.length - 1] ?? ""}
                  disabled={!scan || !hasBackscatter}
                  onChange={(event) => selectExactDate(event.target.value)}
                  aria-label="Event date"
                />
              </label>
              <p className="tm-muted" style={{ alignSelf: "end", margin: 0 }}>
                The calendar accepts exact installed dates only.
              </p>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span className="tm-muted">Choose one event date (before or after) with the slider</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, dates.length - 1)}
                step={1}
                value={safeIndex}
                disabled={!scan || !hasBackscatter}
                onChange={(event) => { setIndex(Number(event.target.value)); setPlaying(false); setCalendarError(null); }}
                aria-label="Observation date timeline"
              />
            </label>
            <div className="tm-ticks" aria-hidden="true">
              {dates.map((date) => <span key={date}>{date.slice(5).replace("-", "/")}</span>)}
            </div>
            <div className="tm-controls__row">
              <button
                type="button"
                className={`tm-button ${eventLabel === "before" ? "" : "tm-button--ghost"}`}
                aria-pressed={eventLabel === "before"}
                onClick={() => setEventLabel("before")}
              >
                Before event
              </button>
              <button
                type="button"
                className={`tm-button ${eventLabel === "after" ? "" : "tm-button--ghost"}`}
                aria-pressed={eventLabel === "after"}
                onClick={() => setEventLabel("after")}
              >
                After event
              </button>
              <button
                type="button"
                className="tm-button tm-button--primary"
                disabled={!scan || !hasBackscatter || !hasPlayback || dates.length < 2}
                onClick={() => setPlaying((current) => !current)}
                aria-label={playing ? "Pause playback" : "Play evolution"}
              >
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <label>
                Speed
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} disabled={!hasPlayback}>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </label>
              {!hasPlayback && <span className="tm-muted">Enable “Playback” in feature choices for play/pause.</span>}
            </div>
            {calendarError && <p className="tm-problem" role="alert">{calendarError}</p>}
          </>
        ) : (
          <>
            <div className="tm-calendar__row">
              <label className="tm-calendar__label">
                Before date
                <input
                  type="date"
                  value={beforeDate}
                  min={dates[0] ?? ""}
                  max={dates[dates.length - 1] ?? ""}
                  onChange={(event) => setBeforeDate(event.target.value)}
                  disabled={!scan}
                  aria-label="Before date"
                />
              </label>
              <label className="tm-calendar__label">
                After date
                <input
                  type="date"
                  value={afterDate}
                  min={dates[0] ?? ""}
                  max={dates[dates.length - 1] ?? ""}
                  onChange={(event) => setAfterDate(event.target.value)}
                  disabled={!scan}
                  aria-label="After date"
                />
              </label>
              <label style={{ flex: 1, minWidth: 220 }}>
                Reveal — {clampedReveal.toFixed(0)}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={clampedReveal}
                  onChange={(event) => setReveal(clampReveal(Number(event.target.value)))}
                  aria-label="Reveal before and after frames"
                />
              </label>
            </div>
            <div className="tm-chip-row" aria-label="Exact installed dates">
              {dates.map((date) => <span key={date} className="tm-chip">{date}</span>)}
            </div>
            <p className="tm-muted">
              Only the slider changes the split. Clicking or dragging on the imagery does nothing. Exactly two
              installed observation dates are used; the viewer refuses to substitute a neighbouring date, a
              different polarization, or a difference/change-mask layer.
            </p>
            {comparison && comparison.ok && (
              <p className="tm-muted">
                Resolved: {comparison.selection.before.date} → {comparison.selection.after.date} · {comparison.selection.pol}.
              </p>
            )}
          </>
        )}

        {hasProvenance && scan && (
          <p className="tm-muted" style={{ marginTop: 4 }}>
            {SYNTHETIC_NOTICE}
          </p>
        )}
      </section>
    </div>
  );
}
