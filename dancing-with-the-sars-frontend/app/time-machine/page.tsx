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

  // Show what is already installed. A live fetch is optional here; the page must
  // never appear empty while the catalog holds a built site with real observations.
  useEffect(() => {
    let active = true;
    api
      .sites()
      .then((list) => {
        if (!active) return;
        setSites(list);
        setSiteId((current) => current || list[0]?.id || "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The installed product catalog could not be loaded.");
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
    api
      .site(siteId)
      .then((loaded) => {
        if (!active) return;
        setDemoScan(null);
        setManifest(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The installed site manifest could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [siteId]);

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
    <AppShell current="/time-machine" eyebrow="Live acquisition time explorer" title="SAR Time Machine" subtitle="Request a real ASF/NASA Earthdata fetch, then animate only exact backscatter observations built by the processing pipeline.">
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <LiveScanPanel idPrefix="time-machine-scan" onBboxChange={setBbox} onBuilt={async (id) => { const list = await api.sites(); setSites(list); setSiteId(id); const built = await fetchManifest(id); setDemoScan(null); setManifest(built); }} />
          {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
          <details className="rounded-lg border border-amber-800/70 bg-amber-950/25 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-100">Optional demo visualization (procedural, not observations)</summary>
            <p className="mt-2 text-xs leading-5 text-amber-100/80">{SYNTHETIC_NOTICE}</p>
            <button className="tm-button tm-button--ghost mt-3" type="button" onClick={startDemo} disabled={busy || !bbox}>Run labeled demo fallback</button>
          </details>
        </div>

        <div className="min-w-0 space-y-4">
          {manifest ? <>
            {sites.length > 1 && <label className="tm-calendar__label">Installed site<select value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}</select></label>}
            <BuiltProductsBanner manifest={manifest} />
            <CalendarReview key={manifest.site.id} manifest={manifest} />
          </> : demoScan ? <>
            <div className="rounded-lg border border-amber-700/60 bg-amber-950/35 p-4 text-sm text-amber-100"><strong>Demo visualization — not NISAR observations, not a real change, not evidence of anything.</strong><br />{demoScan.caveat}</div>
            <TimeReview scan={demoScan} loading={false} />
          </> : <section className="grid min-h-[28rem] place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center">
            <div><p className="text-xs uppercase tracking-[0.2em] text-sky-300">Worldview-inspired timeline</p><h2 className="mt-2 text-xl font-semibold">{loadingSites ? "Loading installed observations…" : "No built site is installed"}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">{loadingSites ? "Reading the product catalog. Nothing is fetched from ASF for this step." : "Built sites appear here automatically once the processing pipeline has written a manifest. A live fetch is optional and only adds new observations; frames are never fabricated or interpolated."}</p></div>
          </section>}
        </div>
      </div>
      <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs leading-5 text-slate-400">
        <strong className="text-slate-200">Acquisition cadence:</strong> dates depend on the installed observations. This frontend does not fill gaps, interpolate frames, or substitute dates/polarizations. Actual availability depends on the returned manifest and backend Earthdata access. See <code>docs/LIVE_FETCH.md</code> for backend setup and limitations.
      </section>
    </AppShell>
  );
}
