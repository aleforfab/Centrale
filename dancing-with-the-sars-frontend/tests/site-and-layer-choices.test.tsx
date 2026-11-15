// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductLayer, SiteManifest, SiteSummary } from "@/lib/types";
import { visibleSites } from "@/lib/types";
import { SiteSelector } from "@/components/SiteSelector";
import { LayerPicker, overlayCandidates } from "@/components/LayerPicker";

const state = vi.hoisted(() => ({ playback: [] as Array<{ layers: string[]; overlays: string[] }> }));

vi.mock("@/components/Map", () => ({
  Map: ({ layers, overlayLayerIds }: { layers: ProductLayer[]; overlayLayerIds?: string[] }) => {
    state.playback.push({ layers: layers.map((layer) => layer.id), overlays: overlayLayerIds ?? [] });
    return <div data-testid="playback-map">{layers.map((layer) => layer.id).join(",")}</div>;
  },
}));
vi.mock("@/components/ComparisonViewer", () => ({
  ComparisonViewer: ({ overlayLayerIds }: { overlayLayerIds?: string[] }) => (
    <div data-testid="compare-overlays">{(overlayLayerIds ?? []).join(",")}</div>
  ),
}));

import { CalendarReview } from "@/components/CalendarReview";

const layer = (id: string, kind: ProductLayer["kind"], props: Partial<ProductLayer> = {}): ProductLayer => ({
  id,
  kind,
  pol: "HH",
  date: "2027-01-10",
  tile_url_template: "",
  min_zoom: 0,
  max_zoom: 10,
  ...props,
});

const manifest: SiteManifest = {
  site: { id: "test", title: "Test", event_type: "other", description: "", caveat: "Caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:4326" },
  acquisitions: [],
  polarizations: [{ pol: "HH", stretch_db: [] }],
  pairs: [{ id: "p1", pre: "20270101", post: "20270113", label: "Pair 1", stats: {} }],
  layers: [
    layer("obs-a", "backscatter", { date: "2027-01-01" }),
    layer("obs-b", "backscatter", { date: "2027-01-13" }),
    layer("diff", "difference", { pair_id: "p1", date: undefined }),
    layer("mask", "change_mask", { pair_id: "p1", threshold_db: 6, date: undefined }),
  ],
};

const sites: SiteSummary[] = [
  { id: "demo-fixture", title: "Synthetic rehearsal site", event_type: "other", bbox: [0, 0, 1, 1], center: [0, 0], source: manifest.source, date_range: [], acquisition_count: 1, pairs: [], synthetic: true },
  { id: "anak-krakatau", title: "Anak Krakatau - NISAR GCOV 2026", event_type: "other", bbox: [0, 0, 1, 1], center: [0, 0], source: manifest.source, date_range: [], acquisition_count: 2, pairs: [], synthetic: false },
];

afterEach(() => { cleanup(); state.playback.length = 0; });

describe("site choices", () => {
  it("drops synthetic rehearsal fixtures from the catalogue", () => {
    expect(visibleSites(sites).map((site) => site.id)).toEqual(["anak-krakatau"]);
  });

  it("never offers a synthetic site in the shared picker", () => {
    render(<SiteSelector id="t" sites={sites} value="anak-krakatau" onChange={() => {}} />);
    const options = Array.from(screen.getByLabelText("Site").querySelectorAll("option")).map((option) => option.textContent);
    expect(options).toEqual(["Anak Krakatau - NISAR GCOV 2026"]);
  });
});

describe("added layers", () => {
  it("offers only installed measured-change products for the polarization", () => {
    expect(overlayCandidates(manifest, "HH").map((item) => item.id)).toEqual(["diff", "mask"]);
    expect(overlayCandidates(manifest, "VV")).toEqual([]);
  });

  it("draws an added change layer over the time machine and the before/after pair", () => {
    render(<CalendarReview manifest={manifest} />);
    fireEvent.click(screen.getByLabelText("Show Change mask · 2027-01-01 → 2027-01-13 · 6 dB"));
    const latest = state.playback.at(-1);
    expect(latest?.layers).toContain("mask");
    expect(latest?.overlays).toEqual(["mask"]);
    fireEvent.click(screen.getByRole("button", { name: "Before / after" }));
    expect(screen.getByTestId("compare-overlays").textContent).toBe("mask");
  });
});
