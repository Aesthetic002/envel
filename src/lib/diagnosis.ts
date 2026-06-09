/**
 * Shared types for the AI leaf-disease diagnosis feature.
 * The /api/diagnose route returns a `Diagnosis`; the dashboard renders it.
 */

export type Confidence = "High" | "Medium" | "Low";
export type Severity = "Mild" | "Moderate" | "Severe" | "None";

export interface Diagnosis {
  /** Probable disease / disorder name, or "Healthy" / "Inconclusive". */
  probableDisease: string;
  /** How sure the model is, given a single field photo. */
  confidence: Confidence;
  /** Visual severity of the problem on the leaf. */
  severity: Severity;
  /** 1-2 sentence plain-language summary of what's seen and likely cause. */
  summary: string;
  /** Other conditions the user should rule out (differential diagnosis). */
  alsoConsider: string[];
  /** Irrigation guidance (more/less water, timing). */
  irrigation: string;
  /** Soil amendments — compounds to add or avoid, pH notes. */
  soil: string;
  /** Fertiliser type, NPK ratio, and approximate dosage. */
  fertiliser: string;
  /** Direct treatment (fungicide/bactericide/cultural control), incl. organic option. */
  treatment: string;
  /** Preventive practices going forward. */
  prevention: string;
  /** Mandatory safety caveat shown to the user. */
  caveat: string;
}

/** A lightweight version stored in history (no need to keep every field). */
export interface DiagnosisSummary {
  probableDisease: string;
  confidence: Confidence;
  severity: Severity;
}
