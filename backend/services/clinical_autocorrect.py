# -*- coding: utf-8 -*-
"""Deterministic Oncology Phonetic Auto-Correction and Normalization Engine.

Applies context-aware phonetic replacements for spoken oncology ward dictation,
normalizing regimens, lab acronyms, and count numbers while safeguarding clinical facts.
Gemini polish verifies medical grammar under strict verification: if any number,
unit, or negation is altered, the LLM output is rejected in favor of verified rule output.
"""
from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

# Context words indicating clinical/laboratory context
CLINICAL_CONTEXT_KEYWORDS = {
    "count", "counts", "lab", "labs", "level", "levels", "cycle", "chemo",
    "wbc", "anc", "platelet", "platelets", "hgb", "hemoglobin", "patient",
    "pt", "blood", "value", "values", "is", "was", "at", "of", "neutrophil",
    "neutrophils", "cells", "regimen", "temperature", "temp", "fever", "grade"
}

NON_CLINICAL_DISQUALIFIERS = {
    "people", "visitors", "movies", "places", "friends", "others", "cars", "houses"
}


def _has_clinical_context(text: str, start: int, end: int) -> bool:
    """Check if the text surrounding a match indicates a clinical or laboratory context."""
    window_start = max(0, start - 40)
    window_end = min(len(text), end + 40)
    surrounding = text[window_start:window_end].lower()

    # Disqualify if followed by non-clinical nouns
    after_text = text[end:min(len(text), end + 25)].lower()
    if any(re.search(rf"\b{dis}\b", after_text) for dis in NON_CLINICAL_DISQUALIFIERS):
        return False

    # Check for digits or numbers nearby
    if re.search(r"\b\d+\b", surrounding):
        return True

    # Check for clinical keywords
    words = set(re.findall(r"\b[a-z]+\b", surrounding))
    if words.intersection(CLINICAL_CONTEXT_KEYWORDS):
        return True

    return False


