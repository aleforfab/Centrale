// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveScanPanel } from "@/components/LiveScanPanel";

vi.mock("@/components/RegionSelector", () => ({ RegionSelector: () => <div>Region selector</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared live scan panel", () => {
  it("rejects missing and reversed dates, and sends the selected window only on request", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/data-status") return { ok: true, json: async () => ({ live_fetch_enabled: true }) };
      if (url === "/api/nisar/fetch" && options?.method === "POST") return { ok: true, json: async () => ({ site_id: "built-site" }) };
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onBuilt = vi.fn();
    render(<LiveScanPanel idPrefix="test" onBuilt={onBuilt} />);
    const button = screen.getByRole("button", { name: "Fetch real observations" }) as HTMLButtonElement;
    const start = screen.getByLabelText("Start date") as HTMLInputElement;
    const end = screen.getByLabelText("End date") as HTMLInputElement;
    expect(start.value).toBe("2026-08-13");
    expect(end.value).toBe("2026-10-01");
    fireEvent.change(start, { target: { value: "" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(start, { target: { value: "2027-01-01" } });
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("on or before");
    fireEvent.change(end, { target: { value: "2027-02-01" } });
    expect(button.disabled).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/nisar/fetch")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(onBuilt).toHaveBeenCalledWith("built-site"));
    const request = fetchMock.mock.calls.find(([url]) => url === "/api/nisar/fetch")?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ start_date: "2027-01-01", end_date: "2027-02-01", maturity: "PROVISIONAL", polarizations: ["HH", "HV"], max_granules: 6 });
    expect(screen.getByText(/Products built/)).toBeTruthy();
  });
});
