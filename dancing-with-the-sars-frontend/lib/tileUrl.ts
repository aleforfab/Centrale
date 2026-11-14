/**
 * Resolve a product raster tile template for Mapbox GL.
 *
 * Templates contain Mapbox placeholders ({z}/{x}/{y}) that must survive
 * verbatim to Mapbox, which substitutes them per tile request. Never pass a
 * template through the WHATWG URL parser: it percent-encodes the braces
 * ({z} -> %7Bz%7D) and every tile request 404s.
 *
 * Behaviour:
 * - absolute http(s) template: returned unchanged (tiles fetched from that origin);
 * - otherwise: the configured base URL prefix is prepended (defaults to "",
 *   i.e. the same origin). The template is deliberately NOT URL-parsed.
 */
export function resolveTileUrl(template: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(template)) {
    return template;
  }
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${template}`;
}
