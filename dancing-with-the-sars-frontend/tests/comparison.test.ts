import { describe, expect, it } from "vitest";
import {
  buildComparison,
  clampReveal,
  findObservation,
  normalizeDate,
  observationDates,
  observationPolarizations,
  pairDates,
  processingIdentity,
  revealFromPointer,
  usablePairs,
} from "@/lib/comparison";
import type { ProductLayer, SiteManifest } from "@/lib/types";

function layer(overrides: Partial<ProductLayer> & Pick<ProductLayer, "id" | "kind">): ProductLayer {
  return {
    title: overrides.id,
    pol: "HH",
    date: null,
    pair_id: null,
    threshold_db: null,
    tile_url_template: `/products/demo/tiles/${overrides.id}/{z}/{x}/{y}.png`,
    min_zoom: 0,
    max_zoom: 12,
    legend: null,
    ...overrides,
  };
}

function manifest(overrides: Partial<SiteManifest> = {}): SiteManifest {
  const base: SiteManifest = {
    site: {
      id: "demo",
      title: "Demo site",
      event_type: "other",
      description: "Synthetic fixture",
      caveat: "Synthetic fixture data: not a real observation.",
      bbox: [0, 0, 1, 1],
      center: [0.5, 0.5],
    },
    source: {
      mission: "NISAR",
      band: "L",
      product: "GCOV",
      maturity: "PROVISIONAL",
      crid: "P05023",
      frequency: "A",
      pixel_spacing_m: 20,
      crs: "EPSG:32646",
    },
    acquisitions: [
      {
        granule: "NISAR_..._20260701T160541_..._001.h5",
        cycle: 4,
        date: "2026-07-01",
        start: "2026-07-01T16:05:41Z",
        end: "2026-07-01T16:05:50Z",
        crid: "P05023",
        coverage: "F",
        polarizations: ["HH"],
        links: {},
      },
      {
        granule: "NISAR_..._20260713T160541_..._002.h5",
        cycle: 4,
        date: "2026-07-13",
        start: "2026-07-13T16:05:41Z",
        end: "2026-07-13T16:05:50Z",
        crid: "P05023",
        coverage: "F",
        polarizations: ["HH"],
        links: {},
      },
    ],
    polarizations: [{ pol: "HH", stretch_db: [-20, -5] }],
    layers: [
      layer({ id: "backscatter-hh-2026-07-01", kind: "backscatter", date: "2026-07-01" }),
      layer({ id: "backscatter-hh-2026-07-13", kind: "backscatter", date: "2026-07-13" }),
      layer({
        id: "difference-hh-demo-pair",
        kind: "difference",
        date: null,
        pair_id: "demo-pair",
      }),
      layer({
        id: "change-hh-demo-pair-3db",
        kind: "change_mask",
        date: null,
        pair_id: "demo-pair",
        threshold_db: 3,
      }),
    ],
    pairs: [
      {
        id: "demo-pair",
        pre: "20260701",
        post: "20260713",
        label: "Synthetic before and after",
        stats: {
          HH: {
            "3.0": {
              valid_pixels: 1500,
              valid_fraction_of_bbox: 0.93,
              decrease_km2: 0.2,
              increase_km2: 0.1,
              decrease_pct: 12,
              increase_pct: 6,
              sigma_db: 1.1,
              median_diff_db: -0.4,
              histogram: [],
              resampled: false,
            },
          },
        },
      },
    ],
  };
  return { ...base, ...overrides };
}

describe("normalizeDate", () => {
  it("accepts compact pair dates", () => {
    expect(normalizeDate("20260701")).toBe("2026-07-01");
  });

  it("accepts ISO layer dates", () => {
    expect(normalizeDate("2026-07-01")).toBe("2026-07-01");
  });

  it("normalizes both shapes to the same value", () => {
    expect(normalizeDate("20260713")).toBe(normalizeDate("2026-07-13"));
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(normalizeDate("2026-02-31")).toBeNull();
  });

  it("rejects partial or malformed dates", () => {
    for (const value of ["", "2026", "2026-7-1", "202607", "not-a-date", null, undefined]) {
      expect(normalizeDate(value)).toBeNull();
    }
  });
});

describe("pairDates and usablePairs", () => {
  it("normalizes both sides of a pair", () => {
    expect(pairDates(manifest().pairs[0])).toEqual({ pre: "2026-07-01", post: "2026-07-13" });
  });

  it("drops pairs with an unreadable date", () => {
    const broken = manifest();
    broken.pairs = [...broken.pairs, { ...broken.pairs[0], id: "broken", pre: "nonsense" }];
    expect(usablePairs(broken).map((pair) => pair.id)).toEqual(["demo-pair"]);
  });
});

