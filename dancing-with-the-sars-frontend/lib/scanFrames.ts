import type { Acquisition, ProductLayer, SiteManifest } from "./types";

export const KRAKATAU_STACK_DATES = [
  "2026-08-13",
  "2026-08-25",
  "2026-09-06",
  "2026-09-18",
  "2026-09-30",
] as const;
const REQUESTED_STACK_DATE_SET = new Set<string>(KRAKATAU_STACK_DATES);

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

/** Adapt a site manifest into exact dated observation frames. No derived/change products enter playback. */
export function manifestToScanFrames(manifest: SiteManifest, polarization?: string): ScanFrame[] {
  const wantedPol = polarization?.toUpperCase();
  return manifest.layers
    .filter((layer) => layer.kind === "backscatter")
    .filter((layer) => !wantedPol || (layer.pol ?? "").toUpperCase() === wantedPol)
    .flatMap((layer) => {
      const date = layer.date?.slice(0, 10);
      if (!date || !REQUESTED_STACK_DATE_SET.has(date)) return [];
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
