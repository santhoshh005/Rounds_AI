/**
 * Round analysis: turns the clinician's dictated round into graded findings,
 * a review alert, a verification checklist and a SOAP draft.
 *
 * Values come only from what was dictated (or returned by the backend
 * extraction pipeline for that dictation). Nothing is filled in from demo
 * profiles: a value that was not dictated is reported as "Not recorded".
 */
import { getDoseModificationRecommendation } from "./clinical-utils.ts"
import { spokenNumbersToDigits } from "./spoken-numbers.ts"

/** ANC, WBC and platelets in cells/µL; hemoglobin in g/dL. */
export interface RoundLabs {
  anc: number | null
  wbc: number | null
  platelets: number | null
  hemoglobin: number | null
}

export interface RoundFlag {
  ruleId: string
  severity: "high" | "medium" | "low"
  message: string
  guideline?: string
}

export interface RoundAnalysis {
  source: "backend" | "local"
  /** Provenance string understood by getModelProvenance(). */
  engine: string
  labs: RoundLabs
  temperatureC: number | null
  activeSymptoms: string[]
  negatedSymptoms: string[]
  /** Dictation explicitly anticipates an ANC decline (IDSA/ASCO "< 1,000 expected to fall < 500"). */
  expectedDecline: boolean
  flags: RoundFlag[]
  /** Extra items the backend asks the clinician to confirm (ambiguous units, conflicts). */
  confirmItems: string[]
}

export interface ReviewPatient {
  id: string
  name: string
  ageSex: string
  diagnosis: string
  regimen: string
  cycle: string
  baselineAnc: number
  ecog?: number
  grade?: number
}

export interface ReviewCase {
  alert: {
    title: string
    subtitle: string
    grade: number
    neutropeniaGrade?: number
    temp: string
    anc: string
    timer: string
    guideline: string
  }
  metrics: [string, string, string, string, number][]
  checklist: string[]
  soapDraft: { s: string; o: string; a: string; p: string }
  activeAlerts: number
}

export const LOCAL_ANALYSIS_ENGINE = "rule_based_oncology (on-device deterministic rules)"

const FEVER_SINGLE_C = 38.3
const FEVER_SUSTAINED_C = 38.0

// ── CTCAE v5.0 grading (Investigations / Blood and lymphatic system) ─────

export function gradeAnc(v: number | null): number {
  if (v === null) return 0
  return v < 500 ? 4 : v < 1000 ? 3 : v < 1500 ? 2 : v < 2000 ? 1 : 0
}

export function gradePlatelets(v: number | null): number {
  if (v === null) return 0
  return v < 25000 ? 4 : v < 50000 ? 3 : v < 75000 ? 2 : v < 150000 ? 1 : 0
}

export function gradeWbc(v: number | null): number {
  if (v === null) return 0
  return v < 1000 ? 4 : v < 2000 ? 3 : v < 3000 ? 2 : v < 4000 ? 1 : 0
}

/** Anemia: Grade 4 is defined by life-threatening consequences, not by value. */
export function gradeHemoglobin(v: number | null): number {
  if (v === null) return 0
  return v < 8 ? 3 : v < 10 ? 2 : v < 12 ? 1 : 0
}

