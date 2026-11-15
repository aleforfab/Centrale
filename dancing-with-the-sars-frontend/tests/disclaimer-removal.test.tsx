import { expect, it } from "vitest";
import { withoutRemovedDisclaimer } from "@/lib/disclaimer";

const REMOVED =
  "Real NISAR L2 GCOV (PROVISIONAL) radar backscatter change, not a validated hazard product. " +
  "Backscatter change alone is not evidence of flooding, damage or subsidence. " +
  "GCOV carries detected amplitude only, so no interferometric phase, no deformation measurement, " +
  "and no ground truth have been used. Maturity is PROVISIONAL: the products are not validated and " +
  "may be reprocessed by NASA.";

it("strips the withdrawn disclaimer from manifest prose but keeps the rest", () => {
  expect(withoutRemovedDisclaimer(`Anak Krakatau. ${REMOVED}`)).toBe("Anak Krakatau.");
  expect(withoutRemovedDisclaimer(REMOVED)).toBe("");
  expect(withoutRemovedDisclaimer("Two ascending acquisitions over the caldera.")).toBe(
    "Two ascending acquisitions over the caldera.",
  );
  expect(withoutRemovedDisclaimer(undefined)).toBe("");
});