describe("findObservation", () => {
  it("returns the observation for an exact date", () => {
    expect(findObservation(manifest(), "HH", "2026-07-01")?.id).toBe("backscatter-hh-2026-07-01");
  });

  it("never returns a difference or change-mask product", () => {
    const onlyDifferences = manifest();
    onlyDifferences.layers = onlyDifferences.layers.filter((item) => item.kind !== "backscatter");
    expect(findObservation(onlyDifferences, "HH", "2026-07-01")).toBeNull();
  });

  it("is case-insensitive about polarization", () => {
    expect(findObservation(manifest(), "hh", "2026-07-01")?.id).toBe("backscatter-hh-2026-07-01");
  });
});

describe("observation index", () => {
  it("lists sorted observation dates", () => {
    expect(observationDates(manifest(), "HH")).toEqual(["2026-07-01", "2026-07-13"]);
  });

  it("lists only polarizations that have observations", () => {
    expect(observationPolarizations(manifest())).toEqual(["HH"]);
  });

  it("ignores difference products when listing polarizations", () => {
    const data = manifest();
    data.layers = data.layers.map((item) =>
      item.kind === "backscatter" ? item : { ...item, pol: "HV" },
    );
    expect(observationPolarizations(data)).toEqual(["HH"]);
  });
});

describe("buildComparison", () => {
  it("resolves a compact pair to two exact ISO observation layers", () => {
    const result = buildComparison(manifest(), "demo-pair", "HH");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.before.layer.id).toBe("backscatter-hh-2026-07-01");
    expect(result.selection.after.layer.id).toBe("backscatter-hh-2026-07-13");
    expect(result.selection.before.date).toBe("2026-07-01");
    expect(result.selection.after.date).toBe("2026-07-13");
  });

  it("matches when the pair itself uses ISO dates", () => {
    const data = manifest();
    data.pairs = [{ ...data.pairs[0], pre: "2026-07-01", post: "2026-07-13" }];
    expect(buildComparison(data, "demo-pair", "HH").ok).toBe(true);
  });

  it("attaches the acquisition provenance for each side", () => {
    const result = buildComparison(manifest(), "demo-pair", "HH");
    if (!result.ok) throw new Error("expected success");
    expect(result.selection.before.acquisition?.date).toBe("2026-07-01");
    expect(result.selection.after.acquisition?.granule).toContain("20260713");
  });

  it("reports the backend resampling flag", () => {
    const result = buildComparison(manifest(), "demo-pair", "HH");
    if (!result.ok) throw new Error("expected success");
    expect(result.selection.resampled).toBe(false);
  });

  it("refuses to substitute a difference product when the observation is missing", () => {
    const data = manifest();
    data.layers = data.layers.filter((item) => item.id !== "backscatter-hh-2026-07-13");
    const result = buildComparison(data, "demo-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing-observation");
    expect(result.problem.side).toBe("after");
    expect(result.problem.date).toBe("2026-07-13");
  });

  it("refuses to use a neighbouring date as a stand-in", () => {
    const data = manifest();
    data.pairs = [{ ...data.pairs[0], post: "20260712" }];
    const result = buildComparison(data, "demo-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing-observation");
    expect(result.problem.date).toBe("2026-07-12");
  });

  it("refuses a polarization that has no observations", () => {
    const result = buildComparison(manifest(), "demo-pair", "HV");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing-polarization");
    expect(result.problem.available).toEqual(["HH"]);
  });

  it("reports a missing pair with the installed pair ids", () => {
    const result = buildComparison(manifest(), "other-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing-pair");
    expect(result.problem.available).toEqual(["demo-pair"]);
  });

  it("reports an unreadable pair date rather than guessing", () => {
    const data = manifest();
    data.pairs = [{ ...data.pairs[0], pre: "unknown" }];
    const result = buildComparison(data, "demo-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("missing-pair");
  });

  it("reports a site with no pairs", () => {
    const data = manifest();
    data.pairs = [];
    const result = buildComparison(data, "demo-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("no-pairs");
  });

  it("reports a missing manifest", () => {
    const result = buildComparison(null, "demo-pair", "HH");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe("no-manifest");
  });
});

describe("reveal slider helpers", () => {
  it("clamps to 0-100", () => {
    expect(clampReveal(-20)).toBe(0);
    expect(clampReveal(120)).toBe(100);
    expect(clampReveal(42)).toBe(42);
  });

  it("falls back to the midpoint for non-finite input", () => {
    expect(clampReveal(Number.NaN)).toBe(50);
    expect(clampReveal(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it("converts a pointer position into a percentage", () => {
    expect(revealFromPointer(150, 100, 200)).toBe(25);
    expect(revealFromPointer(300, 100, 200)).toBe(100);
    expect(revealFromPointer(0, 100, 200)).toBe(0);
  });

  it("ignores a zero-width container", () => {
    expect(revealFromPointer(150, 100, 0)).toBe(50);
  });
});

describe("processingIdentity", () => {
  it("describes the mission, product and grid", () => {
    const text = processingIdentity(manifest());
    expect(text).toContain("NISAR");
    expect(text).toContain("GCOV");
    expect(text).toContain("20 m");
    expect(text).toContain("P05023");
  });

  it("returns unknown without a manifest", () => {
    expect(processingIdentity(null)).toBe("unknown");
  });
});
