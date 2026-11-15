import { describe, expect, it } from "vitest";
import { DEFAULT_BBOX, formatBbox, isValidBbox } from "@/lib/region";

describe("region utilities", () => {
  it("provides and formats the default region", () => {
    expect(isValidBbox(DEFAULT_BBOX)).toBe(true);
    expect(formatBbox(DEFAULT_BBOX)).toBe("105.400, -6.150, 105.550, -6.030");
  });

  it("rejects reversed, non-finite, and out-of-range bounds", () => {
    expect(isValidBbox([105.55, -6.03, 105.4, -6.15])).toBe(false);
    expect(isValidBbox([105.4, -6.15, 200, -6.03])).toBe(false);
    expect(isValidBbox([105.4, -6.15, Number.NaN, -6.03])).toBe(false);
    expect(isValidBbox("105.4,-6.15,105.55,-6.03")).toBe(false);
  });
});
