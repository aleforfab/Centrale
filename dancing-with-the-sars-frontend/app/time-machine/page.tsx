"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RegionSelector, type Bbox } from "@/components/RegionSelector";
import { TimeReview } from "@/components/TimeReview";
import { WorldviewReview } from "@/components/WorldviewReview";
import { DEFAULT_BBOX, SCAN_DATES, SYNTHETIC_NOTICE, formatBbox, isValidBbox, type ScanResult } from "@/lib/timeMachine";
import {
  cancelFetchJob,
  checkLiveFetchAvailable,
  fetchManifest,
  getFetchJob,
  liveFetchErrorMessage,
  LiveFetchError,
  startLiveFetch,
  wait,
  type FetchJob,
} from "@/lib/liveFetch";
import type { DataStatus, SiteManifest } from "@/lib/types";

type ScanState = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "credential-error" | "size-limit" | "demo";

const LIVE_REQUEST = {
  start_date: "2026-08-13",
  end_date: "2026-10-01",
  maturity: "PROVISIONAL" as const,
  polarizations: ["HH", "HV"],
  max_granules: 6,
  refresh: false,
};

function stateText(state: ScanState): string {
  return ({
    idle: "Ready · live ASF scan",
    queued: "Queued",
    running: "Fetching and building products",
    succeeded: "Products built · inspect exact acquisitions",
    failed: "Fetch failed",
    cancelled: "Fetch cancelled",
    "credential-error": "Earthdata credentials required",
    "size-limit": "Configured size limit reached",
    demo: "Procedural demo · not observations",
  })[state];
}

