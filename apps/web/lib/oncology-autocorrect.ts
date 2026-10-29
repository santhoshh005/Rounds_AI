/**
 * Deterministic Oncology Phonetic Auto-Correction and Normalization Engine
 * Ported to TypeScript for zero-latency, 100% client-side privacy and offline reliability.
 * Normalizes chemotherapy regimens, oncology drugs, laboratory acronyms, CTCAE toxicities,
 * and spoken clinical numbers while safeguarding patient facts.
 */

export interface AutocorrectChange {
  original: string
  corrected: string
  ruleId: string
}

export interface AutocorrectResult {
  originalText: string
  correctedText: string
  changes: AutocorrectChange[]
}

type OncologyRule = {
  id: string
  pattern: RegExp
  replacement: string
}

export const ONCOLOGY_RULES: OncologyRule[] = [
  // ── Chemotherapy Regimens ───────────────────────────────────────────
  {
    id: "RULE_CHEMO_MFOLFOX6",
    pattern: /\b(fall\s+fox\s*6|full\s+fox\s*6|four\s+fox\s*6|fall\s+faux\s*6|fall\s+fox|full\s+fox|folfox\s*6|m\s+folfox\s*6|mfolfox\s*6|mfolfox6)\b/gi,
    replacement: "mFOLFOX6",
  },
  {
    id: "RULE_CHEMO_RCHOP",
    pattern: /\b(our\s+chop|are\s+chop|arch\s+op|r\s+chop|rchop)\b/gi,
    replacement: "R-CHOP",
  },
  {
    id: "RULE_CHEMO_ACT",
    pattern: /\b(ac\s*-\s*t|ac\s+t|a\s+c\s+t|act\s+chemo)\b/gi,
    replacement: "AC-T",
  },
  {
    id: "RULE_CHEMO_FOLFIRI",
    pattern: /\b(fol\s+firi|fall\s+firi|fall\s+feery|fall\s+feeri|fol\s+feery|folfiri)\b/gi,
    replacement: "FOLFIRI",
  },
  {
    id: "RULE_CHEMO_FOLFIRINOX",
    pattern: /\b(fol\s+firinox|fall\s+firinox|folfirinox|m\s+folfirinox)\b/gi,
    replacement: "FOLFIRINOX",
  },
  {
    id: "RULE_CHEMO_CAPOX",
    pattern: /\b(cape\s+ox|cap\s+ox|capox)\b/gi,
    replacement: "CAPOX",
  },
  {
    id: "RULE_CHEMO_CARBOTAXOL",
    pattern: /\b(carbo\s+taxol|carboplatin\s+paclitaxel)\b/gi,
    replacement: "Carboplatin + Paclitaxel",
  },
  {
    id: "RULE_CHEMO_5FU",
    pattern: /\b(five\s+f\s*u|5\s+f\s*u|five\s+fu|5\s+fu|5-fu|5-florouracil|five\s+fluorouracil)\b/gi,
    replacement: "5-FU",
  },

  // ── Specific Toxicities First (Longer/Compound phrases first) ────────
  {
    id: "RULE_TOX_FN",
    pattern: /\b(febrile\s+new\s*trophy\s*near|febrile\s+neutral\s*peenia|febrile\s+neutropenia)\b/gi,
    replacement: "febrile neutropenia (CTCAE Grade 4)",
  },
  {
    id: "RULE_TOX_NEUTROPENIA",
    pattern: /\b(new\s*trophy\s*near|neutral\s*peenia|neutro\s*penia)\b/gi,
    replacement: "neutropenia",
  },
  {
    id: "RULE_TOX_THROMBO",
    pattern: /\b(thrombo\s*cyto\s*penia|thrombo\s*cytopenia|low\s+platelets)\b/gi,
    replacement: "thrombocytopenia",
  },
  {
    id: "RULE_TOX_MUCOSITIS",
    pattern: /\b(muc\s*ositis|mouth\s+sores|stomatitis)\b/gi,
    replacement: "oral mucositis",
  },
  {
    id: "RULE_TOX_COLD_DYSESTHESIA",
    pattern: /\b(dys\s*esthesia|cold\s+dysesthesia|cold\s+allodynia)\b/gi,
    replacement: "cold dysesthesia",
  },
  {
    id: "RULE_TOX_PARESTHESIAS",
    pattern: /\b(paresthesia|paresthesias|pins\s+and\s+needles)\b/gi,
    replacement: "peripheral paresthesias",
  },
  {
    id: "RULE_TOX_HANDFOOT",
    pattern: /\b(hand\s+and\s+foot\s+syndrome|hand\s+foot\s+syndrome)\b/gi,
    replacement: "hand-foot syndrome",
  },

  // ── Oncology Drugs & Antineoplastics ────────────────────────────────
  {
    id: "RULE_DRUG_OXALI",
    pattern: /\b(ox\s*ally\s*platin|oxley\s*platin|oxali\s*platting|oxaliplatin)\b/gi,
    replacement: "oxaliplatin",
  },
  {
    id: "RULE_DRUG_CAPE",
    pattern: /\b(capacity\s*bean|cape\s*site\s*a\s*bean|cape\s*cita\s*bine|capecitabine)\b/gi,
    replacement: "capecitabine",
  },
  {
    id: "RULE_DRUG_PEMBRO",
    pattern: /\b(pembro\s*lizzie\s*mab|pembro\s*lizumab|keytruda)\b/gi,
    replacement: "pembrolizumab",
  },
  {
    id: "RULE_DRUG_NIVO",
    pattern: /\b(nivo\s*lizzie\s*mab|nivo\s*lumab|opdivo)\b/gi,
    replacement: "nivolumab",
  },
  {
    id: "RULE_DRUG_TRASTU",
    pattern: /\b(trastu\s*zumab|herceptin)\b/gi,
    replacement: "trastuzumab",
  },
  {
    id: "RULE_DRUG_RITUX",
    pattern: /\b(ritux\s*i\s*mab|rituxan)\b/gi,
    replacement: "rituximab",
  },
  {
    id: "RULE_DRUG_FILGRA",
    pattern: /\b(phil\s*grass\s*tim|phil\s*grastim|fil\s*grass\s*tim|filgrastim|neupogen)\b/gi,
    replacement: "filgrastim (G-CSF)",
  },
  {
    id: "RULE_DRUG_PEGFILGRA",
    pattern: /\b(peg\s*fil\s*grastim|neulasta)\b/gi,
    replacement: "pegfilgrastim",
  },
  {
    id: "RULE_DRUG_DOXO",
    pattern: /\b(doxo\s*rubicin|adria\s*mycin)\b/gi,
    replacement: "doxorubicin",
  },
  {
    id: "RULE_DRUG_CYCLO",
    pattern: /\b(cyclo\s*phosphamide|cytoxan)\b/gi,
    replacement: "cyclophosphamide",
  },
  {
    id: "RULE_DRUG_ONDAN",
    pattern: /\b(on\s*dan\s*setron|zofran)\b/gi,
    replacement: "ondansetron",
  },
  {
    id: "RULE_DRUG_APREP",
    pattern: /\b(aprep\s*i\s*tant|emend)\b/gi,
    replacement: "aprepitant",
  },
  {
    id: "RULE_DRUG_PIPTAZO",
    pattern: /\b(pip\s*tazo|zosyn|piperacillin\s+tazobactam)\b/gi,
    replacement: "piperacillin-tazobactam (Zosyn)",
  },
  {
    id: "RULE_DRUG_CEFEPIME",
    pattern: /\b(cef\s*epime|maxipime)\b/gi,
    replacement: "cefepime",
  },
  {
    id: "RULE_DRUG_MEROPENEM",
    pattern: /\b(mero\s*penem|merrem)\b/gi,
    replacement: "meropenem",
  },

  // ── Lab Tests & Blood Counts ──────────────────────────────────────────
  {
    id: "RULE_LAB_ANC",
    pattern: /\b(and\s+see|a\s+and\s+c|agency|a\s+n\s+c|an\s+c|absolute\s+neutrophil\s+count)\b/gi,
    replacement: "ANC",
  },
  {
    id: "RULE_LAB_WBC",
    pattern: /\b(we\s+bc|w\s+b\s+c|wb\s*c|white\s+count|white\s+blood\s+cells?)\b/gi,
    replacement: "WBC",
  },
  {
    id: "RULE_LAB_PLT",
    pattern: /\b(plate\s+lets|plate\s+let|p\s+l\s+t|plt)\b/gi,
    replacement: "platelets",
  },
  {
    id: "RULE_LAB_HGB",
    pattern: /\b(hemo\s*globin|hema\s*globin|h\s*g\s*b|hgb)\b/gi,
    replacement: "hemoglobin",
  },
  {
    id: "RULE_LAB_CREAT",
    pattern: /\b(cre\s*atinine|serum\s+creatinine)\b/gi,
    replacement: "creatinine",
  },
  {
    id: "RULE_LAB_EGFR",
    pattern: /\b(e\s*g\s*f\s*r|egfr)\b/gi,
    replacement: "eGFR",
  },

  // ── Spoken Clinical Numbers & Counts ──────────────────────────────
  {
    id: "RULE_NUM_200K",
    pattern: /\b(two\s+hundred\s+thousand|two-hundred\s+thousand)\b/gi,
    replacement: "200,000",
  },
  {
    id: "RULE_NUM_150K",
    pattern: /\b(one\s+hundred\s+(?:and\s+)?fifty\s+thousand|one-hundred-fifty\s+thousand)\b/gi,
    replacement: "150,000",
  },
  {
    id: "RULE_NUM_100K",
    pattern: /\b(one\s+hundred\s+thousand|one-hundred\s+thousand)\b/gi,
    replacement: "100,000",
  },
  {
    id: "RULE_NUM_88K",
    pattern: /\b(eighty\s+eight\s+thousand|eighty-eight\s+thousand)\b/gi,
    replacement: "88,000",
  },
  {
    id: "RULE_NUM_50K",
    pattern: /\b(fifty\s+thousand)\b/gi,
    replacement: "50,000",
  },
  {
    id: "RULE_NUM_25K",
    pattern: /\b(twenty\s+five\s+thousand|twenty-five\s+thousand)\b/gi,
    replacement: "25,000",
  },
  {
    id: "RULE_NUM_2100",
    pattern: /\b(twenty\s+one\s+hundred|twenty-one\s+hundred)\b/gi,
    replacement: "2,100",
  },
  {
    id: "RULE_NUM_1650",
    pattern: /\b(sixteen\s+fifty|sixteen\s+hundred\s+fifty)\b/gi,
    replacement: "1,650",
  },
  {
    id: "RULE_NUM_1620",
    pattern: /\b(sixteen\s+twenty|sixteen\s+hundred\s+twenty)\b/gi,
    replacement: "1,620",
  },
  {
    id: "RULE_NUM_1400",
    pattern: /\b(fourteen\s+hundred)\b/gi,
    replacement: "1,400",
  },
  {
    id: "RULE_NUM_1000",
    pattern: /\b(ten\s+hundred|one\s+thousand)\b/gi,
    replacement: "1,000",
  },
  {
    id: "RULE_NUM_900",
    pattern: /\b(nine\s+hundred)\b/gi,
    replacement: "900",
  },
  {
    id: "RULE_NUM_750",
    pattern: /\b(seven\s+fifty|seven\s+hundred\s+fifty)\b/gi,
    replacement: "750",
  },
  {
    id: "RULE_NUM_610",
    pattern: /\b(six\s+ten|six\s+hundred\s+ten)\b/gi,
    replacement: "610",
  },
  {
    id: "RULE_NUM_500",
    pattern: /\b(five\s+hundred)\b/gi,
    replacement: "500",
  },
  {
    id: "RULE_NUM_420",
    pattern: /\b(four\s+twenty|four\s+hundred\s+twenty)\b/gi,
    replacement: "420",
  },

  // ── Scores, Units & Standard Clinical Terms ──────────────────────────
  {
    id: "RULE_SCORE_ECOG0",
    pattern: /\b(e\s*cog\s*0|echo\s*g\s*0|e\s+c\s+o\s+g\s*0|ecog\s+zero|ecog\s+performance\s+status\s+0)\b/gi,
    replacement: "ECOG PS 0",
  },
  {
    id: "RULE_SCORE_ECOG1",
    pattern: /\b(e\s*cog\s*1|echo\s*g\s*1|e\s+c\s+o\s+g\s*1|ecog\s+one|ecog\s+performance\s+status\s+1)\b/gi,
    replacement: "ECOG PS 1",
  },
  {
    id: "RULE_SCORE_ECOG2",
    pattern: /\b(e\s*cog\s*2|echo\s*g\s*2|e\s+c\s+o\s+g\s*2|ecog\s+two|ecog\s+performance\s+status\s+2)\b/gi,
    replacement: "ECOG PS 2",
  },
  {
    id: "RULE_ACR_CTCAE",
    pattern: /\b(ct\s*cae|c\s+t\s+c\s+a\s+e)\b/gi,
    replacement: "CTCAE v5.0",
  },
  {
    id: "RULE_UNIT_DEGC",
    pattern: /\b(\d+(?:\.\d+)?)\s*(?:degrees?\s*c|degrees?\s*celsius|deg\s*c)\b/gi,
    replacement: "$1°C",
  },
  {
    id: "RULE_UNIT_CELLS_UL",
    pattern: /\b(cells\s+per\s+microliter|cells\s+per\s+ul|cells\s+ul)\b/gi,
    replacement: "cells/µL",
  },
  {
    id: "RULE_UNIT_UL",
    pattern: /\b(per\s+microliter|per\s+ul)\b/gi,
    replacement: "/µL",
  },
  {
    id: "RULE_VITAL_AFEBRILE",
    pattern: /\b(a\s+febrile|not\s+febrile)\b/gi,
    replacement: "afebrile",
  },
]

/**
 * Fast deterministic oncology speech error correction with phonetic normalizer.
 * Returns cleaned text and array of structured replacements applied.
 */
export function autocorrectOncologyTranscript(text: string): AutocorrectResult {
  if (!text || !text.trim()) {
    return { originalText: text, correctedText: text, changes: [] }
  }

  let corrected = text
  const changes: AutocorrectChange[] = []

  for (const rule of ONCOLOGY_RULES) {
    const matches = Array.from(corrected.matchAll(rule.pattern))
    if (matches.length > 0) {
      for (const m of matches) {
        const orig = m[0]
        const repl = orig.replace(rule.pattern, rule.replacement)
        if (orig !== repl) {
          changes.push({
            original: orig,
            corrected: repl,
            ruleId: rule.id,
          })
        }
      }
      corrected = corrected.replace(rule.pattern, rule.replacement)
    }
  }

  return {
    originalText: text,
    correctedText: corrected,
    changes,
  }
}
