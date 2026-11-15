"use client";

import React, { useEffect, useRef, useState } from "react";
import { RegionSelector, type Bbox } from "@/components/RegionSelector";
import { DEFAULT_BBOX, formatBbox, isValidBbox } from "@/lib/timeMachine";
import { normalizeDate, observationDates, observationPolarizations } from "@/lib/comparison";
import { cancelFetchJob, checkLiveFetchAvailable, getFetchJob, liveFetchErrorMessage, LiveFetchError, startLiveFetch, wait, type FetchJob } from "@/lib/liveFetch";
import type { DataStatus } from "@/lib/types";

type ScanState = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "credential-error" | "size-limit";
const labels: Record<ScanState, string> = { idle: "Ready · live ASF scan", queued: "Queued", running: "Fetching and building products", succeeded: "Products built · inspect exact acquisitions", failed: "Fetch failed", cancelled: "Fetch cancelled", "credential-error": "Earthdata credentials required", "size-limit": "Configured size limit reached" };

export function LiveScanPanel({ idPrefix, defaultBbox = DEFAULT_BBOX, onBuilt, compact = false, onBboxChange }: {
  idPrefix: string; defaultBbox?: Bbox; onBuilt: (siteId: string) => void | Promise<void>; compact?: boolean; onBboxChange?: (bbox: Bbox | null) => void;
}) {
  const [bbox, setBbox] = useState<Bbox | null>(defaultBbox);
  const [start, setStart] = useState("2026-08-13");
  const [end, setEnd] = useState("2026-10-01");
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [state, setState] = useState<ScanState>("idle");
  const [job, setJob] = useState<FetchJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    fetch("/api/data-status", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Backend status returned HTTP ${response.status}.`);
      return response.json() as Promise<DataStatus>;
    }).then((value) => { if (active) setStatus(value); }).catch((reason: unknown) => { if (active) setAvailabilityError(reason instanceof Error ? reason.message : "Backend status is unavailable."); });
    return () => { active = false; generation.current++; };
  }, []);
  const dateError = !normalizeDate(start) || !normalizeDate(end) ? "Start and end dates are required and must be valid." : start > end ? "Start date must be on or before end date." : "";
  const fail = (reason: unknown) => {
    setError(liveFetchErrorMessage(reason));
    setState(reason instanceof LiveFetchError && reason.kind === "credentials" ? "credential-error" : reason instanceof LiveFetchError && reason.kind === "size-limit" ? "size-limit" : "failed");
    setBusy(false);
  };
  const begin = async () => {
    if (busy || dateError || !isValidBbox(bbox)) return;
    const token = ++generation.current;
    setError(""); setJob(null); setBusy(true); setState("queued");
    try {
      if (!await checkLiveFetchAvailable()) throw new LiveFetchError("Live fetch is disabled by backend configuration.", "disabled");
      const result = await startLiveFetch({ bbox, start_date: start, end_date: end, maturity: "PROVISIONAL", polarizations: ["HH", "HV"], max_granules: 6, refresh: false });
      if (token !== generation.current) return;
      if ("job_id" in result && result.job_id) {
        let latest = result;
        let delay = 1000;
        while (true) {
          if (token !== generation.current) return;
          setJob(latest);
          if (latest.status === "cancelled") { setState("cancelled"); setBusy(false); return; }
          if (latest.status === "failed") {
            const message = latest.error || latest.message || "The live-fetch job failed.";
            throw new LiveFetchError(message, /credential|earthdata|token|authentication|unauthorized/i.test(message) ? "credentials" : /size|limit|too large|bytes/i.test(message) ? "size-limit" : "http");
          }
          if (latest.status === "succeeded") { await onBuilt(latest.result?.site_id || latest.site_id); break; }
          setState(latest.status);
          await wait(delay);
          if (token !== generation.current) return;
          latest = await getFetchJob(latest.job_id);
          delay = Math.min(5000, Math.round(delay * 1.5));
        }
      } else { await onBuilt(result.site_id); }
      if (token === generation.current) { setState("succeeded"); setBusy(false); }
    } catch (reason) { if (token === generation.current) fail(reason); }
  };
  const cancel = async () => {
    if (!job?.job_id) return;
    try {
      const updated = await cancelFetchJob(job.job_id);
      if (updated.status === "cancelled") { generation.current++; setJob(updated); setState("cancelled"); setBusy(false); }
      else setError(updated.message || "Cancellation requested; the active download may finish its current stage first.");
    } catch (reason) { setError(liveFetchErrorMessage(reason)); }
  };
  const percent = typeof job?.progress === "number" ? Math.max(0, Math.min(100, job.progress)) : null;
  return <div className={compact ? "space-y-3" : "space-y-4"}>
    <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
      <h2 className="text-base font-semibold">Select a region</h2>
      <p className="mt-1 text-sm text-slate-400">Draw or enter a bounding box. The default surrounds Anak Krakatau.</p>
      <div className="mt-3"><RegionSelector initialBbox={defaultBbox} onChange={(value) => { setBbox(value); onBboxChange?.(value); }} /></div>
      <p className="mt-2 text-xs text-slate-400">Selected bbox: <code>{bbox ? formatBbox(bbox) : "not selected"}</code></p>
    </section>
    <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4">
      <h2 className="text-base font-semibold">Live scan window</h2>
      <div className="tm-calendar__row mt-3">
        <label className="tm-calendar__label" htmlFor={`${idPrefix}-start`}>Start date<input id={`${idPrefix}-start`} type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="tm-calendar__label" htmlFor={`${idPrefix}-end`}>End date<input id={`${idPrefix}-end`} type="date" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {dateError && <p className="mt-2 text-xs text-amber-200" role="alert">{dateError}</p>}
      <p className="mt-3 text-xs leading-5 text-slate-400">Selected window: {start || "missing"} to {end || "missing"} · HH + HV · PROVISIONAL · ASF / NASA Earthdata. The backend size limit may cap the request; a smaller region or window may be needed.</p>
      <p className="mt-2 text-xs leading-5 text-amber-100">Live fetch downloads from ASF/Earthdata on the operator side and may require multiple GB of data and substantial processing time. Size is an estimate; actual download depends on the returned granules. Nothing runs until you request it.</p>
      <button className="tm-button tm-button--primary mt-4" type="button" onClick={begin} disabled={busy || !!dateError || !isValidBbox(bbox) || status?.live_fetch_enabled === false}>{busy && !job ? "Checking and submitting…" : "Fetch real observations"}</button>
      {availabilityError && <p className="mt-2 text-xs text-amber-200">Backend status: {availabilityError}</p>}
      {status?.live_fetch_enabled === false && <p className="mt-2 text-xs text-amber-200">Live fetch is disabled on this backend. No request was submitted.</p>}
    </section>
    <section className="rounded-lg border border-slate-700 bg-[#111a24] p-4" aria-live="polite">
      <h2 className="text-base font-semibold">Scan status · {labels[state]}</h2>
      {(state === "queued" || state === "running") && <div className="mt-3 space-y-2"><p className="text-sm text-slate-300">{job?.message || "Submitting the scan request…"}{job?.stage ? ` · ${job.stage}` : ""}</p>{percent !== null && <div><div className="mb-1 flex justify-between text-xs text-slate-400"><span>Backend-reported progress</span><span>{percent}%</span></div><progress className="w-full" max={100} value={percent}>{percent}%</progress></div>}<button className="tm-button tm-button--ghost" type="button" onClick={cancel} disabled={!job?.job_id}>Cancel fetch</button></div>}
      {state === "cancelled" && <p className="mt-2 text-sm text-slate-300">The job was cancelled.</p>}
      {error && <p className="mt-3 text-sm text-amber-200" role="alert">{error}</p>}
      {state === "credential-error" && <p className="mt-2 text-xs text-slate-400">Credential guidance is in <code>docs/LIVE_FETCH.md</code>. This UI does not collect or expose credentials.</p>}
      {state === "size-limit" && <p className="mt-2 text-xs text-slate-400">Reduce the selected region or window, or ask the backend operator to review configured limits. No result is presented as complete.</p>}
    </section>
  </div>;
}

export function BuiltProductsBanner({ manifest }: { manifest: import("@/lib/types").SiteManifest }) {
  const pols = observationPolarizations(manifest);
  return <div className="mb-4 rounded-lg border border-amber-700/60 bg-amber-950/25 p-3 text-sm text-amber-100" role="status"><strong>PROVISIONAL products.</strong> Exact backscatter dates present: {pols.map((pol) => `${pol}: ${observationDates(manifest, pol).join(", ") || "none"}`).join(" · ") || "none"}. {manifest.site.caveat} Missing dates stay missing; difference and change-mask products are excluded from playback and comparison.</div>;
}
