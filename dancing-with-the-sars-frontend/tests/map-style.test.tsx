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
    addControl() {}
    on(event: string, cb: Function) { (this.handlers[event] ??= []).push(cb); }
    off(event: string, cb: Function) { this.handlers[event] = (this.handlers[event] ?? []).filter((item) => item !== cb); }
    emit(event: string, data?: unknown) { this.handlers[event]?.forEach((cb) => cb(data)); }
    fitBounds() {}
    isStyleLoaded() { return false; }
    constructor() { state.instances.push(this); }
  }
  return { default: { Map: MockMap, NavigationControl: class {}, ScaleControl: class {}, accessToken: "" } };
});
import { Map } from "@/components/Map";

describe("map basemap lifecycle", () => {
  it("does not reset the shared style on view changes and applies fallback only once", () => {
    state.instances.length = 0;
    const bbox = [0, 0, 1, 1];
    const layers: never[] = [];
    const setView = vi.fn();
    const view = render(<Map bbox={bbox} layers={layers} view="optical" setView={setView} />);
    const map = state.instances[0];
    expect(map.setStyle).not.toHaveBeenCalled();
    view.rerender(<Map bbox={bbox} layers={layers} view="sar" setView={setView} />);
    expect(map.setStyle).not.toHaveBeenCalled();
    act(() => { map.emit("error", { error: new Error("401 style") }); map.emit("error", { error: new Error("403 style") }); });
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    view.rerender(<Map bbox={bbox} layers={layers} view="optical" setView={setView} />);
    expect(map.setStyle).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
