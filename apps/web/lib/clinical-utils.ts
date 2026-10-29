/**
 * Clinical Utility Functions for RoundsAI
 * Implemented using strict TypeScript, discriminated unions, and pure functional logic.
 */

export type CtcaeGrade = 1 | 2 | 3 | 4 | 5;

export interface CtcaeBadgeStyle {
  label: string;
  className: string;
  bg: string;
  text: string;
  border: string;
}

export interface SeverityTheme {
  label: string;
  badgeBg: string;
  badgeText: string;
  cardBg: string;
  cardBorder: string;
}

export type TrendDirection = "up" | "down" | "stable" | "new" | "insufficient data";

export interface TrendAnalysis {
  direction: TrendDirection;
  delta: number | null;
  percentChange: number | null;
  label: string;
}

/**
 * Returns hospital-grade semantic styling for CTCAE v5.0 toxicity grading.
 */
export function getCtcaeBadgeStyle(grade: number | string | undefined | null): CtcaeBadgeStyle {
  const g = typeof grade === "string" ? parseInt(grade, 10) : grade;

  switch (g) {
    case 1:
      return {
        label: "Grade 1 (Mild)",
        className: "severity severity-1",
        bg: "#fef9c3",
        text: "#854d0e",
        border: "#fde047",
      };
    case 2:
      return {
        label: "Grade 2 (Moderate)",
        className: "severity severity-2",
        bg: "#ffedd5",
        text: "#9a3412",
        border: "#fdba74",
      };
    case 3:
      return {
        label: "Grade 3 (Severe)",
        className: "severity severity-3",
        bg: "#fee2e2",
        text: "#991b1b",
        border: "#fca5a5",
      };
    case 4:
      return {
        label: "Grade 4 (Life-threatening)",
        className: "severity severity-4",
        bg: "#7f1d1d",
        text: "#ffffff",
        border: "#991b1b",
      };
    case 5:
      return {
        label: "Grade 5 (Fatal)",
        className: "severity severity-4",
        bg: "#0f172a",
        text: "#ffffff",
        border: "#334155",
      };
    default:
      return {
        label: "Normal / Ungraded",
        className: "severity severity-0",
        bg: "#f1f5f9",
        text: "#475569",
        border: "#cbd5e1",
      };
  }
}

/**
 * Maps safety sentinel alert severities into high-contrast clinical themes.
 */
export function getSentinelSeverityTheme(severity?: string | null): SeverityTheme {
  const s = severity?.toLowerCase().trim();
  switch (s) {
    case "high":
    case "critical":
    case "emergency":
      return {
        label: "HIGH EMERGENCY",
        badgeBg: "#ef4444",
        badgeText: "#ffffff",
        cardBg: "#fef2f2",
        cardBorder: "#fca5a5",
      };
    case "medium":
    case "warning":
      return {
        label: "MEDIUM ALERT",
        badgeBg: "#f59e0b",
        badgeText: "#ffffff",
        cardBg: "#fffbeb",
        cardBorder: "#fde68a",
      };
    case "low":
      return {
        label: "LOW ADVISORY",
        badgeBg: "#0284c7",
        badgeText: "#ffffff",
        cardBg: "#f0f9ff",
        cardBorder: "#bae6fd",
      };
    default:
      return {
        label: "CLINICAL NOTE",
        badgeBg: "#64748b",
        badgeText: "#ffffff",
        cardBg: "#f8fafc",
        cardBorder: "#e2e8f0",
      };
  }
}

/**
 * Computes trajectory delta and direction between current and prior cycle labs.
 */
export function analyzeLabTrend(current?: number | null, previous?: number | null): TrendAnalysis {
  if (current === undefined || current === null || isNaN(current)) {
    return { direction: "insufficient data", delta: null, percentChange: null, label: "Insufficient data" };
  }
  if (previous === undefined || previous === null || isNaN(previous)) {
    return { direction: "new", delta: null, percentChange: null, label: "Initial baseline" };
  }

  const delta = current - previous;
  if (previous === 0) {
    return {
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable",
      delta,
      percentChange: null,
      label: delta === 0 ? "Stable" : `${delta > 0 ? "+" : ""}${delta}`,
    };
  }

  const percentChange = (delta / previous) * 100;
  if (Math.abs(percentChange) < 1.0) {
    return { direction: "stable", delta, percentChange, label: "Stable (±0%)" };
  }

  const sign = delta > 0 ? "+" : "";
  const direction: TrendDirection = delta > 0 ? "up" : "down";
  return {
    direction,
    delta,
    percentChange,
    label: `${sign}${percentChange.toFixed(1)}% (${sign}${delta})`,
  };
}

/**
 * Formats data source provenance with hospital-grade audit transparency.
 */
export function formatProvenanceBadge(source?: string | null): { label: string; bg: string; text: string } {
  const s = source?.toLowerCase().trim() || "unknown";
  if (s.includes("vision") || s.includes("image")) {
    return { label: "OCR Vision Report", bg: "#e0e7ff", text: "#3730a3" };
  }
  if (s.includes("audio") || s.includes("transcript") || s.includes("voice")) {
    return { label: "Clinician Dictation", bg: "#f0fdf4", text: "#166534" };
  }
  if (s.includes("demo")) {
    return { label: "Synthetic Demo", bg: "#fef3c7", text: "#b45309" };
  }
  if (s.includes("manual")) {
    return { label: "Manual Input", bg: "#f1f5f9", text: "#334155" };
  }
  return { label: "Clinical Record", bg: "#f8fafc", text: "#475569" };
}

