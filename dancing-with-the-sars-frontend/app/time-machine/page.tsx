"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveScanPanel, BuiltProductsBanner } from "@/components/LiveScanPanel";
import { CalendarReview } from "@/components/CalendarReview";
import { SiteSelector } from "@/components/SiteSelector";
import { fetchManifest } from "@/lib/liveFetch";
import { api } from "@/lib/api";
import { visibleSites, type SiteManifest, type SiteSummary } from "@/lib/types";
import { initialSiteId, rememberSite } from "@/lib/siteChoice";

export default function TimeMachinePage() {
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [error, setError] = useState("");
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingManifest, setLoadingManifest] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .sites()
      .then((list) => {
        if (!active) return;
        // Synthetic rehearsal fixtures are not offered as a site choice.
        const visible = visibleSites(list);
        setSites(visible);
        setSiteId((current) => current || initialSiteId(visible));
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

  // Keep the chosen site in the URL so the dashboard opens on the same one.
  useEffect(() => { if (siteId) rememberSite(siteId); }, [siteId]);

  useEffect(() => {
    if (!siteId) {
      setManifest(null);
      return;
    }
    let active = true;
    setManifest(null);
    setLoadingManifest(true);
    setError("");
    api
      .site(siteId)
      .then((loaded) => {
        if (active) setManifest(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The installed site manifest could not be loaded.");
      })
      .finally(() => { if (active) setLoadingManifest(false); });
    return () => {
      active = false;
    };
  }, [siteId]);

  const showBuiltSite = async (id: string) => {
    const list = visibleSites(await api.sites());
    setSites(list);
    setSiteId(id);
    setManifest(await fetchManifest(id));
  };

  return (
    <AppShell current="/time-machine" eyebrow="Exact acquisition dates" title="Timeline & before / after" subtitle="Browse installed observations and compare exact dates.">
      <div className="space-y-5">
        <SiteSelector id="time-machine-site" sites={sites} value={siteId} disabled={loadingSites || sites.length === 0} onChange={setSiteId} />
        {error && <p role="alert" className="colophon">{error}</p>}
        {manifest ? <>
          <h2 className="text-xl font-bold">{manifest.site.title}</h2>
          <BuiltProductsBanner manifest={manifest} />
          <CalendarReview key={manifest.site.id} manifest={manifest} />
        </> : <section className="plate"><div className="plate__body" style={{ minHeight: "20rem", display: "grid", placeItems: "center", textAlign: "center" }}>
          <div><h2>{loadingSites || loadingManifest ? "Loading installed acquisitions." : error ? "The installed site could not be loaded." : "No built site is installed."}</h2><p className="footnote mt-3">Built sites appear here automatically. Fetch observations below to add a site.</p></div>
        </div></section>}
        <details className="plate">
          <summary className="cursor-pointer p-4">Fetch new observations</summary>
          <div className="plate__body">
            <LiveScanPanel idPrefix="time-machine-scan" compact onBuilt={showBuiltSite} />
          </div>
        </details>
      </div>
    </AppShell>
  );
}
