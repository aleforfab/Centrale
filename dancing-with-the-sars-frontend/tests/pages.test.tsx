import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ApplicationsPage from "@/app/applications/page";
import SetupPage from "@/app/setup/page";
import { SiteNav } from "@/components/SiteNav";

describe("applications page", () => {
  const html = renderToStaticMarkup(<ApplicationsPage />);

  it("renders every topic title", () => {
    for (const title of ["Flooding", "Volcanoes", "Sinkholes", "Disaster damage assessment"]) {
      expect(html).toContain(title);
    }
  });

  it("labels every topic card as a learning resource", () => {
    // Each of the 12 cards carries the badge; the legend also defines the
    // stronger labels, so count the badge itself rather than any mention.
    const badges = html.match(/font-medium text-sky-200">Learning resource</g) ?? [];
    expect(badges).toHaveLength(12);
    const validatedBadges = html.match(/font-medium text-sky-200">Validated for this case</g) ?? [];
    expect(validatedBadges).toHaveLength(0);
    // The stronger label appears exactly once, as a legend definition.
    expect((html.match(/Validated for this case/g) ?? [])).toHaveLength(1);
  });

  it("states that no validated real case exists", () => {
    expect(html).toContain("holds no validated real case");
  });

  it("links to the machine-readable register", () => {
    expect(html).toContain("/resources/source-register.json");
  });

  it("admits when a fingerprint is missing instead of showing a fake hash", () => {
    expect(html).toContain("fingerprint not recorded in this repository");
  });
});

describe("setup page", () => {
  const html = renderToStaticMarkup(<SetupPage />);

  it("lists all eight gates", () => {
    for (const gate of [
      "Candidate location",
      "Actual acquisitions",
      "Resource approval",
      "Scientific checks",
      "Build and verification",
      "Interpretation review",
      "Imagery configuration",
      "Publication",
    ]) {
      expect(html).toContain(gate);
    }
  });

  it("records every gate as not recorded", () => {
    const matches = html.match(/Status: not recorded/g) ?? [];
    expect(matches).toHaveLength(8);
  });

  it("does not claim a real case has been completed", () => {
    expect(html).toContain("No real acquisition has been processed");
  });
});

describe("navigation", () => {
  it("marks the active section and links every page", () => {
    const html = renderToStaticMarkup(<SiteNav current="/compare" />);
    expect(html).toContain('aria-current="page"');
    for (const href of ["/", "/compare", "/applications", "/setup"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