// ── Transcript extraction ────────────────────────────────────────────────

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`
const THOUSANDS_UNIT = String.raw`(k\b|k\s*\/\s*[µu]l|thousand|(?:x|×|\*)\s*10\s*(?:\^\s*3|³|e3)(?:\s*\/\s*[µu]l)?)?`
const LINK = String.raw`\s*(?:count\s*)?(?:is|of|was|at|now|=|:|-)?\s*(?:about\s+|approximately\s+|~\s*)?`

const LAB_NAMES: Record<keyof RoundLabs, string> = {
  anc: String.raw`\b(?:anc|absolute\s+neutrophils?(?:\s+count)?|neutrophils?(?:\s+count)?)`,
  wbc: String.raw`\b(?:wbc|white\s+(?:blood\s+)?(?:cell\s+)?count|white\s+cells?|leukocytes?)`,
  platelets: String.raw`\b(?:platelets?(?:\s+count)?|plts?)`,
  hemoglobin: String.raw`\b(?:hemoglobin|haemoglobin|hgb|hb)`,
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""))
}

function findLab(text: string, key: keyof RoundLabs): { value: number; thousands: boolean } | null {
  const re = new RegExp(`${LAB_NAMES[key]}${LINK}${NUM}\\s*${THOUSANDS_UNIT}`, "i")
  const m = text.match(re)
  if (!m) return null
  const value = toNumber(m[1])
  return Number.isFinite(value) ? { value, thousands: Boolean(m[2]) } : null
}

/** Extracts dictated labs and normalizes them to cells/µL (counts) and g/dL (hemoglobin). */
export function extractLabs(text: string): RoundLabs {
  const scaleCount = (hit: { value: number; thousands: boolean } | null, smallLimit: number) => {
    if (!hit) return null
    // "ANC 0.4", "WBC 1.8 K/µL", "platelets 62" are spoken in thousands.
    return hit.thousands || hit.value < smallLimit ? Math.round(hit.value * 1000) : Math.round(hit.value)
  }
  const hgbHit = findLab(text, "hemoglobin")
  let hemoglobin = hgbHit ? hgbHit.value : null
  if (hemoglobin !== null && hemoglobin > 25) hemoglobin = Math.round(hemoglobin) / 10 // g/L → g/dL

  return {
    anc: scaleCount(findLab(text, "anc"), 50),
    wbc: scaleCount(findLab(text, "wbc"), 50),
    platelets: scaleCount(findLab(text, "platelets"), 1000),
    hemoglobin,
  }
}

/** Extracts a body temperature in °C (Fahrenheit readings are converted). */
export function extractTemperatureC(text: string): number | null {
  const patterns = [
    /(\d{2,3}(?:\.\d+)?)\s*(?:°|º|degrees?\s*)\s*([cf])?/i,
    /\b(?:temp(?:erature)?|t\s*max|tmax|febrile|fever|spiked?)\b[^.\d]{0,30}?(\d{2,3}(?:\.\d+)?)\s*([cf])?\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const raw = parseFloat(m[1])
    const unit = (m[2] || "").toLowerCase()
    const celsius = unit === "f" || (unit !== "c" && raw > 45) ? ((raw - 32) * 5) / 9 : raw
    if (celsius >= 33 && celsius <= 43) return Math.round(celsius * 10) / 10
  }
  return null
}

const NEGATION_TRIGGERS = [
  String.raw`\bno\b`,
  String.raw`\bnot\b`,
  String.raw`\bdenies\b`,
  String.raw`\bdenied\b`,
  String.raw`\bwithout\b`,
  String.raw`\bnegative\s+for\b`,
  String.raw`\bfree\s+of\b`,
  String.raw`\bno\s+evidence\s+of\b`,
]

// Negation scope ends at sentence punctuation, a contrast, or an affirmative verb.
const CLAUSE_BOUNDARY =
  /[.;!?]|\bbut\b|\bhowever\b|\balthough\b|\bthough\b|\b(?:reports?|reported|complains?|complained|endorses?|endorsed|has|having|had|with|developed)\b/

const SYMPTOMS: [string, RegExp][] = [
  ["chills", /\b(?:chills|rigou?rs|shivering)\b/],
  ["fatigue", /\b(?:fatigue|tiredness|exhaustion|lethargy|lethargic)\b/],
  ["nausea", /\bnausea\b/],
  ["vomiting", /\b(?:vomiting|emesis)\b/],
  ["diarrhea", /\b(?:diarrh(?:o)?ea|loose\s+stools)\b/],
  ["constipation", /\bconstipation\b/],
  ["mucositis", /\b(?:mucositis|mouth\s+sores|stomatitis|sore\s+mouth)\b/],
  ["cough", /\bcough(?:ing)?\b/],
  ["dyspnea", /\b(?:dyspnea|dyspnoea|shortness\s+of\s+breath|sob)\b/],
  ["dysuria", /\bdysuria\b/],
  ["pain", /\b(?:pain|aching)\b/],
  ["neuropathy", /\b(?:neuropathy|paresthesias?|tingling|numbness)\b/],
  ["cold dysesthesia", /\b(?:cold\s+dysesthesia|cold\s+sensitivity)\b/],
  ["rash", /\brash\b/],
  ["bleeding", /\b(?:bleeding|epistaxis|petechiae|bruising)\b/],
]

function isNegated(lower: string, index: number): boolean {
  const window = lower.slice(Math.max(0, index - 60), index)
  const clause = window.split(CLAUSE_BOUNDARY).pop() || ""
  return NEGATION_TRIGGERS.some((t) => new RegExp(`${t}\\s+(?:[\\w-]+[\\s,/]+){0,5}$`).test(clause))
}

export function extractSymptoms(text: string): { active: string[]; negated: string[] } {
  const lower = text.toLowerCase()
  const active: string[] = []
  const negated: string[] = []
  for (const [name, re] of SYMPTOMS) {
    const m = re.exec(lower)
    if (!m) continue
    ;(isNegated(lower, m.index) ? negated : active).push(name)
  }
  return { active, negated }
}

const SUSTAINED_PATTERN =
  /\b(?:sustained|persist(?:ent|ing)|lasting|for|over)\s+(?:at\s+least\s+)?(?:an?|one|1|\d+)\s*(?:hours?|hrs?|h)\b|\bsustained\b/i

const EXPECTED_DECLINE_PATTERNS = [
  /\bexpected(?:\s+to)?\s+(?:decline|drop|fall)\b/i,
  /\b(?:declining|falling|dropping)\s+(?:anc|neutrophils|counts?)\b/i,
  /\b(?:anc|counts?|neutrophils)\s+(?:expected\s+to\s+drop|falling|declining|dropping|trending\s+down)\b/i,
  /\bnadir\s+expected\b|\bexpected\s+nadir\b|\bpost-chemo\s+nadir\b/i,
]

export function hasExpectedDecline(text: string): boolean {
  return EXPECTED_DECLINE_PATTERNS.some((re) => re.test(text))
}

/**
 * IDSA/ASCO 2018 fever: single oral temperature ≥ 38.3°C, or ≥ 38.0°C sustained over
 * 1 hour. Fever dictated without a reading counts unless negated or resolved.
 */
export function isFeverActive(text: string, temperatureC: number | null): boolean {
  if (temperatureC !== null)
    return temperatureC >= FEVER_SINGLE_C || (temperatureC >= FEVER_SUSTAINED_C && SUSTAINED_PATTERN.test(text))
  const lower = text.toLowerCase()
  if (/\bafebrile\b/.test(lower)) return false
  const m = /\b(?:fever|fevers|febrile|pyrexia)\b/.exec(lower)
  if (!m) return false
  if (isNegated(lower, m.index)) return false
  return !/\b(?:fever|fevers)\s+(?:has\s+)?(?:resolved|cleared|subsided)\b/.test(lower)
}

export function analyzeTranscriptLocally(transcript: string): RoundAnalysis {
  // Speech recognition writes numbers as words ("ANC four twenty"); read them as digits.
  const text = spokenNumbersToDigits(transcript)
  const labs = extractLabs(text)
  const temperatureC = extractTemperatureC(text)
  const { active, negated } = extractSymptoms(text)
  const feverActive = isFeverActive(text, temperatureC)
  if (feverActive) active.unshift("fever")
  else if (/\b(?:afebrile|fever|fevers|febrile)\b/i.test(text)) negated.unshift("fever")
  return {
    source: "local",
    engine: LOCAL_ANALYSIS_ENGINE,
    labs,
    temperatureC,
    activeSymptoms: active,
    negatedSymptoms: negated,
    expectedDecline: hasExpectedDecline(text),
    flags: [],
    confirmItems: [],
  }
}

// ── Backend /api/v1/rounds/extract response mapping ─────────────────────

type BackendLab = { name: string; value: number; unit?: string | null; flag_reason?: string | null }
export type BackendExtractResponse = {
  extraction?: {
    labs?: BackendLab[]
    symptoms?: string[]
    negated_symptoms?: string[]
    source?: string
  }
  review_flags?: {
    rule_id?: string
    severity?: string
    message?: string
    guideline?: string
    input_values?: Record<string, unknown>
  }[]
  confirm_before_signing?: { label?: string; reason?: string }[]
  stage_engines?: Record<string, string>
}

function backendLab(labs: BackendLab[], names: string[]): number | null {
  const hit = labs.find((l) => names.includes(l.name.toUpperCase()))
  return hit && Number.isFinite(hit.value) ? hit.value : null
}

/**
 * Maps the backend pipeline result. Fields the backend did not return are
 * taken from the on-device extraction of the same transcript.
 */
export function analysisFromBackend(res: BackendExtractResponse, transcript: string): RoundAnalysis {
  const local = analyzeTranscriptLocally(transcript)
  const labs = res.extraction?.labs || []
  const flagTemp = res.review_flags
    ?.map((f) => f.input_values?.temperature_c)
    .find((t): t is number => typeof t === "number")
  const temperatureC = flagTemp ?? local.temperatureC
  const strip = (s: string) => s.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()
  const active = res.extraction?.symptoms?.map(strip) ?? local.activeSymptoms
  const negated = res.extraction?.negated_symptoms?.map(strip) ?? local.negatedSymptoms
  const extractionEngine = res.stage_engines?.extraction || res.extraction?.source || ""
  const engine = /gemini/i.test(extractionEngine)
    ? `gemini (${extractionEngine.replace(/^gemini\s*\(?|\)$/gi, "").trim() || "gemini"})`
    : "rule_based_oncology (server deterministic rules)"

  return {
    source: "backend",
    engine,
    labs: {
      anc: backendLab(labs, ["ANC"]) ?? local.labs.anc,
      wbc: backendLab(labs, ["WBC"]) ?? local.labs.wbc,
      platelets: backendLab(labs, ["PLATELETS", "PLT"]) ?? local.labs.platelets,
      hemoglobin: backendLab(labs, ["HEMOGLOBIN", "HGB"]) ?? local.labs.hemoglobin,
    },
    temperatureC,
    activeSymptoms: [...new Set(active)],
    negatedSymptoms: [...new Set(negated)].filter((s) => !active.includes(s)),
    expectedDecline: local.expectedDecline,
    flags: (res.review_flags || []).map((f) => ({
      ruleId: f.rule_id || "rule",
      severity: f.severity === "high" || f.severity === "medium" ? f.severity : "low",
      message: f.message || "",
      guideline: f.guideline,
    })),
    confirmItems: (res.confirm_before_signing || [])
      .map((c) => c.reason || c.label || "")
      .filter(Boolean),
  }
}

// ── Review case construction ─────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat("en-US").format(v)

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function buildReviewCase(patient: ReviewPatient, analysis: RoundAnalysis): ReviewCase {
  const { labs, temperatureC: temp } = analysis
  const ancG = gradeAnc(labs.anc)
  const pltG = gradePlatelets(labs.platelets)
  const wbcG = gradeWbc(labs.wbc)
  const hgbG = gradeHemoglobin(labs.hemoglobin)
  const feverActive = analysis.activeSymptoms.includes("fever") || (temp !== null && temp >= FEVER_SINGLE_C)
  const lowGradeTemp = !feverActive && temp !== null && temp >= FEVER_SUSTAINED_C
  // Febrile neutropenia (IDSA/ASCO 2018): fever with ANC < 500 /µL, or ANC < 1,000 /µL
  // expected to fall below 500. CTCAE v5.0 grades febrile neutropenia 3 at minimum.
  const febrileNeutropenia =
    feverActive && labs.anc !== null && (labs.anc < 500 || (labs.anc < 1000 && analysis.expectedDecline))
  // Fever with ANC 500–999 and no documented expected decline must still be surfaced.
  const possibleFn = feverActive && labs.anc !== null && labs.anc < 1000 && !febrileNeutropenia
  const hasAnyValue = temp !== null || Object.values(labs).some((v) => v !== null)

  const tempText = temp !== null ? `${temp}°C` : "Not recorded"
  const ancText = labs.anc !== null ? `${fmt(labs.anc)} /µL` : "Not recorded"

  // Alert
  const others: [string, number][] = (
    [
      ["Thrombocytopenia", pltG],
      ["Anemia", hgbG],
      ["Leukopenia", wbcG],
      ["Neutropenia", ancG],
    ] as [string, number][]
  ).sort((a, b) => b[1] - a[1])

  let alert: ReviewCase["alert"]
  if (febrileNeutropenia) {
    alert = {
      title: "Febrile Neutropenia (Criteria Met)",
      subtitle: `ANC ${ancText} (CTCAE Grade ${ancG} neutropenia) with fever ${temp !== null ? tempText : "documented in dictation"}`,
      grade: Math.max(3, ancG),
      neutropeniaGrade: ancG,
      temp: tempText,
      anc: ancText,
      timer: "Antibiotics ≤ 60 min",
      guideline:
        "IDSA/ASCO: obtain blood cultures and start empiric broad-spectrum IV antibiotics within 60 minutes of presentation.",
    }
  } else if (possibleFn) {
    alert = {
      title: "Fever with Severe Neutropenia (Assess for FN)",
      subtitle: `ANC ${ancText} with fever ${temp !== null ? tempText : "documented in dictation"} — febrile neutropenia if ANC is expected to fall below 500 /µL`,
      grade: Math.max(3, ancG),
      neutropeniaGrade: ancG,
      temp: tempText,
      anc: ancText,
      timer: "Urgent review",
      guideline:
        "IDSA/ASCO 2018: fever with ANC < 1,000 /µL expected to decline to < 500 /µL meets febrile neutropenia criteria; evaluate promptly.",
    }
  } else if (ancG >= 3) {
    alert = {
      title: `Severe Neutropenia (CTCAE Grade ${ancG})`,
      subtitle: lowGradeTemp
        ? `ANC ${ancText} with low-grade temperature ${tempText} — re-check within 1 hour`
        : temp === null
          ? `ANC ${ancText} — no temperature recorded; fever must be ruled out`
          : `ANC ${ancText}, afebrile at ${tempText}`,
      grade: ancG,
      neutropeniaGrade: ancG,
      temp: tempText,
      anc: ancText,
      timer: lowGradeTemp || temp === null ? "Re-check temp ≤ 1 h" : "Neutropenic precautions",
      guideline:
        "NCCN/ASCO: neutropenic precautions, temperature monitoring every 4 hours, and repeat CBC with differential.",
    }
  } else if (others[0][1] > 0) {
    const [name, grade] = others[0]
    alert = {
      title: `${name} (CTCAE Grade ${grade})`,
      subtitle: `Highest graded finding in this round's dictated values`,
      grade,
      neutropeniaGrade: ancG,
      temp: tempText,
      anc: ancText,
      timer: grade >= 3 ? "Same-day review" : "Routine monitoring",
      guideline:
        name === "Thrombocytopenia"
          ? "Bleeding precautions; platelet transfusion per institutional threshold (ASCO platelet transfusion guideline)."
          : name === "Anemia"
            ? "Assess symptoms and transfusion need; evaluate for iron deficiency and bleeding (ASCO/ASH 2019 cancer-associated anemia guideline)."
            : "Monitor CBC with differential per regimen protocol (CTCAE v5.0).",
    }
  } else if (!hasAnyValue) {
    alert = {
      title: "No Labs or Vitals Dictated",
      subtitle: "Add ANC, platelets, WBC, hemoglobin or temperature to the dictation for CTCAE grading",
      grade: 0,
      neutropeniaGrade: 0,
      temp: tempText,
      anc: ancText,
      timer: "Awaiting values",
      guideline: "CTCAE v5.0 grading requires dictated laboratory values.",
    }
  } else {
    alert = {
      title: "No Critical Findings",
      subtitle: feverActive
        ? `Fever ${tempText} without neutropenia — evaluate source`
        : "Dictated values are within CTCAE Grade 0 limits",
      grade: 0,
      neutropeniaGrade: 0,
      temp: tempText,
      anc: ancText,
      timer: "Routine",
      guideline: "Continue routine monitoring per regimen protocol (CTCAE v5.0).",
    }
  }

  // Metrics
  const metrics: ReviewCase["metrics"] = []
  if (labs.anc !== null) {
    const base = patient.baselineAnc
    const delta = base > 0 ? Math.round(((labs.anc - base) / base) * 100) : 0
    metrics.push([
      "ANC",
      fmt(labs.anc),
      "cells/µL",
      base > 0 && delta !== 0 ? `${delta < 0 ? "Down" : "Up"} ${Math.abs(delta)}% from baseline ${fmt(base)}` : "At baseline",
      ancG,
    ])
  }
  if (labs.platelets !== null)
    metrics.push(["Platelets", fmt(labs.platelets), "/µL", pltG ? `Below LLN 150,000` : "Within normal limits", pltG])
  if (labs.wbc !== null)
    metrics.push(["WBC", fmt(labs.wbc), "cells/µL", wbcG ? `Below LLN 4,000` : "Within normal limits", wbcG])
  if (labs.hemoglobin !== null)
    metrics.push(["Hemoglobin", String(labs.hemoglobin), "g/dL", hgbG ? `Below LLN 12.0` : "Within normal limits", hgbG])

  // Checklist
  const checklist: string[] = []
  const graded: [string, number | null, string, number][] = [
    ["ANC", labs.anc, "/µL", ancG],
    ["Platelets", labs.platelets, "/µL", pltG],
    ["WBC", labs.wbc, "/µL", wbcG],
    ["Hemoglobin", labs.hemoglobin, "g/dL", hgbG],
  ]
  graded
    .filter(([, v, , g]) => v !== null && g > 0)
    .sort((a, b) => b[3] - a[3])
    .slice(0, 2)
    .forEach(([name, v, unit, g]) =>
      checklist.push(`Confirm ${name} ${name === "Hemoglobin" ? v : fmt(v as number)} ${unit} (CTCAE v5.0 Grade ${g})`),
    )
  if (temp !== null && feverActive) checklist.push(`Confirm temperature ${tempText} meets febrile criteria (≥ 38.3°C single reading)`)
  else if (lowGradeTemp) checklist.push(`Re-check temperature ${tempText} within 1 hour (≥ 38.0°C sustained criterion)`)
  else if (temp === null && labs.anc !== null && labs.anc < 1000)
    checklist.push("Record a current temperature to rule out febrile neutropenia")
  if (febrileNeutropenia) checklist.push("Verify blood cultures are drawn before the first antibiotic dose")
  if (possibleFn) checklist.push("Document whether ANC is expected to fall below 500 /µL (febrile neutropenia criterion)")
  analysis.confirmItems.forEach((c) => checklist.push(c))
  if (analysis.activeSymptoms.filter((s) => s !== "fever").length)
    checklist.push(`Confirm reported symptoms: ${listPhrase(analysis.activeSymptoms.filter((s) => s !== "fever"))}`)
  else if (analysis.negatedSymptoms.length)
    checklist.push(`Confirm pertinent negatives: ${listPhrase(analysis.negatedSymptoms)}`)
  if (checklist.length === 0) checklist.push("Confirm the dictated findings are complete and accurate")
  const uniqueChecklist = [...new Set(checklist)].slice(0, 5)

  // SOAP draft
  const reported = analysis.activeSymptoms
  const s = [
    `${patient.ageSex} on ${patient.regimen} (${patient.cycle}).`,
    reported.length ? `Reports ${listPhrase(reported)}.` : "",
    analysis.negatedSymptoms.length ? `Denies ${listPhrase(analysis.negatedSymptoms)}.` : "",
    !reported.length && !analysis.negatedSymptoms.length ? "No symptoms documented in dictation." : "",
  ]
    .filter(Boolean)
    .join(" ")

  const labParts = [
    labs.anc !== null ? `ANC ${fmt(labs.anc)} /µL (Grade ${ancG})` : "",
    labs.wbc !== null ? `WBC ${fmt(labs.wbc)} /µL (Grade ${wbcG})` : "",
    labs.platelets !== null ? `Plt ${fmt(labs.platelets)} /µL (Grade ${pltG})` : "",
    labs.hemoglobin !== null ? `Hgb ${labs.hemoglobin} g/dL (Grade ${hgbG})` : "",
  ].filter(Boolean)
  const o = [
    temp !== null ? `T ${tempText}.` : "Temperature not recorded.",
    labParts.length ? `Labs: ${labParts.join(", ")}.` : "No labs documented in dictation.",
    patient.ecog !== undefined ? `ECOG ${patient.ecog}.` : "",
  ]
    .filter(Boolean)
    .join(" ")

  const findings: string[] = []
  if (febrileNeutropenia) findings.push(`febrile neutropenia criteria met (IDSA/ASCO; CTCAE v5.0 Grade ${Math.max(3, ancG)})`)
  else if (ancG > 0) findings.push(`CTCAE v5.0 Grade ${ancG} neutropenia`)
  if (pltG > 0) findings.push(`Grade ${pltG} thrombocytopenia`)
  if (hgbG > 0) findings.push(`Grade ${hgbG} anemia`)
  if (wbcG > 0 && ancG === 0) findings.push(`Grade ${wbcG} leukopenia`)
  if (possibleFn) findings.push("fever with ANC < 1,000 /µL — febrile neutropenia if decline to < 500 /µL is expected")
  if (feverActive && !febrileNeutropenia && !possibleFn) findings.push(`fever ${temp !== null ? tempText : ""} without neutropenia`.trim())
  const a = `${patient.diagnosis} on ${patient.regimen}, ${patient.cycle}. ${
    findings.length
      ? `${findings[0].charAt(0).toUpperCase()}${findings[0].slice(1)}${findings.length > 1 ? `; ${findings.slice(1).join("; ")}` : ""}.`
      : hasAnyValue
        ? "No CTCAE grade ≥ 1 hematologic toxicity in dictated values."
        : "No labs or vitals dictated; assessment pending values."
  }`

  const plan: string[] = []
  if (febrileNeutropenia) {
    plan.push("Blood cultures ×2 and empiric broad-spectrum IV antibiotics within 60 minutes per IDSA/ASCO (agent per institutional protocol).")
    plan.push("Hold myelosuppressive chemotherapy pending count recovery.")
  } else if (possibleFn) {
    plan.push("Urgent evaluation: blood cultures and assessment for empiric antibiotics per IDSA/ASCO; repeat CBC with differential.")
  } else if (ancG >= 3) {
    plan.push("Neutropenic precautions; temperature every 4 hours; repeat CBC with differential in 24–48 hours.")
  }
  if (ancG >= 3) {
    const dose = getDoseModificationRecommendation(patient, [{ anc: labs.anc as number, ctcae_grade: Math.max(ancG, febrileNeutropenia ? 3 : 0) }])
    plan.push(dose.doseAdjustment)
  }
  if (pltG >= 3) plan.push("Bleeding precautions; platelet transfusion per institutional threshold.")
  if (hgbG >= 2) plan.push("Assess anemia symptoms; transfusion per institutional threshold.")
  if (feverActive && !febrileNeutropenia && !possibleFn) plan.push("Evaluate fever source; repeat temperature and CBC.")
  if (plan.length === 0)
    plan.push(`Continue ${patient.regimen} as scheduled; routine CBC monitoring per protocol.`)
  plan.push("All orders require attending confirmation.")

  const fnAlert = febrileNeutropenia || possibleFn
  const activeAlerts =
    (fnAlert ? 1 : 0) + [ancG, pltG, wbcG, hgbG].filter((g) => g >= 3).length - (fnAlert && ancG >= 3 ? 1 : 0)

  return {
    alert,
    metrics,
    checklist: uniqueChecklist,
    soapDraft: { s, o, a, p: plan.join(" ") },
    activeAlerts: Math.max(0, activeAlerts),
  }
}
