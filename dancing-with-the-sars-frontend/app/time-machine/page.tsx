"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
import { type Bbox } from "@/components/RegionSelector";
import { TimeReview } from "@/components/TimeReview";
import { CalendarReview } from "@/components/CalendarReview";
import { DEFAULT_BBOX, SCAN_DATES, SYNTHETIC_NOTICE, isValidBbox, type ScanResult } from "@/lib/timeMachine";
import { fetchManifest } from "@/lib/liveFetch";
import { api } from "@/lib/api";
import type { SiteManifest, SiteSummary } from "@/lib/types";

export default function TimeMachinePage() {
  const [bbox, setBbox] = useState<Bbox | null>(DEFAULT_BBOX);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [demoScan, setDemoScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingManifest, setLoadingManifest] = useState(false);

  // Show what is already installed. A live fetch is optional on this page, so the
  // field log must never read as empty while the catalogue holds a built site.
  useEffect(() => {
    let active = true;
    api
      .sites()
      .then((list) => {
        if (!active) return;
        setSites(list);
        setSiteId((current) => current || list.find((site) => site.id === "anak-krakatau")?.id || list[0]?.id || "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The installed product catalogue could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingSites(false);
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
    setManifest(null);
    setDemoScan(null);
    setLoadingManifest(true);
    setError("");
    api
      .site(siteId)
      .then((loaded) => {
        if (!active) return;
        setDemoScan(null);
        setManifest(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The installed site manifest could not be loaded.");
      })
      .finally(() => { if (active) setLoadingManifest(false); });
    return () => {
      active = false;
    };
  }, [siteId]);

  const startDemo = async () => {
    setError("");
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
      setManifest(null);
      setDemoScan(result as ScanResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The procedural demo could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell current="/time-machine" eyebrow="Exact acquisition dates" title="Timeline & before / after" subtitle="Measured backscatter change, exact dates. Choose an installed observation or compare a pair.">
      <div className="space-y-5">
        {sites.length > 1 && <label className="tm-calendar__label">Installed site<select value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}</select></label>}
        {error && <p role="alert" className="colophon">{error}</p>}
        {manifest ? <>
          <h2 className="text-xl font-bold">{manifest.site.title}</h2>
          <BuiltProductsBanner manifest={manifest} />
          <CalendarReview key={manifest.site.id} manifest={manifest} />
        </> : demoScan ? <>
          <div className="colophon"><strong>Demo visualization — not NISAR observations, not a real change, not evidence of anything.</strong><br />{demoScan.caveat}</div>
          <button className="tm-button" type="button" onClick={async () => { if (siteId) { try { setManifest(await api.site(siteId)); setDemoScan(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the installed site."); } } }}>Return to installed observations</button>
          <TimeReview scan={demoScan} loading={false} />
        </> : <section className="plate"><div className="plate__body" style={{ minHeight: "20rem", display: "grid", placeItems: "center", textAlign: "center" }}>
          <div><h2>{loadingSites || loadingManifest ? "Loading installed acquisitions." : error ? "The installed site could not be loaded." : "No built site is installed."}</h2><p className="footnote mt-3">Built sites appear here automatically. Live fetch is optional; frames are never fabricated or interpolated.</p></div>
        </div></section>}
        <details className="plate"><summary className="cursor-pointer p-4">Optional live fetch and procedural demo</summary><div className="plate__body space-y-4">
          <LiveScanPanel idPrefix="time-machine-scan" compact onBboxChange={setBbox} onBuilt={async (id) => { const list = await api.sites(); setSites(list); setSiteId(id); const built = await fetchManifest(id); setDemoScan(null); setManifest(built); }} />
          <details><summary className="cursor-pointer">Optional demo visualization (procedural, not observations)</summary><p className="footnote my-3">{SYNTHETIC_NOTICE}</p><button className="chapter-button" type="button" onClick={startDemo} disabled={busy || !bbox}>Run labeled demo fallback</button></details>
        </div></details>
      </div>
    </AppShell>
  );
}