export default function TimeMachinePage() {
  const [bbox, setBbox] = useState<Bbox | null>(DEFAULT_BBOX);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [job, setJob] = useState<FetchJob | null>(null);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [demoScan, setDemoScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pollToken, setPollToken] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/data-status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Backend status returned HTTP ${response.status}.`);
        return response.json() as Promise<DataStatus>;
      })
      .then((value) => { if (active) setStatus(value); })
      .catch((reason: unknown) => { if (active) setAvailabilityError(reason instanceof Error ? reason.message : "Backend status is unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!job?.job_id || !["queued", "running"].includes(job.status)) return;
    let active = true;
    let delay = 1000;
    const poll = async () => {
      while (active) {
        await wait(delay);
        if (!active) return;
        try {
          const latest = await getFetchJob(job.job_id);
          if (!active) return;
          setJob(latest);
          if (latest.status === "queued" || latest.status === "running") {
            delay = Math.min(5000, Math.round(delay * 1.5));
            continue;
          }
          if (latest.status === "cancelled") {
            setScanState("cancelled");
            setBusy(false);
            return;
          }
          if (latest.status === "failed") {
            const message = latest.error || latest.message || "The live-fetch job failed.";
            setError(message);
            setScanState(/size|limit|too large|bytes/i.test(message) ? "size-limit" : "failed");
            setBusy(false);
            return;
          }
          const siteId = latest.result?.site_id || latest.site_id;
          const builtManifest = await fetchManifest(siteId);
          if (!active) return;
          setManifest(builtManifest);
          setScanState("succeeded");
          setBusy(false);
          return;
        } catch (reason) {
          if (!active) return;
          setError(liveFetchErrorMessage(reason));
          setScanState("failed");
          setBusy(false);
          return;
        }
      }
    };
    void poll();
    return () => { active = false; };
    // pollToken deliberately restarts the effect after cancellation/submit state changes.
  }, [job?.job_id, job?.status, pollToken]);

  const beginLiveScan = async () => {
    setError("");
    setManifest(null);
    setDemoScan(null);
    if (!isValidBbox(bbox)) {
      setError("Choose a valid map region before starting the live scan.");
      return;
    }
    setBusy(true);
    setScanState("queued");
    setJob(null);
    try {
      if (!await checkLiveFetchAvailable()) {
        throw new LiveFetchError("Live fetch is disabled by backend configuration.", "disabled");
      }
      const result = await startLiveFetch({ bbox, ...LIVE_REQUEST });
      if ("job_id" in result && result.job_id) {
        setJob(result);
        setScanState(result.status === "running" ? "running" : "queued");
        setPollToken((value) => value + 1);
        return;
      }
      const siteId = result.site_id;
      setManifest(await fetchManifest(siteId));
      setScanState("succeeded");
      setBusy(false);
    } catch (reason) {
      setError(liveFetchErrorMessage(reason));
      if (reason instanceof LiveFetchError && reason.kind === "credentials") setScanState("credential-error");
      else if (reason instanceof LiveFetchError && reason.kind === "size-limit") setScanState("size-limit");
      else setScanState("failed");
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job?.job_id) return;
    setError("");
    try {
      const updated = await cancelFetchJob(job.job_id);
      setJob(updated);
      if (updated.status === "cancelled") {
        setScanState("cancelled");
        setBusy(false);
      } else {
        setError(updated.message || "Cancellation requested; the active download may finish its current stage first.");
      }
      setPollToken((value) => value + 1);
    } catch (reason) {
      setError(liveFetchErrorMessage(reason));
    }
  };

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
      setScanState("demo");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The procedural demo could not be loaded.");
      setScanState("failed");
    } finally {
      setBusy(false);
    }
  };

  const percent = typeof job?.progress === "number" ? Math.max(0, Math.min(100, job.progress)) : null;
  const statusLabel = status
    ? `${status.primary_mission} · ${status.sites_count} installed site${status.sites_count === 1 ? "" : "s"} · live fetch ${status.live_fetch_enabled ? "enabled" : "disabled"}`
    : "Checking backend availability…";

  return (
    <AppShell current="/time-machine" eyebrow="Live acquisition time explorer" title="SAR Time Machine" subtitle="Request a real ASF/NASA Earthdata fetch, then animate only exact backscatter observations built by the processing pipeline." status={<span>{statusLabel}</span>}>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
            <h2 className="text-base font-semibold">1 · Select a region</h2>
            <p className="mt-1 text-sm text-slate-400">The default box surrounds Anak Krakatau. Draw or enter another bounding box if needed.</p>
            <div className="mt-3"><RegionSelector initialBbox={DEFAULT_BBOX} onChange={setBbox} /></div>
            <p className="mt-2 text-xs text-slate-400">Selected bbox: <code>{bbox ? formatBbox(bbox) : "not selected"}</code></p>
          </section>

          <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
            <h2 className="text-base font-semibold">2 · Live scan options</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-slate-400">Exact window</dt><dd>2026-08-13 to 2026-09-30</dd><dt className="text-slate-400">Polarizations</dt><dd>HH + HV</dd><dt className="text-slate-400">Maturity</dt><dd>PROVISIONAL</dd><dt className="text-slate-400">Source</dt><dd>ASF / NASA Earthdata</dd></dl>
            <p className="mt-3 text-xs leading-5 text-slate-400">The request covers the specified five acquisition dates. The viewer includes only exact backscatter layers returned in the built manifest; missing dates remain missing.</p>
            <button className="tm-button tm-button--primary mt-4 w-full" type="button" onClick={beginLiveScan} disabled={busy || !bbox || status?.live_fetch_enabled === false}>{busy && !job ? "Checking and submitting…" : "Fetch real observations"}</button>
            {availabilityError && <p className="mt-2 text-xs text-amber-200">Backend status: {availabilityError}</p>}
            {status?.live_fetch_enabled === false && <p className="mt-2 text-xs text-amber-200">Live fetch is disabled on this backend. No request was submitted.</p>}
          </section>

          <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4" aria-live="polite">
            <h2 className="text-base font-semibold">Scan status · {stateText(scanState)}</h2>
            {(scanState === "queued" || scanState === "running") && <div className="mt-3 space-y-2">
              <p className="text-sm text-slate-300">{job?.message || "Submitting the scan request…"}{job?.stage ? ` · ${job.stage}` : ""}</p>
              {percent !== null && <div><div className="mb-1 flex justify-between text-xs text-slate-400"><span>Backend-reported progress</span><span>{percent}%</span></div><progress className="w-full" max={100} value={percent}>{percent}%</progress></div>}
              <button className="tm-button tm-button--ghost" type="button" onClick={cancel} disabled={!job?.job_id}>Cancel fetch</button>
            </div>}
            {job?.status === "failed" && job.error && <p className="mt-2 text-sm text-red-200">{job.error}</p>}
            {job?.status === "cancelled" && <p className="mt-2 text-sm text-slate-300">No additional frames were generated after cancellation.</p>}
            {error && <p className="mt-3 text-sm text-amber-200" role="alert">{error}</p>}
            {scanState === "credential-error" && <p className="mt-2 text-xs text-slate-400">Credential guidance is in <code>docs/LIVE_FETCH.md</code>. This UI does not collect or expose credentials.</p>}
            {scanState === "size-limit" && <p className="mt-2 text-xs text-slate-400">Reduce the selected region or ask the backend operator to review configured limits. No result is presented as complete.</p>}
          </section>

          <details className="rounded-lg border border-amber-800/70 bg-amber-950/25 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-100">Optional demo visualization (procedural, not observations)</summary>
            <p className="mt-2 text-xs leading-5 text-amber-100/80">{SYNTHETIC_NOTICE}</p>
            <button className="tm-button tm-button--ghost mt-3" type="button" onClick={startDemo} disabled={busy || !bbox}>Run labeled demo fallback</button>
          </details>
        </div>

        <div className="min-w-0 space-y-4">
          {manifest ? <>
            <div className="rounded-lg border border-amber-700/60 bg-amber-950/25 p-3 text-sm text-amber-100"><strong>PROVISIONAL NISAR products.</strong> These are processed backscatter rasters, not independently validated scientific results. Difference and change-mask products are excluded from playback.</div>
            <WorldviewReview manifest={manifest} polarization={manifest.layers.find((layer) => layer.kind === "backscatter")?.pol?.toUpperCase() ?? "HH"} />
          </> : demoScan ? <>
            <div className="rounded-lg border border-amber-700/60 bg-amber-950/35 p-4 text-sm text-amber-100"><strong>Demo visualization — not NISAR observations, not a real change, not evidence of anything.</strong><br />{demoScan.caveat}</div>
            <TimeReview scan={demoScan} loading={false} />
          </> : <section className="grid min-h-[28rem] place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center">
            <div><p className="text-xs uppercase tracking-[0.2em] text-sky-300">Worldview-inspired timeline</p><h2 className="mt-2 text-xl font-semibold">No live frames loaded</h2><p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">Start a live fetch to animate exact raster acquisitions. If Earthdata credentials are not configured, the blocked state and operator guidance will be shown here.</p></div>
          </section>}
        </div>
      </div>
      <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs leading-5 text-slate-400">
        <strong className="text-slate-200">Acquisition cadence:</strong> the requested Anak Krakatau stack presets are Aug 13, Aug 25, Sep 6, Sep 18, and Sep 30, 2026. This frontend does not fill gaps, interpolate frames, or substitute dates/polarizations. Actual availability depends on the returned manifest and backend Earthdata access. See <code>docs/LIVE_FETCH.md</code> for backend setup and limitations.
      </section>
    </AppShell>
  );
}
