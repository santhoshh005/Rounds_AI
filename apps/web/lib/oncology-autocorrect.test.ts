import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autocorrectOncologyTranscript,
  applySelectedCorrections,
  formatSpokenClinicalPunctuation,
} from "./oncology-autocorrect.ts";

describe("Oncology Terms Auto-Correction Engine", () => {
  it("normalizes spoken chemotherapy regimens accurately", () => {
    const input = "patient on our chop cycle 2, previous fall fox 6, ac-t, and five fu";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("R-CHOP"));
    assert.ok(result.correctedText.includes("mFOLFOX6"));
    assert.ok(result.correctedText.includes("AC-T"));
    assert.ok(result.correctedText.includes("5-FU"));
    assert.ok(result.averageConfidence >= 95);
  });

  it("normalizes user speech misrecognitions 'Anarcho AMC, 1400 RPM' to 'ANC, 1,400 /µL'", () => {
    const input = "Shen, Anarcho AMC, 1400 RPM. Patient is having fever.";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("ANC"));
    assert.ok(result.correctedText.includes("1,400 /µL") || result.correctedText.includes("/µL"));
    assert.ok(result.correctedText.includes("febrile"));
    assert.ok(result.changes.length >= 3);
    assert.ok(result.averageConfidence >= 95);
  });

  it("normalizes oncology drugs and supportive agents", () => {
    const input = "given ox ally platin with phil grass tim and doxo rubicin";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("oxaliplatin"));
    assert.ok(result.correctedText.includes("filgrastim (G-CSF)"));
    assert.ok(result.correctedText.includes("doxorubicin"));
  });

  it("normalizes spoken lab names and spoken number counts", () => {
    const input = "and see is four twenty and plate lets are eighty eight thousand and we bc twenty one hundred";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("ANC"));
    assert.ok(result.correctedText.includes("420"));
    assert.ok(result.correctedText.includes("platelets"));
    assert.ok(result.correctedText.includes("88,000"));
    assert.ok(result.correctedText.includes("WBC"));
    assert.ok(result.correctedText.includes("2,100"));
  });

  it("normalizes CTCAE toxicities, performance scores, and units", () => {
    const input = "patient has febrile new trophy near with muc ositis, echo g 0, temp 38.4 degrees c";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("febrile neutropenia (CTCAE v5.0 Grade 4)"));
    assert.ok(result.correctedText.includes("oral mucositis"));
    assert.ok(result.correctedText.includes("ECOG PS 0"));
    assert.ok(result.correctedText.includes("38.4°C"));
  });

  it("applies only selected corrections using applySelectedCorrections", () => {
    const input = "patient on our chop and has muc ositis";
    const result = autocorrectOncologyTranscript(input);
    assert.equal(result.changes.length, 2);

    // Deselect the second change
    const modifiedChanges = [
      { ...result.changes[0], selected: true },
      { ...result.changes[1], selected: false },
    ];
    const partiallyApplied = applySelectedCorrections(input, modifiedChanges);
    assert.ok(partiallyApplied.includes("R-CHOP"));
    assert.ok(partiallyApplied.includes("muc ositis")); // Kept original
  });

  it("normalizes newly added regimens, antineoplastic drugs, and tumor markers", () => {
    const input = "patient scheduled for flot chemo, received gem cite a bean and pack lee tax el with leuco vorin rescue, followed by vanco mycin. Labs: blood urea nitrogen and ca 19-9 elevated";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("FLOT"));
    assert.ok(result.correctedText.includes("gemcitabine"));
    assert.ok(result.correctedText.includes("paclitaxel"));
    assert.ok(result.correctedText.includes("leucovorin"));
    assert.ok(result.correctedText.includes("vancomycin"));
    assert.ok(result.correctedText.includes("BUN"));
    assert.ok(result.correctedText.includes("CA 19-9"));
  });

  it("converts spoken clinical punctuation accurately", () => {
    const spoken = "patient on mFOLFOX6 comma afebrile period Labs show ANC 420 cells per microliter period next line start IV piperacillin tazobactam";
    const formatted = formatSpokenClinicalPunctuation(spoken);
    assert.ok(formatted.includes("mFOLFOX6, afebrile."));
    assert.ok(formatted.includes("period") === false);
    assert.ok(formatted.includes("comma") === false);
    assert.ok(formatted.includes("\n"));
  });
});
