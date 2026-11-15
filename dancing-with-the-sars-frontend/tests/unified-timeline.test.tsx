// @vitest-environment jsdom
import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ProductLayer, SiteManifest } from "@/lib/types";
const calls = vi.hoisted(() => ({ layers: [] as ProductLayer[][] }));
vi.mock("@/components/Map", () => ({ Map: ({ layers, activeLayerId, onActiveLayerChange, falseColor, onFalseColorChange, view, setView }: { layers: ProductLayer[]; activeLayerId: string; onActiveLayerChange: (id: string) => void; falseColor: boolean; onFalseColorChange: (value: boolean) => void; view: "optical" | "sar"; setView: (value: "optical" | "sar") => void }) => {
  calls.layers.push(layers);
  useEffect(() => { onActiveLayerChange(activeLayerId); }, [activeLayerId, onActiveLayerChange]);
  return <>
    <span>Playback view {view}</span>
    <button onClick={() => setView("optical")}>Select Optical context</button>
    <button onClick={() => setView("sar")}>Select NISAR</button>
    <button onClick={() => onFalseColorChange(!falseColor)}>Palette {falseColor ? "on" : "off"}</button>
  </>;
} }));
vi.mock("@/components/ComparisonViewer", () => ({ ComparisonViewer: ({ falseColor, view }: { falseColor: boolean; view: "optical" | "sar" }) => <div>Compare palette {falseColor ? "on" : "off"} · {view}</div> }));
import { CalendarReview } from "@/components/CalendarReview";
const dates = ["2026-08-13", "2026-08-25", "2026-09-06"];
const manifest: SiteManifest = {
  site: { id: "site", title: "Site", event_type: "other", description: "", caveat: "Caveat", bbox: [0,0,1,1], center: [0,0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }],
  layers: dates.map((date) => ({ id: date, kind: "backscatter", pol: "HH", date, tile_url_template: "", min_zoom: 0, max_zoom: 14 })),
  pairs: [{ id: "pair", pre: "20260813", post: "20260825", label: "Pair", stats: {} }],
};
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("switches dates without remounting the frame set, plays and keeps the palette when switching to comparison", () => {
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  calls.layers.length = 0;
  render(<CalendarReview manifest={manifest} />);
  expect(screen.getByText(/Frame 1 \/ 3/)).toBeTruthy();
  const initial = calls.layers.at(-1);
  fireEvent.click(screen.getByRole("button", { name: "2026-09-06" }));
  expect(screen.getByText(/Frame 3 \/ 3/)).toBeTruthy();
  expect(calls.layers.at(-1)).toBe(initial);
  fireEvent.change(screen.getByLabelText("After date"), { target: { value: "2026-08-25" } });
  expect(calls.layers.at(-1)).toBe(initial);
  fireEvent.change(screen.getByLabelText("After date"), { target: { value: "2026-09-06" } });
  fireEvent.click(screen.getByRole("button", { name: "2026-09-06" }));
  fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
  act(() => { vi.advanceTimersByTime(1200); });
  expect(screen.getByText(/Frame 1 \/ 3/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Palette off" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Optical context" }));
  fireEvent.click(screen.getByRole("button", { name: "Before / after" }));
  expect(screen.getByText("Compare palette on · optical")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Time Machine" }));
  expect(screen.getByRole("button", { name: "Palette on" })).toBeTruthy();
  expect(screen.getByText("Playback view optical")).toBeTruthy();
});
