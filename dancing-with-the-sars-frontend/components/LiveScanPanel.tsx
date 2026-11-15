"use client";

import React, { useEffect, useRef, useState } from "react";
import { RegionSelector, type Bbox } from "@/components/RegionSelector";
import { DEFAULT_BBOX, formatBbox, isValidBbox } from "@/lib/region";
import { normalizeDate, observationDates, observationPolarizations } from "@/lib/comparison";
import { cancelFetchJob, checkLiveFetchAvailable, getFetchJob, liveFetchErrorMessage, LiveFetchError, startLiveFetch, wait, type FetchJob } from "@/lib/liveFetch";
import type { DataStatus } from "@/lib/types";

type ScanState = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "credential-error" | "size-limit";
const labels: Record<ScanState, string> = { idle: "Ready · live ASF scan", queued: "Queued", running: "Fetching and building products", succeeded: "Products built · inspect exact acquisitions", failed: "Fetch failed", cancelled: "Fetch cancelled", "credential-error": "Earthdata credentials required", "size-limit": "Configured size limit reached" };

export function LiveScanPanel({ idPrefix, defaultBbox = DEFAULT_BBOX, onBuilt, compact = false }: {
  idPrefix: string; defaultBbox?: Bbox; onBuilt: (siteId: string) => void | Promise<void>; compact?: boolean;
}) {
  const [bbox, setBbox] = useState<Bbox | null>(defaultBbox);
  const [start, setStart] = useState("2026-08-13");
  const [end, setEnd] = useState("2026-10-01");
  const [polarizations, setPolarizations] = useState<string[]>(["HH", "HV"]);
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
  const togglePolarization = (polarization: string) => setPolarizations((current) =>
    current.includes(polarization)
      ? current.filter((item) => item !== polarization)
      : [...current, polarization].sort(),
  );
  const fail = (reason: unknown) => {
    setError(liveFetchErrorMessage(reason));
    setState(reason instanceof LiveFetchError && reason.kind === "credentials" ? "credential-error" : reason instanceof LiveFetchError && reason.kind === "size-limit" ? "size-limit" : "failed");
    setBusy(false);
  };
  const begin = async () => {
    if (busy || dateError || !polarizations.length || !isValidBbox(bbox)) return;
    const token = ++generation.current;
    setError(""); setJob(null); setBusy(true); setState("queued");
    try {
      if (!await checkLiveFetchAvailable()) throw new LiveFetchError("Live fetch is disabled by backend configuration.", "disabled");
      const result = await startLiveFetch({ bbox, start_date: start, end_date: end, maturity: "PROVISIONAL", polarizations, max_granules: 6, refresh: false });
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
    <section className="plate">
      <h2 className="plate__tag">Select a region</h2>
      <p className="footnote mt-1">Draw or enter a bounding box. The default surrounds Anak Krakatau.</p>
      <div className="mt-3"><RegionSelector initialBbox={defaultBbox} onChange={setBbox} /></div>
      <p className="plate__caption">Selected bbox: <code>{bbox ? formatBbox(bbox) : "not selected"}</code></p>
    </section>
    <section className="plate">
      <h2 className="plate__tag">Live scan window</h2>
      <div className="tm-calendar__row mt-3">
        <label className="field tm-calendar__label" htmlFor={`${idPrefix}-start`}>Start date<input id={`${idPrefix}-start`} type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field tm-calendar__label" htmlFor={`${idPrefix}-end`}>End date<input id={`${idPrefix}-end`} type="date" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <fieldset className="mt-3 flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="mb-1 w-full text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-mute)]">Polarization</legend>
        {(["HH", "HV"] as const).map((polarization) => (
          <label key={polarization} className="tm-button inline-flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={polarization}
              checked={polarizations.includes(polarization)}
              onChange={() => togglePolarization(polarization)}
              className="accent-[color:var(--accent)]"
            />
            <span>{polarization}</span>
          </label>
        ))}
      </fieldset>
      {dateError && <p className="colophon mt-2" role="alert">{dateError}</p>}
      {!polarizations.length && <p className="colophon mt-2" role="alert">Select HH, HV, or both.</p>}
      <p className="footnote mt-3">Selected: {start || "—"} to {end || "—"} · {polarizations.join(" + ") || "no polarization selected"}</p>
      <p className="colophon mt-3">Live fetch downloads from ASF/Earthdata on the operator side and may require multiple GB of data and substantial processing time. Nothing runs until you request it.</p>
      <button className="chapter-button chapter-button--primary tm-button tm-button--primary mt-4" type="button" onClick={begin} disabled={busy || !!dateError || !polarizations.length || !isValidBbox(bbox) || status?.live_fetch_enabled === false}>{busy && !job ? "Checking and submitting…" : "Fetch real observations"}</button>
      {availabilityError && <p className="colophon mt-2">Backend status: {availabilityError}</p>}
      {status?.live_fetch_enabled === false && <p className="colophon mt-2">Live fetch is disabled on this backend. No request was submitted.</p>}
    </section>
    <section className="plate" aria-live="polite">
      <h2 className="plate__tag">Scan status · {labels[state]}</h2>
      {(state === "queued" || state === "running") && <div className="mt-3 space-y-2"><p className="footnote">{job?.message || "Submitting the scan request…"}{job?.stage ? ` · ${job.stage}` : ""}</p>{percent !== null && <div><div className="footnote mb-1 flex justify-between"><span>Backend-reported progress</span><span>{percent}%</span></div><progress className="tm-scan-progress w-full" max={100} value={percent}>{percent}%</progress></div>}<button className="chapter-button chapter-button--ghost tm-button tm-button--ghost" type="button" onClick={cancel} disabled={!job?.job_id}>Cancel fetch</button></div>}
      {state === "cancelled" && <p className="footnote mt-2">The job was cancelled.</p>}
      {error && <p className="colophon mt-3" role="alert">{error}</p>}
      {state === "credential-error" && <p className="footnote mt-2">Credential guidance is in <code>docs/LIVE_FETCH.md</code>. This UI does not collect or expose credentials.</p>}
      {state === "size-limit" && <p className="footnote mt-2">Reduce the selected region or window, or ask the backend operator to review configured limits. No result is presented as complete.</p>}
    </section>
  </div>;
}

export function BuiltProductsBanner({ manifest }: { manifest: import("@/lib/types").SiteManifest }) {
  const pols = observationPolarizations(manifest);
  return <div className="colophon mb-4" role="status"><strong>Available observations:</strong> {pols.map((pol) => `${pol} · ${observationDates(manifest, pol).join(", ") || "none"}`).join(" | ") || "none"}</div>;
}
