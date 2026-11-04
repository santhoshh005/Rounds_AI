import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spokenNumbersToDigits } from "./spoken-numbers.ts";
import { analyzeTranscriptLocally } from "./round-analysis.ts";

// Same cases as tests/test_spoken_numbers.py — the two readers must agree.
const CASES: [string, string][] = [
  ["ANC four twenty", "ANC 420"],
  ["platelets eighty eight thousand", "platelets 88000"],
  ["WBC one point eight", "WBC 1.8"],
  ["temp one oh one point three", "temp 101.3"],
  ["ANC zero point four", "ANC 0.4"],
  ["one hundred and twenty", "120"],
  ["twelve fifty", "1250"],
  ["four two zero", "420"],
  ["twenty-five", "25"],
  ["Oh well, ANC 1500", "Oh well, ANC 1500"],
  ["the point is", "the point is"],
];

describe("spokenNumbersToDigits", () => {
  for (const [input, expected] of CASES) {
    it(`reads "${input}"`, () => assert.equal(spokenNumbersToDigits(input), expected));
  }
});

describe("offline analysis of spoken dictation", () => {
  it("extracts labs and fever from number words", () => {
    const result = analyzeTranscriptLocally(
      "Febrile, temp one oh one point three. ANC four twenty, platelets eighty eight thousand, hemoglobin nine point two.",
    );
    assert.equal(result.labs.anc, 420);
    assert.equal(result.labs.platelets, 88000);
    assert.equal(result.labs.hemoglobin, 9.2);
    assert.equal(result.temperatureC, 38.5);
  });
});
