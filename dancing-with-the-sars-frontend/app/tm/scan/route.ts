import {
  DEFAULT_POL,
  SCAN_DATES,
  SYNTHETIC_NOTICE,
  isFeatureId,
  isValidBbox,
  scanFrames,
  type FeatureId,
  type ScanRequest,
  type ScanResult,
} from "@/lib/timeMachine";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  let payload: Partial<ScanRequest>;
  try {
    payload = (await request.json()) as Partial<ScanRequest>;
  } catch {
    return json({ detail: "Scan request must be valid JSON." }, 400);
  }

  if (!isValidBbox(payload.bbox)) {
    return json({ detail: "Select a valid map region before starting a scan." }, 400);
  }

  const rawFeatures = Array.isArray(payload.features) ? payload.features : [];
  const features = rawFeatures.filter(
    (item): item is FeatureId => typeof item === "string" && isFeatureId(item),
  );
  if (features.length === 0) {
    return json({ detail: "Select at least one feature to visualise." }, 400);
  }

  const dateMode = payload.dateMode === "single" || payload.dateMode === "pair"
    ? payload.dateMode
    : "both";
  const pol = typeof payload.pol === "string" && /^(HH|HV|VV|VH)$/i.test(payload.pol)
    ? payload.pol.toUpperCase()
    : DEFAULT_POL;

  const requestedBefore = payload.beforeDate;
  const requestedAfter = payload.afterDate;
  const invalidDate =
    (requestedBefore !== undefined && !SCAN_DATES.includes(requestedBefore as (typeof SCAN_DATES)[number])) ||
    (requestedAfter !== undefined && !SCAN_DATES.includes(requestedAfter as (typeof SCAN_DATES)[number]));
  if (invalidDate) {
    return json({ detail: "Choose exact installed dates. No substitute date is used." }, 400);
  }

  const beforeDate = requestedBefore;
  const afterDate = requestedAfter;
  if (dateMode === "pair" && (!beforeDate || !afterDate || beforeDate >= afterDate)) {
    return json(
      { detail: "Choose two exact installed dates in chronological order. No substitute date is used." },
      400,
    );
  }

  const result: ScanResult = {
    id: "prototype-scan",
    title: "Selected region · synthetic time machine",
    caveat: SYNTHETIC_NOTICE,
    notice: SYNTHETIC_NOTICE,
    bbox: payload.bbox,
    features,
    dateMode,
    pol,
    beforeDate,
    afterDate,
    dates: [...SCAN_DATES],
    frames: scanFrames(payload.bbox, pol, features),
    displayRange: [-25, -5],
    generatedAt: new Date().toISOString(),
  };

  return json(result);
}
