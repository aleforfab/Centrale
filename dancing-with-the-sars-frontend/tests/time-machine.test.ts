import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { POST as scanPost } from "@/app/tm/scan/route";
import { GET as frameGet } from "@/app/tm/frames/[date]/route";
import { TimeReview } from "@/components/TimeReview";
import { buildComparison } from "@/lib/comparison";
import {
  DEFAULT_BBOX,
  DEFAULT_FEATURES,
  FEATURE_OPTIONS,
  SCAN_DATES,
  SYNTHETIC_NOTICE,
  buildMockManifest,
  frameUrl,
  isFeatureId,
  isValidBbox,
  scanFrames,
  type ScanResult,
} from "@/lib/timeMachine";

const scanResult: ScanResult = {
  id: "test-scan",
  title: "Test scan",
  caveat: SYNTHETIC_NOTICE,
  notice: SYNTHETIC_NOTICE,
  bbox: DEFAULT_BBOX,
  features: DEFAULT_FEATURES,
  dateMode: "pair",
  pol: "HH",
  beforeDate: SCAN_DATES[0],
  afterDate: SCAN_DATES[SCAN_DATES.length - 1],
  dates: [...SCAN_DATES],
  frames: scanFrames(DEFAULT_BBOX, "HH", DEFAULT_FEATURES),
  displayRange: [-25, -5],
  generatedAt: "2026-11-14T00:00:00.000Z",
};

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/tm/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Time Machine scan contract", () => {
  it("rejects invalid bounding boxes", () => {
    expect(isValidBbox(DEFAULT_BBOX)).toBe(true);
    expect(isValidBbox([105.55, -6.03, 105.4, -6.15])).toBe(false);
    expect(isValidBbox([105.4, -6.15, 200, -6.03])).toBe(false);
    expect(isValidBbox("105.4,-6.15,105.55,-6.03")).toBe(false);
  });

  it("builds one same-origin frame URL per exact date", () => {
    const frames = scanFrames(DEFAULT_BBOX, "HH", DEFAULT_FEATURES);
    expect(frames).toHaveLength(SCAN_DATES.length);
    expect(new Set(frames.map((frame) => frame.date)).size).toBe(SCAN_DATES.length);
    expect(frames.every((frame) => frame.kind === "backscatter")).toBe(true);
    expect(frames.every((frame) => frame.pol === "HH")).toBe(true);
    expect(frames[0].url).toBe(frameUrl(SCAN_DATES[0], DEFAULT_BBOX, "HH", DEFAULT_FEATURES));
    expect(frames[0].url.startsWith("/tm/frames/")).toBe(true);
  });

  it("keeps difference and change-mask products out of observation layers", () => {
    const manifest = buildMockManifest(scanResult, SCAN_DATES[0], SCAN_DATES[2], "HH");
    expect(manifest.layers).toHaveLength(SCAN_DATES.length);
    expect(manifest.layers.every((layer) => layer.kind === "backscatter")).toBe(true);
    expect(manifest.layers.some((layer) => layer.kind === "difference" || layer.kind === "change_mask")).toBe(false);
    expect(manifest.layers.every((layer) => layer.pol === "HH")).toBe(true);
    expect(manifest.site.caveat).toContain("not a real observation");
  });

  it("resolves exact dates and refuses substitute dates or polarizations", () => {
    const manifest = buildMockManifest(scanResult, SCAN_DATES[0], SCAN_DATES[2], "HH");
    const okay = buildComparison(manifest, "selected-pair", "HH");
    expect(okay.ok).toBe(true);
    if (okay.ok) {
      expect(okay.selection.before.date).toBe(SCAN_DATES[0]);
      expect(okay.selection.after.date).toBe(SCAN_DATES[2]);
      expect(okay.selection.before.layer.kind).toBe("backscatter");
      expect(okay.selection.after.layer.kind).toBe("backscatter");
    }

    const wrongPol = buildComparison(manifest, "selected-pair", "HV");
    expect(wrongPol.ok).toBe(false);
    if (!wrongPol.ok) expect(wrongPol.problem.kind).toBe("missing-polarization");

    const missingDate = buildComparison(
      {
        ...manifest,
        pairs: [{ ...manifest.pairs[0], pre: "2026-09-02", post: SCAN_DATES[2] }],
      },
      "selected-pair",
      "HH",
    );
    expect(missingDate.ok).toBe(false);
    if (!missingDate.ok) {
      expect(missingDate.problem.kind).toBe("missing-observation");
      expect(missingDate.problem.message).toContain("not substituted");
    }
  });

  it("returns a scan from the selected region and features", async () => {
    const response = await scanPost(jsonRequest({
      bbox: DEFAULT_BBOX,
      features: ["backscatter", "playback", "compare"],
      dateMode: "pair",
      pol: "HH",
      beforeDate: SCAN_DATES[0],
      afterDate: SCAN_DATES[3],
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ScanResult;
    expect(body.bbox).toEqual(DEFAULT_BBOX);
    expect(body.features).toEqual(["backscatter", "playback", "compare"]);
    expect(body.dateMode).toBe("pair");
    expect(body.frames).toHaveLength(SCAN_DATES.length);
    expect(body.caveat).toContain("not NISAR observations");
  });

  it("refuses to start a scan without a region or features", async () => {
    const noRegion = await scanPost(jsonRequest({ features: ["backscatter"] }));
    expect(noRegion.status).toBe(400);
    const noFeatures = await scanPost(jsonRequest({ bbox: DEFAULT_BBOX, features: [] }));
    expect(noFeatures.status).toBe(400);
  });

  it("refuses a calendar date that is not an exact installed date", async () => {
    const response = await scanPost(jsonRequest({
      bbox: DEFAULT_BBOX,
      features: ["backscatter", "compare"],
      dateMode: "pair",
      pol: "HH",
      beforeDate: "2026-09-02",
      afterDate: SCAN_DATES[3],
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toContain("exact installed dates");
  });

  it("serves an explicitly labelled synthetic frame and rejects an unknown date", async () => {
    const known = await frameGet(
      new Request(`http://localhost/tm/frames/${SCAN_DATES[0]}?bbox=${DEFAULT_BBOX.join(",")}&pol=HH&features=backscatter`),
      { params: { date: SCAN_DATES[0] } },
    );
    expect(known.status).toBe(200);
    expect(known.headers.get("content-type")).toContain("image/svg+xml");
    const svg = await known.text();
    expect(svg).toContain("NOT A REAL OBSERVATION");
    expect(svg).toContain(SCAN_DATES[0]);

    const unknown = await frameGet(
      new Request("http://localhost/tm/frames/2026-01-01"),
      { params: { date: "2026-01-01" } },
    );
    expect(unknown.status).toBe(404);
  });
});

describe("proposed science features", () => {
  it("offers normalization and interferometry as explicit proposals, not default results", () => {
    expect(isFeatureId("normalization")).toBe(true);
    expect(isFeatureId("insar")).toBe(true);
    expect(DEFAULT_FEATURES).not.toContain("normalization");
    expect(DEFAULT_FEATURES).not.toContain("insar");
    const normalization = FEATURE_OPTIONS.find((option) => option.id === "normalization");
    const insar = FEATURE_OPTIONS.find((option) => option.id === "insar");
    expect(normalization?.label).toContain("proposed");
    expect(normalization?.description).toContain("not applied");
    expect(insar?.label).toContain("proposed");
    expect(insar?.description).toContain("phase-capable");
  });
});

describe("TimeReview server-rendered controls", () => {
  it("shows the slider, playback control, exact-date modes and synthetic notice", () => {
    const html = renderToStaticMarkup(
      React.createElement(TimeReview, { scan: scanResult, loading: false }),
    );
    expect(html).toContain('type="date"');
    expect(html).toContain("Observation date timeline");
    expect(html).toContain("Play evolution");
    expect(html).toContain("One event date");
    expect(html).toContain("Two dates to compare");
    expect(html).toContain("not a real observation");
  });

  it("disables playback when that feature was not selected", () => {
    const withoutPlayback: ScanResult = {
      ...scanResult,
      features: scanResult.features.filter((item) => item !== "playback"),
    };
    const html = renderToStaticMarkup(
      React.createElement(TimeReview, { scan: withoutPlayback, loading: false }),
    );
    expect(html).toContain("Enable “Playback” in feature choices");
    expect(html).toContain("disabled");
  });
});
