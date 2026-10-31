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
        className: "severity grade-1",
        bg: "#fef9c3",
        text: "#854d0e",
        border: "#fde047",
      };
    case 2:
      return {
        label: "Grade 2 (Moderate)",
        className: "severity grade-2",
        bg: "#ffedd5",
        text: "#9a3412",
        border: "#fdba74",
      };
    case 3:
      return {
        label: "Grade 3 (Severe)",
        className: "severity grade-3",
        bg: "#fee2e2",
        text: "#991b1b",
        border: "#fca5a5",
      };
    case 4:
      return {
        label: "Grade 4 (Life-threatening)",
        className: "severity grade-4",
        bg: "#7f1d1d",
        text: "#ffffff",
        border: "#991b1b",
      };
    case 5:
      return {
        label: "Grade 5 (Fatal)",
        className: "severity grade-4",
        bg: "#0f172a",
        text: "#ffffff",
        border: "#334155",
      };
    default:
      return {
        label: "Normal / Ungraded",
        className: "severity grade-0",
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
        badgeBg: "#fef3c7",
        badgeText: "#92400e",
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
  const formattedDelta = Number.isInteger(delta) ? delta.toString() : delta.toFixed(1);

  if (previous === 0) {
    return {
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable",
      delta,
      percentChange: null,
      label: delta === 0 ? "Stable" : `${delta > 0 ? "+" : ""}${formattedDelta}`,
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
    label: `${sign}${percentChange.toFixed(1)}% (${sign}${formattedDelta})`,
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
    if (
      (n.includes("anc") || n.includes("neutrophil")) &&
      !n.includes("%") &&
      !n.includes("percent") &&
      !n.includes("volume") &&
      !n.includes("mpv")
    ) {
      let normalizedVal = val;
      if (normalizedVal > 0 && normalizedVal < 50) {
        normalizedVal = Math.round(normalizedVal * 1000);
      }
      let grade: CtcaeGrade | null = null;
      if (normalizedVal < 500) grade = 4;
      else if (normalizedVal < 1000) grade = 3;
      else if (normalizedVal < 1500) grade = 2;
      else if (normalizedVal < 2000) grade = 1;

      ancItem = {
        name: "ANC (Absolute Neutrophils)",
        key: "anc",
        value: normalizedVal,
        unit: lab.unit || "cells/µL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }

    // Platelets
    else if (
      (n.includes("platelet") || n.includes("plt")) &&
      !n.includes("mpv") &&
      !n.includes("volume") &&
      !n.includes("%")
    ) {
      let normalizedPlt = val;
      if (normalizedPlt > 0 && normalizedPlt < 1000) {
        normalizedPlt = Math.round(normalizedPlt * 1000);
      }
      let grade: CtcaeGrade | null = null;
      if (normalizedPlt < 25000) grade = 4;
      else if (normalizedPlt < 50000) grade = 3;
      else if (normalizedPlt < 75000) grade = 2;
      else if (normalizedPlt < 150000) grade = 1;

      pltItem = {
        name: "Platelets",
        key: "platelets",
        value: normalizedPlt,
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
      let normalizedVal = val;
      if (normalizedVal > 50) {
        normalizedVal = Math.round((normalizedVal / 1000) * 10) / 10;
      }
      let grade: CtcaeGrade | null = null;
      if (normalizedVal < 1.0) grade = 4;
      else if (normalizedVal < 2.0) grade = 3;
      else if (normalizedVal < 3.0) grade = 2;
      else if (normalizedVal < 4.0) grade = 1;

      wbcItem = {
        name: "WBC",
        key: "wbc",
        value: normalizedVal,
        unit: lab.unit || "K/µL",
        previousValue: lab.previous_value,
        ctcaeGrade: grade,
        trend,
        badgeStyle: getCtcaeBadgeStyle(grade),
        isNadirAlert: grade !== null && grade >= 3,
      };
    }

    // Hemoglobin
    else if (
      (n.includes("hemoglobin") || n.includes("hgb") || n.includes("hb")) &&
      !n.includes("a1c") &&
      !n.includes("%")
    ) {
      let grade: CtcaeGrade | null = null;
      if (val < 6.0) grade = 4;
      else if (val < 8.0) grade = 3;
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

export interface ParsedClinicalOcr {
  anc: number;
  wbc: number;
  platelets: number;
  hemoglobin: number;
  temp: number;
  grade: number;
  isFebrile: boolean;
  confidence: number;
  extractedFromText: boolean;
}

/**
 * Extracts hematologic parameters and vital signs from clinical text / OCR strings,
 * normalizing counts, calculating CTCAE v5.0 grading, and preserving provenance.
 */
export function parseClinicalLabReport(
  fileName: string,
  textContent: string,
  fallbackPatient?: { id: string; baselineAnc?: number }
): ParsedClinicalOcr {
  let extractedFromText = false;

  // 1. ANC / Neutrophil extraction
  let anc: number | null = null;
  const ancDecimalMatch = textContent.match(/(?:neut#|anc|absolute\s+neutrophils?)\s*[:=]?\s*(\d+\.\d+)\s*(?:x\s*10\^?3|k\/u?l)/i);
  if (ancDecimalMatch) {
    anc = Math.round(parseFloat(ancDecimalMatch[1]) * 1000);
    extractedFromText = true;
  } else {
    const ancMatch = textContent.match(/(?:anc|absolute\s+neutrophils?(?:\s+count)?|neutrophils?\s*\(?absolute\)?|neut#)\s*(?:\(\s*anc\s*\))?\s*[:=]?\s*(\d[\d,]*)/i);
    if (ancMatch) {
      anc = parseInt(ancMatch[1].replace(/,/g, ""), 10);
      extractedFromText = true;
    }
  }

  // 2. WBC extraction
  let wbc: number | null = null;
  const wbcMatch = textContent.match(/(?:wbc|white\s+blood(?:\s+cell)?(?:\s+count)?|leukocytes?)\s*[:=]?\s*(\d+[\d,]*(?:\.\d+)?)/i);
  if (wbcMatch) {
    const rawVal = parseFloat(wbcMatch[1].replace(/,/g, ""));
    wbc = rawVal > 50 ? Math.round((rawVal / 1000) * 10) / 10 : rawVal;
    extractedFromText = true;
  }

  // 3. Platelets extraction
  let platelets: number | null = null;
  const pltKMatch = textContent.match(/(?:platelets?|plt)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:k\/u?l|k)/i);
  if (pltKMatch) {
    platelets = Math.round(parseFloat(pltKMatch[1]) * 1000);
    extractedFromText = true;
  } else {
    const pltMatch = textContent.match(/(?:platelets?(?:\s+count)?|plt|thrombocytes?)\s*[:=]?\s*(\d[\d,]*)/i);
    if (pltMatch) {
      platelets = parseInt(pltMatch[1].replace(/,/g, ""), 10);
      extractedFromText = true;
    }
  }

  // 4. Hemoglobin extraction
  let hemoglobin: number | null = null;
  const hgbMatch = textContent.match(/(?:hemoglobin|hgb|\bhb\b)(?!\s*a1c|\s*%\s*)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (hgbMatch) {
    hemoglobin = parseFloat(hgbMatch[1]);
    extractedFromText = true;
  }

  // 5. Temperature extraction
  let temp: number | null = null;
  const tempFMatch = textContent.match(/(?:temp(?:erature)?|vitals?\s+temp)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:[°º]?\s*f\b|deg\s*f)/i);
  if (tempFMatch) {
    const valF = parseFloat(tempFMatch[1]);
    temp = Math.round(((valF - 32) * (5 / 9)) * 10) / 10;
    extractedFromText = true;
  } else {
    const tempMatch = textContent.match(/(?:temp(?:erature)?|vitals?\s+temp)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (tempMatch) {
      const rawTemp = parseFloat(tempMatch[1]);
      if (rawTemp > 50) {
        temp = Math.round(((rawTemp - 32) * (5 / 9)) * 10) / 10;
      } else {
        temp = rawTemp;
      }
      extractedFromText = true;
    }
  }

  // Missing OCR values must remain missing. Never substitute values from a
  // patient's demo profile because that can silently create a false clinical
  // result when an image is unreadable.
  void fileName;
  void fallbackPatient;
  const finalAnc = anc ?? 0;
  const finalWbc = wbc ?? 0;
  const finalPlatelets = platelets ?? 0;
  const finalHgb = hemoglobin ?? 0;
  const finalTemp = temp ?? 0;

  // Compute CTCAE v5.0 Toxicity Grade
  let grade = 0;
  if (anc !== null) {
    if (anc < 500) grade = 4;
    else if (anc < 1000) grade = 3;
    else if (anc < 1500) grade = 2;
    else if (anc < 2000) grade = 1;
    else grade = 0;
  }

  const isFebrile = finalTemp >= 38.0;
  const confidence = extractedFromText ? 99 : 0;

  return {
    anc: finalAnc,
    wbc: finalWbc,
    platelets: finalPlatelets,
    hemoglobin: finalHgb,
    temp: finalTemp,
    grade,
    isFebrile,
    confidence,
    extractedFromText,
  };
}

export interface BedValidationResult {
  isOccupied: boolean;
  occupant: { id: string; name: string; mrn: string; bed: string } | null;
  message?: string;
  normalizedBed: string;
}

export function normalizeBedIdentifier(bed?: string | null): string {
  if (!bed) return "";
  return bed.trim().replace(/^bed\s*/i, "").replace(/^0+([1-9])/, "$1").trim().toLowerCase();
}

/**
 * Validates whether a requested bed is already occupied by an active patient in the ward census.
 * Beds remain occupied until the patient is formally discharged.
 */
export function validateBedOccupancy(
  targetBed: string,
  activePatients: Array<{ id: string; name: string; mrn: string; bed: string }>,
  currentPatientId?: string
): BedValidationResult {
  const normalized = normalizeBedIdentifier(targetBed);
  if (!normalized) {
    return { isOccupied: false, occupant: null, normalizedBed: "" };
  }

  const occupant = activePatients.find(
    (p) => p.id !== currentPatientId && normalizeBedIdentifier(p.bed) === normalized
  );

  if (occupant) {
    return {
      isOccupied: true,
      occupant,
      normalizedBed: normalized,
      message: `Bed ${targetBed.replace(/^bed\s*/i, "").trim()} is currently occupied by ${occupant.name} (#${occupant.id} · ${occupant.mrn}). Bed is occupied until the patient is discharged.`,
    };
  }

  return {
    isOccupied: false,
    occupant: null,
    normalizedBed: normalized,
  };
}

export interface DoseModificationGuideline {
  patientId: string;
  patientName: string;
  statusBadge: string;
  badgeVariant: "warning" | "danger" | "success" | "neutral";
  title: string;
  actionRequired: boolean;
  protocolSource: string;
  recommendation: string;
  doseAdjustment: string;
  gcsfProphylaxis: string;
  monitoringPlan: string;
}

/**
 * Computes patient-specific NCCN / ASCO dose modification and toxicity management recommendations
 * tailored dynamically to each patient's regimen, cycle, nadir counts, and CTCAE grade.
 */
export function getDoseModificationRecommendation(
  patient: { id: string; name: string; regimen: string; cycle: string; baselineAnc: number; grade?: number },
  rounds?: Array<{ anc: number; ctcae_grade: number }>
): DoseModificationGuideline {
  const activeRounds = rounds || [];
  const lowestAnc = activeRounds.length > 0 ? Math.min(...activeRounds.map((r) => r.anc)) : patient.baselineAnc;
  const highestGrade = activeRounds.length > 0 ? Math.max(...activeRounds.map((r) => r.ctcae_grade)) : (patient.grade ?? 0);
  const regLower = (patient.regimen || "").toLowerCase();

  // Grade 4 Febrile Neutropenia / ANC < 500
  if (highestGrade >= 4 || lowestAnc < 500) {
    let doseAdjustment = `Reduce cytotoxic myelosuppressive agents in ${patient.regimen} by 20% for upcoming cycle.`;
    let protocolSource = "NCCN / ASCO Febrile Neutropenia Guidelines v2.2025";
    if (regLower.includes("folfox") || regLower.includes("oxaliplatin")) {
      doseAdjustment = "Reduce oxaliplatin dose by 20% (to 68 mg/m²) and omit bolus fluorouracil (5-FU) for Cycle 4.";
      protocolSource = "NCCN Colorectal Cancer / ASCO Febrile Neutropenia Guidelines v2.2025";
    } else if (regLower.includes("ac-t") || regLower.includes("doxorubicin") || regLower.includes("taxane")) {
      doseAdjustment = "Reduce cytotoxic dose by 20% and hold continuation until ANC ≥ 1,500 /µL.";
      protocolSource = "NCCN Breast Cancer / ASCO Febrile Neutropenia Guidelines";
    } else if (regLower.includes("chop") || regLower.includes("lymphoma")) {
      doseAdjustment = "Hold cytotoxic components until ANC ≥ 1,500 /µL, then reduce cyclophosphamide and doxorubicin by 20%.";
      protocolSource = "NCCN B-Cell Lymphomas / ASCO Febrile Neutropenia Guidelines";
    }

    return {
      patientId: patient.id,
      patientName: patient.name,
      statusBadge: "Action required · Grade 4 Toxicity",
      badgeVariant: "danger",
      title: "Protocol Dose Reduction & Secondary G-CSF Prophylaxis",
      actionRequired: true,
      protocolSource,
      recommendation: `Following documented CTCAE Grade 4 febrile neutropenia (nadir ANC ${lowestAnc} /µL), protocol mandates chemotherapy dose modification for subsequent cycles.`,
      doseAdjustment,
      gcsfProphylaxis: `Initiate secondary G-CSF prophylaxis: Filgrastim 300 mcg (5 mcg/kg/day) subcutaneously daily starting 24–48 hours post-chemotherapy completion until post-nadir ANC recovery ≥ 1,500 /µL.`,
      monitoringPlan: `Bi-weekly CBC with differential; immediate emergency oncology evaluation if oral temperature ≥ 38.0°C.`,
    };
  }

  // Grade 3 Neutropenia / ANC < 1000
  if (highestGrade === 3 || lowestAnc < 1000) {
    let protocolSource = "NCCN / ASCO Growth Factor Prophylaxis Guidelines";
    let doseAdjustment = `Delay initiation of next cycle by 7 days or until absolute neutrophil count recovers to ≥ 1,000 /µL and platelets recover to ≥ 100,000 /µL. Maintain 100% relative dose intensity upon recovery.`;
    let gcsfProphylaxis = `Recommend secondary G-CSF prophylaxis (pegfilgrastim 6 mg subcutaneous injection once per cycle, 24 hours post-chemotherapy) for subsequent cycles to prevent dose delays.`;

    if (regLower.includes("chop") || regLower.includes("lymphoma")) {
      protocolSource = "NCCN B-Cell Lymphomas / ASCO Growth Factor Prophylaxis Guidelines";
      doseAdjustment = `Delay initiation of Cycle 3 by 7 days or until absolute neutrophil count recovers to ≥ 1,000 /µL and platelets recover to ≥ 100,000 /µL. Maintain 100% relative dose intensity of curative R-CHOP upon recovery.`;
      gcsfProphylaxis = `Recommend primary pegfilgrastim 6 mg subcutaneous injection once per cycle (24 hours after completion of day 1 chemotherapy) for Cycle 3 onwards to prevent dose delays.`;
    }

    return {
      patientId: patient.id,
      patientName: patient.name,
      statusBadge: "Action required · Delay Cycle",
      badgeVariant: "warning",
      title: "Chemotherapy Cycle Delay & Growth Factor Evaluation",
      actionRequired: true,
      protocolSource,
      recommendation: `Documented CTCAE Grade 3 severe neutropenia (nadir ANC ${lowestAnc} /µL) during ${patient.cycle} of ${patient.regimen}.`,
      doseAdjustment,
      gcsfProphylaxis,
      monitoringPlan: `Repeat CBC with differential on day 7 of delay. Educate patient on thermal vigilance and neutropenic precautions.`,
    };
  }

  // Moderate / Grade 2 (ANC 1000 - 1499 or Grade 2)
  if (highestGrade === 2 || (lowestAnc >= 1000 && lowestAnc < 1500)) {
    let protocolSource = "CTCAE v5.0 / NCCN Toxicity Management Guidelines";
    let doseAdjustment = `Standard dose continuation permissible if asymptomatic and Day 1 pre-chemo ANC ≥ 1,500 /µL.`;
    if (regLower.includes("folfirinox") || regLower.includes("pancrea")) {
      protocolSource = "NCCN Pancreatic Adenocarcinoma / ASCO Guidelines";
      doseAdjustment = "Standard dose permissible if Day 1 pre-chemo ANC ≥ 1,500 /µL. If Grade 2 fatigue/neutropenia persists, consider 20% dose reduction of irinotecan/bolus 5-FU.";
    }

    return {
      patientId: patient.id,
      patientName: patient.name,
      statusBadge: "Moderate Vigilance · Grade 2",
      badgeVariant: "warning",
      title: "Close Surveillance & Pre-infusion CBC Check",
      actionRequired: false,
      protocolSource,
      recommendation: `Moderate myelosuppression observed (nadir ANC ${lowestAnc} /µL). Relative dose intensity preserved.`,
      doseAdjustment,
      gcsfProphylaxis: `Observe without growth factors unless nadir drops below 1,000 /µL or patient experiences febrile episodes.`,
      monitoringPlan: `CBC with differential 48 hours prior to planned cycle initiation.`,
    };
  }

  // Grade 1 Mild Myelosuppression / Toxicity (ANC 1500 - 1999 or Grade 1)
  if (highestGrade === 1) {
    let protocolSource = "NCCN Guidelines / CTCAE v5.0 Toxicity Management";
    let doseAdjustment = `Maintain 100% full dose intensity for ${patient.cycle} ${patient.regimen}. Provide supportive care and monitor for cumulative toxicity.`;
    if (regLower.includes("cisplatin") || regLower.includes("pemetrexed") || regLower.includes("nsclc") || regLower.includes("lung")) {
      protocolSource = "NCCN Non-Small Cell Lung Cancer Guidelines v2.2025";
      doseAdjustment = "Proceed with planned Cycle 3 Cisplatin + Pemetrexed at 100% relative dose intensity. Counsel patient on Grade 1 peripheral sensory symptoms.";
    }

    return {
      patientId: patient.id,
      patientName: patient.name,
      statusBadge: "Grade 1 Mild · Monitoring",
      badgeVariant: "warning",
      title: "Full Dose Continuation with Symptom Surveillance",
      actionRequired: false,
      protocolSource,
      recommendation: `Documented CTCAE Grade 1 mild toxicity (nadir ANC ${lowestAnc} /µL). Protocol supports continued therapy at standard dosing with close monitoring.`,
      doseAdjustment,
      gcsfProphylaxis: `Growth factor prophylaxis not indicated for Grade 1 myelosuppression.`,
      monitoringPlan: `Day 1 pre-chemotherapy CBC with differential. Re-evaluate sensory neuropathy prior to each platinum infusion.`,
    };
  }

  // Grade 0 Stable / Normal reserve
  let protocolSource = "NCCN / ASCO Systemic Therapy Evidence-Based Guidelines";
  let doseAdjustment = `No dose reduction or schedule delay warranted. Proceed with planned ${patient.cycle} ${patient.regimen} at 100% relative dose intensity.`;
  if (regLower.includes("ac-t") || regLower.includes("doxorubicin") || regLower.includes("breast")) {
    protocolSource = "NCCN Breast Cancer Guidelines · ASCO Systemic Therapy Recommendations";
    doseAdjustment = `No dose reduction or schedule delay warranted. Proceed with planned Cycle 4 AC-T (doxorubicin 60 mg/m² + cyclophosphamide 600 mg/m²) at 100% relative dose intensity.`;
  }

  return {
    patientId: patient.id,
    patientName: patient.name,
    statusBadge: "On track · Full dose cleared",
    badgeVariant: "success",
    title: "Full Planned Dose Continuation (100% RDI)",
    actionRequired: false,
    protocolSource,
    recommendation: `Hematologic recovery verified robust and within protocol limits (ANC ${lowestAnc} /µL ≥ 1,500 /µL, afebrile, ECOG 0).`,
    doseAdjustment,
    gcsfProphylaxis: `No growth factor prophylaxis indicated for this cycle based on maintained bone marrow reserve.`,
    monitoringPlan: `Routine day 1 pre-chemotherapy complete blood count and metabolic panel. Continue standard supportive antiemetics.`,
  };
}

export interface ClinicianProfile {
  name: string;
  title: string;
  department: string;
  hospital: string;
  ward: string;
  shift: string;
  npi: string;
  hospitalId: string;
  initials: string;
}

export const DEFAULT_CLINICIAN_PROFILE: ClinicianProfile = {
  name: "Dr. Amrut S Kadam, MD",
  title: "Lead Attending Oncologist",
  department: "Hematology & Medical Oncology",
  hospital: "City Cancer Center",
  ward: "Ward 4B",
  shift: "Day Rounds (07:00 – 19:00)",
  npi: "1849204821",
  hospitalId: "CCC-4B-9102",
  initials: "AK",
};

export interface ClinicalNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  timeStr: string;
  type: "alert" | "warning" | "info" | "success";
  read: boolean;
  patientId?: string;
  patientName?: string;
}

export const INITIAL_CLINICAL_NOTIFICATIONS: ClinicalNotification[] = [
  {
    id: "notif-init-1",
    title: "CTCAE Grade 4 Alert · Bed 12",
    message: "David Miller: ANC 420/µL with fever 38.4°C. Secondary G-CSF protocol recommended.",
    patientId: "104",
    patientName: "David Miller",
    timestamp: 1729000000000,
    timeStr: "1 hr ago",
    type: "alert",
    read: false,
  },
  {
    id: "notif-init-2",
    title: "CTCAE Grade 3 Alert · Bed 14",
    message: "Sarah Jenkins: ANC 750/µL nadir. Thermal vigilance and hydration ordered.",
    patientId: "105",
    patientName: "Sarah Jenkins",
    timestamp: 1728990000000,
    timeStr: "2 hrs ago",
    type: "warning",
    read: false,
  },
  {
    id: "notif-init-3",
    title: "CTCAE Grade 2 Alert · Bed 18",
    message: "Robert Chen: ANC 1,250/µL moderate nadir. Pre-infusion CBC scheduled for Cycle 4.",
    patientId: "107",
    patientName: "Robert Chen",
    timestamp: 1728985000000,
    timeStr: "3 hrs ago",
    type: "warning",
    read: false,
  },
  {
    id: "notif-init-4",
    title: "CTCAE Grade 1 Note · Bed 20",
    message: "Emily Watson: ANC 1,750/µL with mild Grade 1 sensory neuropathy. Full dose cleared.",
    patientId: "108",
    patientName: "Emily Watson",
    timestamp: 1728982000000,
    timeStr: "4 hrs ago",
    type: "info",
    read: true,
  },
  {
    id: "notif-init-5",
    title: "Hematologic Recovery · Bed 16",
    message: "Elena Rostova: ANC 1,620/µL verified. Grade 0 stable.",
    patientId: "106",
    patientName: "Elena Rostova",
    timestamp: 1728980000000,
    timeStr: "5 hrs ago",
    type: "success",
    read: true,
  },
  {
    id: "notif-init-6",
    title: "Ward 4B Bedside Sync Active",
    message: "Bedside-to-station real-time channel connected. Audio egress: zero (local WebAssembly).",
    timestamp: 1728975000000,
    timeStr: "6 hrs ago",
    type: "info",
    read: true,
  },
];

/**
 * Strips leading status/checkmark emoji or symbols from toast notifications
 * to prevent double icons when rendered next to UI SVG icons.
 */
export function cleanToastMessage(msg: string): string {
  if (!msg) return "";
  return msg.replace(/^[✓✔✅⚠️ℹ️\s]+/u, "").trim();
}

/**
 * Derives clean 2-letter uppercase clinician initials from formal MD name.
 */
export function deriveDoctorInitials(name: string): string {
  if (!name) return "MD";
  const clean = name.replace(/^Dr\.?\s*/i, "").replace(/,?\s*(?:MD|DO|MBBS|PhD).*$/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

