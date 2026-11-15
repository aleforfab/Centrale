import type { Acquisition, ProductLayer, SiteManifest } from "./types";

/**
 * Anak Krakatau eruption date. Only Krakatau manifests get eruption-phased
 * labels; every other site gets the neutral fallback in `framePhase`.
 */
export const KRAKATAU_EVENT_DATE = "2026-09-06";

export interface ScanFrame {
  date: string;
  layer: ProductLayer;
  polarization: string;
  granule: string;
  crid: string;
  maturity: string;
  source: string;
}

function acquisitionForDate(acquisitions: Acquisition[], date: string): Acquisition | undefined {
  return acquisitions.find((item) => item.date.slice(0, 10) === date);
}

/**
 * Adapt a site manifest into exact dated observation frames. Every installed
 * backscatter layer becomes a frame; derived/change products never enter
 * playback, and missing dates stay missing (no interpolation, no substitutes).
 */
export function manifestToScanFrames(manifest: SiteManifest, polarization?: string): ScanFrame[] {
  const wantedPol = polarization?.toUpperCase();
  return manifest.layers
    .filter((layer) => layer.kind === "backscatter")
    .filter((layer) => !wantedPol || (layer.pol ?? "").toUpperCase() === wantedPol)
    .flatMap((layer) => {
      const date = layer.date?.slice(0, 10);
      if (!date) return [];
      const acquisition = acquisitionForDate(manifest.acquisitions, date);
      return [{
        date,
        layer,
        polarization: (layer.pol ?? acquisition?.polarizations[0] ?? "").toUpperCase(),
        granule: acquisition?.granule ?? "Not listed in manifest",
        crid: acquisition?.crid ?? manifest.source.crid,
        maturity: manifest.source.maturity,
        source: "ASF / NASA Earthdata",
      }];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.polarization.localeCompare(b.polarization));
}

/**
 * Exact acquisition dates present in the loaded manifest's frame stack. These
 * are the date presets shown in the UI: derived from what is installed, so a
 * preset can never point at a date that has no observation.
 */
export function scanFrameDates(frames: ScanFrame[]): string[] {
  return [...new Set(frames.map((frame) => frame.date))].sort();
}

/** Heuristic gate so eruption-specific copy only appears for Anak Krakatau. */
export function isKrakatauSite(manifest: SiteManifest): boolean {
  const haystack = `${manifest.site.id} ${manifest.site.title}`.toLowerCase();
  return haystack.includes("krakatau") || haystack.includes("krakatoa");
}

/**
 * Phase label for one playback frame. Anak Krakatau frames are phased around
 * the 2026-09-06 eruption; other sites get a neutral fallback anchored on the
 * stack's earliest acquisition date ("Before acquisition" / "After acquisition").
 * Frames equal to the reference date are part of the "before" side.
 */
export function framePhase(manifest: SiteManifest, frames: ScanFrame[], date: string): string {
  if (!date) return "Acquisition";
  if (isKrakatauSite(manifest)) {
    if (date < KRAKATAU_EVENT_DATE) return "Before event";
    if (date === KRAKATAU_EVENT_DATE) return "Event date";
    if (date <= "2026-10-06") return "Month after event";
    return "Later acquisition";
  }
  const anchor = scanFrameDates(frames)[0];
  if (!anchor) return "Acquisition";
  return date <= anchor ? "Before acquisition" : "After acquisition";
}
