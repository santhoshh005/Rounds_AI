import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTranscriptLocally,
  analysisFromBackend,
  buildReviewCase,
  extractLabs,
  extractSymptoms,
  extractTemperatureC,
  gradeAnc,
  gradePlatelets,
} from "./round-analysis.ts";
import { getModelProvenance, parsedOcrFromVisionLabs } from "./clinical-utils.ts";

const david = {
  id: "104",
  name: "David Miller",
  ageSex: "58M",
  diagnosis: "Colorectal cancer, Stage III",
  regimen: "mFOLFOX6",
  cycle: "Cycle 3 of 6",
  baselineAnc: 1400,
  ecog: 1,
};

describe("Round analysis — transcript extraction", () => {
  it("extracts and normalizes dictated labs", () => {
    const labs = extractLabs("ANC 420 cells/µL, platelets 88,000/µL, WBC 1,800 cells/µL, Hgb 10.2 g/dL");
    assert.deepEqual(labs, { anc: 420, wbc: 1800, platelets: 88000, hemoglobin: 10.2 });
  });

  it("scales counts spoken in thousands", () => {
    const labs = extractLabs("WBC 1.8 K/µL, ANC 0.4, platelets 62, absolute neutrophil count of 0.4");
    assert.equal(labs.wbc, 1800);
    assert.equal(labs.anc, 400);
    assert.equal(labs.platelets, 62000);
  });

  it("returns null for labs that were not dictated", () => {
    const labs = extractLabs("Patient comfortable, eating well.");
    assert.deepEqual(labs, { anc: null, wbc: null, platelets: null, hemoglobin: null });
  });

  it("extracts temperature in °C and converts °F", () => {
    assert.equal(extractTemperatureC("Febrile overnight to 38.4°C with chills"), 38.4);
    assert.equal(extractTemperatureC("Temp 101.3 F this morning"), 38.5);
    assert.equal(extractTemperatureC("Fever for 12 hours"), null);
    assert.equal(extractTemperatureC("Day 8 of cycle 3"), null);
  });

  it("scopes negation to the clause", () => {
    const res = extractSymptoms("Denies cough, dysuria, or focal pain. Reports nausea.");
    assert.deepEqual(res.negated.sort(), ["cough", "dysuria", "pain"]);
    assert.deepEqual(res.active, ["nausea"]);
    const res2 = extractSymptoms("No vomiting but has diarrhea.");
    assert.deepEqual(res2.active, ["diarrhea"]);
    assert.deepEqual(res2.negated, ["vomiting"]);
  });

  it("marks afebrile dictation as negated fever", () => {
    const a = analyzeTranscriptLocally("Afebrile, ANC 1,620.");
    assert.ok(a.negatedSymptoms.includes("fever"));
    assert.ok(!a.activeSymptoms.includes("fever"));
  });
});

describe("Round analysis — CTCAE grading and review case", () => {
  it("grades ANC and platelets per CTCAE v5.0", () => {
    assert.equal(gradeAnc(420), 4);
    assert.equal(gradeAnc(750), 3);
    assert.equal(gradeAnc(1620), 1);
    assert.equal(gradeAnc(2500), 0);
    assert.equal(gradePlatelets(88000), 1);
    assert.equal(gradePlatelets(40000), 3);
  });

  it("flags febrile neutropenia from the demo case 1 transcript", () => {
    const transcript =
      "Patient on mFOLFOX6 cycle 3, day 8. Febrile overnight to 38.4°C with chills and fatigue. ANC 420 cells/µL, platelets 88,000/µL, WBC 1,800 cells/µL. Denies cough, dysuria, or focal pain.";
    const c = buildReviewCase(david, analyzeTranscriptLocally(transcript));
    assert.equal(c.alert.title, "Febrile Neutropenia (Criteria Met)");
    assert.equal(c.alert.grade, 4);
    assert.equal(c.alert.temp, "38.4°C");
    assert.equal(c.alert.anc, "420 /µL");
    assert.deepEqual(c.metrics.map((m) => [m[0], m[4]]), [["ANC", 4], ["Platelets", 1], ["WBC", 3]]);
    assert.ok(c.checklist.some((i) => i.includes("blood cultures")));
    assert.match(c.soapDraft.s, /Reports fever, chills and fatigue/);
    assert.match(c.soapDraft.s, /Denies cough, dysuria and pain/);
    assert.match(c.soapDraft.p, /antibiotics within 60 minutes/);
  });

  it("reports severe neutropenia without fever when temp is below threshold", () => {
    const c = buildReviewCase(david, analyzeTranscriptLocally("Low-grade temperature 38.1°C. ANC 750 cells/µL."));
    assert.equal(c.alert.title, "Severe Neutropenia (CTCAE Grade 3)");
    assert.ok(c.checklist.some((i) => i.startsWith("Re-check temperature 38.1°C")));
  });

  it("never invents values that were not dictated", () => {
    const c = buildReviewCase(david, analyzeTranscriptLocally("Patient resting comfortably, no complaints."));
    assert.equal(c.alert.title, "No Labs or Vitals Dictated");
    assert.equal(c.alert.temp, "Not recorded");
    assert.equal(c.metrics.length, 0);
    assert.match(c.soapDraft.o, /No labs documented/);
  });

  it("maps a backend extraction response and keeps local fallbacks", () => {
    const a = analysisFromBackend(
      {
        extraction: {
          labs: [{ name: "ANC", value: 400 }, { name: "PLATELETS", value: 62000 }],
          symptoms: ["fever", "nausea"],
          negated_symptoms: ["vomiting (negated)"],
          source: "local-rules",
        },
        review_flags: [{ rule_id: "RULE_SENTINEL_FEBRILE_NEUTROPENIA", severity: "high", input_values: { temperature_c: 38.6 } }],
        confirm_before_signing: [{ reason: "WBC dictated without unit; please confirm." }],
        stage_engines: { extraction: "local-rules" },
      },
      "ANC 400, platelets 62000, Hgb 9.2, temp 38.6 C. Nausea, no vomiting.",
    );
    assert.equal(a.labs.anc, 400);
    assert.equal(a.labs.hemoglobin, 9.2);
    assert.equal(a.temperatureC, 38.6);
    assert.deepEqual(a.negatedSymptoms, ["vomiting"]);
    assert.match(a.engine, /rule_based_oncology/);
    const c = buildReviewCase(david, a);
    assert.equal(c.alert.title, "Febrile Neutropenia (Criteria Met)");
    assert.ok(c.checklist.includes("WBC dictated without unit; please confirm."));
  });
});

