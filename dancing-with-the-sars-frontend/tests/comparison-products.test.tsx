// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductLayer, SiteManifest } from "@/lib/types";

const state = vi.hoisted(() => ({ maps: [] as any[] }));
vi.mock("@/components/Map", () => ({
  mapStyleForView: (view: string) => view === "optical" ? "optical-style" : "nisar-style",
}));
vi.mock("mapbox-gl", () => {
  class MockMap {
    handlers: Record<string, Function[]> = {};
    options: any;
    setStyle = vi.fn();
    remove = vi.fn();
    on(event: string, cb: Function) { (this.handlers[event] ??= []).push(cb); }
    off(event: string, cb: Function) { this.handlers[event] = (this.handlers[event] ?? []).filter((item) => item !== cb); }
    once() {}
    emit(event: string) { this.handlers[event]?.forEach((cb) => cb()); }
    fitBounds() {}
    isStyleLoaded() { return false; }
    constructor(options: any) { this.options = options; state.maps.push(this); }
  }
  return { default: { accessToken: "", Map: MockMap } };
});
import { ComparisonViewer } from "@/components/ComparisonViewer";

const layer = (id: string, kind: ProductLayer["kind"], props: Partial<ProductLayer>): ProductLayer => ({ id, kind, pol: "HH", tile_url_template: "", min_zoom: 0, max_zoom: 14, ...props });
const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "other", description: "", caveat: "Original caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }], pairs: [{ id: "p1", pre: "20260813", post: "20260825", label: "Pair 1", stats: {} }],
  layers: [layer("before", "backscatter", {date: "2026-08-13"}), layer("after", "backscatter", {date: "2026-08-25"}), layer("diff-1", "difference", {pair_id: "p1"}), layer("mask-6", "change_mask", {pair_id: "p1", threshold_db: 6})],
};
afterEach(() => { cleanup(); state.maps.length = 0; });

describe("before/after imagery controls", () => {
  it("omits the installed-product panel, keeps the reveal slider beside the imagery, and switches context styles", () => {
    const setView = vi.fn();
    render(<ComparisonViewer manifest={manifest} pairId="p1" pol="HH" setView={setView} />);

    expect(screen.queryByLabelText("Installed product")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Measured backscatter change/ })).toBeNull();
    const slider = screen.getByRole("slider", { name: "Reveal before and after imagery" });
    const plate = screen.getByTestId("map-before").closest(".plate");
    expect(plate).not.toBeNull();
    expect(plate?.nextElementSibling).toBe(slider.parentElement);
    expect(screen.getByRole("group", { name: "Map view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "NISAR" }).getAttribute("aria-pressed")).toBe("true");
    expect(state.maps.map((map) => map.options.style)).toEqual(["nisar-style", "nisar-style"]);

    fireEvent.click(screen.getByRole("button", { name: "Optical context" }));
    expect(setView).toHaveBeenCalledWith("optical");
    expect(state.maps.map((map) => map.setStyle.mock.calls.at(-1)?.[0])).toEqual(["optical-style", "optical-style"]);
    expect(screen.getByText("Original caveat")).toBeTruthy();
  });
});
