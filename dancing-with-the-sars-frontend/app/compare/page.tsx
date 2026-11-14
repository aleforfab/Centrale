"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { api } from "@/lib/api";
import { observationDates, observationPolarizations } from "@/lib/comparison";
import type { SiteManifest, SiteSummary } from "@/lib/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected request error occurred.";
}

function compactDate(value: string): string {
  return value.replace(/-/g, "");
}

const CALENDAR_PAIR_ID = "calendar-selection";

interface DateChoiceProps {
  label: string;
  value: string;
  min: string;
  max: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function DateChoice({ label, value, min, max, disabled, onChange }: DateChoiceProps) {
  return (
    <label className="tm-calendar__label">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  );
}

export default function ComparePage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [pol, setPol] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSites = useCallback(() => {
    setLoadingSites(true);
    setError(null);
    api
      .sites()
      .then((list) => {
        setSites(list);
        setSiteId((current) => current || list[0]?.id || "");
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoadingSites(false));
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (!siteId) {
      setManifest(null);
      return;
    }
    let active = true;
    setLoadingManifest(true);
    setManifest(null);
    setError(null);
    api
      .site(siteId)
      .then((loaded) => {
        if (!active) return;
        setManifest(loaded);
        setPol(observationPolarizations(loaded)[0] ?? loaded.polarizations[0]?.pol ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoadingManifest(false);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const pols = useMemo(() => (manifest ? observationPolarizations(manifest) : []), [manifest]);
  const availableDates = useMemo(
    () => (manifest && pol ? observationDates(manifest, pol) : []),
    [manifest, pol],
  );

  useEffect(() => {
    if (availableDates.length >= 2) {
      setBeforeDate(availableDates[0]);
      setAfterDate(availableDates[availableDates.length - 1]);
    } else {
      setBeforeDate("");
      setAfterDate("");
    }
  }, [availableDates]);

  const calendarManifest = useMemo((): SiteManifest | null => {
    if (!manifest || !beforeDate || !afterDate) return null;
    return {
      ...manifest,
      pairs: [
        {
          id: CALENDAR_PAIR_ID,
          pre: compactDate(beforeDate),
          post: compactDate(afterDate),
          label: "Selected calendar dates",
          stats: manifest.pairs[0]?.stats ?? {},
        },
      ],
    };
  }, [manifest, beforeDate, afterDate]);

  const exactDatesSelected = availableDates.includes(beforeDate) && availableDates.includes(afterDate);
  const chronological = Boolean(beforeDate && afterDate && beforeDate < afterDate);
  const calendarError = !availableDates.length
    ? "No observation dates are available for this polarization."
    : availableDates.length < 2
      ? "At least two exact observation dates are needed for a comparison."
      : !exactDatesSelected
        ? "Choose two exact installed dates. No substitute date, polarization or difference layer is used."
        : !chronological
          ? "The before date must be earlier than the after date. No substitute date is used."
          : null;

  return (
    <AppShell current="/compare" eyebrow="Exact-pair viewer" title="Before / after comparison">
      {error && (
        <div
          className="mb-5 flex items-start justify-between gap-4 rounded-md border border-red-700/60 bg-red-950/80 p-4 text-sm text-red-200"
          role="alert"
        >
          <div>
            <p className="font-medium">The catalogue or site could not be loaded.</p>
            <p className="mt-1 text-red-300/90">{error}</p>
            <p className="mt-1 text-[11px] text-red-300/70">
              This page shows installed products only; it does not start processing.
            </p>
          </div>
          <button type="button" onClick={loadSites} className="shrink-0 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {loadingSites ? (
        <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading product catalog…</div>
      ) : sites.length === 0 ? (
        <section className="mx-auto mt-16 max-w-2xl rounded-xl border border-slate-700 bg-[#111a24] p-8 text-center">
          <h2 className="text-lg font-semibold">No installed products to compare</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            A comparison needs a built site with at least one curated pair. Build one with the backend CLI, then
            reload this page. Nothing is generated here on demand.
          </p>
          <p className="mt-4 rounded bg-slate-950 p-3 font-mono text-xs text-slate-300">
            python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
          </p>
        </section>
      ) : (
        <>
          <div className="tm-calendar">
            <div className="tm-calendar__row">
              <DateChoice
                label="Before date"
                value={beforeDate}
                min={availableDates[0] ?? ""}
                max={availableDates[availableDates.length - 1] ?? ""}
                disabled={!availableDates.length}
                onChange={setBeforeDate}
              />
              <DateChoice
                label="After date"
                value={afterDate}
                min={availableDates[0] ?? ""}
                max={availableDates[availableDates.length - 1] ?? ""}
                disabled={!availableDates.length}
                onChange={setAfterDate}
              />
              <label className="tm-calendar__label">
                Polarization
                <select value={pol} onChange={(event) => setPol(event.target.value)} disabled={!pols.length}>
                  {pols.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tm-chip-row" aria-label="Exact observation dates">
              {availableDates.map((date) => (
                <span key={date} className="tm-chip">{date}</span>
              ))}
            </div>
          </div>

          {calendarError && (
            <p className="tm-problem" role="status" style={{ marginBottom: 16 }}>
              {calendarError}
            </p>
          )}

          {loadingManifest ? (
            <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading site manifest…</div>
          ) : calendarManifest ? (
            <ComparisonViewer manifest={calendarManifest} pairId={CALENDAR_PAIR_ID} pol={pol} />
          ) : null}
        </>
      )}
    </AppShell>
  );
}
