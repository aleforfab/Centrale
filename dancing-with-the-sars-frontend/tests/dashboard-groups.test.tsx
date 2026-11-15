// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProductLayer } from "@/lib/types";
const dates = ["2026-08-13", "2026-08-25", "2026-09-06", "2026-09-18", "2026-09-30"];
const pairs = dates.slice(0, 4).map((date, i) => ({ id: `pair-${i}`, pre: date.replace(/-/g, ""), post: dates[i + 1].replace(/-/g, ""), label: `Pair ${i}`, stats: {} }));
const layer = (id: string, kind: string, props: object) => ({ id, kind, pol: "HH", tile_url_template: "", min_zoom: 8, max_zoom: 14, ...props });
const manifest = {
  site: { id: "anak-krakatau", title: "Anak Krakatau", event_type: "other", description: "", caveat: "Manifest caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P05023", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: dates.map((date) => ({ date, cycle: 1, crid: "P", coverage: "F", granule: date, links: {}, polarizations: ["HH"] })),
  polarizations: [{ pol: "HH", stretch_db: [] }], pairs,
  layers: [...dates.map((date) => layer(`observation-${date}`, "backscatter", { date })), ...pairs.flatMap((pair) => [layer(`difference-${pair.id}`, "difference", { pair_id: pair.id }), ...[2, 3, 6].map((threshold) => layer(`mask-${pair.id}-${threshold}`, "change_mask", { pair_id: pair.id, threshold_db: threshold }))])],
};
vi.mock("@/lib/api", () => ({ api: { sites: vi.fn(async () => [{ id: "anak-krakatau", title: "Anak Krakatau" }]), site: vi.fn(async () => manifest), baseUrl: "" } }));
vi.mock("@/components/LiveScanPanel", () => ({ LiveScanPanel: () => null, BuiltProductsBanner: () => null }));
vi.mock("@/components/Map", () => ({ Map: ({ layers }: { layers: ProductLayer[] }) => <div data-testid="map-layers">{layers.map((l) => l.id).join(",")}</div> }));
import Home from "@/app/page";
afterEach(cleanup);
it("groups installed products and starts with the newest observation", async () => {
  render(<Home />);
  expect((await screen.findByTestId("map-layers")).textContent).toBe("observation-2026-09-30");
  expect(screen.getByRole("heading", { name: "Radar observations" })).toBeTruthy();
  expect(screen.getByText("Measured change (4 pairs)")).toBeTruthy();
  expect(screen.getAllByText("Manifest caveat").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText("2026-08-13 → 2026-08-25"));
  const drawMask = screen.getByLabelText("Draw 6 dB mask 2026-08-13 → 2026-08-25");
  fireEvent.click(drawMask);
  expect(screen.getByTestId("map-layers").textContent).toBe("mask-pair-0-6");
  expect(screen.getByText("Blue = lower return · Red = higher return.")).toBeTruthy();
});
