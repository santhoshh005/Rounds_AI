# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Specialized phonetic & acoustic correction patterns for oncology ward dictation
# Maps commonly misrecognized speech phrases to accurate oncology clinical terminology
_ONCOLOGY_PHONETIC_REPLACEMENTS = [
    # ── Lab Tests & Blood Counts ──────────────────────────────────────────
    (r"\b(and\s+see|a\s+and\s+c|agency|a\s+n\s+c|an\s+c|anc)\b", "ANC"),
    (r"\b(wb\s*c|w\s+b\s+c|we\s+bc|white\s+count|white\s+blood\s+cells?)\b", "WBC"),
    (r"\b(plate\s+lets|plate\s+let|plt|p\s+l\s+t)\b", "platelets"),
    (r"\b(hemo\s*globin|hema\s*globin|hgb|h\s*g\s*b)\b", "hemoglobin"),
    (r"\b(hemato\s*crit|hct|h\s*c\s*t)\b", "hematocrit"),
    (r"\b(ab\s*solute\s+neutro\s*phil\s+count)\b", "Absolute Neutrophil Count (ANC)"),
    (r"\b(cre\s*atinine|serum\s+creatinine|cr|s\s*cr)\b", "creatinine"),
    (r"\b(e\s*g\s*f\s*r|egfr|g\s*f\s*r)\b", "eGFR"),
    (r"\b(total\s+bili\s*rubin|bili\s*rubin|t\s*bili)\b", "total bilirubin"),
    (r"\b(a\s*s\s*t|ast|s\s*g\s*o\s*t)\b", "AST"),
    (r"\b(a\s*l\s*t|alt|s\s*g\s*p\s*t)\b", "ALT"),
    (r"\b(alk\s*phos|alkaline\s+phosphatase)\b", "alkaline phosphatase"),
    (r"\b(l\s*d\s*h|ldh|lactate\s+dehydrogenase)\b", "LDH"),
    (r"\b(al\s*bumin|serum\s+albumin)\b", "albumin"),
    (r"\b(c\s*e\s*a|cea|carcino\s*embryonic\s+antigen)\b", "CEA"),
    (r"\b(c\s*a\s*125|ca\s*125|ca\s+one\s+twenty\s+five)\b", "CA-125"),
    (r"\b(p\s*s\s*a|psa|prostate\s+specific\s+antigen)\b", "PSA"),

    # ── Spoken Clinical Numbers & Counts ──────────────────────────────
    (r"\b(twenty\s+one\s+hundred|twenty-one\s+hundred)\b", "2,100"),
    (r"\b(twenty\s+five\s+hundred|twenty-five\s+hundred)\b", "2,500"),
    (r"\b(fifteen\s+hundred)\b", "1,500"),
    (r"\b(fourteen\s+hundred)\b", "1,400"),
    (r"\b(twelve\s+hundred)\b", "1,200"),
    (r"\b(eleven\s+hundred)\b", "1,100"),
    (r"\b(ten\s+hundred|one\s+thousand)\b", "1,000"),
    (r"\b(nine\s+hundred)\b", "900"),
    (r"\b(eight\s+hundred)\b", "800"),
    (r"\b(seven\s+hundred)\b", "700"),
    (r"\b(six\s+hundred)\b", "600"),
    (r"\b(five\s+hundred)\b", "500"),
    (r"\b(four\s+hundred)\b", "400"),
    (r"\b(three\s+hundred)\b", "300"),
    (r"\b(two\s+hundred)\b", "200"),
    (r"\b(one\s+hundred)\b", "100"),

    # ── Chemotherapy Regimens ───────────────────────────────────────────
    (r"\b(fall\s+fox|full\s+fox|four\s+fox|fall\s+faux|folfox\s*6|m\s+folfox\s*6|mfolfox\s*6)\b", "mFOLFOX6"),
    (r"\b(our\s+chop|are\s+chop|arch\s+op|r\s+chop|rchop)\b", "R-CHOP"),
    (r"\b(ac\s*-\s*t|ac\s+t|a\s+c\s+t|act\s+chemo)\b", "AC-T"),
    (r"\b(fol\s+firi|fall\s+firi|folfiri)\b", "FOLFIRI"),
    (r"\b(fol\s+firinox|fall\s+firinox|folfirinox|m\s+folfirinox)\b", "FOLFIRINOX"),
    (r"\b(cape\s+ox|cap\s+ox|capox)\b", "CAPOX"),
    (r"\b(gem\s*zar\s+abrax\s*ane|gem\s+abraxane)\b", "Gemcitabine + Abraxane"),
    (r"\b(flot\s+regimen|flot\s+chemo|f\s*l\s*o\s*t)\b", "FLOT"),
    (r"\b(t\s*-\s*dm1|tdm1|kadcyla)\b", "T-DM1"),
    (r"\b(abvd|a\s*b\s*v\s*d)\b", "ABVD"),
    (r"\b(bep|b\s*e\s*p\s+regimen)\b", "BEP"),
    (r"\b(carbo\s+taxol|carboplatin\s+paclitaxel)\b", "Carboplatin + Paclitaxel"),

    # ── Oncology Drugs & Antineoplastics ────────────────────────────────
    (r"\b(ox\s*ally\s*platin|oxley\s*platin|oxali\s*platting|oxaliplatin)\b", "Oxaliplatin"),
    (r"\b(capacity\s*bean|cape\s*site\s*a\s*bean|cape\s*cita\s*bine|capecitabine)\b", "Capecitabine"),
    (r"\b(pembro\s*lizzie\s*mab|pembro\s*lizumab|keytruda)\b", "Pembrolizumab"),
    (r"\b(nivo\s*lizzie\s*mab|nivo\s*lumab|opdivo)\b", "Nivolumab"),
    (r"\b(trastu\s*zumab|herceptin)\b", "Trastuzumab"),
    (r"\b(pertu\s*zumab|perjeta)\b", "Pertuzumab"),
    (r"\b(ritux\s*i\s*mab|rituxan)\b", "Rituximab"),
    (r"\b(beva\s*cizumab|avastin)\b", "Bevacizumab"),
    (r"\b(phil\s*grass\s*tim|phil\s*grastim|fil\s*grass\s*tim|filgrastim|neupogen)\b", "Filgrastim"),
    (r"\b(peg\s*fil\s*grastim|neulasta)\b", "Pegfilgrastim"),
    (r"\b(doxo\s*rubicin|adria\s*mycin)\b", "Doxorubicin"),
    (r"\b(cyclo\s*phosphamide|cytoxan)\b", "Cyclophosphamide"),
    (r"\b(on\s*dan\s*setron|zofran)\b", "Ondansetron"),
    (r"\b(gran\s*i\s*setron|kytril)\b", "Granisetron"),
    (r"\b(aprep\s*i\s*tant|emend)\b", "Aprepitant"),
    (r"\b(dexa\s*methasone|decadron)\b", "Dexamethasone"),
    (r"\b(lop\s*eramide|imodium)\b", "Loperamide"),
    (r"\b(cef\s*epime|maxipime)\b", "Cefepime"),
    (r"\b(pip\s*tazo|zosyn|piperacillin\s+tazobactam)\b", "Piperacillin-Tazobactam"),
    (r"\b(mero\s*penem|merrem)\b", "Meropenem"),
    (r"\b(vanco\s*mycin|vancocin)\b", "Vancomycin"),

    # ── Toxicities & Adverse Events ─────────────────────────────────────
    (r"\b(new\s*trophy\s*near|neutral\s*peenia|neutro\s*penia)\b", "neutropenia"),
    (r"\b(febrile\s+new\s*trophy\s*near|febrile\s+neutral\s*peenia|f\s*n|febrile\s+neutropenia)\b", "febrile neutropenia"),
    (r"\b(thrombo\s*cyto\s*penia|thrombo\s*cytopenia|low\s+platelets)\b", "thrombocytopenia"),
    (r"\b(dys\s*esthesia|cold\s+dysesthesia|cold\s+allodynia)\b", "cold dysesthesia"),
    (r"\b(muc\s*ositis|mouth\s+sores|stomatitis)\b", "mucositis"),
    (r"\b(paresthesia|paresthesias|pins\s+and\s+needles)\b", "paresthesias"),
    (r"\b(hand\s+and\s+foot\s+syndrome|hand\s+foot\s+syndrome|palmar\s+plantar\s+erythrodysesthesia)\b", "hand-foot syndrome"),
    (r"\b(cinv|c\s*i\s*n\s*v|chemo\s+induced\s+nausea)\b", "CINV"),
    (r"\b(alo\s*pecia|hair\s+loss)\b", "alopecia"),
    (r"\b(tumor\s+lysis|t\s*l\s*s)\b", "tumor lysis syndrome"),

    # ── Scores, Acronyms & Units ────────────────────────────────────────
    (r"\b(e\s*cog|echo\s*g|e\s+c\s+o\s+g)\s*([0-4])\b", r"ECOG \2"),
    (r"\b(ct\s*cae|c\s+t\s+c\s+a\s+e)\b", "CTCAE"),
    (r"\b(dlbcl|d\s+l\s+b\s+c\s+l)\b", "DLBCL"),
    (r"\b(nsclc|n\s+s\s+c\s+l\s+c)\b", "NSCLC"),
    (r"\b(tnbc|t\s+n\s+b\s+c)\b", "TNBC"),
    (r"\b(\d+(\.\d+)?)\s*(degree\s*c|degrees\s*c|degrees\s*celsius)\b", r"\1°C"),
    (r"\b(\d+(\.\d+)?)\s*(degree\s*f|degrees\s*f|degrees\s*fahrenheit)\b", r"\1°F"),
    (r"\b(cells\s+per\s+microliter|cells\s+per\s+ul|cells\s+ul)\b", "cells/µL"),
    (r"\b(per\s+microliter|per\s+ul)\b", "/µL"),
    (r"\b(grams\s+per\s+deciliter|g\s+dl)\b", "g/dL"),
    (r"\b(milligrams\s+per\s+deciliter|mg\s+dl)\b", "mg/dL"),
    (r"\b(milligrams\s+per\s+square\s+meter|mg\s+m2|mg\s+per\s+m2)\b", "mg/m²"),
    (r"\bcycle\s*(\d+)\b", r"Cycle \1"),
    (r"\bbed\s*(\d+)\b", r"Bed \1"),
    (r"\bpt\s*#?\s*(\d+)\b", r"Patient #\1"),
    (r"\bpatient\s*(\d+)\b", r"Patient \1"),
]


