import type { DataStatus, SiteManifest, SiteSummary, TimeSeriesPoint } from "./types";

/**
 * Empty means "same origin": browser requests go to /api/... and /products/...
 * and Next.js rewrites them to BACKEND_URL on the server (see next.config.mjs).
 *
 * Only set NEXT_PUBLIC_API_URL when you deliberately want the browser to call a
 * different origin, for example a standalone frontend served without the Next.js
 * proxy. On the Google Cloud VM it must stay unset.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

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
