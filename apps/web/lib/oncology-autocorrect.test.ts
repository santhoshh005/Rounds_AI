import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autocorrectOncologyTranscript } from "./oncology-autocorrect.ts";

describe("Oncology Terms Auto-Correction Engine", () => {
  it("normalizes spoken chemotherapy regimens accurately", () => {
    const input = "patient on our chop cycle 2, previous fall fox 6, ac-t, and five fu";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.correctedText.includes("R-CHOP"));
    assert.ok(result.correctedText.includes("mFOLFOX6"));
    assert.ok(result.correctedText.includes("AC-T"));
    assert.ok(result.correctedText.includes("5-FU"));
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

  it("returns structured changes tracking every replacement", () => {
    const input = "our chop with and see 750";
    const result = autocorrectOncologyTranscript(input);
    assert.ok(result.changes.length >= 2);
    assert.ok(result.changes.some((c) => c.corrected === "R-CHOP"));
    assert.ok(result.changes.some((c) => c.corrected === "ANC"));
  });
});
