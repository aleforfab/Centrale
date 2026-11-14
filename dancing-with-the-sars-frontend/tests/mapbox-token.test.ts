import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_MAPBOX_TOKEN,
  getMapboxToken,
  hasMapboxToken,
} from "@/lib/mapboxToken";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public Mapbox token", () => {
  it("ships a valid public token from a fresh checkout", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    expect(PUBLIC_MAPBOX_TOKEN).toMatch(/^pk\.[A-Za-z0-9._-]{20,}$/);
    expect(getMapboxToken()).toBe(PUBLIC_MAPBOX_TOKEN);
    expect(hasMapboxToken()).toBe(true);
  });

  it("ignores CI dummy values instead of disabling the basemap", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "dummy_token");
    expect(getMapboxToken()).toBe(PUBLIC_MAPBOX_TOKEN);
  });

  it("allows a valid environment override", () => {
    const override = "pk.override-token-abcdefghijklmnopqrstuvwxyz";
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", override);
    expect(getMapboxToken()).toBe(override);
  });
});