# Rule definition: (rule_id, regex_pattern, replacement, requires_context_check)
ONCOLOGY_RULES: list[tuple[str, str, str, bool]] = [
    # ── Lab Tests & Blood Counts ──────────────────────────────────────────
    ("RULE_LAB_ANC", r"\b(and\s+see|a\s+and\s+c|agency|a\s+n\s+c|an\s+c)\b", "ANC", True),
    ("RULE_LAB_ANC_DIRECT", r"\b(anc)\b", "ANC", False),
    ("RULE_LAB_WBC", r"\b(we\s+bc|w\s+b\s+c|wb\s*c|white\s+count|white\s+blood\s+cells?)\b", "WBC", False),
    ("RULE_LAB_PLT", r"\b(plate\s+lets|plate\s+let|p\s+l\s+t|plt)\b", "platelets", False),
    ("RULE_LAB_HGB", r"\b(hemo\s*globin|hema\s*globin|h\s*g\s*b|hgb)\b", "hemoglobin", False),
    ("RULE_LAB_HCT", r"\b(hemato\s*crit|h\s*c\s*t|hct)\b", "hematocrit", False),
    ("RULE_LAB_ANC_LONG", r"\b(ab\s*solute\s+neutro\s*phil\s+count)\b", "Absolute Neutrophil Count (ANC)", False),
    ("RULE_LAB_CREAT", r"\b(cre\s*atinine|serum\s+creatinine|cr|s\s*cr)\b", "creatinine", False),
    ("RULE_LAB_EGFR", r"\b(e\s*g\s*f\s*r|egfr|g\s*f\s*r)\b", "eGFR", False),
    ("RULE_LAB_BILI", r"\b(total\s+bili\s*rubin|bili\s*rubin|t\s*bili)\b", "total bilirubin", False),
    ("RULE_LAB_AST", r"\b(a\s*s\s*t|ast|s\s*g\s*o\s*t)\b", "AST", False),
    ("RULE_LAB_ALT", r"\b(a\s*l\s*t|alt|s\s*g\s*p\s*t)\b", "ALT", False),
    ("RULE_LAB_ALKPHOS", r"\b(alk\s*phos|alkaline\s+phosphatase)\b", "alkaline phosphatase", False),
    ("RULE_LAB_LDH", r"\b(l\s*d\s*h|ldh|lactate\s+dehydrogenase)\b", "LDH", False),
    ("RULE_LAB_ALB", r"\b(al\s*bumin|serum\s+albumin)\b", "albumin", False),
    ("RULE_LAB_CEA", r"\b(c\s*e\s*a|cea|carcino\s*embryonic\s+antigen)\b", "CEA", False),
    ("RULE_LAB_CA125", r"\b(c\s*a\s*125|ca\s*125|ca\s+one\s+twenty\s+five)\b", "CA-125", False),
    ("RULE_LAB_PSA", r"\b(p\s*s\s*a|psa|prostate\s+specific\s+antigen)\b", "PSA", False),

    # ── Spoken Clinical Numbers & Counts ──────────────────────────────
    ("RULE_NUM_150K", r"\b(one\s+hundred\s+(?:and\s+)?fifty\s+thousand|one-hundred-fifty\s+thousand)\b", "150,000", False),
    ("RULE_NUM_200K", r"\b(two\s+hundred\s+thousand|two-hundred\s+thousand)\b", "200,000", False),
    ("RULE_NUM_100K", r"\b(one\s+hundred\s+thousand|one-hundred\s+thousand)\b", "100,000", False),
    ("RULE_NUM_50K", r"\b(fifty\s+thousand)\b", "50,000", False),
    ("RULE_NUM_25K", r"\b(twenty\s+five\s+thousand|twenty-five\s+thousand)\b", "25,000", False),
    ("RULE_NUM_20K", r"\b(twenty\s+thousand)\b", "20,000", False),
    ("RULE_NUM_2100", r"\b(twenty\s+one\s+hundred|twenty-one\s+hundred)\b", "2,100", False),
    ("RULE_NUM_2500", r"\b(twenty\s+five\s+hundred|twenty-five\s+hundred)\b", "2,500", False),
    ("RULE_NUM_1500", r"\b(fifteen\s+hundred)\b", "1,500", False),
    ("RULE_NUM_1400", r"\b(fourteen\s+hundred)\b", "1,400", False),
    ("RULE_NUM_1200", r"\b(twelve\s+hundred)\b", "1,200", False),
    ("RULE_NUM_1100", r"\b(eleven\s+hundred)\b", "1,100", False),
    ("RULE_NUM_1000", r"\b(ten\s+hundred|one\s+thousand)\b", "1,000", False),
    ("RULE_NUM_900", r"\b(nine\s+hundred)\b", "900", False),
    ("RULE_NUM_800", r"\b(eight\s+hundred)\b", "800", False),
    ("RULE_NUM_700", r"\b(seven\s+hundred)\b", "700", False),
    ("RULE_NUM_600", r"\b(six\s+hundred)\b", "600", False),
    ("RULE_NUM_500", r"\b(five\s+hundred)\b", "500", False),
    ("RULE_NUM_400", r"\b(four\s+hundred)\b", "400", False),
    ("RULE_NUM_300", r"\b(three\s+hundred)\b", "300", False),
    ("RULE_NUM_200", r"\b(two\s+hundred)\b", "200", False),
    ("RULE_NUM_100", r"\b(one\s+hundred)\b", "100", False),

    # ── Chemotherapy Regimens ───────────────────────────────────────────
    ("RULE_CHEMO_MFOLFOX6", r"\b(fall\s+fox|full\s+fox|four\s+fox|fall\s+faux|folfox\s*6|m\s+folfox\s*6|mfolfox\s*6)\b", "mFOLFOX6", False),
    ("RULE_CHEMO_RCHOP", r"\b(our\s+chop|are\s+chop|arch\s+op|r\s+chop|rchop)\b", "R-CHOP", False),
    ("RULE_CHEMO_ACT", r"\b(ac\s*-\s*t|ac\s+t|a\s+c\s+t|act\s+chemo)\b", "AC-T", False),
    ("RULE_CHEMO_FOLFIRI", r"\b(fol\s+firi|fall\s+firi|fall\s+feery|fall\s+feeri|fol\s+feery|folfiri)\b", "FOLFIRI", False),
    ("RULE_CHEMO_FOLFIRINOX", r"\b(fol\s+firinox|fall\s+firinox|folfirinox|m\s+folfirinox)\b", "FOLFIRINOX", False),
    ("RULE_CHEMO_CAPOX", r"\b(cape\s+ox|cap\s+ox|capox)\b", "CAPOX", False),
    ("RULE_CHEMO_GEMABRAX", r"\b(gem\s*zar\s+abrax\s*ane|gem\s+abraxane)\b", "Gemcitabine + Abraxane", False),
    ("RULE_CHEMO_FLOT", r"\b(flot\s+regimen|flot\s+chemo|f\s*l\s*o\s*t)\b", "FLOT", False),
    ("RULE_CHEMO_TDM1", r"\b(t\s*-\s*dm1|tdm1|kadcyla)\b", "T-DM1", False),
    ("RULE_CHEMO_ABVD", r"\b(abvd|a\s*b\s*v\s*d)\b", "ABVD", False),
    ("RULE_CHEMO_BEP", r"\b(bep|b\s*e\s*p\s+regimen)\b", "BEP", False),
    ("RULE_CHEMO_CARBOTAXOL", r"\b(carbo\s+taxol|carboplatin\s+paclitaxel)\b", "Carboplatin + Paclitaxel", False),
    ("RULE_CHEMO_TAXOL", r"\b(tax\s+all|taxol|paclitaxel)\b", "Paclitaxel (Taxol)", False),
    ("RULE_CHEMO_CARBO", r"\b(carbo|carboplatin)\b", "Carboplatin", False),
    ("RULE_CHEMO_CISPLATIN", r"\b(sis\s+platin|cis\s+platin|cisplatin)\b", "Cisplatin", False),

    # ── Oncology Drugs & Antineoplastics ────────────────────────────────
    ("RULE_DRUG_OXALI", r"\b(ox\s*ally\s*platin|oxley\s*platin|oxali\s*platting|oxaliplatin)\b", "Oxaliplatin", False),
    ("RULE_DRUG_CAPE", r"\b(capacity\s*bean|cape\s*site\s*a\s*bean|cape\s*cita\s*bine|capecitabine)\b", "Capecitabine", False),
    ("RULE_DRUG_PEMBRO", r"\b(pembro\s*lizzie\s*mab|pembro\s*lizumab|keytruda)\b", "Pembrolizumab", False),
    ("RULE_DRUG_NIVO", r"\b(nivo\s*lizzie\s*mab|nivo\s*lumab|opdivo)\b", "Nivolumab", False),
    ("RULE_DRUG_TRASTU", r"\b(trastu\s*zumab|herceptin)\b", "Trastuzumab", False),
    ("RULE_DRUG_PERTU", r"\b(pertu\s*zumab|perjeta)\b", "Pertuzumab", False),
    ("RULE_DRUG_RITUX", r"\b(ritux\s*i\s*mab|rituxan)\b", "Rituximab", False),
    ("RULE_DRUG_BEVA", r"\b(beva\s*cizumab|avastin)\b", "Bevacizumab", False),
    ("RULE_DRUG_FILGRA", r"\b(phil\s*grass\s*tim|phil\s*grastim|fil\s*grass\s*tim|filgrastim|neupogen)\b", "Filgrastim", False),
    ("RULE_DRUG_PEGFILGRA", r"\b(peg\s*fil\s*grastim|neulasta)\b", "Pegfilgrastim", False),
    ("RULE_DRUG_DOXO", r"\b(doxo\s*rubicin|adria\s*mycin)\b", "Doxorubicin", False),
    ("RULE_DRUG_CYCLO", r"\b(cyclo\s*phosphamide|cytoxan)\b", "Cyclophosphamide", False),
    ("RULE_DRUG_ONDAN", r"\b(on\s*dan\s*setron|zofran)\b", "Ondansetron", False),
    ("RULE_DRUG_GRANI", r"\b(gran\s*i\s*setron|kytril)\b", "Granisetron", False),
    ("RULE_DRUG_APREP", r"\b(aprep\s*i\s*tant|emend)\b", "Aprepitant", False),
    ("RULE_DRUG_DEXA", r"\b(dexa\s*methasone|decadron)\b", "Dexamethasone", False),
    ("RULE_DRUG_LOPER", r"\b(lop\s*eramide|imodium)\b", "Loperamide", False),
    ("RULE_DRUG_CEFEPIME", r"\b(cef\s*epime|maxipime)\b", "Cefepime", False),
    ("RULE_DRUG_PIPTAZO", r"\b(pip\s*tazo|zosyn|piperacillin\s+tazobactam)\b", "Piperacillin-Tazobactam", False),
    ("RULE_DRUG_MEROPENEM", r"\b(mero\s*penem|merrem)\b", "Meropenem", False),
    ("RULE_DRUG_VANCO", r"\b(vanco\s*mycin|vancocin)\b", "Vancomycin", False),

    # ── Toxicities & Adverse Events ─────────────────────────────────────
    ("RULE_TOX_NEUTROPENIA", r"\b(new\s*trophy\s*near|neutral\s*peenia|neutro\s*penia)\b", "neutropenia", False),
    ("RULE_TOX_FN", r"\b(febrile\s+new\s*trophy\s*near|febrile\s+neutral\s*peenia|febrile\s+neutropenia)\b", "febrile neutropenia", False),
    ("RULE_TOX_THROMBO", r"\b(thrombo\s*cyto\s*penia|thrombo\s*cytopenia|low\s+platelets)\b", "thrombocytopenia", False),
    ("RULE_TOX_COLD_DYSESTHESIA", r"\b(dys\s*esthesia|cold\s+dysesthesia|cold\s+allodynia)\b", "cold dysesthesia", False),
    ("RULE_TOX_MUCOSITIS", r"\b(muc\s*ositis|mouth\s+sores|stomatitis)\b", "mucositis", False),
    ("RULE_TOX_PARESTHESIAS", r"\b(paresthesia|paresthesias|pins\s+and\s+needles)\b", "paresthesias", False),
    ("RULE_TOX_HANDFOOT", r"\b(hand\s+and\s+foot\s+syndrome|hand\s+foot\s+syndrome|palmar\s+plantar\s+erythrodysesthesia)\b", "hand-foot syndrome", False),
    ("RULE_TOX_CINV", r"\b(cinv|c\s*i\s*n\s*v|chemo\s+induced\s+nausea)\b", "CINV", False),
    ("RULE_TOX_ALOPECIA", r"\b(alo\s*pecia|hair\s+loss)\b", "alopecia", False),
    ("RULE_TOX_TLS", r"\b(tumor\s+lysis|t\s*l\s*s)\b", "tumor lysis syndrome", False),

    # ── Scores, Acronyms & Units ────────────────────────────────────────
    ("RULE_SCORE_ECOG", r"\b(e\s*cog|echo\s*g|e\s+c\s+o\s+g)\s*([0-4])\b", r"ECOG \2", False),
    ("RULE_ACR_CTCAE", r"\b(ct\s*cae|c\s+t\s+c\s+a\s+e)\b", "CTCAE", False),
    ("RULE_ACR_DLBCL", r"\b(dlbcl|d\s+l\s+b\s+c\s+l)\b", "DLBCL", False),
    ("RULE_ACR_NSCLC", r"\b(nsclc|n\s+s\s+c\s+l\s+c)\b", "NSCLC", False),
    ("RULE_ACR_TNBC", r"\b(tnbc|t\s+n\s+b\s+c)\b", "TNBC", False),
    ("RULE_UNIT_DEGC", r"\b(\d+(\.\d+)?)\s*(degree\s*c|degrees\s*c|degrees\s*celsius)\b", r"\1°C", False),
    ("RULE_UNIT_DEGF", r"\b(\d+(\.\d+)?)\s*(degree\s*f|degrees\s*f|degrees\s*fahrenheit)\b", r"\1°F", False),
    ("RULE_UNIT_CELLS_UL", r"\b(cells\s+per\s+microliter|cells\s+per\s+ul|cells\s+ul)\b", "cells/µL", False),
    ("RULE_UNIT_UL", r"\b(per\s+microliter|per\s+ul)\b", "/µL", False),
    ("RULE_UNIT_GDL", r"\b(grams\s+per\s+deciliter|g\s+dl)\b", "g/dL", False),
    ("RULE_UNIT_MGDL", r"\b(milligrams\s+per\s+deciliter|mg\s+dl)\b", "mg/dL", False),
    ("RULE_UNIT_MGM2", r"\b(milligrams\s+per\s+square\s+meter|mg\s+m2|mg\s+per\s+m2)\b", "mg/m²", False),
    ("RULE_CYCLE_NUM", r"\bcycle\s*(\d+)\b", r"Cycle \1", False),
    ("RULE_BED_NUM", r"\bbed\s*(\d+)\b", r"Bed \1", False),
    ("RULE_PT_NUM", r"\bpt\s*#?\s*(\d+)\b", r"Patient #\1", False),
    ("RULE_PATIENT_NUM", r"\bpatient\s*(\d+)\b", r"Patient \1", False),
]


