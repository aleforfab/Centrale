import { describe, expect, it } from "vitest";
import { resolveTileUrl } from "@/lib/tileUrl";

const TEMPLATE = "/products/demo-fixture/tiles/backscatter-hh-2026-07-01/{z}/{x}/{y}.png";

describe("resolveTileUrl", () => {
  it("keeps Mapbox placeholders verbatim (no %7B encoding)", () => {
    const url = resolveTileUrl(TEMPLATE, "");
    expect(url).toContain("{z}/{x}/{y}");
    expect(url).not.toContain("%7B");
    expect(url).not.toContain("%7D");
  });

  it("returns the relative template unchanged when no base URL is configured (same origin)", () => {
    expect(resolveTileUrl(TEMPLATE, "")).toBe(TEMPLATE);
  });

  it("strips trailing slashes from the configured base URL", () => {
    const url = resolveTileUrl(TEMPLATE, "https://tiles.example.org/");
    expect(url).toBe(`https://tiles.example.org${TEMPLATE}`);
    expect(url).toContain("{z}/{x}/{y}");
  });

  it("returns absolute http(s) templates unchanged, even with a base URL set", () => {
    const absolute = "https://products.example.org/tiles/{z}/{x}/{y}.png";
    expect(resolveTileUrl(absolute, "https://api.example.org")).toBe(absolute);
    expect(resolveTileUrl(absolute, "")).toBe(absolute);
  });

  it("matches what Mapbox receives for the installed demo site", () => {
    // Regression for the deployed-VM bug: requests like
    // /products/.../%7Bz%7D/%7Bx%7D/%7By%7D.png returned 404.
    const url = resolveTileUrl(TEMPLATE, "");
    expect(url).toBe("/products/demo-fixture/tiles/backscatter-hh-2026-07-01/{z}/{x}/{y}.png");
  });
});
