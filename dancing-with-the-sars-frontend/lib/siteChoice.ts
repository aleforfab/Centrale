/**
 * The chosen site lives in `?site=<id>` so the dashboard, the time machine and
 * the before/after workspace all open on the site the reader picked last.
 * Values are read/written only in the browser; SSR renders the default site.
 */
const PARAM = "site";

export function requestedSiteId(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

export function rememberSite(siteId: string): void {
  if (typeof window === "undefined" || !siteId) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(PARAM) === siteId) return;
  url.searchParams.set(PARAM, siteId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** First site to show: the requested one when installed, else the preferred id, else the first. */
export function initialSiteId(sites: Array<{ id: string }>, preferred = "anak-krakatau"): string {
  const requested = requestedSiteId();
  if (requested && sites.some((site) => site.id === requested)) return requested;
  return sites.find((site) => site.id === preferred)?.id ?? sites[0]?.id ?? "";
}
