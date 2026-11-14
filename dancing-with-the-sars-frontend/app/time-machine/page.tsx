"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { FeatureChoices } from "@/components/FeatureChoices";
import { RegionSelector, type Bbox } from "@/components/RegionSelector";
import { TimeReview } from "@/components/TimeReview";
import {
  DEFAULT_BBOX,
  DEFAULT_FEATURES,
  DEFAULT_POL,
  SCAN_DATES,
  SYNTHETIC_NOTICE,
  featureLabel,
  formatBbox,
  isValidBbox,
  type FeatureId,
  type ScanResult,
} from "@/lib/timeMachine";
import type { DataStatus } from "@/lib/types";

type PrototypeDataStatus = DataStatus & { live_fetch_enabled?: boolean };

function OutputBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tm-output">
      <h3>{title}</h3>
      <div className="tm-muted">{children}</div>
    </div>
  );
}

function FeatureCheck() {
  const rows: Array<[string, string]> = [
    ["Mapbox region selection", "ready"],
    ["Start scan from selected bbox", "ready"],
    ["Choices for selected features", "ready"],
    ["Timeline slider", "ready"],
    ["Playback / speed", "ready"],
    ["One event date or two exact dates", "ready"],
    ["Exact-date refusal rule", "ready"],
    ["Real NISAR live fetch", "endpoint exists · not run here"],
    ["Tiled Mapbox basemap", "real token needed"],
  ];
  return (
    <ul className="tm-checklist">
      {rows.map(([label, state]) => (
        <li key={label}>
          <span>{label}</span>
          <em className={state === "ready" ? "tm-checklist--ready" : ""}>{state}</em>
        </li>
      ))}
    </ul>
  );
}

