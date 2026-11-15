import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveScanPanel } from "@/components/LiveScanPanel";

vi.mock("@/components/RegionSelector", () => ({ RegionSelector: () => <div>Region selector</div> }));

describe("shared live scan panel", () => {
  it("renders explicit date controls with the default window and no implicit submission", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = renderToStaticMarkup(<LiveScanPanel idPrefix="test" onBuilt={() => {}} />);
      expect(html).toContain('value="2026-08-13"');
      expect(html).toContain('value="2026-10-01"');
      expect(html).toContain("Fetch real observations");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
