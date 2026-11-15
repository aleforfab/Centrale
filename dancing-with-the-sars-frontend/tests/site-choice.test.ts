// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { initialSiteId, rememberSite, requestedSiteId } from "@/lib/siteChoice";

const sites = [{ id: "anak-krakatau" }, { id: "other-site" }];

afterEach(() => { window.history.replaceState(null, "", "/time-machine"); });

it("reads a requested site from the URL and ignores malformed ids", () => {
  window.history.replaceState(null, "", "/time-machine?site=other-site");
  expect(requestedSiteId()).toBe("other-site");
  expect(initialSiteId(sites)).toBe("other-site");
  window.history.replaceState(null, "", "/time-machine?site=Not%20A%20Site");
  expect(requestedSiteId()).toBeNull();
});

it("falls back to the preferred site, then the first installed site", () => {
  expect(initialSiteId(sites)).toBe("anak-krakatau");
  expect(initialSiteId([{ id: "zeta" }, { id: "alpha" }])).toBe("zeta");
  expect(initialSiteId([])).toBe("");
  // A requested site that is not installed cannot win.
  window.history.replaceState(null, "", "/time-machine?site=missing-site");
  expect(initialSiteId(sites)).toBe("anak-krakatau");
});

it("writes the chosen site back to the URL", () => {
  window.history.replaceState(null, "", "/time-machine#compare");
  rememberSite("other-site");
  expect(window.location.search).toBe("?site=other-site");
  expect(window.location.hash).toBe("#compare");
});
