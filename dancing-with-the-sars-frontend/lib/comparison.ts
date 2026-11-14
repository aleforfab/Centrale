import type { Acquisition, Pair, ProductLayer, SiteManifest } from "./types";

/**
 * Logic for the before/after comparison viewer.
 *
 * The rule this module enforces: a comparison may only pair two *observation*
 * layers (kind "backscatter") of the same polarization whose dates are exactly
 * the dates recorded in the curated pair. It never substitutes a different
 * date, a different polarization, or a difference/change-mask product to fill a
 * gap. When something is missing it reports a problem instead.
 *
 * Dates appear in two shapes in real products: compact `20260701` inside pair
 * records and ISO `2026-07-01` on layers. Both normalize to ISO here.
 */

export type ComparisonSide = "before" | "after";

export interface Observation {
  date: string;
  layer: ProductLayer;
  acquisition: Acquisition | null;
}

export interface ComparisonSelection {
  siteId: string;
  siteTitle: string;
  caveat: string;
  pairId: string;
  pairLabel: string;
  pol: string;
  before: Observation;
  after: Observation;
  /** True when the backend had to resample one grid onto the other. */
  resampled: boolean | null;
}

export type ComparisonProblemKind =
  | "no-manifest"
  | "no-pairs"
  | "missing-pair"
  | "missing-polarization"
  | "no-observations-for-polarization"
  | "missing-observation"
  | "mismatched-site";

export interface ComparisonProblem {
  kind: ComparisonProblemKind;
  message: string;
  side?: ComparisonSide;
  date?: string;
  available?: string[];
}

