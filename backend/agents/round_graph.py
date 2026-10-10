"""5-Stage Clinical Agent Workflow with LangGraph.

Pipeline:
  START
    ↓
  extraction_node  (Transcripts + Gemini Vision image observations + Lab Validation)
    ↓
  context_node     (Patient history & cycle-over-cycle lab trends)
    ↓
  rag_node         (Evidence retrieval from ASCO/NCCN guidelines as reference material)
    ↓
  verify_node      (Deterministic CTCAE v5.0 Sentinels & Clinical Guardrails)
    ↓
  drafting_node    (Structured clinical note with trends, provenance & disclaimer)
    ↓
  END
"""
from __future__ import annotations

import os
import re
import warnings
warnings.filterwarnings("ignore")

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from backend.models.round import (
    ClinicalEvidence,
    ClinicalExtraction,
    ConfirmItem,
    ImageAttachment,
    LabTrend,
    LabValue,
    ReviewFlag,
)
from backend.services.clinical_negation import evaluate_fever_status
from backend.services.gemini_vision import analyze_clinical_images
from backend.services.lab_validation import validate_labs_collection
from backend.services.local_extractor import extract_clinical_facts
from backend.services.patient_context import build_patient_context
from backend.services.rag_service import retrieve_clinical_evidence


def get_ctcae_thresholds() -> dict[str, float]:
    """Retrieve CTCAE and clinical sentinel thresholds with environment variable overrides."""
    return {
        "anc_lln": float(os.getenv("THRESHOLD_ANC_LLN", "2000.0")),
        "anc_grade2": float(os.getenv("THRESHOLD_ANC_GRADE2", "1500.0")),
        "anc_grade3": float(os.getenv("THRESHOLD_ANC_GRADE3", "1000.0")),
        "anc_grade4": float(os.getenv("THRESHOLD_ANC_GRADE4", "500.0")),
        "platelets_lln": float(os.getenv("THRESHOLD_PLATELETS_LLN", "150000.0")),
        "platelets_grade2": float(os.getenv("THRESHOLD_PLATELETS_GRADE2", "75000.0")),
        "platelets_grade3": float(os.getenv("THRESHOLD_PLATELETS_GRADE3", "50000.0")),
        "platelets_grade4": float(os.getenv("THRESHOLD_PLATELETS_GRADE4", "25000.0")),
        "hgb_lln": float(os.getenv("THRESHOLD_HGB_LLN", "12.0")),
        "hgb_grade2": float(os.getenv("THRESHOLD_HGB_GRADE2", "10.0")),
        "hgb_grade3": float(os.getenv("THRESHOLD_HGB_GRADE3", "8.0")),
        "hgb_grade4": float(os.getenv("THRESHOLD_HGB_GRADE4", "6.5")),
        "fn_anc_critical": float(os.getenv("THRESHOLD_FN_ANC_CRITICAL", "500.0")),
        "fn_anc_decline": float(os.getenv("THRESHOLD_FN_ANC_DECLINE", "1000.0")),
        "fn_temp_single_c": float(os.getenv("THRESHOLD_FN_TEMP_SINGLE_C", "38.3")),
        "fn_temp_sustained_c": float(os.getenv("THRESHOLD_FN_TEMP_SUSTAINED_C", "38.0")),
    }


# ── Canonical Versioned CTCAE v5.0 Configuration Table ────────────────
CTCAE_V5_CONFIG = {
    "version": "CTCAE v5.0 (November 27, 2017)",
    "table_source": "U.S. Department of Health and Human Services, National Institutes of Health, National Cancer Institute (NCI) - CTCAE v5.0, Category: Investigations",
    "guidelines": {
        "neutrophil_count_decreased": "CTCAE v5.0: Grade 1 (<LLN-1500/mm3), Grade 2 (<1500-1000/mm3), Grade 3 (<1000-500/mm3), Grade 4 (<500/mm3)",
        "platelet_count_decreased": "CTCAE v5.0: Grade 1 (<LLN-75,000/mm3), Grade 2 (<75,000-50,000/mm3), Grade 3 (<50,000-25,000/mm3), Grade 4 (<25,000/mm3)",
        "febrile_neutropenia": "IDSA/ASCO Clinical Practice Guideline for Antimicrobial Prophylaxis and Outpatient Management of Fever and Neutropenia in Adults Treated for Malignancy (Taplitz et al., 2018)",
        "thrombocytopenia": "NCCN Clinical Practice Guidelines in Oncology: Hematopoietic Growth Factors",
        "anemia": "ASCO/ASH Clinical Practice Guideline: Management of Cancer-Related Anemia (2020)",
        "trajectory": "Longitudinal Patient Trajectory Analysis Protocol",
    },
    "thresholds": get_ctcae_thresholds(),
}


