// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductLayer, SiteManifest } from "@/lib/types";
vi.mock("@/components/Map", () => ({ Map: ({ layers }: { layers: ProductLayer[] }) => <div data-testid="change-map">{layers.map((layer) => layer.id).join(",")}</div> }));
vi.mock("mapbox-gl", () => ({ default: { accessToken: "", Map: class { on() {} off() {} once() {} isStyleLoaded() { return false; } remove() {} } } }));
import { ComparisonViewer } from "@/components/ComparisonViewer";
const layer = (id: string, kind: ProductLayer["kind"], props: Partial<ProductLayer>): ProductLayer => ({ id, kind, pol: "HH", tile_url_template: "", min_zoom: 0, max_zoom: 14, ...props });
const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "other", description: "", caveat: "Original caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }], pairs: [{ id: "p1", pre: "20260813", post: "20260825", label: "Pair 1", stats: {} }],
  layers: [layer("before", "backscatter", {date: "2026-08-13"}), layer("after", "backscatter", {date: "2026-08-25"}), layer("diff-other", "difference", {pair_id: "other"}), layer("diff-1", "difference", {pair_id: "p1"}), layer("mask-6", "change_mask", {pair_id: "p1", threshold_db: 6})],
};
afterEach(cleanup);
describe("installed pair products", () => {
  it("draws the exact pair difference and the chosen categorical mask over the after image", () => {
    render(<ComparisonViewer manifest={manifest} pairId="p1" pol="HH" showProducts />);
    expect(screen.getByTestId("change-map").textContent).toBe("diff-1,after");
    fireEvent.change(screen.getByLabelText("Installed product"), { target: { value: "6" } });
    expect(screen.getByTestId("change-map").textContent).toBe("mask-6,after");
    expect(screen.getByText(/Categorical mask: blue = lower return/)).toBeTruthy();
    expect(screen.getByText("Original caveat")).toBeTruthy();
  });
});
