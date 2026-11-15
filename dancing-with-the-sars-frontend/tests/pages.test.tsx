import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteNav } from "@/components/SiteNav";

describe("navigation", () => {
  const html = renderToStaticMarkup(<SiteNav current="/time-machine" />);

  it("marks the active section and links the current routes", () => {
    expect(html).toContain('aria-current="page"');
    for (const href of ["/", "/time-machine"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("does not link the retired comparison, applications or setup routes", () => {
    expect(html).not.toContain('href="/compare"');
    expect(html).not.toContain('href="/applications"');
    expect(html).not.toContain('href="/setup"');
  });
});
