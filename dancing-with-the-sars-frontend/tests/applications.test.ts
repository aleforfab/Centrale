import { describe, expect, it } from "vitest";
import {
  APPLICATIONS,
  CAPABILITIES,
  CASE_REVIEWS,
  capabilityFor,
  registerEntryFor,
  topicsRequiringInterferometry,
} from "@/lib/applications";

describe("applications library", () => {
  it("covers twelve distinct topics", () => {
    expect(APPLICATIONS).toHaveLength(12);
    expect(new Set(APPLICATIONS.map((topic) => topic.id)).size).toBe(12);
  });

  it("gives every topic a summary, exploration, limits and required methods", () => {
    for (const topic of APPLICATIONS) {
      expect(topic.summary.length, topic.id).toBeGreaterThan(40);
      expect(topic.exploration.length, topic.id).toBeGreaterThanOrEqual(1);
      expect(topic.limitations.length, topic.id).toBeGreaterThanOrEqual(2);
      expect(topic.methodsNeeded.length, topic.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("never awards a validated label without a recorded review", () => {
    expect(CASE_REVIEWS).toHaveLength(0);
    for (const topic of APPLICATIONS) {
      expect(capabilityFor(topic.id)).toBe("learning-resource");
      expect(CAPABILITIES[capabilityFor(topic.id)].label).toBe("Learning resource");
    }
  });

  it("derives the validated label only from an explicit review", () => {
    const review = {
      applicationId: "flooding",
      reviewer: "named reviewer",
      scope: "one case",
      evidence: "recorded evidence",
      limitations: "recorded limits",
    };
    expect(capabilityFor("flooding", [review])).toBe("validated-for-this-case");
    expect(capabilityFor("landslides", [review])).toBe("learning-resource");
  });

  it("marks the topics whose central measurement needs interferometry", () => {
    const ids = topicsRequiringInterferometry().map((topic) => topic.id);
    expect(ids).toEqual([
      "glaciers-and-snow",
      "volcanoes",
      "sinkholes",
      "permafrost",
      "earthquakes-and-tectonics",
      "human-induced-earthquakes",
    ]);
  });

  it("does not claim quantitative soil-moisture retrieval", () => {
    const topic = APPLICATIONS.find((item) => item.id === "water-and-soil-moisture");
    const text = topic?.limitations.join(" ").toLowerCase() ?? "";
    expect(text).toContain("does not retrieve");
  });

  it("does not claim displacement in centimetres", () => {
    const topic = APPLICATIONS.find((item) => item.id === "earthquakes-and-tectonics");
    const text = topic?.limitations.join(" ").toLowerCase() ?? "";
    expect(text).toContain("not derived by this pipeline");
  });

  it("references a registered source document for every topic", () => {
    for (const topic of APPLICATIONS) {
      const entry = registerEntryFor(topic);
      expect(entry, topic.id).toBeDefined();
      expect(entry?.filename).toBe(topic.sourceFilename);
    }
  });

  it("keeps register ids unique per topic", () => {
    const ids = APPLICATIONS.map((topic) => topic.registerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
