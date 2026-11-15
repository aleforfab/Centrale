"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
import { type Bbox } from "@/components/RegionSelector";
import { TimeReview } from "@/components/TimeReview";
import { CalendarReview } from "@/components/CalendarReview";
import { DEFAULT_BBOX, SCAN_DATES, SYNTHETIC_NOTICE, isValidBbox, type ScanResult } from "@/lib/timeMachine";
import { fetchManifest } from "@/lib/liveFetch";
import type { SiteManifest } from "@/lib/types";

export default function TimeMachinePage() {
  const [bbox, setBbox] = useState<Bbox | null>(DEFAULT_BBOX);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [demoScan, setDemoScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const startDemo = async () => {
    setError("");
    setManifest(null);
    setDemoScan(null);
    if (!isValidBbox(bbox)) {
      setError("Choose a valid map region before starting the demo.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/tm/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bbox,
          features: ["backscatter", "playback", "compare", "provenance"],
          dateMode: "pair",
          pol: "HH",
          beforeDate: SCAN_DATES[0],
          afterDate: SCAN_DATES[SCAN_DATES.length - 1],
        }),
      });
      const result = await response.json() as ScanResult | { detail?: string };
      if (!response.ok) throw new Error("detail" in result ? result.detail || `Demo failed (HTTP ${response.status}).` : `Demo failed (HTTP ${response.status}).`);
      setDemoScan(result as ScanResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The procedural demo could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell current="/time-machine" eyebrow="Field Log — exact acquisition dates" title="Time Machine" subtitle="The emotional core of the catalogue. Numbered entries, exact acquisitions, measured claims.">
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">

        {/* Left rail: chapters */}
        <div className="space-y-5">

          {/* Chapter 01 — REGION */}
          <section className="plate">
            <div className="plate__header">
              <span className="plate__tag">01 — Region</span>
              <span className="plate__right-tag">bbox · WGS 84</span>
            </div>
            <div className="plate__body">
              <LiveScanPanel idPrefix="time-machine-scan" compact onBboxChange={setBbox} onBuilt={async (siteId) => { const built = await fetchManifest(siteId); setDemoScan(null); setManifest(built); }} />
            </div>
          </section>

          {/* Chapter 02 — WINDOW & FETCH */}
          <section className="plate">
            <div className="plate__header">
              <span className="plate__tag">02 — Window & Fetch</span>
              <span className="plate__right-tag">ASF · Earthdata</span>
            </div>
            <div className="plate__body">
              {error && <p role="alert" className="colophon" style={{ marginTop: 0 }}>{error}</p>}
              <details className="plate" style={{ border: "1px solid var(--hairline)" }}>
                <summary className="cursor-pointer" style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--ink-mute)" }}>Optional demo visualization (procedural, not observations)</summary>
                <div className="plate__body">
                  <p className="footnote" style={{ marginBottom: "12px" }}>{SYNTHETIC_NOTICE}</p>
                  <button className="chapter-button" type="button" onClick={startDemo} disabled={busy || !bbox}>Run labeled demo fallback</button>
                </div>
              </details>
            </div>
          </section>

          {/* PROVISIONAL colophon */}
          <div className="colophon">
            <strong>PROVISIONAL products.</strong> The data are NISAR L-band GCOV provisional acquisitions. They are not validated, not reviewed, and not a scientific result. Missing dates stay missing; no substitute date, polarization, or interpolation is used.
          </div>
        </div>

        {/* Right column: viewer */}
        <div className="min-w-0 space-y-5">
          {manifest ? <>
            <BuiltProductsBanner manifest={manifest} />
            <CalendarReview key={manifest.site.id} manifest={manifest} />
          </> : demoScan ? <>
            <div className="colophon">
              <strong>Demo visualization — not NISAR observations, not a real change, not evidence of anything.</strong><br />{demoScan.caveat}
            </div>
            <TimeReview scan={demoScan} loading={false} />
          </> : (
            <section className="plate">
              <div className="plate__body" style={{ minHeight: "28rem", display: "grid", placeItems: "center", textAlign: "center" }}>
                <div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase" as const, color: "var(--ink-mute)" }}>No live frames loaded</p>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 800, marginTop: "8px", color: "var(--ink)" }}>The field log awaits a scan.</h2>
                  <p className="footnote" style={{ marginTop: "12px", maxWidth: "480px" }}>Start a live fetch from the left rail to load exact raster acquisitions. If Earthdata credentials are not configured, the operator guidance will appear here.</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Acquisition cadence footnote */}
      <div className="footnote" style={{ marginTop: "28px" }}>
        <strong style={{ color: "var(--ink)" }}>Acquisition cadence:</strong> five exact ascending-frame-010 dates — 2026-08-13, 2026-08-25, 2026-09-06, 2026-09-18, 2026-09-30 — bracketing the early-September Anak Krakatau activity. This frontend does not fill gaps, interpolate frames, or substitute dates or polarizations. Missing dates stay missing. Actual availability depends on the returned manifest and backend Earthdata access. See <code>docs/LIVE_FETCH.md</code> for backend setup and limitations.
      </div>
    </AppShell>
  );
}