def compute_ctcae_grade(analyte: str, value: float, lln: float | None = None) -> dict[str, Any]:
    """Compute deterministic CTCAE v5.0 toxicity grade for a validated laboratory value.

    LLN (Lower Limit of Normal) is configurable per lab via optional `lln`.
    When `lln` is omitted, institutional default adult LLN thresholds are used
    (configurable via THRESHOLD_ANC_LLN, THRESHOLD_PLATELETS_LLN, THRESHOLD_HGB_LLN).
    """
    analyte_clean = analyte.strip().upper()
    version = CTCAE_V5_CONFIG["version"]
    thresholds = get_ctcae_thresholds()

    if analyte_clean in ("ANC", "ABSOLUTE NEUTROPHIL COUNT"):
        # Official CTCAE v5.0 "Neutrophil count decreased" (NCI, Nov 27, 2017, Category: Investigations):
        # Grade 4: < 500 /mm3 (< 0.5 x 10e9 /L)
        # Grade 3: < 1000 - 500 /mm3 (< 1.0 - 0.5 x 10e9 /L)
        # Grade 2: < 1500 - 1000 /mm3 (< 1.5 - 1.0 x 10e9 /L)
        # Grade 1: < LLN - 1500 /mm3 (< LLN - 1.5 x 10e9 /L)
        anc_lln = float(lln) if lln is not None else thresholds["anc_lln"]
        lln_is_default = (lln is None)
        lln_note = f"LLN: {anc_lln:g} cells/µL ({'default adult laboratory LLN' if lln_is_default else 'custom per-lab LLN'})"

        base = {
            "analyte": "ANC",
            "value": value,
            "version": version,
            "lln": anc_lln,
            "lln_is_default": lln_is_default,
            "lln_note": lln_note,
        }
        if value < thresholds["anc_grade4"]:
            return {**base, "grade": 4, "status": "life-threatening"}
        elif value < thresholds["anc_grade3"]:
            return {**base, "grade": 3, "status": "severe"}
        elif value < thresholds["anc_grade2"]:
            return {**base, "grade": 2, "status": "moderate"}
        elif value < anc_lln:
            return {**base, "grade": 1, "status": "mild"}
        else:
            return {**base, "grade": 0, "status": "normal"}

    elif analyte_clean in ("PLATELETS", "PLT"):
        # Official CTCAE v5.0 "Platelet count decreased" (NCI, Nov 27, 2017, Category: Investigations):
        # Grade 4: < 25,000 /mm3 (< 25.0 x 10e9 /L)
        # Grade 3: < 50,000 - 25,000 /mm3 (< 50.0 - 25.0 x 10e9 /L)
        # Grade 2: < 75,000 - 50,000 /mm3 (< 75.0 - 50.0 x 10e9 /L)
        # Grade 1: < LLN - 75,000 /mm3 (< LLN - 75.0 x 10e9 /L)
        plt_lln = float(lln) if lln is not None else thresholds["platelets_lln"]
        lln_is_default = (lln is None)
        lln_note = f"LLN: {plt_lln:g} /µL ({'default adult laboratory LLN' if lln_is_default else 'custom per-lab LLN'})"

        base = {
            "analyte": "Platelets",
            "value": value,
            "version": version,
            "lln": plt_lln,
            "lln_is_default": lln_is_default,
            "lln_note": lln_note,
        }
        if value < thresholds["platelets_grade4"]:
            return {**base, "grade": 4, "status": "life-threatening"}
        elif value < thresholds["platelets_grade3"]:
            return {**base, "grade": 3, "status": "severe"}
        elif value < thresholds["platelets_grade2"]:
            return {**base, "grade": 2, "status": "moderate"}
        elif value < plt_lln:
            return {**base, "grade": 1, "status": "mild"}
        else:
            return {**base, "grade": 0, "status": "normal"}

    elif analyte_clean in ("HEMOGLOBIN", "HGB"):
        # Official CTCAE v5.0 "Anemia" (NCI, Nov 27, 2017, Category: Investigations):
        # Grade 4: Life-threatening consequences; urgent intervention indicated (< 6.5 g/dL)
        # Grade 3: < 8.0 g/dL (< 4.9 mmol/L)
        # Grade 2: < 10.0 - 8.0 g/dL (< 6.2 - 4.9 mmol/L)
        # Grade 1: < LLN - 10.0 g/dL (< LLN - 6.2 mmol/L)
        hgb_lln = float(lln) if lln is not None else thresholds["hgb_lln"]
        lln_is_default = (lln is None)
        lln_note = f"LLN: {hgb_lln:g} g/dL ({'default adult laboratory LLN' if lln_is_default else 'custom per-lab LLN'})"

        base = {
            "analyte": "Hemoglobin",
            "value": value,
            "version": version,
            "lln": hgb_lln,
            "lln_is_default": lln_is_default,
            "lln_note": lln_note,
        }
        if value < thresholds["hgb_grade4"]:
            return {**base, "grade": 4, "status": "life-threatening"}
        elif value < thresholds["hgb_grade3"]:
            return {**base, "grade": 3, "status": "severe"}
        elif value < thresholds["hgb_grade2"]:
            return {**base, "grade": 2, "status": "moderate"}
        elif value < hgb_lln:
            return {**base, "grade": 1, "status": "mild"}
        else:
            return {**base, "grade": 0, "status": "normal"}

    return {"analyte": analyte, "value": value, "grade": 0, "status": "unknown", "version": version}

    return {"analyte": analyte, "value": value, "grade": 0, "status": "unknown", "version": version}



