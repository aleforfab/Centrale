// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SiteManifest } from "@/lib/types";
const state = vi.hoisted(() => ({ maps: [] as any[] }));
vi.mock("@/components/Map", () => ({ mapStyleForView: (view: string) => view === "optical" ? "optical-style" : "nisar-style" }));
vi.mock("mapbox-gl", () => {
  class MockMap {
    sources: Record<string, any> = {}; layers: Record<string, any> = {};
    setPaintProperty = vi.fn();
    on() {} off() {} once() {} remove() {} isStyleLoaded() { return true; }
    getSource(id: string) { return this.sources[id]; }
    getLayer(id: string) { return this.layers[id]; }
    addSource(id: string, source: any) { this.sources[id] = { ...source, setTiles: vi.fn() }; }
    addLayer(layer: any) { this.layers[layer.id] = layer; }
    constructor() { state.maps.push(this); }
  }
  return { default: { accessToken: "", Map: MockMap } };
});
import { ComparisonViewer } from "@/components/ComparisonViewer";
const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "other", description: "", caveat: "Caveat", bbox: [0,0,1,1], center: [0,0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }],
  pairs: [{ id: "pair", pre: "20260813", post: "20260825", label: "Pair", stats: {} }],
  layers: [
    { id: "before", kind: "backscatter", pol: "HH", date: "2026-08-13", tile_url_template: "", min_zoom: 0, max_zoom: 14 },
    { id: "after", kind: "backscatter", pol: "HH", date: "2026-08-25", tile_url_template: "", min_zoom: 0, max_zoom: 14 },
    { id: "difference", kind: "difference", pol: "HH", pair_id: "pair", tile_url_template: "", min_zoom: 0, max_zoom: 14 },
  ],
};
afterEach(cleanup);
it("applies the same display palette to both comparison observations", () => {
  state.maps.length = 0;
  render(<ComparisonViewer manifest={manifest} pairId="pair" pol="HH" />);
  fireEvent.click(screen.getByRole("button", { name: "False colour: off" }));
  expect(state.maps[0].setPaintProperty).toHaveBeenCalledWith("comparison-before-raster", "raster-color", expect.any(Array));
  expect(state.maps[1].setPaintProperty).toHaveBeenCalledWith("comparison-after-raster", "raster-color", expect.any(Array));
  expect(screen.getByRole("button", { name: "False colour: on" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "False colour: on" }));
  expect(state.maps[0].setPaintProperty).toHaveBeenLastCalledWith("comparison-before-raster", "raster-color", undefined);
  expect(state.maps[1].setPaintProperty).toHaveBeenLastCalledWith("comparison-after-raster", "raster-color", undefined);
  expect(screen.getByRole("button", { name: "False colour: off" })).toBeTruthy();
});
