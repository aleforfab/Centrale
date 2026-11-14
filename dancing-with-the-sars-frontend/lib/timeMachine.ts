import type { PairStats, SiteManifest } from "./types";

export type FeatureId =
  | "backscatter"
  | "change"
  | "mask"
  | "timeseries"
  | "provenance"
  | "playback"
  | "compare";

export interface FeatureOption {
  id: FeatureId;
  label: string;
  description: string;
}

export const FEATURE_OPTIONS: FeatureOption[] = [
  {
    id: "backscatter",
    label: "Backscatter observations",
    description: "Show the dated radar observation frames.",
  },
  {
    id: "change",
    label: "Difference product",
    description: "Show a measured difference panel. Difference layers are never used as observations.",
  },
  {
    id: "mask",
    label: "Threshold mask",
    description: "Show thresholded change areas as a separate product.",
  },
  {
    id: "timeseries",
    label: "Time series",
    description: "Show a small measured backscatter series for the selected region.",
  },
  {
    id: "provenance",
    label: "Provenance",
    description: "Show dates, polarization, source notice and exact-date rules.",
  },
  {
    id: "playback",
    label: "Playback",
    description: "Enable play/pause and speed controls for the timeline.",
  },
  {
    id: "compare",
    label: "Two-date compare",
    description: "Enable exact before/after date selection with a reveal slider.",
  },
];

export const DEFAULT_FEATURES: FeatureId[] = [
  "backscatter",
  "change",
  "timeseries",
  "provenance",
  "playback",
  "compare",
];

export const SCAN_DATES = [
  "2026-09-01",
  "2026-09-07",
  "2026-09-19",
  "2026-09-23",
  "2026-10-11",
  "2026-10-20",
  "2026-11-10",
  "2026-11-22",
] as const;

export const DEFAULT_BBOX: [number, number, number, number] = [105.4, -6.15, 105.55, -6.03];
export const DEFAULT_POL = "HH";
export const SYNTHETIC_NOTICE =
  "Prototype scan: these frames are procedurally generated to demonstrate interaction. They are not NISAR observations; each frame is not a real observation, not a real change, and not evidence of anything.";

export interface ScanRequest {
  bbox: [number, number, number, number];
  features: FeatureId[];
  dateMode: "single" | "pair" | "both";
  pol?: string;
  beforeDate?: string;
  afterDate?: string;
}

export interface ScanFrame {
  date: string;
  url: string;
  pol: string;
  layerId: string;
  kind: "backscatter";
  displayRange: [number, number];
}

export interface ScanResult {
  id: string;
  title: string;
  caveat: string;
  notice: string;
  bbox: [number, number, number, number];
  features: FeatureId[];
  dateMode: ScanRequest["dateMode"];
  pol: string;
  beforeDate?: string;
  afterDate?: string;
  dates: string[];
  frames: ScanFrame[];
  displayRange: [number, number];
  generatedAt: string;
}

export function isFeatureId(value: string): value is FeatureId {
  return FEATURE_OPTIONS.some((option) => option.id === value);
}

export function featureLabel(id: FeatureId): string {
  return FEATURE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export function isValidBbox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    value[0] < value[2] &&
    value[1] < value[3] &&
    value[0] >= -180 &&
    value[2] <= 180 &&
    value[1] >= -90 &&
    value[3] <= 90
  );
}

export function formatBbox(bbox: [number, number, number, number]): string {
  return bbox.map((value) => value.toFixed(3)).join(", ");
}

export function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function frameUrl(
  date: string,
  bbox: [number, number, number, number],
  pol: string,
  features: FeatureId[],
): string {
  const params = new URLSearchParams({
    bbox: bbox.join(","),
    pol,
    features: features.join(","),
  });
  return `/tm/frames/${encodeURIComponent(date)}?${params.toString()}`;
}

export function scanFrames(
  bbox: [number, number, number, number],
  pol: string,
  features: FeatureId[],
): ScanFrame[] {
  return SCAN_DATES.map((date) => ({
    date,
    url: frameUrl(date, bbox, pol, features),
    pol,
    layerId: `backscatter-${pol.toLowerCase()}-${date}`,
    kind: "backscatter" as const,
    displayRange: [-25, -5] as [number, number],
  }));
}

const EMPTY_STATS: PairStats = {
  valid_pixels: 0,
  valid_fraction_of_bbox: 0,
  decrease_km2: 0,
  increase_km2: 0,
  decrease_pct: 0,
  increase_pct: 0,
  sigma_db: 0,
  median_diff_db: 0,
  histogram: [],
  resampled: false,
};

/**
 * Build a manifest-shaped object for the exact-date comparison helper.
 *
 * Only backscatter observation layers are included. Difference and mask layers
 * are deliberately absent so buildComparison cannot substitute them.
 */
export function buildMockManifest(
  result: ScanResult,
  beforeDate: string,
  afterDate: string,
  pol: string,
): SiteManifest {
  const wantedPol = pol.toUpperCase();
  return {
    site: {
      id: result.id,
      title: result.title,
      event_type: "other",
      description: "Prototype scan built from synthetic frames.",
      caveat: result.caveat,
      bbox: result.bbox,
      center: [
        (result.bbox[0] + result.bbox[2]) / 2,
        (result.bbox[1] + result.bbox[3]) / 2,
      ],
    },
    source: {
      mission: "NISAR",
      band: "L",
      product: "GCOV",
      maturity: "PROTOTYPE",
      crid: "SYNTHETIC",
      frequency: "A",
      pixel_spacing_m: 20,
      crs: "EPSG:4326",
    },
    acquisitions: result.frames.map((frame, index) => ({
      granule: `SYNTHETIC_${compactDate(frame.date)}_${wantedPol}_${index + 1}.frame`,
      cycle: 1,
      date: frame.date,
      start: `${frame.date}T00:00:00Z`,
      end: `${frame.date}T00:00:00Z`,
      crid: "SYNTHETIC",
      coverage: "F",
      polarizations: [wantedPol],
      links: {},
    })),
    polarizations: [{ pol: wantedPol, stretch_db: [-25, -5] }],
    layers: result.frames.map((frame) => ({
      id: frame.layerId,
      kind: "backscatter" as const,
      title: `${wantedPol} backscatter · ${frame.date}`,
      pol: wantedPol,
      date: frame.date,
      pair_id: null,
      threshold_db: null,
      tile_url_template: frame.url,
      min_zoom: 0,
      max_zoom: 12,
      legend: "Synthetic grayscale: brighter means a stronger radar-like return.",
    })),
    pairs: [
      {
        id: "selected-pair",
        pre: compactDate(beforeDate),
        post: compactDate(afterDate),
        label: "Selected before and after dates",
        stats: {
          [wantedPol]: {
            "3": EMPTY_STATS,
          },
        },
      },
    ],
  };
}
