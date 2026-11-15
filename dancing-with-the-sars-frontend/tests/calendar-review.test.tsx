// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarReview } from "@/components/CalendarReview";
import type { SiteManifest, ProductLayer } from "@/lib/types";

vi.mock("@/components/Map", () => ({ Map: ({ layers }: { layers: ProductLayer[] }) => <div data-testid="map-layer">{layers.map((layer) => layer.id).join(",")}</div> }));
vi.mock("@/components/ComparisonViewer", () => ({ ComparisonViewer: () => <div>Exact comparison</div> }));
afterEach(cleanup);
const layer = (id: string, date: string, kind: ProductLayer["kind"] = "backscatter"): ProductLayer => ({ id, date, kind, pol: "HH", tile_url_template: "", min_zoom: 0, max_zoom: 10 });
const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "test", description: "", caveat: "Synthetic, not evidence.", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 20, crs: "EPSG:4326" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }], pairs: [],
  layers: [layer("first", "2027-01-01"), layer("middle", "2027-01-10"), layer("last", "2027-02-01"), layer("difference", "2027-01-15", "difference"), layer("mask", "2027-01-20", "change_mask")],
};
describe("Time Machine calendar playback", () => {
  it("plays only exact observations inside the selected inclusive range and refuses missing endpoints", () => {
    render(<CalendarReview manifest={manifest} />);
    expect(screen.getByText(/Frame 1 \/ 3/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Before date"), { target: { value: "2027-01-10" } });
    expect(screen.getByText(/Frame 1 \/ 2/)).toBeTruthy();
    expect(screen.getByTestId("map-layer").textContent).toBe("middle");
    fireEvent.change(screen.getByLabelText("Observation timeline"), { target: { value: "1" } });
    expect(screen.getByTestId("map-layer").textContent).toBe("last");
    fireEvent.change(screen.getByLabelText("After date"), { target: { value: "2027-01-15" } });
    expect(screen.getByRole("status").textContent).toContain("Choose exact installed dates");
    expect(screen.queryByTestId("map-layer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Before / after" }));
    expect(screen.queryByText("Exact comparison")).toBeNull();
    fireEvent.change(screen.getByLabelText("After date"), { target: { value: "2027-01-01" } });
    expect(screen.getByRole("status").textContent).toContain("on or before");
  });
});