class RoundState(TypedDict, total=False):
    transcript: str
    images: list[ImageAttachment]
    extraction: ClinicalExtraction
    lab_trends: list[LabTrend]
    retrieved_evidence: list[ClinicalEvidence]
    review_flags: list[ReviewFlag]
    confirm_before_signing: list[ConfirmItem]
    draft_note: str
    provenance: dict[str, str]
    ctcae_version: str
    stage_engines: dict[str, str]
    fallback_used: bool
    fallback_message: str | None


# ── Stage 1: Clinical Extraction Agent ─────────────────────────────────
def extraction_node(state: RoundState) -> RoundState:
    provider = os.getenv("LLM_PROVIDER", "local").lower()
    transcript = state.get("transcript", "")
    images = state.get("images", [])
    provenance: dict[str, str] = {}
    confirm_items: list[ConfirmItem] = []
    stage_engines: dict[str, str] = {
        "polish": "not_run",
        "extraction": "not_run",
        "vision": "not_run",
    }

    # 0. Polish / Terminology Normalization Stage
    working_transcript = transcript
    if transcript.strip():
        from backend.services.clinical_autocorrect import correct_clinical_transcript
        polish_res = correct_clinical_transcript(transcript, use_gemini=(provider == "gemini"))
        working_transcript = polish_res.get("corrected_text") or transcript
        stage_engines["polish"] = polish_res.get("engine", "rule_based_oncology")
        provenance["polish_engine"] = stage_engines["polish"]

    # 1. Text Extraction Stage
    if provider == "gemini" and working_transcript.strip():
        from backend.services.gemini_extractor import extract_clinical_facts_gemini
        extraction = extract_clinical_facts_gemini(working_transcript)
        if extraction.source == "local-rules":
            stage_engines["extraction"] = "local-rules (fallback)"
        else:
            stage_engines["extraction"] = extraction.source
    elif working_transcript.strip():
        extraction = extract_clinical_facts(working_transcript)
        stage_engines["extraction"] = extraction.source
    else:
        extraction = ClinicalExtraction()
        stage_engines["extraction"] = "not_run"

    if stage_engines["extraction"] != "not_run":
        provenance["extraction_engine"] = stage_engines["extraction"]

    # 1B. Validate and normalize transcript labs first
    for lab in extraction.labs:
        lab.source = "Transcript"
        lab.confidence = "High"

    validated_transcript_labs, transcript_confirms = validate_labs_collection(
        extraction.labs,
        source_context="Transcript",
    )
    extraction.labs = validated_transcript_labs
    confirm_items.extend(transcript_confirms)
    for lab in extraction.labs:
        lab.source = "Transcript"
        provenance[lab.name] = "Transcript"

    # 2. Vision Document Extraction Stage
    if images:
        from backend.services.lab_validation import validate_and_normalize_lab

        vision_obs = analyze_clinical_images(images)
        if vision_obs:
            stage_engines["vision"] = vision_obs[0].engine
            provenance["vision_engine"] = stage_engines["vision"]
        for obs in vision_obs:
            if not extraction.patient_id and obs.patient_id:
                extraction.patient_id = obs.patient_id
                provenance["patient_id"] = obs.source_file

            if not obs.labs and obs.notes:
                provenance[obs.source_file] = obs.notes
                confirm_items.append(
                    ConfirmItem(
                        id=f"vision-unanalyzed-{obs.source_file}",
                        item_type="unverified_image",
                        label=f"Image not analyzed: {obs.source_file}",
                        value="unverified",
                        unit=None,
                        reason=obs.notes,
                        source=obs.source_file,
                    )
                )

            vision_src = f"{obs.source_file} (Vision)"
            for vlab in obs.labs:
                norm_vlab, v_confirm = validate_and_normalize_lab(
                    LabValue(
                        name=vlab.name,
                        value=vlab.value,
                        unit=vlab.unit,
                        source=vision_src,
                        confidence=vlab.confidence,
                    ),
                    source_context=vision_src,
                )
                norm_vlab.source = vision_src
                vlab_name = norm_vlab.name.upper()
                existing = next((l for l in extraction.labs if l.name.upper() == vlab_name), None)

                if existing:
                    # Lab appears in BOTH transcript and image: record both sources consistently
                    existing_sources = [s.strip() for s in (existing.source or "Transcript").split(";") if s.strip()]
                    if vision_src not in existing_sources:
                        existing_sources.append(vision_src)
                    combined_source = "; ".join(existing_sources)
                    existing.source = combined_source
                    provenance[existing.name] = combined_source

                    # Check for conflicting values between spoken transcript and lab scan
                    if existing.value != norm_vlab.value:
                        existing.status = "needs_confirmation"
                        existing.flag_reason = (
                            f"Conflicting values: Transcript ({existing.value:g} {existing.unit or ''}) "
                            f"vs {obs.source_file} ({norm_vlab.value:g} {norm_vlab.unit or ''})."
                        )
                        confirm_items.append(
                            ConfirmItem(
                                id=f"conflict-{vlab_name.lower()}",
                                item_type="conflict",
                                label=f"Conflict: {existing.name}",
                                value={"transcript": existing.value, "image": norm_vlab.value},
                                unit=norm_vlab.unit or existing.unit,
                                reason=(
                                    f"Discrepancy for {existing.name}: Dictated value is {existing.value:g} {existing.unit or ''}, "
                                    f"while {obs.source_file} scan shows {norm_vlab.value:g} {norm_vlab.unit or ''}. Confirm before signing."
                                ),
                                source=combined_source,
                            )
                        )
                else:
                    extraction.labs.append(norm_vlab)
                    provenance[norm_vlab.name] = vision_src
                    if v_confirm:
                        v_confirm.source = vision_src
                        confirm_items.append(v_confirm)

    # 3. Guarantee provenance[lab.name] == lab.source for every lab in extraction.labs
    for lab in extraction.labs:
        provenance[lab.name] = lab.source or "Transcript"

    # 4. Evaluate whether any active stage fell back to or ran on local rules
    local_stages: list[str] = []
    if images and "local" in stage_engines["vision"].lower():
        local_stages.append(f"vision ({stage_engines['vision']})")
    if transcript.strip() and "local" in stage_engines["extraction"].lower():
        local_stages.append(f"extraction ({stage_engines['extraction']})")
    if transcript.strip() and "rule_based" in stage_engines["polish"].lower():
        local_stages.append(f"polish ({stage_engines['polish']})")

    fallback_used = len(local_stages) > 0
    fallback_message = (
        f"Local rules active for: {', '.join(local_stages)}."
        if fallback_used
        else None
    )

    return {
        "extraction": extraction,
        "provenance": provenance,
        "confirm_before_signing": confirm_items,
        "ctcae_version": CTCAE_V5_CONFIG["version"],
        "stage_engines": stage_engines,
        "fallback_used": fallback_used,
        "fallback_message": fallback_message,
    }