describe("Round analysis — IDSA/ASCO febrile neutropenia edge cases", () => {
  const caseFor = (t: string) => buildReviewCase(david, analyzeTranscriptLocally(t));

  it("meets FN criteria for ANC < 500 with a single reading >= 38.3°C", () => {
    assert.equal(caseFor("Temp 38.3 C. ANC 0.").alert.title, "Febrile Neutropenia (Criteria Met)");
    assert.equal(caseFor("Temp 38.3 C. ANC 0.").alert.grade, 4);
  });

  it("meets FN criteria for 38.0–38.2°C only when sustained for an hour", () => {
    assert.equal(caseFor("Temp 38.1°C sustained for 1 hour. ANC 420.").alert.title, "Febrile Neutropenia (Criteria Met)");
    assert.equal(caseFor("Temp 38.1°C. ANC 420.").alert.title, "Severe Neutropenia (CTCAE Grade 4)");
  });

  it("requires an expected decline for ANC 500–999 but still surfaces the fever", () => {
    assert.equal(caseFor("Temp 38.6°C. ANC 750.").alert.title, "Fever with Severe Neutropenia (Assess for FN)");
    assert.equal(caseFor("Temp 38.6°C. ANC 750, expected nadir in 2 days.").alert.title, "Febrile Neutropenia (Criteria Met)");
  });

  it("normalizes '88k' platelets without a false Grade 4", () => {
    assert.equal(extractLabs("platelets 88k").platelets, 88000);
    assert.equal(gradePlatelets(extractLabs("platelets 88k").platelets), 1);
    assert.equal(extractLabs("plt 88,000").platelets, 88000);
  });
});

describe("Vision OCR mapping and provenance", () => {
  it("normalizes vision lab units and ignores percentages", () => {
    const p = parsedOcrFromVisionLabs(
      [
        { name: "Neutrophils", value: 62, unit: "%" },
        { name: "Absolute Neutrophil Count", value: 0.42, unit: "x10^3/uL" },
        { name: "WBC", value: 1800, unit: "cells/uL" },
        { name: "Platelets", value: 88, unit: "10^3/uL" },
        { name: "Hemoglobin", value: 102, unit: "g/L" },
      ],
      "gemini (gemini-3.5-flash)",
    );
    assert.equal(p.anc, 420);
    assert.equal(p.wbc, 1.8);
    assert.equal(p.platelets, 88000);
    assert.equal(p.hemoglobin, 10.2);
    assert.equal(p.grade, 4);
    assert.equal(p.extractedFromText, true);
  });

  it("reports an empty vision result as unread", () => {
    const p = parsedOcrFromVisionLabs([], "local-vision-fallback");
    assert.equal(p.confidence, 0);
    assert.equal(p.extractedFromText, false);
  });

  it("labels the model that actually answered", () => {
    const p = getModelProvenance("gemini (gemini-3.5-flash)");
    assert.equal(p.modelName, "gemini-3.5-flash");
    assert.equal(p.displayLabel, "AI Model: Gemini 3.5 Flash");
    const alias = getModelProvenance("gemini (gemini-flash-lite-latest)");
    assert.equal(alias.modelName, "gemini-flash-lite-latest");
    assert.equal(alias.isFallback, true);
    assert.match(alias.displayLabel, /AI Fallback: Gemini Flash Lite Latest/);
    const local = getModelProvenance("rule_based_oncology (on-device deterministic rules)");
    assert.equal(local.isAi, false);
    assert.equal(local.isFallback, false);
    assert.match(local.displayLabel, /Deterministic Clinical Rule Engine \(On-Device\)/);
  });
});
