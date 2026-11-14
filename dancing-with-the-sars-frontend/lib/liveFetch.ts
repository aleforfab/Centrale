import type { DataStatus, SiteManifest } from "./types";

export type FetchJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface LiveFetchRequest {
  bbox: number[];
  start_date: string;
  end_date: string;
  maturity: "PROVISIONAL" | "BETA";
  polarizations: string[];
  max_granules: number;
  refresh: boolean;
}

export interface FetchJob {
  job_id: string;
  site_id: string;
  status: FetchJobStatus;
  stage?: string;
  progress?: number;
  message?: string;
  error?: string | null;
  result?: LiveFetchResult | null;
}

export interface LiveFetchResult {
  site_id: string;
  manifest_url: string;
  tiles_url: string;
  granules: string[];
  acquisition_count: number;
  layers: number;
  generated_at: string;
  cached?: boolean;
}

export type LiveFetchFailureKind = "credentials" | "disabled" | "size-limit" | "http";

export class LiveFetchError extends Error {
  constructor(
    message: string,
    readonly kind: LiveFetchFailureKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LiveFetchError";
  }
}

async function responseError(response: Response): Promise<LiveFetchError> {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  const detail = body?.detail;
  const message = typeof detail === "string"
    ? detail
    : detail && typeof detail === "object" && "message" in detail
      ? String((detail as { message: unknown }).message)
      : `Live fetch request failed (HTTP ${response.status}).`;
  const lower = message.toLowerCase();
  const kind: LiveFetchFailureKind = response.status === 404 || /disabled|not enabled/.test(lower)
    ? "disabled"
    : /credential|earthdata|token|username|password|authentication|unauthorized/.test(lower)
      ? "credentials"
      : response.status === 413 || /size limit|too large|exceeds.*size|maximum.*bytes/.test(lower)
        ? "size-limit"
        : "http";
  return new LiveFetchError(message, kind, response.status);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function checkLiveFetchAvailable(): Promise<boolean> {
  const response = await fetch("/api/data-status", { cache: "no-store" });
  const status = await json<DataStatus>(response);
  return status.live_fetch_enabled === true;
}

export async function startLiveFetch(request: LiveFetchRequest): Promise<FetchJob | LiveFetchResult> {
  const response = await fetch("/api/nisar/fetch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await json<FetchJob | LiveFetchResult & { status: "succeeded"; job_id: null }>(response);
  return body;
}

export async function getFetchJob(jobId: string): Promise<FetchJob> {
  return json<FetchJob>(await fetch(`/api/nisar/fetch/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" }));
}

export async function cancelFetchJob(jobId: string): Promise<FetchJob> {
  return json<FetchJob>(await fetch(`/api/nisar/fetch/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }));
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchManifest(siteId: string): Promise<SiteManifest> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}`, { cache: "no-store" });
  return json<SiteManifest>(response);
}

export function liveFetchErrorMessage(error: unknown): string {
  if (error instanceof LiveFetchError && error.kind === "credentials") {
    return "Earthdata credentials are not configured on the backend — see docs/LIVE_FETCH.md.";
  }
  if (error instanceof LiveFetchError && error.kind === "size-limit") {
    return `The requested live-fetch stack exceeded a configured size limit. ${error.message}`;
  }
  return error instanceof Error ? error.message : "The live-fetch request could not be completed.";
}
