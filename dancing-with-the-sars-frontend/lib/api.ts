import type { DataStatus, SiteManifest, SiteSummary, TimeSeriesPoint } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : JSON.stringify(detail ?? `HTTP ${response.status}`);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  baseUrl: API_BASE,
  sites: () => getJson<SiteSummary[]>("/api/sites"),
  site: (id: string) => getJson<SiteManifest>(`/api/sites/${encodeURIComponent(id)}`),
  timeseries: (id: string, pol: string) =>
    getJson<TimeSeriesPoint[]>(
      `/api/sites/${encodeURIComponent(id)}/timeseries?pol=${encodeURIComponent(pol)}`,
    ),
  dataStatus: () => getJson<DataStatus>("/api/data-status"),
};
