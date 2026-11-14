import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteNav } from "@/components/SiteNav";

describe("navigation", () => {
  const html = renderToStaticMarkup(<SiteNav current="/compare" />);

  it("marks the active section and links the current routes", () => {
    expect(html).toContain('aria-current="page"');
    for (const href of ["/", "/compare", "/time-machine"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("does not link the retired applications or setup routes", () => {
    expect(html).not.toContain('href="/applications"');
    expect(html).not.toContain('href="/setup"');
  });
});
