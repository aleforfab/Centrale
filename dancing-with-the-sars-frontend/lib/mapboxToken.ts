/**
 * Public, client-side Mapbox token for the demo.
 *
 * This is a `pk.*` token intended to be visible in the browser bundle. It is
 * committed because the user explicitly asked for the preview to run from a
 * fresh checkout without a private `.env.local`. It grants no server-side
 * privilege, but it should still be URL-restricted in the Mapbox dashboard and
 * rotated if it is ever used outside this project.
 */
export const PUBLIC_MAPBOX_TOKEN =
  "pk.eyJ1IjoiYWxlZm9yZmFiIiwiYSI6ImNtdWg1endhZDA1OGgyeHM5bmMybzJyb20ifQ.ATSEIIgqoWvHRmomUsaCPQ";

const PUBLIC_TOKEN_PATTERN = /^pk\.[A-Za-z0-9._-]{20,}$/;

/**
 * Prefer a valid environment override; otherwise use the committed public
 * token. CI uses `dummy_token`, which must not downgrade the app to the local
 * canvas fallback.
 */
export function getMapboxToken(): string {
  const candidate = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  return PUBLIC_TOKEN_PATTERN.test(candidate) ? candidate : PUBLIC_MAPBOX_TOKEN;
}

export function hasMapboxToken(): boolean {
  return PUBLIC_TOKEN_PATTERN.test(getMapboxToken());
}
