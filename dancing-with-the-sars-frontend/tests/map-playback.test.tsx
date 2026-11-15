// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ProductLayer } from "@/lib/types";
const state = vi.hoisted(() => ({ map: null as any }));
vi.mock("@/lib/mapboxToken", () => ({ getMapboxToken: () => "test", hasMapboxToken: () => true }));
vi.mock("mapbox-gl", () => {
  class MockMap {
    handlers: Record<string, Function[]> = {};
    sources: Record<string, any> = {};
    layers: Record<string, any> = {};
    ready = false;
    setStyle = vi.fn(); remove = vi.fn();
    addSource = vi.fn((id, source) => { this.sources[id] = { ...source, setData: vi.fn(), setTiles: vi.fn() }; });
    removeSource = vi.fn((id) => { delete this.sources[id]; });
    addLayer = vi.fn((layer) => { this.layers[layer.id] = layer; });
    removeLayer = vi.fn((id) => { delete this.layers[id]; });
    setPaintProperty = vi.fn((id, prop, value) => { this.layers[id].paint[prop] = value; });
    addControl() {} fitBounds() {} moveLayer() {}
    getSource(id: string) { return this.sources[id]; }
    getLayer(id: string) { return this.layers[id]; }
    getStyle() { return { layers: Object.values(this.layers), sources: this.sources }; }
    isStyleLoaded() { return true; }
    isSourceLoaded() { return this.ready; }
    areTilesLoaded() { return this.ready; }
    on(event: string, cb: Function) { (this.handlers[event] ??= []).push(cb); }
    off(event: string, cb: Function) { this.handlers[event] = (this.handlers[event] ?? []).filter((item) => item !== cb); }
    emit(event: string) { this.handlers[event]?.forEach((cb) => cb()); }
    constructor() { state.map = this; }
  }
  return { default: { Map: MockMap, NavigationControl: class {}, ScaleControl: class {}, accessToken: "" } };
});
import { Map } from "@/components/Map";
const layer = (id: string, kind: ProductLayer["kind"]): ProductLayer => ({ id, kind, pol: "HH", date: id, tile_url_template: `/products/${id}/{z}/{x}/{y}.png`, min_zoom: 0, max_zoom: 14 });
it("preloads frames, holds the old one until ready, and only palette-colours observations", () => {
  const layers = [layer("first", "backscatter"), layer("second", "backscatter"), layer("mask", "change_mask")];
  const bbox = [0, 0, 1, 1];
  const onActiveLayerChange = vi.fn();
  const props = { layers, bbox, view: "sar" as const, setView: vi.fn(), onActiveLayerChange };
  const rendered = render(<Map {...props} activeLayerId="first" />);
  const map = state.map;
  expect(map.layers["nisar-layer-first"].paint["raster-opacity"]).toBe(0.8);
  expect(map.layers["nisar-layer-second"].layout.visibility).toBe("visible");
  expect(map.layers["nisar-layer-second"].paint["raster-opacity"]).toBe(0);
  const added = map.addSource.mock.calls.length;
  rendered.rerender(<Map {...props} activeLayerId="second" />);
  expect(map.layers["nisar-layer-first"].paint["raster-opacity"]).toBe(0.8);
  expect(map.layers["nisar-layer-second"].paint["raster-opacity"]).toBe(0);
  // A newer request cancels the pending switch, so an old idle event cannot show stale data.
  rendered.rerender(<Map {...props} activeLayerId="first" />);
  act(() => { map.ready = true; map.emit("idle"); });
  expect(map.layers["nisar-layer-first"].paint["raster-opacity"]).toBe(0.8);
  rendered.rerender(<Map {...props} activeLayerId="second" />);
  expect(map.layers["nisar-layer-first"].paint["raster-opacity"]).toBe(0);
  expect(map.layers["nisar-layer-second"].paint["raster-opacity"]).toBe(0.8);
  expect(map.addSource).toHaveBeenCalledTimes(added);
  expect(map.removeSource).not.toHaveBeenCalled();
  expect(onActiveLayerChange).toHaveBeenLastCalledWith("second");
  fireEvent.click(screen.getByRole("button", { name: "False colour: off" }));
  expect(map.layers["nisar-layer-first"].paint["raster-color"]).toBeDefined();
  expect(map.layers["nisar-layer-second"].paint["raster-color"]).toBeDefined();
  expect(map.layers["nisar-layer-mask"].paint["raster-color"]).toBeUndefined();
  rendered.unmount();
});