def apply_rule_based_autocorrect(text: str) -> tuple[str, list[dict]]:
    """Fast deterministic oncology speech error correction.

    Returns the cleaned text along with a list of corrections applied.
    """
    if not text:
        return "", []

    corrected = text
    applied_changes = []

    for pattern, replacement in _ONCOLOGY_PHONETIC_REPLACEMENTS:
        matches = list(re.finditer(pattern, corrected, flags=re.IGNORECASE))
        if matches:
            for m in reversed(matches):
                orig_snippet = m.group(0)
                # Compute replacement string (supporting backreferences)
                repl = re.sub(pattern, replacement, orig_snippet, flags=re.IGNORECASE)
                if orig_snippet != repl:
                    start, end = m.span()
                    corrected = corrected[:start] + repl + corrected[end:]
                    applied_changes.append({
                        "from": orig_snippet,
                        "to": repl,
                    })

    # Capitalize the first letter of sentences
    sentences = re.split(r"([.!?]\s+)", corrected)
    capitalized_sentences = []
    for s in sentences:
        if s and not re.match(r"^[.!?]\s+$", s):
            s = s[0].upper() + s[1:]
        capitalized_sentences.append(s)
    corrected = "".join(capitalized_sentences)

    return corrected.strip(), applied_changes


def _deduplicate_changes(changes: list[dict]) -> list[dict]:
    """Deduplicate applied corrections."""
    seen = set()
    deduped = []
    for c in changes:
        k = c.get("from", "").lower().strip()
        if k and k not in seen:
            seen.add(k)
            deduped.append(c)
    return deduped


