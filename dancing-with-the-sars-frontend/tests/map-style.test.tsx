// @vitest-environment jsdom
import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock("@/lib/mapboxToken", () => ({ getMapboxToken: () => "test", hasMapboxToken: () => true }));
vi.mock("mapbox-gl", () => {
  class MockMap {
    handlers: Record<string, Function[]> = {};
    setStyle = vi.fn();
    remove = vi.fn();
    style: unknown;
    addControl() {}
    on(event: string, cb: Function) { (this.handlers[event] ??= []).push(cb); }
    off(event: string, cb: Function) { this.handlers[event] = (this.handlers[event] ?? []).filter((item) => item !== cb); }
    emit(event: string, data?: unknown) { this.handlers[event]?.forEach((cb) => cb(data)); }
    fitBounds() {}
    isStyleLoaded() { return false; }
    constructor(options: { style: unknown }) { this.style = options.style; state.instances.push(this); }
  }
  return { default: { Map: MockMap, NavigationControl: class {}, ScaleControl: class {}, accessToken: "" } };
});
import { Map, mapStyleForView } from "@/components/Map";

describe("map basemap lifecycle", () => {
  it("uses distinct Optical and NISAR Mapbox styles, then applies fallback only once", () => {
    expect(mapStyleForView("optical")).toBe("mapbox://styles/mapbox/satellite-streets-v12");
    expect(mapStyleForView("sar")).toBe("mapbox://styles/mapbox/dark-v11");

    state.instances.length = 0;
    const bbox = [0, 0, 1, 1];
    const layers: never[] = [];
    const setView = vi.fn();
    const view = render(<Map bbox={bbox} layers={layers} view="optical" setView={setView} />);
    const map = state.instances[0];
    expect(map.style).toBe("mapbox://styles/mapbox/satellite-streets-v12");
    expect(map.setStyle).not.toHaveBeenCalled();

    view.rerender(<Map bbox={bbox} layers={layers} view="sar" setView={setView} />);
    expect(map.setStyle).toHaveBeenCalledWith("mapbox://styles/mapbox/dark-v11");
    view.rerender(<Map bbox={bbox} layers={layers} view="optical" setView={setView} />);
    expect(map.setStyle).toHaveBeenLastCalledWith("mapbox://styles/mapbox/satellite-streets-v12");

    act(() => { map.emit("error", { error: new Error("401 style") }); map.emit("error", { error: new Error("403 style") }); });
    expect(map.setStyle).toHaveBeenCalledTimes(3);
    view.rerender(<Map bbox={bbox} layers={layers} view="sar" setView={setView} />);
    expect(map.setStyle).toHaveBeenCalledTimes(3);
    view.unmount();
  });
});