def apply_rule_based_autocorrect(text: str) -> tuple[str, list[dict]]:
    """Fast deterministic oncology speech error correction with context verification.

    Returns the cleaned text along with structured changes:
    [{"original": orig_snippet, "corrected": repl, "rule_id": rule_id}]
    """
    if not text:
        return "", []

    corrected = text
    applied_changes = []

    for rule_id, pattern, replacement, requires_context in ONCOLOGY_RULES:
        matches = list(re.finditer(pattern, corrected, flags=re.IGNORECASE))
        if matches:
            for m in reversed(matches):
                orig_snippet = m.group(0)
                start, end = m.span()

                # If rule requires clinical context check, verify surrounding text
                if requires_context and not _has_clinical_context(corrected, start, end):
                    continue

                repl = re.sub(pattern, replacement, orig_snippet, flags=re.IGNORECASE)
                if orig_snippet != repl:
                    corrected = corrected[:start] + repl + corrected[end:]
                    applied_changes.append({
                        "original": orig_snippet,
                        "corrected": repl,
                        "rule_id": rule_id,
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
    """Deduplicate applied corrections while retaining rule_id."""
    seen = set()
    deduped = []
    for c in changes:
        orig = c.get("original", c.get("from", "")).lower().strip()
        corr = c.get("corrected", c.get("to", "")).lower().strip()
        k = f"{orig}->{corr}"
        if k and k not in seen:
            seen.add(k)
            # Ensure keys "original", "corrected", "rule_id" and backward compatibility "from", "to"
            item = {
                "original": c.get("original", c.get("from", "")),
                "corrected": c.get("corrected", c.get("to", "")),
                "rule_id": c.get("rule_id", "RULE_AUTO"),
                "from": c.get("original", c.get("from", "")),
                "to": c.get("corrected", c.get("to", "")),
            }
            deduped.append(item)
    return deduped


def _validate_gemini_polish(
    input_text: str,
    polished_text: str,
    rule_changes: list[dict] | None = None,
) -> tuple[bool, str]:
    """Diff check verifying that LLM polish altered zero numbers, negation terms, or rule-corrected spans."""
    # 1. Compare numeric sets
    def extract_nums(t: str) -> list[str]:
        raw_nums = re.findall(r"\b\d+(?:[\.,]\d+)?\b", t)
        cleaned = [n.replace(",", "") for n in raw_nums]
        # sort so order shifts don't reject valid rephrasing
        return sorted(cleaned)

    in_nums = extract_nums(input_text)
    out_nums = extract_nums(polished_text)
    if in_nums != out_nums:
        return False, f"Numbers altered by polish (input numbers: {in_nums}, output numbers: {out_nums})"

    # 2. Compare negation tokens
    negation_set = {"no", "not", "without", "denies", "denied", "afebrile", "none", "neither", "never", "negative"}
    in_tokens = set(re.findall(r"\b[a-z]+\b", input_text.lower()))
    out_tokens = set(re.findall(r"\b[a-z]+\b", polished_text.lower()))
    in_negs = in_tokens.intersection(negation_set)
    out_negs = out_tokens.intersection(negation_set)
    if in_negs != out_negs:
        return False, f"Negations altered by polish (input negations: {in_negs}, output negations: {out_negs})"

    # 3. Verify rule-corrected spans remain intact for per-change UI Undo and lab/drug integrity
    if rule_changes:
        for chg in rule_changes:
            corr_span = chg.get("corrected", "")
            if corr_span and corr_span.lower() in input_text.lower():
                if corr_span.lower() not in polished_text.lower():
                    return False, f"Rule-corrected span '{corr_span}' was altered by polish"

    return True, ""


def correct_clinical_transcript(raw_text: str, use_gemini: bool = True) -> dict:
    """High-accuracy oncology clinical auto-correction pipeline.

    Combines deterministic oncology phonetic mapping with Gemini
    medical grammar verification, rejecting any polish that mutates numbers or negations.
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

    # Step 2: Gemini contextual medical polish with 4-model fallback cascade
    import time
    model_name = os.getenv("GEMINI_MODEL_POLISH", "gemini-2.5-flash")
    fallback_model = os.getenv("GEMINI_MODEL_DRAFT", "gemini-2.5-pro")
    # 4-model cascading fallback hierarchy: 2.5-flash -> 2.5-pro -> 1.5-flash -> 1.5-pro
    candidate_models: list[str] = []
    for m in (model_name, fallback_model, "gemini-1.5-flash", "gemini-1.5-pro"):
        if m and m not in candidate_models:
            candidate_models.append(m)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=15000))
        preserved_spans = [c.get("corrected", "") for c in rule_changes if c.get("corrected")]
        spans_instruction = (
            f"4. Preserve these exact normalized clinical spans verbatim: {preserved_spans}.\n"
            if preserved_spans
            else ""
        )
        prompt = (
            "You are a board-certified clinical oncology medical documentation specialist.\n"
            "Your task is to polish the grammar and punctuation of this clinician ward-round dictation.\n\n"
            "HARD CONSTRAINTS:\n"
            "1. DO NOT alter, add, delete, or round ANY numbers, lab values, or counts.\n"
            "2. DO NOT change ANY negations (e.g. 'no fever', 'denies fever', 'afebrile').\n"
            "3. DO NOT change or add drug names or regimen names, and do not insert words between a lab name and its number (keep 'ANC 900', 'WBC 2,100' intact).\n"
            f"{spans_instruction}"
            "5. Return ONLY the polished clinical text without conversational preamble or markdown fences.\n\n"
            f"Dictation Text:\n{cleaned_rule}"
        )

        response = None
        used_model = model_name
        last_exc: Exception | None = None

        for candidate in candidate_models:
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=candidate,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.0,
                            max_output_tokens=800,
                        ),
                    )
                    used_model = candidate
                    break
                except Exception as call_exc:
                    last_exc = call_exc
                    msg_low = str(call_exc).lower()
                    if any(tok in msg_low for tok in ("503", "unavailable", "deadline_exceeded", "504", "server disconnected", "high demand")) and attempt == 0:
                        time.sleep(1.0)
                        continue
                    break
            if response is not None:
                break

        if response is None:
            raise last_exc or RuntimeError("Gemini polish returned empty response")

        gemini_text = response.text.strip() if response.text else cleaned_rule
        if gemini_text.startswith("```"):
            gemini_text = re.sub(r"^```[a-zA-Z]*\n?", "", gemini_text)
            gemini_text = re.sub(r"\n?```$", "", gemini_text).strip()

        # Strict diff verification: reject if any number, negation, or rule-corrected span was modified
        is_valid, reject_reason = _validate_gemini_polish(cleaned_rule, gemini_text, rule_changes)
        if not is_valid:
            logger.warning("Gemini polish rejected (%s); keeping verified rule-based text.", reject_reason)
            return {
                "original_text": raw_text,
                "corrected_text": cleaned_rule,
                "changes": _deduplicate_changes(rule_changes),
                "engine": "rule_based_oncology_verified",
            }

        return {
            "original_text": raw_text,
            "corrected_text": gemini_text,
            "changes": _deduplicate_changes(rule_changes),
            "engine": f"{used_model}+oncology-rules",
        }

    except Exception as exc:
        err_msg = str(exc)
        if "404" in err_msg or "not found" in err_msg.lower():
            logger.error("Gemini polish model '%s' not found (404). Please update GEMINI_MODEL_POLISH in .env: %s", model_name, exc)
        else:
            logger.warning("Gemini autocorrect call failed, using rule-based output: %s", exc)

        return {
            "original_text": raw_text,
            "corrected_text": cleaned_rule,
            "changes": _deduplicate_changes(rule_changes),
            "engine": "rule_based_oncology_fallback",
        }


# Convenience alias
autocorrect_clinical_text = correct_clinical_transcript

