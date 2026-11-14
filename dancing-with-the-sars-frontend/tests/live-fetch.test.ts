import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLiveFetchAvailable, liveFetchErrorMessage, startLiveFetch, LiveFetchError } from "@/lib/liveFetch";

afterEach(() => vi.unstubAllGlobals());

describe("same-origin live-fetch client", () => {
  it("checks the documented data-status capability flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      primary_mission: "NISAR", active_source: "NISAR", nisar_ready: true, sites_count: 1,
      live_fetch_enabled: true, message: "ready",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(checkLiveFetchAvailable()).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/data-status");
  });

  it("posts only fields supported by the backend request schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job_id: "job-012345abcdef", site_id: "anak-krakatau", status: "queued", progress: 0,
    }), { status: 202, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = {
      bbox: [105.4, -6.15, 105.55, -6.03], start_date: "2026-08-13", end_date: "2026-10-01",
      maturity: "PROVISIONAL" as const, polarizations: ["HH", "HV"], max_granules: 6, refresh: false,
    };
    const result = await startLiveFetch(request);
    expect(result).toMatchObject({ status: "queued", site_id: "anak-krakatau" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/nisar/fetch");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(request);
  });

  it("maps credential failures to operator-facing Earthdata guidance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Earthdata credentials are not configured" }), {
      status: 503, headers: { "content-type": "application/json" },
    })));
    try {
      await startLiveFetch({ bbox: [1, 1, 2, 2], start_date: "2026-08-13", end_date: "2026-10-01", maturity: "PROVISIONAL", polarizations: ["HH"], max_granules: 6, refresh: false });
      throw new Error("Expected live fetch failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LiveFetchError);
      expect(liveFetchErrorMessage(error)).toContain("Earthdata credentials are not configured on the backend");
      expect(liveFetchErrorMessage(error)).toContain("docs/LIVE_FETCH.md");
    }
  });
});