export interface OncologyMetricTile {
  name: string;
  key: "anc" | "platelets" | "wbc" | "hemoglobin";
  value: number;
  unit: string;
  previousValue?: number;
  ctcaeGrade: CtcaeGrade | null;
  trend: TrendAnalysis;
  badgeStyle: CtcaeBadgeStyle;
  isNadirAlert: boolean;
}

export interface OncologyTriad {
  anc: OncologyMetricTile | null;
  platelets: OncologyMetricTile | null;
  wbc: OncologyMetricTile | null;
  hemoglobin: OncologyMetricTile | null;
}

interface RawLabItem {
  name: string;
  value: number;
  unit?: string;
  previous_value?: number;
}

/**
 * Extracts key oncology markers (ANC, Platelets, WBC, Hemoglobin) and computes CTCAE grades and cycle deltas.
 */
export function extractOncologyTriad(labs: RawLabItem[]): OncologyTriad {
  let ancItem: OncologyMetricTile | null = null;
  let pltItem: OncologyMetricTile | null = null;
  let wbcItem: OncologyMetricTile | null = null;
  let hgbItem: OncologyMetricTile | null = null;

  for (const lab of labs) {
    const n = (lab.name || "").toLowerCase().trim();
    const val = typeof lab.value === "number" ? lab.value : parseFloat(String(lab.value));
    if (isNaN(val)) continue;

    const trend = analyzeLabTrend(val, lab.previous_value);

    // ANC
    if (n.includes("anc") || n.includes("neutrophil")) {
      let grade: CtcaeGrade | null = null;
      if (val < 500) grade = 4;
      else if (val < 1000) grade = 3;
      else if (val < 1500) grade = 2;
      else if (val < 2000) grade = 1;

      ancItem = {
        name: "ANC (Absolute Neutrophils)",
        key: "anc",
        value: val,
        unit: lab.unit || "cells/µL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }

    // Platelets
    else if (n.includes("platelet") || n.includes("plt")) {
      let grade: CtcaeGrade | null = null;
      if (val < 25000) grade = 4;
      else if (val < 50000) grade = 3;
      else if (val < 75000) grade = 2;
      else if (val < 150000) grade = 1;

      pltItem = {
        name: "Platelets",
        key: "platelets",
        value: val,
        unit: lab.unit || "/µL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }

    // WBC
    else if (n.includes("wbc") || n.includes("white blood")) {
      let grade: CtcaeGrade | null = null;
      if (val < 1.0) grade = 4;
      else if (val < 2.0) grade = 3;
      else if (val < 3.0) grade = 2;

      wbcItem = {
        name: "WBC",
        key: "wbc",
        value: val,
        unit: lab.unit || "K/µL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }

    // Hemoglobin
    else if (n.includes("hemoglobin") || n.includes("hgb") || n.includes("hb")) {
      let grade: CtcaeGrade | null = null;
      if (val < 8.0) grade = 3;
      else if (val < 10.0) grade = 2;
      else if (val < 12.0) grade = 1;

      hgbItem = {
        name: "Hemoglobin",
        key: "hemoglobin",
        value: val,
        unit: lab.unit || "g/dL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }
  }

  return {
    anc: ancItem,
    platelets: pltItem,
    wbc: wbcItem,
    hemoglobin: hgbItem,
  };
}

export interface EmrClipboardParams {
  patientName?: string;
  mrn?: string;
  note: string;
  attestedBy?: string;
  attestedAt?: string;
}

/**
 * Standardizes SOAP note text for seamless 1-click clipboard paste into Epic / Cerner / Meditech EMRs.
 */
export function formatEmrClipboardNote(
  paramsOrNote: EmrClipboardParams | string,
  roundId?: string,
  patientId?: string,
  approvedBy?: string
): string {
  if (typeof paramsOrNote === "string") {
    const timestamp = new Date().toISOString();
    const attestationLine = approvedBy
      ? `Attested by: ${approvedBy} (${timestamp})`
      : `Status: Pending Clinician Attestation (Exported at ${timestamp})`;

    const header = [
      `================================================================================`,
      `[ROUNDS-AI EMR CLINICAL DOCUMENTATION]`,
      `PATIENT: ${patientId || "Unassigned"} | ROUND: ${roundId || "N/A"}`,
      attestationLine,
      `================================================================================`,
    ].join("\n");

    const cleanNote = paramsOrNote.trim();
    return `${header}\n\n${cleanNote}\n\n[End of RoundsAI Note]`;
  }

  const params = paramsOrNote;
  const timestamp = params.attestedAt || new Date().toISOString();
  const attestationLine = params.attestedBy
    ? `Attested by: ${params.attestedBy} (${timestamp})`
    : `Status: Pending Clinician Attestation (Exported at ${timestamp})`;

  const header = [
    `================================================================================`,
    `[ROUNDS-AI EMR CLINICAL DOCUMENTATION]`,
    `PATIENT: ${params.patientName || "Unassigned"} | MRN: ${params.mrn || "N/A"}`,
    attestationLine,
    `================================================================================`,
  ].join("\n");

  const cleanNote = (params.note || "").trim();

  return `${header}\n\n${cleanNote}\n\n[End of RoundsAI Note]`;
}

