import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCtcaeBadgeStyle,
  getSentinelSeverityTheme,
  analyzeLabTrend,
  formatProvenanceBadge,
  extractOncologyTriad,
  formatEmrClipboardNote,
  parseClinicalLabReport,
  validateBedOccupancy,
  normalizeBedIdentifier,
  getDoseModificationRecommendation,
  cleanToastMessage,
  deriveDoctorInitials,
  DEFAULT_CLINICIAN_PROFILE,
  INITIAL_CLINICAL_NOTIFICATIONS,
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
      assert.equal(theme.badgeBg, "#fef3c7");
      assert.equal(theme.badgeText, "#92400e");
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

    it("normalizes platelets in K units (< 1000) to cells/uL avoiding false Grade 4", () => {
      const triad = extractOncologyTriad([
        { name: "Platelets", value: 88, unit: "K/µL" },
      ]);
      assert.equal(triad.platelets?.value, 88000);
      assert.equal(triad.platelets?.ctcaeGrade, 1);
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

  describe("parseClinicalLabReport", () => {
    it("extracts ANC, WBC, Platelets, and Temp from raw clinical text", () => {
      const text = "CITY CANCER CENTER LAB REPORT WBC: 1.8 x10^3/uL Absolute Neutrophils (ANC): 420 cells/uL Platelet Count: 88,000 /uL Hemoglobin: 10.2 g/dL Vitals: Temp 38.4 C";
      const res = parseClinicalLabReport("cbc_scan.txt", text);
      assert.equal(res.anc, 420);
      assert.equal(res.wbc, 1.8);
      assert.equal(res.platelets, 88000);
      assert.equal(res.hemoglobin, 10.2);
      assert.equal(res.temp, 38.4);
      assert.equal(res.grade, 4);
      assert.equal(res.isFebrile, true);
      assert.equal(res.confidence, 99);
      assert.equal(res.extractedFromText, true);
    });

    it("handles decimal neutrophil counts e.g. NEUT# 0.42 x10^3", () => {
      const text = "NEUT# 0.42 x10^3/uL, PLT 88 K/uL, Temp 101.1 F";
      const res = parseClinicalLabReport("lab.txt", text);
      assert.equal(res.anc, 420);
      assert.equal(res.platelets, 88000);
      assert.equal(res.temp, 38.4);
      assert.equal(res.grade, 4);
    });

    it("does not invent values when text has no numerical matches", () => {
      const res = parseClinicalLabReport("unreadable.png", "Binary stream...", { id: "105" });
      assert.equal(res.anc, 0);
      assert.equal(res.wbc, 0);
      assert.equal(res.platelets, 0);
      assert.equal(res.hemoglobin, 0);
      assert.equal(res.temp, 0);
      assert.equal(res.grade, 0);
      assert.equal(res.extractedFromText, false);
      assert.equal(res.confidence, 0);
    });

    it("does not match HbA1c as hemoglobin and correctly extracts true hemoglobin", () => {
      const text = "HbA1c: 5.6%, Hemoglobin: 11.2 g/dL, ANC: 1500 /uL, WBC: 4.8";
      const res = parseClinicalLabReport("labs.txt", text);
      assert.equal(res.hemoglobin, 11.2);
    });

    it("correctly grades true zero ANC (ANC: 0) as CTCAE Grade 4 agranulocytosis", () => {
      const text = "ANC: 0 /uL, WBC: 0.8, Platelets: 45000, Temp 37.0 C";
      const res = parseClinicalLabReport("labs.txt", text);
      assert.equal(res.anc, 0);
      assert.equal(res.grade, 4);
      assert.equal(res.extractedFromText, true);
    });
  });

  describe("normalizeBedIdentifier", () => {
    it("strips leading zeroes and prefixes and handles null/undefined", () => {
      assert.equal(normalizeBedIdentifier("Bed 012"), "12");
      assert.equal(normalizeBedIdentifier("008"), "8");
      assert.equal(normalizeBedIdentifier("bed 14"), "14");
      assert.equal(normalizeBedIdentifier(null), "");
      assert.equal(normalizeBedIdentifier(undefined), "");
    });
  });

  describe("validateBedOccupancy", () => {
    const activeWard = [
      { id: "104", name: "David Miller", mrn: "MRN-009184", bed: "12" },
      { id: "105", name: "Sarah Jenkins", mrn: "MRN-012720", bed: "14" },
      { id: "106", name: "Elena Rostova", mrn: "MRN-018341", bed: "16" },
    ];

    it("identifies an occupied bed with case and prefix insensitivity", () => {
      const res1 = validateBedOccupancy("12", activeWard);
      assert.equal(res1.isOccupied, true);
      assert.equal(res1.occupant?.name, "David Miller");
      assert.match(res1.message || "", /occupied by David Miller/);

      const res2 = validateBedOccupancy("Bed 14", activeWard);
      assert.equal(res2.isOccupied, true);
      assert.equal(res2.occupant?.name, "Sarah Jenkins");

      const res3 = validateBedOccupancy(" bed 16 ", activeWard);
      assert.equal(res3.isOccupied, true);
      assert.equal(res3.occupant?.name, "Elena Rostova");
    });

    it("allows allocating an unoccupied bed", () => {
      const res = validateBedOccupancy("18", activeWard);
      assert.equal(res.isOccupied, false);
      assert.equal(res.occupant, null);
    });

    it("allows a patient to keep their own bed during edit", () => {
      const res = validateBedOccupancy("12", activeWard, "104");
      assert.equal(res.isOccupied, false);
    });

    it("blocks a patient from taking another patient's bed during edit", () => {
      const res = validateBedOccupancy("14", activeWard, "104");
      assert.equal(res.isOccupied, true);
      assert.equal(res.occupant?.name, "Sarah Jenkins");
    });

    it("handles empty bed inputs cleanly", () => {
      const res = validateBedOccupancy("", activeWard);
      assert.equal(res.isOccupied, false);
    });
  });

  describe("getDoseModificationRecommendation", () => {
    it("returns Grade 4 oxaliplatin reduction and G-CSF for David Miller", () => {
      const p104 = { id: "104", name: "David Miller", regimen: "mFOLFOX6", cycle: "Cycle 3", baselineAnc: 1400, grade: 4 };
      const rec = getDoseModificationRecommendation(p104, [{ anc: 420, ctcae_grade: 4 }]);
      assert.equal(rec.badgeVariant, "danger");
      assert.equal(rec.actionRequired, true);
      assert.match(rec.doseAdjustment, /20% \(to 68 mg\/m²\)/);
      assert.match(rec.gcsfProphylaxis, /Filgrastim 300 mcg/);
    });

    it("returns Grade 3 cycle delay and pegfilgrastim for Sarah Jenkins", () => {
      const p105 = { id: "105", name: "Sarah Jenkins", regimen: "R-CHOP", cycle: "Cycle 2", baselineAnc: 2200, grade: 3 };
      const rec = getDoseModificationRecommendation(p105, [{ anc: 750, ctcae_grade: 3 }]);
      assert.equal(rec.badgeVariant, "warning");
      assert.equal(rec.actionRequired, true);
      assert.match(rec.doseAdjustment, /Delay initiation of Cycle 3 by 7 days/);
      assert.match(rec.gcsfProphylaxis, /pegfilgrastim 6 mg/);
    });

    it("returns 100% full dose continuation for Elena Rostova (Grade 0 Stable)", () => {
      const p106 = { id: "106", name: "Elena Rostova", regimen: "AC-T", cycle: "Cycle 4", baselineAnc: 1650, grade: 0 };
      const rec = getDoseModificationRecommendation(p106, [{ anc: 1620, ctcae_grade: 0 }]);
      assert.equal(rec.badgeVariant, "success");
      assert.equal(rec.actionRequired, false);
      assert.match(rec.doseAdjustment, /No dose reduction or schedule delay warranted/);
      assert.match(rec.recommendation, /Hematologic recovery verified robust/);
    });

    it("dynamically computes recommendation for custom admitted patient with ANC < 500", () => {
      const customPatient = { id: "3274", name: "Sung Jinwoo", regimen: "mFOLFOX6", cycle: "Cycle 4", baselineAnc: 1450 };
      const rec = getDoseModificationRecommendation(customPatient, [{ anc: 390, ctcae_grade: 4 }]);
      assert.equal(rec.badgeVariant, "danger");
      assert.equal(rec.actionRequired, true);
      assert.match(rec.doseAdjustment, /20%/);
    });

    it("returns Grade 2 surveillance and pre-infusion CBC check for Robert Chen", () => {
      const p107 = { id: "107", name: "Robert Chen", regimen: "FOLFIRINOX", cycle: "Cycle 3", baselineAnc: 2800, grade: 2 };
      const rec = getDoseModificationRecommendation(p107, [{ anc: 1250, ctcae_grade: 2 }]);
      assert.equal(rec.badgeVariant, "warning");
      assert.equal(rec.actionRequired, false);
      assert.match(rec.statusBadge, /Grade 2/);
      assert.match(rec.title, /Close Surveillance/);
      assert.match(rec.recommendation, /Moderate myelosuppression/);
    });

    it("returns Grade 1 mild monitoring and 100% dose continuation for Emily Watson", () => {
      const p108 = { id: "108", name: "Emily Watson", regimen: "Cisplatin + Pemetrexed", cycle: "Cycle 2", baselineAnc: 3100, grade: 1 };
      const rec = getDoseModificationRecommendation(p108, [{ anc: 1750, ctcae_grade: 1 }]);
      assert.equal(rec.badgeVariant, "warning");
      assert.equal(rec.actionRequired, false);
      assert.match(rec.statusBadge, /Grade 1 Mild · Monitoring/);
      assert.match(rec.doseAdjustment, /100% relative dose intensity/);
    });

    it("prioritizes Grade 2 toxicity vigilance even when ANC >= 1500", () => {
      const patient = { id: "201", name: "Alex Chen", regimen: "mFOLFOX6", cycle: "Cycle 2", baselineAnc: 1800, grade: 2 };
      const rec = getDoseModificationRecommendation(patient, [{ anc: 1650, ctcae_grade: 2 }]);
      assert.equal(rec.badgeVariant, "warning");
      assert.match(rec.statusBadge, /Moderate Vigilance · Grade 2/);
      assert.match(rec.title, /Close Surveillance & Pre-infusion CBC Check/);
    });
  });

  describe("cleanToastMessage", () => {
    it("strips duplicate checkmarks, alert symbols, and leading whitespace", () => {
      assert.equal(cleanToastMessage("✓ Updated verification point 2"), "Updated verification point 2");
      assert.equal(cleanToastMessage("✓ ✓ Note attested"), "Note attested");
      assert.equal(cleanToastMessage("✅ Patient admitted"), "Patient admitted");
      assert.equal(cleanToastMessage("⚠️ Bed 12 occupied"), "Bed 12 occupied");
      assert.equal(cleanToastMessage("ℹ️ New lab results"), "New lab results");
      assert.equal(cleanToastMessage("Clinician profile updated"), "Clinician profile updated");
      assert.equal(cleanToastMessage(""), "");
    });
  });

  describe("deriveDoctorInitials", () => {
    it("derives clean initials from physician names with titles and suffixes", () => {
      assert.equal(deriveDoctorInitials("Dr. Amrut S Kadam, MD"), "AK");
      assert.equal(deriveDoctorInitials("Dr. Gregory House, MD"), "GH");
      assert.equal(deriveDoctorInitials("Dr. Sarah Jenkins"), "SJ");
      assert.equal(deriveDoctorInitials("Elena Rostova"), "ER");
      assert.equal(deriveDoctorInitials(""), "MD");
    });
  });

  describe("Clinician Profile & Clinical Notifications Defaults", () => {
    it("provides complete default clinician profile with valid NPI and initials", () => {
      assert.equal(DEFAULT_CLINICIAN_PROFILE.name, "Dr. Amrut S Kadam, MD");
      assert.equal(DEFAULT_CLINICIAN_PROFILE.initials, "AK");
      assert.equal(DEFAULT_CLINICIAN_PROFILE.npi, "1849204821");
      assert.equal(DEFAULT_CLINICIAN_PROFILE.hospital, "City Cancer Center");
    });

    it("initializes clinical notifications with active ward alerts and correct urgency types", () => {
      assert.ok(INITIAL_CLINICAL_NOTIFICATIONS.length >= 3);
      const grade4Notif = INITIAL_CLINICAL_NOTIFICATIONS.find((n) => n.type === "alert");
      assert.ok(grade4Notif);
      assert.match(grade4Notif.title, /Grade 4/);
      assert.equal(grade4Notif.read, false);
    });
  });
});
