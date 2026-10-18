import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCtcaeBadgeStyle,
  getSentinelSeverityTheme,
  analyzeLabTrend,
  formatProvenanceBadge,
  extractOncologyTriad,
  formatEmrClipboardNote,
} from "./clinical-utils.ts";


describe("Clinical Utilities — TDD Suite", () => {
  describe("getCtcaeBadgeStyle", () => {
    it("returns Grade 1 Mild styling for numeric 1", () => {
      const style = getCtcaeBadgeStyle(1);
      assert.equal(style.label, "Grade 1 (Mild)");
      assert.equal(style.text, "#854d0e");
    });

    it("returns Grade 3 Severe styling for string '3'", () => {
      const style = getCtcaeBadgeStyle("3");
      assert.equal(style.label, "Grade 3 (Severe)");
      assert.equal(style.text, "#991b1b");
    });

    it("returns Grade 4 Life-threatening for 4", () => {
      const style = getCtcaeBadgeStyle(4);
      assert.equal(style.label, "Grade 4 (Life-threatening)");
      assert.equal(style.bg, "#7f1d1d");
    });

    it("falls back to Normal / Ungraded for 0, null, or undefined", () => {
      assert.equal(getCtcaeBadgeStyle(0).label, "Normal / Ungraded");
      assert.equal(getCtcaeBadgeStyle(null).label, "Normal / Ungraded");
      assert.equal(getCtcaeBadgeStyle(undefined).label, "Normal / Ungraded");
      assert.equal(getCtcaeBadgeStyle("invalid").label, "Normal / Ungraded");
    });
  });

  describe("getSentinelSeverityTheme", () => {
    it("maps high/emergency alerts to HIGH EMERGENCY palette", () => {
      const theme = getSentinelSeverityTheme("high");
      assert.equal(theme.label, "HIGH EMERGENCY");
      assert.equal(theme.badgeBg, "#ef4444");
    });

    it("maps medium alerts to MEDIUM ALERT palette", () => {
      const theme = getSentinelSeverityTheme("medium");
      assert.equal(theme.label, "MEDIUM ALERT");
      assert.equal(theme.badgeBg, "#f59e0b");
    });

    it("handles whitespace and case insensitivity", () => {
      const theme = getSentinelSeverityTheme("  WARNING  ");
      assert.equal(theme.label, "MEDIUM ALERT");
    });

    it("falls back gracefully for missing or unrecognized severity", () => {
      const theme = getSentinelSeverityTheme(null);
      assert.equal(theme.label, "CLINICAL NOTE");
    });
  });

  describe("analyzeLabTrend", () => {
    it("handles missing current value", () => {
      const res = analyzeLabTrend(null, 1500);
      assert.equal(res.direction, "insufficient data");
      assert.equal(res.delta, null);
    });

    it("identifies initial baseline when previous value is missing", () => {
      const res = analyzeLabTrend(900, null);
      assert.equal(res.direction, "new");
      assert.equal(res.label, "Initial baseline");
    });

    it("calculates steep drop accurately (e.g. ANC 1400 -> 900)", () => {
      const res = analyzeLabTrend(900, 1400);
      assert.equal(res.direction, "down");
      assert.equal(res.delta, -500);
      assert.ok(res.percentChange! < -35);
      assert.ok(res.label.includes("-500"));
    });

    it("identifies stable trends within 1%", () => {
      const res = analyzeLabTrend(100.5, 100);
      assert.equal(res.direction, "stable");
      assert.ok(res.label.includes("Stable"));
    });

    it("handles zero baseline without throwing division by zero", () => {
      const res = analyzeLabTrend(50, 0);
      assert.equal(res.direction, "up");
      assert.equal(res.delta, 50);
      assert.equal(res.percentChange, null);
    });
  });

  describe("formatProvenanceBadge", () => {
    it("identifies OCR Vision sources", () => {
      assert.equal(formatProvenanceBadge("vision_extracted").label, "OCR Vision Report");
      assert.equal(formatProvenanceBadge("image_scan").label, "OCR Vision Report");
    });

    it("identifies Voice Dictation sources", () => {
      assert.equal(formatProvenanceBadge("voice_transcript").label, "Clinician Dictation");
      assert.equal(formatProvenanceBadge("audio").label, "Clinician Dictation");
    });

    it("identifies synthetic demo sources", () => {
      assert.equal(formatProvenanceBadge("demo_data").label, "Synthetic Demo");
    });

    it("falls back to Clinical Record for unknown or empty string", () => {
      assert.equal(formatProvenanceBadge(null).label, "Clinical Record");
    });
  });

  describe("extractOncologyTriad", () => {
    it("extracts ANC, Platelets, and WBC with appropriate CTCAE grades", () => {
      const labs = [
        { name: "ANC", value: 850, unit: "cells/µL", previous_value: 1200 },
        { name: "Platelets", value: 45000, unit: "/µL", previous_value: 110000 },
        { name: "WBC", value: 2.1, unit: "K/µL" },
        { name: "Hemoglobin", value: 9.2, unit: "g/dL" },
      ];

      const triad = extractOncologyTriad(labs);
      assert.equal(triad.anc?.value, 850);
      assert.equal(triad.anc?.ctcaeGrade, 3);
      assert.equal(triad.platelets?.value, 45000);
      assert.equal(triad.platelets?.ctcaeGrade, 3);
      assert.equal(triad.wbc?.value, 2.1);
      assert.equal(triad.hemoglobin?.value, 9.2);
    });

    it("grades life-threatening nadirs (Grade 4) for ANC < 500 and Platelets < 25000", () => {
      const labs = [
        { name: "Absolute Neutrophil Count", value: 380, unit: "cells/µL" },
        { name: "Platelet Count", value: 18000, unit: "/µL" },
      ];

      const triad = extractOncologyTriad(labs);
      assert.equal(triad.anc?.value, 380);
      assert.equal(triad.anc?.ctcaeGrade, 4);
      assert.equal(triad.platelets?.value, 18000);
      assert.equal(triad.platelets?.ctcaeGrade, 4);
    });

    it("returns null for absent lab markers", () => {
      const triad = extractOncologyTriad([]);
      assert.equal(triad.anc, null);
      assert.equal(triad.platelets, null);
      assert.equal(triad.wbc, null);
      assert.equal(triad.hemoglobin, null);
    });
  });

  describe("formatEmrClipboardNote", () => {
    it("formats clean clinical EMR paste string with attestation header", () => {
      const formatted = formatEmrClipboardNote({
        patientName: "Jane Doe",
        mrn: "MRN-104-B",
        note: "SOAP NOTE CONTENT: Patient evaluated in Ward 4B.",
        attestedBy: "Dr. Gregory House, MD",
        attestedAt: "2026-10-18 10:30 UTC",
      });

      assert.ok(formatted.includes("[ROUNDS-AI EMR CLINICAL DOCUMENTATION]"));
      assert.ok(formatted.includes("Jane Doe"));
      assert.ok(formatted.includes("MRN-104-B"));
      assert.ok(formatted.includes("Dr. Gregory House, MD"));
      assert.ok(formatted.includes("SOAP NOTE CONTENT: Patient evaluated in Ward 4B."));
    });

    it("handles draft note without prior attestation cleanly", () => {
      const formatted = formatEmrClipboardNote({
        note: "Draft note for review.",
      });

      assert.ok(formatted.includes("[ROUNDS-AI EMR CLINICAL DOCUMENTATION]"));
      assert.ok(formatted.includes("Pending Clinician Attestation"));
      assert.ok(formatted.includes("Draft note for review."));
    });
  });
});

