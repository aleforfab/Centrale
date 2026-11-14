import { SCAN_DATES } from "@/lib/timeMachine";

export const dynamic = "force-dynamic";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number, index: number, salt: number): number {
  const raw = Math.sin(seed * 0.0001 + index * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgFrame(date: string, bbox: string, pol: string, features: string): string {
  const seed = hashString(`${date}|${bbox}|${pol}|${features}`);
  const dateIndex = Math.max(0, SCAN_DATES.indexOf(date as (typeof SCAN_DATES)[number]));
  const speckle = Array.from({ length: 170 }, (_, index) => {
    const x = unit(seed, index, 1) * 1200;
    const y = unit(seed, index, 2) * 900;
    const radius = 1 + unit(seed, index, 3) * 5;
    const opacity = 0.05 + unit(seed, index, 4) * 0.22;
    const shade = Math.round(90 + unit(seed, index, 5) * 150);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="rgb(${shade},${shade},${shade})" opacity="${opacity.toFixed(2)}"/>`;
  }).join("");

  const brightRadius = 120 + dateIndex * 14;
  const flowWidth = 130 + dateIndex * 18;
  const featureList = features
    .split(",")
    .filter(Boolean)
    .slice(0, 4)
    .map((item, index) => `<text x="${28 + index * 172}" y="842" class="chip">${escapeXml(item)}</text>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900" role="img" aria-label="Synthetic radar-like frame for ${escapeXml(date)}">
  <defs>
    <radialGradient id="island" cx="52%" cy="48%" r="38%">
      <stop offset="0%" stop-color="#e8edf0" stop-opacity="0.74"/>
      <stop offset="48%" stop-color="#8b9aa5" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#1b2731" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="flow" x1="50%" y1="40%" x2="82%" y2="88%">
      <stop offset="0%" stop-color="#ff9b5a" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ff9b5a" stop-opacity="0"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 9999}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
    </filter>
    <style>
      .label { font: 600 22px ui-monospace, monospace; fill: #dfeaf1; }
      .small { font: 500 16px ui-monospace, monospace; fill: #9fb2c4; }
      .chip { font: 600 14px ui-monospace, monospace; fill: #7dd8ec; }
      .warning { font: 700 15px ui-monospace, monospace; fill: #ffd27d; }
    </style>
  </defs>
  <rect width="1200" height="900" fill="#071018"/>
  <rect width="1200" height="900" fill="url(#island)"/>
  <rect width="1200" height="900" filter="url(#grain)" opacity="0.55"/>
  <ellipse cx="610" cy="440" rx="${brightRadius}" ry="${(brightRadius * 0.72).toFixed(1)}" fill="#d7e2e8" opacity="0.12"/>
  <path d="M 610 430 C 700 500, 760 610, 900 760 L ${900 - flowWidth} 780 C 720 640, 660 540, 590 470 Z" fill="url(#flow)" opacity="0.8"/>
  ${speckle}
  <g opacity="0.18" stroke="#7dd8ec" stroke-width="1">
    ${Array.from({ length: 11 }, (_, index) => `<line x1="${index * 120}" y1="0" x2="${index * 120}" y2="900"/>`).join("")}
    ${Array.from({ length: 8 }, (_, index) => `<line x1="0" y1="${index * 120}" x2="1200" y2="${index * 120}"/>`).join("")}
  </g>
  <rect x="24" y="24" width="1152" height="852" fill="none" stroke="#7dd8ec" stroke-opacity="0.35" stroke-width="2"/>
  <text x="40" y="64" class="label">SYNTHETIC ${escapeXml(pol)} BACKSCATTER</text>
  <text x="40" y="92" class="small">${escapeXml(date)} · display -25 to -5 dB · bbox ${escapeXml(bbox)}</text>
  <text x="1160" y="64" text-anchor="end" class="warning">NOT A REAL OBSERVATION</text>
  <text x="40" y="878" class="small">Procedural illustration only — no satellite measurement, no validated result.</text>
  ${featureList}
</svg>`;
}

export async function GET(
  request: Request,
  { params }: { params: { date: string } },
): Promise<Response> {
  const date = params.date;
  if (!SCAN_DATES.includes(date as (typeof SCAN_DATES)[number])) {
    return new Response("Unknown synthetic frame date", { status: 404 });
  }

  const url = new URL(request.url);
  const bbox = url.searchParams.get("bbox") ?? "105.4,-6.15,105.55,-6.03";
  const pol = url.searchParams.get("pol") ?? "HH";
  const features = url.searchParams.get("features") ?? "backscatter";

  return new Response(svgFrame(date, bbox, pol, features), {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
