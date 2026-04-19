/**
 * Lightweight validation / issue list for extraction quality (machine-readable).
 * Heavy repairs run in extractionRepairs + analysisEngine.assembleAnalysis.
 */

export type ValidationSeverity = "error" | "warning" | "info";

export interface ExtractionValidationIssue {
  severity: ValidationSeverity;
  field: string;
  type: string;
  message: string;
  suggestedAction?: string;
}
