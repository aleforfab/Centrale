"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ComparisonViewer } from "@/components/ComparisonViewer";
import { SiteNav } from "@/components/SiteNav";
import { api } from "@/lib/api";
import { observationPolarizations, usablePairs } from "@/lib/comparison";
import type { SiteManifest, SiteSummary } from "@/lib/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected request error occurred.";
}

export default function ComparePage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [pairId, setPairId] = useState("");
  const [pol, setPol] = useState("");
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
        const firstPair = usablePairs(loaded)[0];
        setPairId(firstPair?.id ?? "");
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

  const pairs = useMemo(() => (manifest ? usablePairs(manifest) : []), [manifest]);
  const pols = useMemo(() => (manifest ? observationPolarizations(manifest) : []), [manifest]);

  return (
    <main className="min-h-screen bg-[#0b1118] p-4 text-slate-100 sm:p-6 lg:p-8">
      <header className="mb-3 flex flex-col gap-3 border-b border-slate-700/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Earth observation workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Before / after comparison</h1>
          <p className="mt-1 text-sm text-slate-400">
            Two installed observations of the same stack, revealed with a slider
          </p>
        </div>
      </header>

      <SiteNav current="/compare" />

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
        <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading NISAR site catalog…</div>
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
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-xs font-medium text-slate-400">
              NISAR site
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-400">
              Curated pair
              <select
                value={pairId}
                onChange={(event) => setPairId(event.target.value)}
                disabled={!pairs.length}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {pairs.map((pair) => (
                  <option key={pair.id} value={pair.id}>
                    {pair.label} ({pair.pre} → {pair.post})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-400">
              Polarization
              <select
                value={pol}
                onChange={(event) => setPol(event.target.value)}
                disabled={!pols.length}
                className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {pols.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loadingManifest ? (
            <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading site manifest…</div>
          ) : manifest && pairs.length === 0 ? (
            <section className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-5 text-sm text-amber-100">
              <h2 className="text-base font-semibold">This site has no curated pair</h2>
              <p className="mt-2 leading-6">
                Observations exist but the site configuration does not declare a before/after pair, so no
                comparison dates can be chosen without inventing them.
              </p>
            </section>
          ) : manifest ? (
            <ComparisonViewer manifest={manifest} pairId={pairId} pol={pol} />
          ) : null}
        </>
      )}
    </main>
  );
}
