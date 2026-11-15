"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
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

/*
 * The Diptych — REDESIGN_GUIDE §6 `/compare`.
 *
 * The catalogue vocabulary (`.plate*`, `.colophon`, `.field*`, `.footnote`) is
 * owned by `app/redesign.css` (slice 07) and is used here by name only.
 * Utilities add this page's own layout around it.
 */
const MONO = "font-[family-name:var(--font-mono)]";
const DISPLAY = "font-[family-name:var(--font-display)]";
/** Guide §4 label: 11px mono, 0.18em tracking, uppercase, ink-mute. */
const LABEL = `${MONO} text-[11px] uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink-mute)]`;
const PLATE = "plate";
const PLATE_TAG = "plate__tag";
const PLATE_HEADER = "plate__header gap-4";
const PLATE_RIGHT_TAG = "plate__right-tag shrink-0";
const COLOPHON = "colophon";
const FOOTNOTE = "footnote";
/* `.field` styles its own label and control; this only equalises select and date-input heights. */
const FIELD_CONTROL = "h-[38px] w-full";
const TEXT_LINK = `${MONO} text-[11px] uppercase tracking-[0.14em] text-[color:var(--accent)] underline underline-offset-2`;

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="field flex min-w-[11rem] flex-1 flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

interface DateChoiceProps {
  id: string;
  label: string;
  value: string;
  min: string;
  max: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function DateChoice({ id, label, value, min, max, disabled, onChange }: DateChoiceProps) {
  return (
    <Field id={id} label={label}>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={FIELD_CONTROL}
      />
    </Field>
  );
}

interface DiptychCellProps {
  tag: "Before" | "After";
  date: string;
  pol: string;
  installed: boolean;
  divided?: boolean;
}

/** One half of the diptych header: mono side tag, the selected date set large, and whether it is an exact installed date. */
function DiptychCell({ tag, date, pol, installed, divided = false }: DiptychCellProps) {
  return (
    <div className={`min-w-0 py-4 ${divided ? "border-l border-[color:var(--hairline)] pl-4 sm:pl-6" : "pr-4 sm:pr-6"}`}>
      <p className={LABEL}>{tag}</p>
      <p
        className={`${DISPLAY} mt-1 text-[clamp(26px,5.4vw,64px)] font-black leading-none tracking-[-0.02em] tabular-nums ${
          installed ? "text-[color:var(--ink)]" : "text-[color:var(--ink-mute)]"
        }`}
      >
        {date || "—"}
      </p>
      <p className={`${FOOTNOTE} mt-2`}>
        {!date
          ? "No date selected."
          : installed
            ? `${pol} · backscatter · exact installed date`
            : `No ${pol} backscatter observation is installed on this date. No substitute date is used.`}
      </p>
    </div>
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
  const [builtId, setBuiltId] = useState("");
  const [revision, setRevision] = useState(0);
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
  }, [siteId, revision]);

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
    <AppShell current="/compare" eyebrow="Diptych · exact-pair viewer" title="Before / after comparison">
      <details className="mb-5 border-y border-[color:var(--hairline)] py-2.5">
        <summary className={`${LABEL} cursor-pointer`}>Fetch new observations (live)</summary>
        <div className="mt-4"><LiveScanPanel idPrefix="compare-scan" compact onBuilt={async (id) => { const list = await api.sites(); if (!list.some((site) => site.id === id)) throw new Error("Built site is not yet in the product catalog."); setSites(list); setBuiltId(id); setSiteId(id); setRevision((value) => value + 1); }} /></div>
      </details>
      {manifest && builtId === siteId && <BuiltProductsBanner manifest={manifest} />}
      {error && (
        <div className={`${COLOPHON} mb-5`} role="alert">
          <div className="flex w-full min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold">The catalogue or site could not be loaded.</p>
              <p className="mt-1 [overflow-wrap:anywhere]">{error}</p>
              <p className={`${FOOTNOTE} mt-1`}>
                The viewer shows installed products; a live fetch requires an explicit request.
              </p>
            </div>
            <button type="button" onClick={loadSites} className={`${TEXT_LINK} shrink-0`}>
              Retry
            </button>
          </div>
        </div>
      )}

      {loadingSites ? (
        <div className={`${PLATE} grid min-h-80 place-items-center`}>
          <p className={LABEL}>Loading product catalog…</p>
        </div>
      ) : sites.length === 0 ? (
        <section className={`${PLATE} mx-auto my-12 max-w-[720px]`} aria-labelledby="compare-empty-title">
          <header className={PLATE_HEADER}>
            <p className={PLATE_TAG}>Diptych</p>
            <p className={PLATE_RIGHT_TAG}>0 installed sites</p>
          </header>
          <div className="plate__body space-y-4">
            <h2 id="compare-empty-title" className={`${DISPLAY} text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[color:var(--ink)]`}>
              No installed products to compare
            </h2>
            <p className={COLOPHON}>
              A comparison needs a built site with at least two exact backscatter observations. Use the backend CLI or explicitly request a live fetch above.
            </p>
            <p className={`${MONO} overflow-x-auto rounded-[var(--radius)] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]`}>
              python -m nisar.cli build-site --config sites/&lt;site&gt;.yaml
            </p>
          </div>
        </section>
      ) : (
        <>
          <div
            className="mb-5 grid grid-cols-2 border-y border-[color:var(--hairline-strong)]"
            role="group"
            aria-label="Selected comparison dates"
          >
            <DiptychCell tag="Before" date={beforeDate} pol={pol} installed={availableDates.includes(beforeDate)} />
            <DiptychCell tag="After" date={afterDate} pol={pol} installed={availableDates.includes(afterDate)} divided />
          </div>

          <div className="mb-5">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <Field id="compare-site" label="Site">
                <select
                  id="compare-site"
                  value={siteId}
                  onChange={(event) => { setBuiltId(""); setSiteId(event.target.value); }}
                  className={FIELD_CONTROL}
                >
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
                </select>
              </Field>
              <DateChoice
                id="compare-before"
                label="Before date"
                value={beforeDate}
                min={availableDates[0] ?? ""}
                max={availableDates[availableDates.length - 1] ?? ""}
                disabled={!availableDates.length}
                onChange={setBeforeDate}
              />
              <DateChoice
                id="compare-after"
                label="After date"
                value={afterDate}
                min={availableDates[0] ?? ""}
                max={availableDates[availableDates.length - 1] ?? ""}
                disabled={!availableDates.length}
                onChange={setAfterDate}
              />
              <Field id="compare-polarization" label="Polarization">
                <select
                  id="compare-polarization"
                  value={pol}
                  onChange={(event) => setPol(event.target.value)}
                  disabled={!pols.length}
                  className={FIELD_CONTROL}
                >
                  {pols.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className={`${FOOTNOTE} mt-2`} aria-label="Exact observation dates">Available {pol} dates: {availableDates.join(" · ") || "none"}</p>
          </div>

          {calendarError && (
            <p className={`${COLOPHON} mb-5`} role="status">
              {calendarError}
            </p>
          )}

          {loadingManifest ? (
            <div className={`${PLATE} grid min-h-80 place-items-center`}>
              <p className={LABEL}>Loading site manifest…</p>
            </div>
          ) : calendarManifest && !calendarError ? (
            <ComparisonViewer manifest={calendarManifest} pairId={CALENDAR_PAIR_ID} pol={pol} />
          ) : null}

          {manifest && (
            <p className={`${COLOPHON} mt-6`}>
              {manifest.site.caveat}{" "}No substitute date, polarization or difference layer is used.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
