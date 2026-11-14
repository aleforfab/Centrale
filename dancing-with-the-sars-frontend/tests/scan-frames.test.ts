import { describe, expect, it } from "vitest";
import { manifestToScanFrames } from "@/lib/scanFrames";
import type { SiteManifest } from "@/lib/types";

const manifest: SiteManifest = {
  site: {
    id: "anak-krakatau",
    title: "Anak Krakatau",
    event_type: "eruption",
    description: "Test manifest",
    caveat: "PROVISIONAL products; no validation claimed.",
    bbox: [105.39, -6.13, 105.45, -6.07],
    center: [105.42, -6.1],
  },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P05023", frequency: "A", pixel_spacing_m: 20, crs: "EPSG:4326" },
  acquisitions: [
    { granule: "NISAR_GRANULE_029_010_A_175_HH", cycle: 1, date: "2026-08-25", start: "2026-08-25T00:00:00Z", end: "2026-08-25T00:00:00Z", crid: "P05023", coverage: "F", polarizations: ["HH", "HV"], links: {} },
    { granule: "NISAR_GRANULE_028_010_A_175_HH", cycle: 1, date: "2026-08-13", start: "2026-08-13T00:00:00Z", end: "2026-08-13T00:00:00Z", crid: "P05023", coverage: "F", polarizations: ["HH", "HV"], links: {} },
  ],
  polarizations: [{ pol: "HH", stretch_db: [-25, -5] }],
  layers: [
    { id: "later", kind: "backscatter", pol: "HH", date: "2026-08-25", tile_url_template: "/products/site/later/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
    { id: "diff", kind: "difference", pol: "HH", date: "2026-08-25", tile_url_template: "/products/site/diff/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
    { id: "mask", kind: "change_mask", pol: "HH", date: "2026-08-25", tile_url_template: "/products/site/mask/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
    { id: "earlier", kind: "backscatter", pol: "HH", date: "2026-08-13", tile_url_template: "/products/site/earlier/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
    { id: "hv", kind: "backscatter", pol: "HV", date: "2026-08-13", tile_url_template: "/products/site/hv/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
    { id: "unexpected-date", kind: "backscatter", pol: "HH", date: "2026-09-12", tile_url_template: "/products/site/unexpected/{z}/{x}/{y}.png", min_zoom: 0, max_zoom: 12 },
  ],
  pairs: [],
};

describe("manifest playback frame adapter", () => {
  it("orders exact backscatter raster observations and retains provenance only", () => {
    const frames = manifestToScanFrames(manifest, "HH");
    expect(frames.map((frame) => frame.date)).toEqual(["2026-08-13", "2026-08-25"]);
    expect(frames.every((frame) => frame.layer.kind === "backscatter")).toBe(true);
    expect(frames.map((frame) => frame.layer.id)).toEqual(["earlier", "later"]);
    expect(frames[0]).toMatchObject({ polarization: "HH", granule: "NISAR_GRANULE_028_010_A_175_HH", crid: "P05023", maturity: "PROVISIONAL", source: "ASF / NASA Earthdata" });
  });

  it("filters to the requested polarization and never promotes difference or mask products", () => {
    const frames = manifestToScanFrames(manifest, "HV");
    expect(frames).toHaveLength(1);
    expect(frames[0].layer.id).toBe("hv");
    expect(frames[0].layer.kind).toBe("backscatter");
  });
});
