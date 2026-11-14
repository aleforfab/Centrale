import { describe, expect, it } from "vitest";
import { registerIsComplete, sourceRegister as register, unverifiedPaperCount } from "@/lib/sourceRegister";

describe("source register", () => {
  it("records the twelve supplied documents", () => {
    expect(register.papers).toHaveLength(12);
    expect(new Set(register.papers.map((paper) => paper.filename)).size).toBe(12);
  });

  it("keeps identifiers unique", () => {
    expect(new Set(register.papers.map((paper) => paper.id)).size).toBe(12);
  });

  it("records the owner spelling that matches the supplied files", () => {
    const filenames = register.papers.map((paper) => paper.filename);
    expect(filenames).toContain("NisarCostalRegion.pdf");
    expect(filenames).toContain("nisarinductedearthquake.pdf");
    expect(filenames).toContain("nisarManmadeHasardTexas.pdf");
  });

  it("does not invent fingerprints, page counts or years", () => {
    for (const paper of register.papers) {
      expect(paper.sha256, paper.id).toBeNull();
      expect(paper.page_count, paper.id).toBeNull();
      expect(paper.publication_year, paper.id).toBeNull();
      expect(paper.verification, paper.id).toBe("filename only");
    }
    expect(register.record_status).toBe("metadata-partial");
    expect(register.record_note.toLowerCase()).toContain("not redistributed");
  });

  it("records the duplicate pair with an explicit verification state", () => {
    expect(register.duplicates).toHaveLength(1);
    const [duplicate] = register.duplicates;
    expect(duplicate.files).toEqual(["nisarterrestialperma.pdf", "nisarpermafrost.pdf"]);
    expect(duplicate.verified_in_this_repository).toBe(false);
  });

  it("records the duplicate as one registered paper plus one extra file", () => {
    const filenames = new Set(register.papers.map((paper) => paper.filename));
    const [primary, duplicateCopy] = register.duplicates[0].files;
    // The canonical file is a register entry; the byte-identical copy is not
    // listed as a separate document, so the library cannot double-count it.
    expect(filenames.has(primary)).toBe(true);
    expect(filenames.has(duplicateCopy)).toBe(false);
  });

  it("does not present the collection URL as a direct document link", () => {
    expect(register.collection.verified_as_direct_pdf_links).toBe(false);
    expect(register.collection.url_note.toLowerCase()).toContain("not a verified");
  });

  it("states that the register is not an exhaustive bibliography", () => {
    expect(register.bibliography_scope.toLowerCase()).toContain("not an exhaustive bibliography");
  });

  it("reports the register as incomplete rather than complete", () => {
    expect(registerIsComplete()).toBe(false);
    expect(unverifiedPaperCount()).toBe(12);
  });

  it("lists data services without claiming they were verified here", () => {
    expect(register.data_services.length).toBeGreaterThanOrEqual(2);
    for (const service of register.data_services) {
      expect(service.verified_in_this_repository).toBe(false);
      expect(service.url.startsWith("https://")).toBe(true);
    }
  });
});