# ── Stage 2: Patient Context Agent ─────────────────────────────────────
def context_node(state: RoundState) -> RoundState:
    extraction = state["extraction"]
    lab_trends = build_patient_context(extraction)
    return {"lab_trends": lab_trends}


# ── Stage 4: Evidence / RAG Agent (Matches Fired Alerts Only) ──────────
def rag_node(state: RoundState) -> RoundState:
    extraction = state["extraction"]
    review_flags = state.get("review_flags", [])
    evidence = retrieve_clinical_evidence(extraction, review_flags=review_flags)
    return {"retrieved_evidence": evidence}


# ── Stage 4: Verification Agent (Deterministic CTCAE Sentinels) ────────
def verification_node(state: RoundState) -> RoundState:
    facts = state["extraction"]
    transcript = state.get("transcript", "")
    trends = state.get("lab_trends", [])
    flags: list[ReviewFlag] = []

    # Map verified labs by uppercase name
    validated_labs_map = {lab.name.upper(): lab for lab in facts.labs}
    thresholds = get_ctcae_thresholds()
    guidelines = CTCAE_V5_CONFIG["guidelines"]

    # Rule 1: Febrile Neutropenia Sentinel
    # Evaluates IDSA/ASCO 2018 criteria with configurable thresholds:
    # - Fever: single temp >= 38.3°C or sustained >= 38.0°C for >= 1h (or active fever in dictation)
    # - Primary Alert (High): ANC < 500 /µL, or < 1000 /µL with explicitly documented expected decline in transcript
    # - Secondary Alert (Medium): Fever with ANC < 1000 /µL where expected decline to < 500 is not documented
    fever_eval = evaluate_fever_status(
        transcript,
        single_temp_threshold_c=thresholds["fn_temp_single_c"],
        sustained_temp_threshold_c=thresholds["fn_temp_sustained_c"],
    )
    active_fever = fever_eval["active_fever"]

    anc_lab = validated_labs_map.get("ANC")
    if anc_lab and active_fever:
        crit_anc = thresholds["fn_anc_critical"]
        decline_thresh = thresholds["fn_anc_decline"]
        single_temp = thresholds["fn_temp_single_c"]
        sustained_temp = thresholds["fn_temp_sustained_c"]

        is_critical_anc = anc_lab.value < crit_anc
        has_explicit_expected_decline = False

        if not is_critical_anc and anc_lab.value < decline_thresh:
            transcript_lower = transcript.lower()
            # Explicit expected decline detected solely from transcript statements (never inferred from trends)
            explicit_decline_patterns = [
                r"\bexpected(?:\s+to)?\s+(?:decline|drop|fall)\b",
                r"\b(?:declining|falling|dropping)\s+(?:anc|neutrophils|count)\b",
                r"\b(?:anc|count|neutrophils)\s+(?:expected\s+to\s+drop|falling|declining|dropping|trending\s+down)\b",
                r"\bnadir\s+expected\b",
                r"\bexpected\s+nadir\b",
                r"\bpost-chemo\s+nadir\b",
            ]
            if any(re.search(pat, transcript_lower) for pat in explicit_decline_patterns):
                has_explicit_expected_decline = True

        fever_criterion = fever_eval.get("fever_criterion") or "active fever documented in dictation"

        if is_critical_anc or has_explicit_expected_decline:
            # Primary high-severity alert per IDSA/ASCO 2018
            if is_critical_anc:
                anc_criterion = f"Absolute Neutrophil Count (ANC) of {anc_lab.value:g} cells/µL (< {crit_anc:g} cells/µL threshold)"
            else:
                anc_criterion = (
                    f"Absolute Neutrophil Count (ANC) of {anc_lab.value:g} cells/µL "
                    f"(< {decline_thresh:g} cells/µL threshold with expected decline to < {crit_anc:g} cells/µL)"
                )

            message_text = (
                f"Criterion met, for clinician review: {fever_criterion} and {anc_criterion}. "
                f"Note: Thresholds require clinical review and correlation."
            )
            rationale_text = (
                f"Evaluated against configured febrile neutropenia screening rule: "
                f"{fever_criterion} and {anc_criterion}. "
                f"Per IDSA/ASCO (Taplitz et al., 2018), clinical correlation and evaluation are recommended."
            )
            flags.append(
                ReviewFlag(
                    severity="high",
                    rule_id="RULE_SENTINEL_FEBRILE_NEUTROPENIA",
                    message=message_text,
                    rationale=rationale_text,
                    guideline=guidelines["febrile_neutropenia"],
                    source=anc_lab.source or "Transcript",
                    input_values={
                        "anc": anc_lab.value,
                        "anc_unit": anc_lab.unit,
                        "anc_threshold": crit_anc if is_critical_anc else decline_thresh,
                        "fn_anc_critical": crit_anc,
                        "fn_anc_decline": decline_thresh,
                        "has_expected_decline": has_explicit_expected_decline,
                        "temperature_c": fever_eval.get("temperature"),
                        "fn_temp_single_c": single_temp,
                        "fn_temp_sustained_c": sustained_temp,
                        "fever_status": "active",
                        "fever_criterion": fever_criterion,
                        "fever_rationale": fever_eval.get("rationale", ""),
                    },
                )
            )
        elif anc_lab.value < decline_thresh:
            # Secondary, lower-severity alert when fever present with ANC <1000 but no expected decline is documented
            sec_message = "Criterion met, for clinician review: fever with ANC <1000; expected decline to <500 not documented."
            sec_rationale = (
                f"Patient presents with active fever and validated ANC of {anc_lab.value:g} cells/µL "
                f"(< {decline_thresh:g} cells/µL threshold). An expected decline to < {crit_anc:g} cells/µL "
                f"is not explicitly documented in the transcript."
            )
            flags.append(
                ReviewFlag(
                    severity="medium",
                    rule_id="RULE_SENTINEL_FEVER_ANC_SUB1000_NO_DECLINE",
                    message=sec_message,
                    rationale=sec_rationale,
                    guideline=guidelines["febrile_neutropenia"],
                    source=anc_lab.source or "Transcript",
                    input_values={
                        "anc": anc_lab.value,
                        "anc_unit": anc_lab.unit,
                        "anc_threshold": decline_thresh,
                        "fn_anc_critical": crit_anc,
                        "fn_anc_decline": decline_thresh,
                        "has_expected_decline": False,
                        "temperature_c": fever_eval.get("temperature"),
                        "fn_temp_single_c": single_temp,
                        "fn_temp_sustained_c": sustained_temp,
                        "fever_status": "active",
                        "fever_criterion": fever_criterion,
                    },
                )
            )

    # Rule 2: Thrombocytopenia Sentinels
    plt_lab = validated_labs_map.get("PLATELETS")
    if plt_lab:
        if plt_lab.value < thresholds["platelets_grade4"]:
            flags.append(
                ReviewFlag(
                    severity="high",
                    rule_id="RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA",
                    message="Criterion met, for clinician review: Critical thrombocytopenia (Platelets < 25,000 /µL, CTCAE Grade 4).",
                    rationale=f"Recorded platelet count of {plt_lab.value:g} /µL is below the 25,000 /µL critical threshold.",
                    guideline=guidelines["thrombocytopenia"],
                    source=plt_lab.source or "Transcript",
                    input_values={"platelets": plt_lab.value, "threshold": thresholds["platelets_grade4"]},
                )
            )
        elif plt_lab.value < thresholds["platelets_grade3"]:
            flags.append(
                ReviewFlag(
                    severity="medium",
                    rule_id="RULE_SENTINEL_SEVERE_THROMBOCYTOPENIA",
                    message="Criterion met, for clinician review: Severe thrombocytopenia (Platelets < 50,000 /µL, CTCAE Grade 3).",
                    rationale=f"Recorded platelet count of {plt_lab.value:g} /µL is below 50,000 /µL.",
                    guideline=guidelines["thrombocytopenia"],
                    source=plt_lab.source or "Transcript",
                    input_values={"platelets": plt_lab.value, "threshold": thresholds["platelets_grade3"]},
                )
            )

    # Rule 3: Severe Anemia
    hgb_lab = validated_labs_map.get("HEMOGLOBIN") or validated_labs_map.get("HGB")
    if hgb_lab and hgb_lab.value < thresholds["hgb_grade3"]:
        flags.append(
            ReviewFlag(
                severity="medium",
                rule_id="RULE_SENTINEL_SEVERE_ANEMIA",
                message=f"Criterion met, for clinician review: Severe anemia alert (Hemoglobin {hgb_lab.value:g} g/dL, CTCAE Grade 3).",
                rationale=f"Hemoglobin below 8.0 g/dL threshold (recorded: {hgb_lab.value:g} g/dL).",
                guideline=guidelines["anemia"],
                source=hgb_lab.source or "Transcript",
                input_values={"hemoglobin": hgb_lab.value, "threshold": thresholds["hgb_grade3"]},
            )
        )

    # Rule 4: Longitudinal Trajectory Alert (Rapid Drop)
    for t in trends:
        if t.trend == "down" and t.previous_value and t.value < t.previous_value * 0.7:
            flags.append(
                ReviewFlag(
                    severity="medium",
                    rule_id="RULE_SENTINEL_TRAJECTORY_DROP",
                    message=f"Criterion met, for clinician review: rapid decline detected in {t.name} from {t.previous_value:g} to {t.value:g} {t.unit or ''}.",
                    rationale=f"{t.name} dropped by more than 30% compared to previous cycle baseline.",
                    guideline=guidelines["trajectory"],
                    source="Longitudinal Context",
                    input_values={"analyte": t.name, "current": t.value, "previous": t.previous_value},
                )
            )

    return {"review_flags": flags}


