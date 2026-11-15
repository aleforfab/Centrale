/**
 * The provisional / GCOV disclaimer was removed from the UI by request. Site
 * manifests built on the VM still carry that sentence in their `caveat` (and
 * occasionally in `description`), so displayed manifest prose is scrubbed of it
 * rather than trusting the installed JSON to be clean.
 */
const REMOVED_DISCLAIMER = [
  /Real NISAR L2 GCOV \(PROVISIONAL\)[\s\S]*?reprocessed by NASA\.?/gi,
  /Backscatter change alone is not evidence of<\/?[^>]*>\s*flooding[\s\S]*?subsidence\.?/gi,
  /GCOV carries detected amplitude only[\s\S]*?ground truth have been used\.?/gi,
  /Maturity is PROVISIONAL[\s\S]*?reprocessed by NASA\.?/gi,
];

/** Remove the withdrawn disclaimer sentences from manifest prose. */
export function withoutRemovedDisclaimer(text?: string | null): string {
  if (!text) return "";
  let cleaned = text;
  for (const pattern of REMOVED_DISCLAIMER) cleaned = cleaned.replace(pattern, " ");
  return cleaned.replace(/\s{2,}/g, " ").trim();
}