export type ComparisonResult =
  | { ok: true; selection: ComparisonSelection }
  | { ok: false; problem: ComparisonProblem };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * Normalize a pair or layer date to `YYYY-MM-DD`.
 * Returns null for anything that is not a complete, valid calendar date.
 */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const iso = ISO_DATE.exec(text);
  const compact = COMPACT_DATE.exec(text);
  const parts = iso ?? compact;
  if (!parts) return null;
  const [, year, month, day] = parts;
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject impossible dates that Date would silently roll over (e.g. 2026-02-31).
  if (parsed.toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

/** Dates recorded in a curated pair, normalized. */
export function pairDates(pair: Pair): { pre: string | null; post: string | null } {
  return { pre: normalizeDate(pair.pre), post: normalizeDate(pair.post) };
}

/** Pairs that can be offered to a viewer, i.e. both dates are readable. */
export function usablePairs(manifest: SiteManifest): Pair[] {
  return manifest.pairs.filter((pair) => pairDates(pair).pre && pairDates(pair).post);
}

/**
 * Find the observation layer for one exact date and polarization.
 * Difference and change-mask products are never returned.
 */
export function findObservation(
  manifest: SiteManifest,
  pol: string,
  isoDate: string,
): ProductLayer | null {
  const wantedPol = pol.trim().toUpperCase();
  return (
    manifest.layers.find(
      (layer) =>
        layer.kind === "backscatter" &&
        (layer.pol ?? "").toUpperCase() === wantedPol &&
        normalizeDate(layer.date) === isoDate,
    ) ?? null
  );
}

/** Dates that have an observation layer for a polarization, sorted ascending. */
export function observationDates(manifest: SiteManifest, pol: string): string[] {
  const wantedPol = pol.trim().toUpperCase();
  const dates = new Set<string>();
  for (const layer of manifest.layers) {
    if (layer.kind !== "backscatter") continue;
    if ((layer.pol ?? "").toUpperCase() !== wantedPol) continue;
    const iso = normalizeDate(layer.date);
    if (iso) dates.add(iso);
  }
  return [...dates].sort();
}

/** Polarizations that actually have observation layers in the installed site. */
export function observationPolarizations(manifest: SiteManifest): string[] {
  const pols = new Set<string>();
  for (const layer of manifest.layers) {
    if (layer.kind === "backscatter" && layer.pol) pols.add(layer.pol.toUpperCase());
  }
  return [...pols].sort();
}

/** Match the provenance record for a dated observation. */
export function findAcquisition(manifest: SiteManifest, isoDate: string): Acquisition | null {
  return manifest.acquisitions.find((item) => normalizeDate(item.date) === isoDate) ?? null;
}

/** Read the backend's resampling flag for this pair and polarization, if present. */
export function resampledFlag(manifest: SiteManifest, pairId: string, pol: string): boolean | null {
  const pair = manifest.pairs.find((item) => item.id === pairId);
  const byPol = pair?.stats?.[pol.toUpperCase()];
  if (!byPol) return null;
  const thresholds = Object.values(byPol);
  if (thresholds.length === 0) return null;
  return thresholds[0].resampled ?? null;
}

/**
 * Resolve a curated pair into two exact observation layers.
 * Returns a problem rather than a partial or substituted result.
 */
export function buildComparison(
  manifest: SiteManifest | null,
  pairId: string,
  pol: string,
): ComparisonResult {
  if (!manifest) {
    return { ok: false, problem: { kind: "no-manifest", message: "No site manifest was loaded." } };
  }
  if (manifest.pairs.length === 0) {
    return {
      ok: false,
      problem: {
        kind: "no-pairs",
        message: "This site has no curated pairs, so there is nothing to compare.",
      },
    };
  }

  const pair = manifest.pairs.find((item) => item.id === pairId);
  if (!pair) {
    return {
      ok: false,
      problem: {
        kind: "missing-pair",
        message: `Pair "${pairId}" is not installed for this site.`,
        available: manifest.pairs.map((item) => item.id),
      },
    };
  }

  const availablePols = observationPolarizations(manifest);
  const wantedPol = pol.trim().toUpperCase();
  if (!availablePols.includes(wantedPol)) {
    return {
      ok: false,
      problem: {
        kind: "missing-polarization",
        message: `No observation layers exist for polarization ${wantedPol || "(none)"}.`,
        available: availablePols,
      },
    };
  }

  const { pre, post } = pairDates(pair);
  if (!pre || !post) {
    return {
      ok: false,
      problem: {
        kind: "missing-pair",
        message: `Pair "${pair.id}" has an unreadable date and cannot be compared exactly.`,
      },
    };
  }

  const beforeLayer = findObservation(manifest, wantedPol, pre);
  if (!beforeLayer) {
    return {
      ok: false,
      problem: {
        kind: "missing-observation",
        side: "before",
        date: pre,
        message:
          `No backscatter observation exists for ${wantedPol} on ${pre}. ` +
          "A different date or a difference product is not substituted.",
        available: observationDates(manifest, wantedPol),
      },
    };
  }

  const afterLayer = findObservation(manifest, wantedPol, post);
  if (!afterLayer) {
    return {
      ok: false,
      problem: {
        kind: "missing-observation",
        side: "after",
        date: post,
        message:
          `No backscatter observation exists for ${wantedPol} on ${post}. ` +
          "A different date or a difference product is not substituted.",
        available: observationDates(manifest, wantedPol),
      },
    };
  }

  return {
    ok: true,
    selection: {
      siteId: manifest.site.id,
      siteTitle: manifest.site.title,
      caveat: manifest.site.caveat,
      pairId: pair.id,
      pairLabel: pair.label,
      pol: wantedPol,
      before: {
        date: pre,
        layer: beforeLayer,
        acquisition: findAcquisition(manifest, pre),
      },
      after: {
        date: post,
        layer: afterLayer,
        acquisition: findAcquisition(manifest, post),
      },
      resampled: resampledFlag(manifest, pair.id, wantedPol),
    },
  };
}

/** Clamp the reveal slider to 0-100 and ignore non-finite input. */
export function clampReveal(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/**
 * Convert a pointer position inside the map container into a reveal percentage.
 * `left` and `width` describe the container's bounding box.
 */
export function revealFromPointer(clientX: number, left: number, width: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return 50;
  }
  return clampReveal(((clientX - left) / width) * 100);
}

/** Human-readable processing identity for the provenance panel. */
export function processingIdentity(manifest: SiteManifest | null): string {
  if (!manifest) return "unknown";
  const source = manifest.source;
  const parts = [
    source.mission,
    `${source.band}-band`,
    source.product,
    source.frequency,
    `${source.pixel_spacing_m} m`,
    source.crs,
    source.crid,
    source.maturity,
  ];
  return parts.filter(Boolean).join(" · ");
}