# ── Stage 5: Note Drafting Agent ───────────────────────────────────────
def drafting_node(state: RoundState) -> RoundState:
    facts = state["extraction"]
    trends = state.get("lab_trends", [])
    evidence = state.get("retrieved_evidence", [])
    provenance = state.get("provenance", {})

    patient = facts.patient_id or "Unidentified demo patient"
    demographic = " ".join(
        x
        for x in [
            f"{facts.age}-year-old" if facts.age else None,
            facts.sex.value if facts.sex.value != "unknown" else None,
        ]
        if x
    )

    lines = [
        f"ONCOLOGY ROUND NOTE — PATIENT #{patient}",
        f"Demographics: {demographic or 'Age/sex not stated'}; Primary Diagnosis: {facts.diagnosis or 'Not stated'}.",
    ]

    if facts.treatment_cycle is not None:
        lines.append(f"Current Treatment: Chemotherapy Cycle {facts.treatment_cycle}.")

    if facts.symptoms:
        lines.append(f"Active Symptoms: {', '.join(facts.symptoms)}.")

    if facts.negated_symptoms:
        lines.append(f"Reviewed & Negated Findings: {', '.join(facts.negated_symptoms)}.")

    if trends:
        lab_strings = []
        for t in trends:
            arrow = " ↓" if t.trend == "down" else " ↑" if t.trend == "up" else ""
            prev = f" (prev: {t.previous_value:g})" if t.previous_value is not None else ""
            lab_strings.append(f"{t.name} {t.value:g} {t.unit or ''}{arrow}{prev}")
        lines.append("Laboratory Findings (with cycle trends): " + ", ".join(lab_strings) + ".")
    elif facts.labs:
        lines.append(
            "Laboratory Findings: "
            + ", ".join(f"{l.name} {l.value:g} {l.unit or ''}".strip() for l in facts.labs)
            + "."
        )

    if provenance:
        sources_used = sorted(set(provenance.values()))
        lines.append(f"Document & Data Provenance: {'; '.join(sources_used)}.")

    if evidence:
        guideline_refs = [f"{e.title} ({e.year}) [{e.source}]" for e in evidence[:2]]
        lines.append("Evidence-Based Guidelines Consulted: " + "; ".join(guideline_refs) + ".")

    lines.append(
        f"Note Status: DRAFT | Grading Standard: {CTCAE_V5_CONFIG['version']}. "
        "Generated as assistive documentation. Clinician must review, edit, and approve."
    )

    return {"draft_note": "\n\n".join(lines)}


def build_round_graph():
    graph = StateGraph(RoundState)
    graph.add_node("extract", extraction_node)
    graph.add_node("context", context_node)
    graph.add_node("verify", verification_node)
    graph.add_node("rag", rag_node)
    graph.add_node("draft", drafting_node)

    graph.add_edge(START, "extract")
    graph.add_edge("extract", "context")
    graph.add_edge("context", "verify")
    graph.add_edge("verify", "rag")
    graph.add_edge("rag", "draft")
    graph.add_edge("draft", END)

    return graph.compile()


round_graph = build_round_graph()