def correct_clinical_transcript(raw_text: str, use_gemini: bool = True) -> dict:
    """High-accuracy oncology clinical auto-correction pipeline.

    Combines deterministic oncology phonetic mapping with Gemini 2.5 Flash
    (₹0 free tier) medical entity and clinical grammar verification.
    """
    if not raw_text or not raw_text.strip():
        return {
            "original_text": "",
            "corrected_text": "",
            "changes": [],
            "engine": "none",
        }

    # Step 1: Deterministic oncology phonetic correction
    cleaned_rule, rule_changes = apply_rule_based_autocorrect(raw_text)

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not use_gemini or not api_key:
        return {
            "original_text": raw_text,
            "corrected_text": cleaned_rule,
            "changes": _deduplicate_changes(rule_changes),
            "engine": "rule_based_oncology",
        }

    # Step 2: Gemini 2.5 Flash contextual medical polish
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = (
            "You are a board-certified clinical oncology medical documentation specialist.\n"
            "Your task is to accurately transcribe and normalize the following clinician ward-round dictation.\n\n"
            "CLINICAL RULES:\n"
            "1. Accurately standardize chemotherapy regimens (e.g., mFOLFOX6, R-CHOP, AC-T, FOLFIRINOX, CAPOX).\n"
            "2. Accurately format blood counts and lab values (e.g., 'WBC 2100' -> 'WBC 2,100 /µL', 'ANC 900' -> 'ANC 900 cells/µL', 'platelets 135k' -> 'platelets 135,000 /µL').\n"
            "3. Format vital signs cleanly (e.g., 'temperature 38.3' or 'fever 38.3' -> 'temperature 38.3°C').\n"
            "4. Capitalize medical acronyms: ANC, WBC, ECOG, CTCAE, DLBCL, NSCLC.\n"
            "5. Correct common oncology toxicity terms (e.g., 'neutropenia', 'febrile neutropenia', 'mucositis', 'cold dysesthesia', 'paresthesias').\n"
            "6. CRITICAL: PRESERVE EXACT CLINICAL FACTS, NUMBERS, AND OBSERVATIONS. DO NOT HALLUCINATE, EXAGGERATE, OR INVENT NEW FINDINGS NOT IN THE ORIGINAL TEXT.\n"
            "7. Return ONLY the polished, clinical-grade transcript text. Do not provide conversational commentary, greetings, or markdown fences.\n\n"
            f"Dictation Text:\n{cleaned_rule}"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=800,
            ),
        )

        gemini_text = response.text.strip() if response.text else cleaned_rule
        # Clean off any accidental markdown code fences
        if gemini_text.startswith("```"):
            gemini_text = re.sub(r"^```[a-zA-Z]*\n?", "", gemini_text)
            gemini_text = re.sub(r"\n?```$", "", gemini_text).strip()

        return {
            "original_text": raw_text,
            "corrected_text": gemini_text,
            "changes": _deduplicate_changes(rule_changes),
            "engine": "gemini-2.5-flash+oncology-rules",
        }

    except Exception as exc:
        logger.warning("Gemini autocorrect call failed, using rule-based output: %s", exc)
        return {
            "original_text": raw_text,
            "corrected_text": cleaned_rule,
            "changes": _deduplicate_changes(rule_changes),
            "engine": "rule_based_oncology_fallback",
        }
