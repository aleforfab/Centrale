// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProductLayer } from "@/lib/types";
const dates = ["2026-08-13", "2026-08-25", "2026-09-06", "2026-09-18", "2026-09-30"];
const manifest = {
  site: { id: "anak-krakatau", title: "Anak Krakatau", event_type: "other", description: "", caveat: "Manifest caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P05023", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }], pairs: [],
  layers: dates.map((date) => ({ id: date, kind: "backscatter", pol: "HH", date, tile_url_template: "", min_zoom: 8, max_zoom: 14 })),
};
vi.mock("@/lib/api", () => ({ api: { sites: vi.fn(async () => [{ id: "anak-krakatau", title: "Anak Krakatau" }]), site: vi.fn(async () => manifest), baseUrl: "" } }));
vi.mock("@/components/LiveScanPanel", () => ({ LiveScanPanel: () => <p>Live fetch disabled</p>, BuiltProductsBanner: () => null }));
vi.mock("@/components/Map", () => ({ Map: ({ layers }: { layers: ProductLayer[] }) => <div>{layers.map((l) => l.id).join(",")}</div> }));
vi.mock("@/components/ComparisonViewer", () => ({ ComparisonViewer: () => null }));
import TimeMachinePage from "@/app/time-machine/page";
afterEach(cleanup);
it("loads five installed frames and keeps the dashboard site selector in playback and before/after", async () => {
  render(<TimeMachinePage />);
  expect(await screen.findByText(/Frame 1 \/ 5/)).toBeTruthy();
  const availability = screen.getByText(/Available HH dates:/).textContent ?? "";
  for (const date of dates) expect(availability).toContain(date);
  expect(screen.getByText("Live fetch disabled")).toBeTruthy();
  const siteSelect = screen.getByLabelText("Site") as HTMLSelectElement;
  expect(siteSelect.value).toBe("anak-krakatau");
  expect(siteSelect.options[0].text).toBe("Anak Krakatau");

  fireEvent.click(screen.getByRole("button", { name: "Before / after" }));
  expect(screen.getByLabelText("Site")).toBeTruthy();
});
