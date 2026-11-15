import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarReview, calendarDatesInRange } from "@/components/CalendarReview";
import type { SiteManifest, ProductLayer } from "@/lib/types";

vi.mock("@/components/Map", () => ({ Map: ({ layers }: { layers: ProductLayer[] }) => <div>{layers.map((layer) => layer.id).join(",")}</div> }));
vi.mock("@/components/ComparisonViewer", () => ({ ComparisonViewer: () => <div>Exact comparison</div> }));
const layer = (id: string, date: string, kind: ProductLayer["kind"] = "backscatter"): ProductLayer => ({ id, date, kind, pol: "HH", tile_url_template: "", min_zoom: 0, max_zoom: 10 });
const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "test", description: "", caveat: "Synthetic, not evidence.", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 20, crs: "EPSG:4326" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }], pairs: [],
  layers: [layer("first", "2027-01-01"), layer("middle", "2027-01-10"), layer("last", "2027-02-01"), layer("difference", "2027-01-15", "difference"), layer("mask", "2027-01-20", "change_mask")],
};
describe("Time Machine calendar playback", () => {
  it("renders arbitrary backscatter dates and excludes derived products", () => {
    const html = renderToStaticMarkup(<CalendarReview manifest={manifest} />);
    expect(html).toContain("2027-01-10");
    expect(html).toContain("Frame 1 / 3");
    expect(html).not.toContain("2027-01-15");
    expect(html).not.toContain("2027-01-20");
  });
  it("includes only exact dates in the inclusive range and rejects missing or reversed endpoints", () => {
    const dates = ["2027-01-01", "2027-01-10", "2027-02-01"];
    expect(calendarDatesInRange(dates, "2027-01-10", "2027-02-01")).toEqual(["2027-01-10", "2027-02-01"]);
    expect(calendarDatesInRange(dates, "2027-01-10", "2027-01-15")).toEqual([]);
    expect(calendarDatesInRange(dates, "2027-02-01", "2027-01-01")).toEqual([]);
    expect(calendarDatesInRange(dates, "2027-01-10", "2027-01-10")).toEqual(["2027-01-10"]);
  });
});