export default function TimeMachinePage() {
  const [bbox, setBbox] = useState<Bbox | null>(DEFAULT_BBOX);
  const [features, setFeatures] = useState<FeatureId[]>([...DEFAULT_FEATURES]);
  const [pol, setPol] = useState(DEFAULT_POL);
  const [dateMode, setDateMode] = useState<"single" | "pair">("single");
  const [beforeDate, setBeforeDate] = useState<string>(SCAN_DATES[1]);
  const [afterDate, setAfterDate] = useState<string>(SCAN_DATES[SCAN_DATES.length - 2]);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [status, setStatus] = useState<PrototypeDataStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/data-status")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PrototypeDataStatus;
      })
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setStatusError(reason instanceof Error ? reason.message : "Data status could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedFeaturesMatch = scan
    && [...scan.features].sort().join(",") === [...features].sort().join(",");
  const bboxMatches = scan
    && bbox
    && scan.bbox.every((value, index) => Math.abs(value - bbox[index]) < 1e-9);
  const pendingChanges = Boolean(
    scan
    && (
      !selectedFeaturesMatch
      || !bboxMatches
      || scan.pol !== pol
      || scan.dateMode !== dateMode
      || scan.beforeDate !== beforeDate
      || scan.afterDate !== afterDate
    ),
  );

  const startScan = async () => {
    setError(null);
    if (!isValidBbox(bbox)) {
      setError("Select a valid Mapbox region before starting a scan.");
      return;
    }
    if (features.length === 0) {
      setError("Choose at least one feature to visualise.");
      return;
    }
    if (dateMode === "pair") {
      if (!features.includes("compare")) {
        setError("Enable “Two-date compare” in feature choices to use two-date review.");
        return;
      }
      if (beforeDate >= afterDate) {
        setError("The before date must be earlier than the after date. No substitute date is used.");
        return;
      }
    }

    setLoading(true);
    setScan(null);
    try {
      const response = await fetch("/tm/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bbox,
          features,
          dateMode,
          pol,
          beforeDate,
          afterDate,
        }),
      });
      const body = (await response.json()) as ScanResult | { detail?: string };
      if (!response.ok) {
        throw new Error("detail" in body && body.detail ? body.detail : `Scan failed (HTTP ${response.status}).`);
      }
      setScan(body as ScanResult);
      setScanCount((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The prototype scan could not be started.");
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = status
    ? `${status.primary_mission} · ${status.active_source} · ${status.sites_count} installed site${status.sites_count === 1 ? "" : "s"}${status.live_fetch_enabled ? "" : " · live fetch off"}`
    : "Prototype · synthetic frames";

  return (
    <AppShell
      current="/time-machine"
      eyebrow="Map-first cinematic explorer"
      title="SAR Time Machine"
      subtitle="Select any region with Mapbox, choose the features to visualise, then start a synthetic scan and review exact dates by slider, playback or two-date compare."
      status={<span>{statusLabel}</span>}
    >
      <section className="tm-notice tm-panel" style={{ marginBottom: 18 }}>
        <strong>Prototype scan.</strong> {SYNTHETIC_NOTICE} The FastAPI backend has an arbitrary-bbox live-fetch
        endpoint, but this preview deliberately does not download real granules or claim a validated result.
      </section>

      <div className="tm-layout">
        <div>
          <RegionSelector initialBbox={DEFAULT_BBOX} onChange={setBbox} />

          <section className="tm-panel">
            <h2 className="tm-panel__title">2 · Choose features</h2>
            <FeatureChoices selected={features} onChange={setFeatures} disabled={loading} />
            <div className="tm-chip-row" aria-label="Selected features">
              {features.map((id) => <span key={id} className="tm-chip">{featureLabel(id)}</span>)}
            </div>
          </section>

          <section className="tm-panel">
            <h2 className="tm-panel__title">3 · Scan options</h2>
            <div className="tm-controls__row">
              <label>
                Polarization
                <select value={pol} onChange={(event) => setPol(event.target.value)} disabled={loading}>
                  {["HH", "HV", "VV", "VH"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Time review
                <select
                  value={dateMode}
                  onChange={(event) => setDateMode(event.target.value as "single" | "pair")}
                  disabled={loading}
                >
                  <option value="single">One event date (before / after)</option>
                  <option value="pair">Two dates to compare</option>
                </select>
              </label>
            </div>

            {dateMode === "pair" && (
              <div className="tm-controls__row" style={{ marginTop: 12 }}>
                <label>
                  Before date
                  <select value={beforeDate} onChange={(event) => setBeforeDate(event.target.value)} disabled={loading}>
                    {SCAN_DATES.map((date) => <option key={date} value={date}>{date}</option>)}
                  </select>
                </label>
                <label>
                  After date
                  <select value={afterDate} onChange={(event) => setAfterDate(event.target.value)} disabled={loading}>
                    {SCAN_DATES.map((date) => <option key={date} value={date}>{date}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="tm-actions">
              <button
                type="button"
                className="tm-button tm-button--primary"
                onClick={startScan}
                disabled={loading || !bbox || features.length === 0}
              >
                {loading ? "Scanning…" : "Start scan for selected region"}
              </button>
              <button
                type="button"
                className="tm-button tm-button--ghost"
                onClick={() => {
                  setScan(null);
                  setError(null);
                }}
                disabled={loading || !scan}
              >
                Reset
              </button>
            </div>

            {bbox && (
              <p className="tm-muted" style={{ marginTop: 10 }}>
                Selected bbox: <code>{formatBbox(bbox)}</code>
              </p>
            )}
            {pendingChanges && (
              <p className="tm-problem" role="status" style={{ marginTop: 12 }}>
                Selection changed. Press “Start scan for selected region” again to refresh the frames.
              </p>
            )}
            {error && <p className="tm-problem" role="alert" style={{ marginTop: 12 }}>{error}</p>}
            {scan && (
              <p className="tm-muted" style={{ marginTop: 10 }}>
                Scan #{scanCount} · {scan.dates.length} exact dates · {scan.pol} · generated at{" "}
                {new Date(scan.generatedAt).toLocaleString()}.
              </p>
            )}
          </section>
        </div>

        <div>
          <section className="tm-panel" style={{ padding: 10, marginBottom: 14 }}>
            <div className="tm-controls__row" style={{ justifyContent: "space-between" }}>
              <div>
                <h2 className="tm-panel__title" style={{ margin: 0 }}>4 · Review time</h2>
                <p className="tm-muted" style={{ marginTop: 4 }}>
                  Slider, playback, one event date or two exact dates.
                </p>
              </div>
              <Link href="/compare" className="tm-button tm-button--ghost">
                Installed-product compare ↗
              </Link>
            </div>
          </section>
          <TimeReview scan={scan} loading={loading} />
        </div>

        <div>
          <section className="tm-panel">
            <h2 className="tm-panel__title">5 · Feature outputs</h2>
            {!scan ? (
              <p className="tm-muted">Run a scan to populate the selected feature panels.</p>
            ) : (
              <div>
                {scan.features.includes("backscatter") && (
                  <OutputBlock title="Backscatter observations">
                    {scan.frames.length} dated frames are ordered by exact date. No intermediate observations are
                    invented.
                    <div className="tm-spark" aria-label="Equal frame slots, not measured values">
                      {scan.frames.map((frame) => <i key={frame.date} style={{ height: "52%" }} />)}
                    </div>
                  </OutputBlock>
                )}
                {scan.features.includes("change") && (
                  <OutputBlock title="Difference product">
                    <div className="tm-gradient" aria-hidden="true" />
                    Difference layers are kept separate from observation frames. A brightness difference is a
                    measured output, not a cause and not a validated scientific result.
                  </OutputBlock>
                )}
                {scan.features.includes("mask") && (
                  <OutputBlock title="Threshold mask">
                    <div className="tm-chip-row">
                      {["2 dB", "3 dB", "6 dB"].map((item) => <span key={item} className="tm-chip">{item}</span>)}
                    </div>
                    Threshold choices are illustrative here; no validated change area is computed from real data.
                  </OutputBlock>
                )}
                {scan.features.includes("timeseries") && (
                  <OutputBlock title="Time series">
                    Only the {scan.dates.length} installed synthetic dates appear. Missing dates are gaps, never
                    substituted with neighbouring observations.
                  </OutputBlock>
                )}
                {scan.features.includes("provenance") && (
                  <OutputBlock title="Provenance">
                    {SYNTHETIC_NOTICE}
                  </OutputBlock>
                )}
                {scan.features.includes("playback") && (
                  <OutputBlock title="Playback">
                    Play/pause and speed controls step through the dated frames at equal time per frame.
                  </OutputBlock>
                )}
                {scan.features.includes("compare") && (
                  <OutputBlock title="Two-date compare">
                    The reveal handle uses exactly the selected before and after observation layers. It refuses
                    a substitute date, polarization or difference/change-mask layer.
                  </OutputBlock>
                )}
              </div>
            )}
          </section>

          <section className="tm-panel">
            <h2 className="tm-panel__title">Observation facts</h2>
            <dl className="tm-facts">
              <div><dt>Region</dt><dd>{scan ? formatBbox(scan.bbox) : bbox ? formatBbox(bbox) : "not selected"}</dd></div>
              <div><dt>Polarization</dt><dd>{scan?.pol ?? pol}</dd></div>
              <div><dt>Dates</dt><dd>{scan ? `${scan.dates.length} exact slots` : "awaiting scan"}</dd></div>
              <div><dt>Display</dt><dd>{scan ? `${scan.displayRange[0]} to ${scan.displayRange[1]} dB` : "-25 to -5 dB"}</dd></div>
              <div><dt>Source</dt><dd>Procedural SVG</dd></div>
            </dl>
          </section>

          <section className="tm-panel">
            <h2 className="tm-panel__title">Backend support check</h2>
            {statusError ? (
              <p className="tm-problem">{statusError}</p>
            ) : status ? (
              <dl className="tm-facts">
                <div><dt>Primary mission</dt><dd>{status.primary_mission}</dd></div>
                <div><dt>Active source</dt><dd>{status.active_source}</dd></div>
                <div><dt>Products ready</dt><dd>{status.nisar_ready ? "yes" : "no"}</dd></div>
                <div><dt>Installed sites</dt><dd>{status.sites_count}</dd></div>
                <div><dt>Live fetch</dt><dd>{status.live_fetch_enabled ? "enabled" : "disabled"}</dd></div>
              </dl>
            ) : (
              <p className="tm-muted">Checking backend status…</p>
            )}
            <p className="tm-muted" style={{ marginTop: 10 }}>
              The backend’s <code>POST /api/nisar/fetch</code> accepts an arbitrary bbox, start/end dates, maturity,
              polarizations and max granules. In this preview live fetch is off and no Earthdata credentials are
              configured, so the scan button returns procedural frames instead of real NISAR products.
            </p>
          </section>

          <section className="tm-panel">
            <h2 className="tm-panel__title">Feature check</h2>
            <FeatureCheck />
          </section>

          <section className="tm-panel tm-notice">
            <h2 className="tm-panel__title">What this prototype is not</h2>
            <p className="tm-muted">
              It is not a tiled Mapbox product adapter, a real-granule scan, or evidence of surface change. A
              production integration must handle tile loading, projection, camera sync, exact dates and attribution.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
