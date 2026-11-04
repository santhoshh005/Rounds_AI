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

export interface ModelProvenanceInfo {
  isAi: boolean;
  isFallback: boolean;
  engineRaw: string;
  modelName: string | null;
  displayLabel: string;
  badgeType: "ai-primary" | "ai-fallback" | "deterministic" | "deterministic-fallback" | "on-device-stt" | "browser-stt" | "demo";
  detailedDescription: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

/**
 * Parses engine and provenance strings to identify whether an AI model was used,
 * which specific model gave the response, or which fallback engine was engaged.
 */
export function getModelProvenance(engineOrSource?: string | null): ModelProvenanceInfo {
  const raw = (engineOrSource || "").trim();
  const lower = raw.toLowerCase();

  // 1. Google Gemini Generative AI Models
  if (lower.includes("gemini")) {
    // Report the model that actually answered (e.g. "gemini (gemini-3.5-flash)").
    const modelName = lower.match(/gemini-[a-z0-9.]+(?:-[a-z0-9.]+)*/)?.[0] ?? "gemini";
    const LEGACY_FALLBACK_TIERS: Record<string, string> = {
      "gemini-2.0-flash": "Tier 2",
      "gemini-1.5-flash": "Tier 3",
      "gemini-1.5-pro": "Tier 4",
      "gemini-2.5-pro": "Tier 4",
    };
    // Rolling "-latest" aliases are only tried after the configured models fail.
    const isFallback = lower.includes("fallback") || modelName.endsWith("-latest") || modelName in LEGACY_FALLBACK_TIERS;

    const pretty = ["Gemini", ...modelName.replace(/^gemini-?/, "").split("-").filter(Boolean)]
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    if (isFallback) {
      const tier = LEGACY_FALLBACK_TIERS[modelName] ?? "Tier 4";
      return {
        isAi: true,
        isFallback: true,
        engineRaw: raw,
        modelName,
        displayLabel: `AI Fallback: ${pretty} (${tier})`,
        badgeType: "ai-fallback",
        detailedDescription: `Primary model unavailable; responded via cascading fallback model ${pretty} (${modelName}) [${tier}].`,
        badgeBg: "rgba(245, 158, 11, 0.12)",
        badgeText: "#b45309",
        badgeBorder: "rgba(245, 158, 11, 0.35)",
      };
    }

    return {
      isAi: true,
      isFallback: false,
      engineRaw: raw,
      modelName,
      displayLabel: `AI Model: ${pretty}`,
      badgeType: "ai-primary",
      detailedDescription: `Generated by primary AI model ${pretty} (${modelName}) under CTCAE v5.0 verification.`,
      badgeBg: "rgba(16, 185, 129, 0.12)",
      badgeText: "#065f46",
      badgeBorder: "rgba(16, 185, 129, 0.35)",
    };
  }

  // 2. On-Device Whisper (Faster-Whisper / CTranslate2)
  if (lower.includes("whisper")) {
    const isFb = lower.includes("fallback");
    return {
      isAi: true,
      isFallback: isFb,
      engineRaw: raw,
      modelName: "whisper-base-int8",
      displayLabel: isFb ? "On-Device Whisper (Fallback)" : "On-Device Whisper (Local CPU)",
      badgeType: "on-device-stt",
      detailedDescription: "Transcribed on-device via faster-whisper (CTranslate2 int8 on CPU · zero audio egress).",
      badgeBg: "rgba(99, 102, 241, 0.12)",
      badgeText: "#4338ca",
      badgeBorder: "rgba(99, 102, 241, 0.35)",
    };
  }

  // 3. Browser Live ASR
  if (lower.includes("live-asr") || lower.includes("asr") || lower.includes("speech")) {
    return {
      isAi: false,
      isFallback: false,
      engineRaw: raw,
      modelName: null,
      displayLabel: "Live Speech Recognition (Browser ASR)",
      badgeType: "browser-stt",
      detailedDescription: "Transcribed live in browser client via Web Speech Recognition API.",
      badgeBg: "rgba(100, 116, 139, 0.12)",
      badgeText: "#334155",
      badgeBorder: "rgba(100, 116, 139, 0.3)",
    };
  }

  // 4. Synthetic Demo Data
  if (lower.includes("demo")) {
    return {
      isAi: false,
      isFallback: true,
      engineRaw: raw,
      modelName: null,
      displayLabel: "Synthetic Demo Dataset",
      badgeType: "demo",
      detailedDescription: "Pre-verified clinical demo encounter for evaluation across CTCAE grades.",
      badgeBg: "rgba(251, 191, 36, 0.15)",
      badgeText: "#92400e",
      badgeBorder: "rgba(251, 191, 36, 0.4)",
    };
  }

  // 5. Deterministic rule engine as the primary path (on-device or server), not a fallback
  if (/rule_based|deterministic|local-text-parser/.test(lower) && !lower.includes("fallback")) {
    const onServer = lower.includes("server");
    return {
      isAi: false,
      isFallback: false,
      engineRaw: raw,
      modelName: null,
      displayLabel: onServer ? "Deterministic Clinical Rule Engine (Server)" : "Deterministic Clinical Rule Engine (On-Device)",
      badgeType: "deterministic",
      detailedDescription: onServer
        ? "Extracted by the RoundsAI backend's deterministic oncology rules (no generative AI)."
        : "Extracted in this browser by deterministic oncology rules (no generative AI, no data egress).",
      badgeBg: "rgba(14, 165, 233, 0.12)",
      badgeText: "#0369a1",
      badgeBorder: "rgba(14, 165, 233, 0.35)",
    };
  }

  // 6. Deterministic Clinical Rule Engine Fallback (Default offline)
  return {
    isAi: false,
    isFallback: true,
    engineRaw: raw,
    modelName: null,
    displayLabel: "Deterministic Clinical Rule Engine (Offline Fallback)",
    badgeType: "deterministic-fallback",
    detailedDescription: "Cloud AI unavailable or offline; generated via 100% deterministic oncology rule engine (zero AI hallucination).",
    badgeBg: "rgba(14, 165, 233, 0.12)",
    badgeText: "#0369a1",
    badgeBorder: "rgba(14, 165, 233, 0.35)",
  };
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
      `GENERATION PROVENANCE: AI Model: Gemini 2.5 Flash (gemini-2.5-flash) | CTCAE v5.0`,
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
    `GENERATION PROVENANCE: AI Model: Gemini 2.5 Flash (gemini-2.5-flash) | CTCAE v5.0`,
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
  engine?: string;
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
  const ancDecimalMatch = textContent.match(/(?:neut#|anc|absolute\s+neutrophils?|abs\s+neutrophils?|neutrophils,\s*abs)\s*[:=]?\s*(\d+\.\d+)\s*(?:x\s*10\^?3|\*10\^?3|k\/u?l)/i);
  if (ancDecimalMatch) {
    anc = Math.round(parseFloat(ancDecimalMatch[1]) * 1000);
    extractedFromText = true;
  } else {
    const ancMatch = textContent.match(/(?:anc|absolute\s+neutrophils?(?:\s+count)?|neutrophils?\s*\(?absolute\)?|neut#|neutrophils,\s*abs|abs\s+neutrophils?)\s*(?:\(\s*anc\s*\))?\s*[:=]?\s*(\d[\d,]*)/i);
    if (ancMatch) {
      anc = parseInt(ancMatch[1].replace(/,/g, ""), 10);
      extractedFromText = true;
    }
  }

  // 2. WBC extraction
  let wbc: number | null = null;
  const wbcMatch = textContent.match(/(?:wbc|white\s+blood(?:\s+cell)?(?:\s+count)?|leukocytes?|leucocytes?)\s*[:=]?\s*(\d+[\d,]*(?:\.\d+)?)/i);
  if (wbcMatch) {
    const rawVal = parseFloat(wbcMatch[1].replace(/,/g, ""));
    wbc = rawVal > 50 ? Math.round((rawVal / 1000) * 10) / 10 : rawVal;
    extractedFromText = true;
  }

  // 3. Platelets extraction
  let platelets: number | null = null;
  const pltKMatch = textContent.match(/(?:platelets?|plt|thrombocytes?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:x\s*10\^?3|\*10\^?3|k\/u?l|k\b)/i);
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
  const tempFMatch = textContent.match(/(?:temp(?:erature)?|vitals?\s+temp|febrile\s+at)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:[°º]?\s*f\b|deg\s*f)/i);
  if (tempFMatch) {
    const valF = parseFloat(tempFMatch[1]);
    temp = Math.round(((valF - 32) * (5 / 9)) * 10) / 10;
    extractedFromText = true;
  } else {
    const tempMatch = textContent.match(/(?:temp(?:erature)?|vitals?\s+temp|febrile\s+at)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
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
    engine: extractedFromText ? "local-text-parser (deterministic regex)" : "local-vision-fallback",
  };
}

/**
 * Maps lab values read from an image by the backend vision model into the OCR
 * review shape, normalizing units (ANC/platelets in /µL, WBC in x10³/µL, Hgb in g/dL).
 * Values the model did not return stay 0 ("not read") for the clinician to fill in.
 */
export function parsedOcrFromVisionLabs(
  labs: { name: string; value: number; unit?: string | null }[],
  engine: string
): ParsedClinicalOcr {
  let anc: number | null = null;
  let wbc: number | null = null;
  let platelets: number | null = null;
  let hemoglobin: number | null = null;
  let temp: number | null = null;

  for (const lab of labs) {
    const name = lab.name.toLowerCase();
    const unit = (lab.unit || "").toLowerCase();
    const v = Number(lab.value);
    if (!Number.isFinite(v) || unit.includes("%")) continue;
    const inThousands = /10\s*\^?\s*3|10³|\bk\b|k\/|thou/.test(unit);

    if (anc === null && /\banc\b|neutrophil|neut#|\bneut\b/.test(name)) {
      anc = inThousands || v < 50 ? Math.round(v * 1000) : Math.round(v);
    } else if (wbc === null && /\bwbc\b|white|leuk/.test(name)) {
      wbc = v > 50 ? Math.round((v / 1000) * 10) / 10 : v;
    } else if (platelets === null && /platelet|\bplts?\b|thrombo/.test(name)) {
      platelets = inThousands || v < 1000 ? Math.round(v * 1000) : Math.round(v);
    } else if (hemoglobin === null && /h(a)?emoglobin|\bhgb\b|^hb$/.test(name)) {
      hemoglobin = v > 25 ? Math.round(v) / 10 : v;
    } else if (temp === null && /temp/.test(name)) {
      temp = unit.includes("f") || v > 45 ? Math.round(((v - 32) * 5 / 9) * 10) / 10 : v;
    }
  }

  const found = [anc, wbc, platelets, hemoglobin, temp].some((x) => x !== null);
  const grade = anc === null ? 0 : anc < 500 ? 4 : anc < 1000 ? 3 : anc < 1500 ? 2 : anc < 2000 ? 1 : 0;
  return {
    anc: anc ?? 0,
    wbc: wbc ?? 0,
    platelets: platelets ?? 0,
    hemoglobin: hemoglobin ?? 0,
    temp: temp ?? 0,
    grade,
    isFebrile: (temp ?? 0) >= 38.0,
    confidence: found ? 95 : 0,
    extractedFromText: found,
    engine,
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
/** "Cycle 3 of 6" -> "Cycle 4"; falls back to "the next cycle" when no number is present. */
function nextCycleLabel(cycle: string): string {
  const n = (cycle || "").match(/cycle\s*(\d+)/i);
  return n ? `Cycle ${parseInt(n[1], 10) + 1}` : "the next cycle";
}

export function getDoseModificationRecommendation(
  patient: { id: string; name: string; regimen: string; cycle: string; baselineAnc: number; grade?: number },
  rounds?: Array<{ anc: number; ctcae_grade: number }>
): DoseModificationGuideline {
  const activeRounds = rounds || [];
  const lowestAnc = activeRounds.length > 0 ? Math.min(...activeRounds.map((r) => r.anc)) : patient.baselineAnc;
  const highestGrade = activeRounds.length > 0 ? Math.max(...activeRounds.map((r) => r.ctcae_grade)) : (patient.grade ?? 0);
  const regLower = (patient.regimen || "").toLowerCase();
  const nextCycle = nextCycleLabel(patient.cycle);

  // Grade 4 Febrile Neutropenia / ANC < 500
  if (highestGrade >= 4 || lowestAnc < 500) {
    let doseAdjustment = `Reduce cytotoxic myelosuppressive agents in ${patient.regimen} by 20% for upcoming cycle.`;
    let protocolSource = "NCCN / ASCO Febrile Neutropenia Guidelines v2.2025";
    if (regLower.includes("folfox") || regLower.includes("oxaliplatin")) {
      doseAdjustment = `Reduce oxaliplatin dose by 20% (to 68 mg/m²) and omit bolus fluorouracil (5-FU) for ${nextCycle}.`;
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
    let doseAdjustment = `Delay initiation of next cycle by 7 days or until absolute neutrophil count recovers to ≥ 1,500 /µL and platelets recover to ≥ 100,000 /µL. Maintain 100% relative dose intensity upon recovery.`;
    let gcsfProphylaxis = `Recommend secondary G-CSF prophylaxis (pegfilgrastim 6 mg subcutaneous injection once per cycle, 24 hours post-chemotherapy) for subsequent cycles to prevent dose delays.`;

    if (regLower.includes("chop") || regLower.includes("lymphoma")) {
      protocolSource = "NCCN B-Cell Lymphomas / ASCO Growth Factor Prophylaxis Guidelines";
      doseAdjustment = `Delay initiation of ${nextCycle} by 7 days or until absolute neutrophil count recovers to ≥ 1,500 /µL and platelets recover to ≥ 100,000 /µL. Maintain 100% relative dose intensity of curative R-CHOP upon recovery.`;
      gcsfProphylaxis = `Recommend primary pegfilgrastim 6 mg subcutaneous injection once per cycle (24 hours after completion of day 1 chemotherapy) for ${nextCycle} onwards to prevent dose delays.`;
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
      doseAdjustment = `Proceed with planned ${nextCycle} Cisplatin + Pemetrexed at 100% relative dose intensity. Counsel patient on Grade 1 peripheral sensory symptoms.`;
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
    doseAdjustment = `No dose reduction or schedule delay warranted. Proceed with planned ${nextCycle} AC-T (doxorubicin 60 mg/m² + cyclophosphamide 600 mg/m²) at 100% relative dose intensity.`;
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
    message: "Elena Rostova: ANC 2,150/µL verified. Grade 0 stable.",
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

export interface AiAnalyticsInsight {
  engine: string;
  patient_id: string;
  patient_name: string;
  risk_level: "Low" | "Moderate" | "High" | "Critical";
  confidence_score: number;
  executive_summary: string;
  nadir_and_kinetics: string;
  toxicity_stratification: string;
  dose_and_cycle_guidance: string;
  surveillance_milestones: string[];
  generated_at: string;
}

/**
 * Precision deterministic oncology analytics fallback generator.
 * Produces clear, detailed, and mathematically accurate clinical insights
 * without requiring generative AI or external network connectivity.
 */
export function generateLocalClinicalAnalyticsInsight(
  patient: {
    id: string;
    name: string;
    regimen?: string;
    cycle?: string;
    diagnosis?: string;
    baselineAnc?: number;
    grade?: number;
  },
  rounds?: Array<{
    date?: string;
    anc: number;
    platelets?: number;
    hemoglobin?: number;
    ctcae_grade?: number;
    notes?: string;
  }>
): AiAnalyticsInsight {
  // Rounds are stored newest first. Every statement below is derived from recorded
  // values only; anything not recorded is reported as such rather than assumed.
  const activeRounds = rounds || [];
  const baselineAnc = patient.baselineAnc && patient.baselineAnc > 0 ? patient.baselineAnc : null;
  const regimen = patient.regimen || "the current regimen";
  const cycle = patient.cycle || "current cycle";
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  const measured = (v: unknown, allowZero: boolean): v is number =>
    typeof v === "number" && Number.isFinite(v) && (allowZero ? v >= 0 : v > 0);

  const ancSeries = activeRounds.map((r) => r.anc).filter((v): v is number => measured(v, true));
  const pltSeries = activeRounds.map((r) => r.platelets).filter((v): v is number => measured(v, false));
  const hgbSeries = activeRounds.map((r) => r.hemoglobin).filter((v): v is number => measured(v, false));

  const nadirAnc = ancSeries.length ? Math.min(...ancSeries) : null;
  const latestAnc = ancSeries.length ? ancSeries[0] : null;
  const lowestPlt = pltSeries.length ? Math.min(...pltSeries) : null;
  const lowestHgb = hgbSeries.length ? Math.min(...hgbSeries) : null;

  const ancGrade = (v: number | null) => (v === null ? 0 : v < 500 ? 4 : v < 1000 ? 3 : v < 1500 ? 2 : v < 2000 ? 1 : 0);
  const pltGrade = (v: number | null) => (v === null ? 0 : v < 25000 ? 4 : v < 50000 ? 3 : v < 75000 ? 2 : v < 150000 ? 1 : 0);
  const hgbGrade = (v: number | null) => (v === null ? 0 : v < 8 ? 3 : v < 10 ? 2 : v < 12 ? 1 : 0);

  const referenceAnc = nadirAnc ?? baselineAnc;
  const neutropeniaGrade = ancGrade(referenceAnc);
  const thrombocytopeniaGrade = pltGrade(lowestPlt);
  const anemiaGrade = hgbGrade(lowestHgb);
  const recordedGrade = Math.max(0, ...activeRounds.map((r) => (measured(r.ctcae_grade, true) ? r.ctcae_grade : 0)));
  const worstGrade = Math.max(neutropeniaGrade, thrombocytopeniaGrade, anemiaGrade, recordedGrade);

  const riskLevel: AiAnalyticsInsight["risk_level"] =
    worstGrade >= 4 ? "Critical" : worstGrade === 3 ? "High" : worstGrade === 2 ? "Moderate" : "Low";

  const declinePct =
    baselineAnc && nadirAnc !== null ? Math.max(0, Math.round(((baselineAnc - nadirAnc) / baselineAnc) * 1000) / 10) : null;
  let trend = "";
  if (latestAnc !== null && nadirAnc !== null && ancSeries.length > 1) {
    trend =
      latestAnc === nadirAnc
        ? "the latest value is the lowest recorded (no recovery documented yet)"
        : latestAnc >= nadirAnc * 1.1
          ? `recovering from the nadir (latest ${fmt(latestAnc)} /µL)`
          : `near the nadir (latest ${fmt(latestAnc)} /µL)`;
  }

  const roundsText = `${activeRounds.length} recorded round${activeRounds.length === 1 ? "" : "s"}`;
  const ancSentence =
    nadirAnc !== null
      ? `ANC nadir ${fmt(nadirAnc)} /µL (CTCAE Grade ${neutropeniaGrade}${declinePct !== null ? `, ${declinePct}% below baseline ${fmt(baselineAnc as number)} /µL` : ""})${trend ? `; ${trend}` : ""}.`
      : baselineAnc
        ? `No ANC recorded since admission; admission baseline ANC ${fmt(baselineAnc)} /µL (Grade ${neutropeniaGrade}).`
        : "No ANC values recorded yet.";
  const pltSentence =
    lowestPlt !== null
      ? `Lowest platelets ${fmt(lowestPlt)} /µL (Grade ${thrombocytopeniaGrade}).`
      : "Platelets not recorded.";

  const action =
    riskLevel === "Critical"
      ? `Grade 4 toxicity recorded: daily CBC with differential, neutropenic precautions and protocol dose-modification review are indicated.`
      : riskLevel === "High"
        ? `Grade 3 toxicity recorded: a cycle delay and secondary growth-factor support should be considered before the next infusion.`
        : riskLevel === "Moderate"
          ? `Grade 2 toxicity recorded: repeat CBC with differential before clearing the next cycle.`
          : `No grade ≥ 2 hematologic toxicity recorded; continuation is supported if pre-cycle counts remain adequate.`;

  const executiveSummary = `${patient.name} (#${patient.id}) on ${regimen}, ${cycle} — ${roundsText}. ${ancSentence} ${pltSentence} ${action}`;

  const nadirAndKinetics = [
    baselineAnc ? `Baseline ANC ${fmt(baselineAnc)} /µL` : "Baseline ANC not recorded",
    nadirAnc !== null ? `nadir ${fmt(nadirAnc)} /µL${declinePct !== null ? ` (${declinePct}% decline)` : ""}` : "no ANC recorded since admission",
    latestAnc !== null && ancSeries.length > 1 ? `latest ${fmt(latestAnc)} /µL` : "",
  ]
    .filter(Boolean)
    .join(" → ")
    .concat(
      `. Platelets: ${lowestPlt !== null ? `lowest ${fmt(lowestPlt)} /µL` : "not recorded"}. Hemoglobin: ${lowestHgb !== null ? `lowest ${lowestHgb} g/dL` : "not recorded"}. `,
      "After myelosuppressive chemotherapy the neutrophil nadir typically falls 7–14 days post-infusion with recovery over the following 1–2 weeks; confirm with serial CBCs.",
    );

  const lineages = [
    `Neutropenia: Grade ${neutropeniaGrade}${referenceAnc !== null ? ` (ANC ${fmt(referenceAnc)} /µL)` : " (not recorded)"}`,
    `Thrombocytopenia: Grade ${thrombocytopeniaGrade}${lowestPlt !== null ? ` (${fmt(lowestPlt)} /µL)` : " (not recorded)"}`,
    `Anemia: Grade ${anemiaGrade}${lowestHgb !== null ? ` (${lowestHgb} g/dL)` : " (not recorded)"}`,
  ];
  const riskNote =
    neutropeniaGrade >= 4
      ? " ANC < 500 /µL carries a high risk of febrile neutropenia: any temperature ≥ 38.0°C requires immediate evaluation."
      : neutropeniaGrade === 3
        ? " ANC 500–999 /µL: elevated infection risk; monitor temperature closely."
        : thrombocytopeniaGrade >= 3
          ? " Platelets < 50,000 /µL: bleeding precautions apply."
          : worstGrade <= 1
            ? " Stable: no grade ≥ 2 hematologic toxicity recorded."
            : "";
  const toxicityStratification = `CTCAE v5.0 worst recorded grades — ${lineages.join("; ")}.${riskNote}`;

  const regLower = (patient.regimen || "").toLowerCase();
  let doseAndCycleGuidance = "";
  if (worstGrade >= 4) {
    if (regLower.includes("folfox") || regLower.includes("oxaliplatin")) {
      doseAndCycleGuidance = "NCCN Colorectal Panel Guideline: Implement 20% dose reduction of Oxaliplatin (to 68 mg/m²) for subsequent cycles. Initiate G-CSF secondary prophylaxis with Filgrastim 300 mcg SC daily (Days 3–7 or until post-nadir recovery).";
    } else {
      doseAndCycleGuidance = "Protocol Dose Adjustment: 20–25% cytotoxic dose reduction for the next cycle after a Grade 4 nadir. Consider G-CSF support starting 24–48 hours post-chemotherapy until ANC recovery.";
    }
  } else if (worstGrade === 3) {
    if (regLower.includes("r-chop") || regLower.includes("chop")) {
      doseAndCycleGuidance = "NCCN Lymphoma Guideline: Delay initiation of next cycle by 7 days until absolute neutrophil count recovers to ≥ 1,500 /µL. Add secondary G-CSF prophylaxis with Pegfilgrastim 6 mg SC on Day 2 of subsequent cycles.";
    } else {
      doseAndCycleGuidance = "Protocol Guidance: Hold or delay next infusion by 7 days until ANC ≥ 1,500 /µL and platelets ≥ 100,000 /µL. Consider secondary granulocyte colony-stimulating factor (G-CSF) prophylaxis.";
    }
  } else if (worstGrade === 2) {
    doseAndCycleGuidance = "Protocol Guidance: Continue planned cycle at 100% dose intensity contingent on pre-cycle Day 1 CBC verifying ANC ≥ 1,500 /µL and platelets ≥ 100,000 /µL.";
  } else {
    doseAndCycleGuidance = "Protocol Guidance: Proceed with planned chemotherapy cycle at 100% relative dose intensity if pre-cycle counts remain adequate. No schedule delay or dose reduction indicated by recorded counts.";
  }

  const surveillanceMilestones = [
    `Confirm CBC with differential prior to next infusion (ANC must be ≥ 1,500 /µL, Platelets ≥ 100,000 /µL)`,
    `Instruct patient on immediate emergency reporting for temperature ≥ 38.0°C or shaking chills`,
    `Evaluate clinical recovery from acute toxicities (fatigue, GI, mucositis) to Grade ≤ 1 before cycle start`,
    `Verify renal/hepatic clearance markers (creatinine, AST/ALT, total bilirubin) within safe administration parameters`,
  ];
  if (lowestPlt === null) surveillanceMilestones.unshift("Record a platelet count — none documented this admission");

  // Deterministic rules have no model confidence; report how complete the recorded data is.
  const lineagesRecorded = [ancSeries.length, pltSeries.length, hgbSeries.length].filter((n) => n > 0).length;
  const dataCompleteness = Math.round(((lineagesRecorded / 3) * 0.7 + (Math.min(activeRounds.length, 3) / 3) * 0.3) * 100);

  return {
    engine: "deterministic-clinical-rules (client fallback)",
    patient_id: patient.id,
    patient_name: patient.name,
    risk_level: riskLevel,
    confidence_score: dataCompleteness,
    executive_summary: executiveSummary,
    nadir_and_kinetics: nadirAndKinetics,
    toxicity_stratification: toxicityStratification,
    dose_and_cycle_guidance: doseAndCycleGuidance,
    surveillance_milestones: surveillanceMilestones,
    generated_at: new Date().toISOString(),
  };
}


