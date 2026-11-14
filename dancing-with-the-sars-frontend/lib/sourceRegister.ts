import raw from "@/public/resources/source-register.json";

/**
 * Typed view of the source register.
 *
 * The JSON is the single source of truth; this module only gives it a shape.
 * `null` in the register means "not verified in this repository". It never
 * means zero, and it is never replaced by a guessed value at display time.
 */

export interface RegisterPaper {
  id: string;
  filename: string;
  topic: string;
  sha256: string | null;
  page_count: number | null;
  publication_year: number | null;
  verification: string;
}

export interface RegisterService {
  name: string;
  url: string;
  purpose: string;
  verified_in_this_repository: boolean;
}

export interface RegisterDuplicate {
  files: string[];
  relation: string;
  verified_in_this_repository: boolean;
  note: string;
}

export interface SourceRegister {
  schema_version: number;
  record_status: "metadata-partial" | "complete";
  record_note: string;
  bibliography_scope: string;
  collection: {
    title: string;
    publisher: string;
    url: string;
    description: string;
    verified_as_direct_pdf_links: boolean;
    url_note: string;
  };
  data_services: RegisterService[];
  papers: RegisterPaper[];
  duplicates: RegisterDuplicate[];
}

export const sourceRegister = raw as unknown as SourceRegister;

export function paperFor(id: string): RegisterPaper | undefined {
  return sourceRegister.papers.find((paper) => paper.id === id);
}

/** True when every paper has a fingerprint, page count and publication year. */
export function registerIsComplete(): boolean {
  return sourceRegister.papers.every(
    (paper) => paper.sha256 !== null && paper.page_count !== null && paper.publication_year !== null,
  );
}

export function unverifiedPaperCount(): number {
  return sourceRegister.papers.filter((paper) => paper.sha256 === null).length;
}
