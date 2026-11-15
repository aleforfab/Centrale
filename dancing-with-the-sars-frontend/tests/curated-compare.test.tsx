// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductLayer, SiteManifest } from "@/lib/types";

const layer = (id: string, kind: ProductLayer["kind"], extras: Partial<ProductLayer> = {}): ProductLayer => ({ id, kind, pol: "HH", tile_url_template: `/products/${id}/{z}/{x}/{y}.png`, min_zoom: 8, max_zoom: 14, ...extras });
const manifest: SiteManifest = {
  site: { id: "anak-krakatau", title: "Anak Krakatau", event_type: "volcano", description: "", caveat: "Manifest caveat", bbox: [0, 0, 1, 1], center: [0, 0] },
  source: { mission: "NISAR", band: "L", product: "GCOV", maturity: "PROVISIONAL", crid: "P05023", frequency: "A", pixel_spacing_m: 10, crs: "EPSG:32748" },
  acquisitions: [], polarizations: [{ pol: "HH", stretch_db: [] }],
  pairs: [{ id: "pair-1", pre: "20260813", post: "20260825", label: "First pair", stats: {} }, { id: "pair-2", pre: "20260825", post: "20260906", label: "Second pair", stats: {} }],
  layers: [layer("a", "backscatter", { date: "2026-08-13" }), layer("b", "backscatter", { date: "2026-08-25" }), layer("c", "backscatter", { date: "2026-09-06" }), layer("diff-1", "difference", { pair_id: "pair-1" }), layer("mask-1", "change_mask", { pair_id: "pair-1", threshold_db: 6 }), layer("diff-2", "difference", { pair_id: "pair-2" })],
};
vi.mock("@/lib/api", () => ({ api: { sites: vi.fn(async () => [{ id: "anak-krakatau", title: "Anak Krakatau" }]), site: vi.fn(async () => manifest), baseUrl: "" } }));
vi.mock("@/components/LiveScanPanel", () => ({ LiveScanPanel: () => null, BuiltProductsBanner: () => null }));
vi.mock("@/components/Map", () => ({ Map: () => <div>Timeline map</div> }));
vi.mock("@/components/ComparisonViewer", () => ({ ComparisonViewer: ({ pairId, showProducts, manifest: m }: { pairId: string; showProducts?: boolean; manifest: SiteManifest }) => <div data-testid="viewer">{pairId} · {showProducts ? m.layers.find((l) => l.pair_id === pairId && l.kind === "difference")?.id : "observations only"}</div> }));
import { CalendarReview } from "@/components/CalendarReview";

afterEach(cleanup);
describe("comparison modes", () => {
  it("uses installed pair products and never assigns an arbitrary calendar pair a product", async () => {
    render(<CalendarReview manifest={manifest} />);
    fireEvent.click(screen.getByRole("button", { name: "Before / after" }));
    expect((await screen.findByTestId("viewer")).textContent).toContain("pair-1");
    expect(screen.getByTestId("viewer").textContent).toContain("diff-1");
    fireEvent.change(screen.getByLabelText("Installed pair"), { target: { value: "pair-2" } });
    expect(screen.getByTestId("viewer").textContent).toContain("diff-2");
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "calendar" } });
    await waitFor(() => expect(screen.getByTestId("viewer").textContent).toContain("calendar-selection · observations only"));
    expect(screen.getByText(/Only installed pairs have measured difference products/)).toBeTruthy();
  });
});
