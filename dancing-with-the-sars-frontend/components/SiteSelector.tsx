"use client";

import React from "react";
import { visibleSites, type SiteSummary } from "@/lib/types";

interface SiteSelectorProps {
  id: string;
  sites: SiteSummary[];
  value: string;
  disabled?: boolean;
  onChange: (siteId: string) => void;
}

/** Shared site picker used by the dashboard and the timeline/comparison workspace. */
export function SiteSelector({ id, sites: allSites, value, disabled = false, onChange }: SiteSelectorProps) {
  // Synthetic rehearsal fixtures are never offered as a site choice.
  const sites = visibleSites(allSites);
  return (
    <div className="field min-w-[11rem]">
      <label htmlFor={id}>Site</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-[38px] w-full"
      >
        {!sites.length && <option value="">{disabled ? "Loading sites…" : "No sites available"}</option>}
        {sites.map((site) => <option key={site.id} value={site.id}>{site.title}</option>)}
      </select>
    </div>
  );
}
