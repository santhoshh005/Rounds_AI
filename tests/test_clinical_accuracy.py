import pytest
from backend.services.clinical_autocorrect import (
    autocorrect_clinical_text,
    _validate_gemini_polish,
)
from backend.services.clinical_negation import (
    detect_fever_status,
    partition_symptoms_by_negation,
)
from backend.services.lab_validation import (
    validate_and_normalize_lab,
    validate_labs_collection,
)
from backend.agents.round_graph import (
    compute_ctcae_grade,
    CTCAE_V5_CONFIG,
    verification_node,
)
from backend.models.round import ClinicalExtraction, LabValue, ReviewFlag, ConfirmItem, LabTrend


# ======================================================================
# SUITE 1: Clinical Autocorrect Context Checks & True/False Positives (10 cases)
# ======================================================================

def test_autocorrect_anc_in_lab_context():
    # "and see nine hundred" preceded by WBC / lab context
    text = "WBC 2100 and see nine hundred"
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "ANC 900" in res["corrected_text"]
    assert any("ANC" in c["rule_id"] for c in res["changes"])


def test_autocorrect_anc_in_general_english_context():
    # "and see nine hundred" in non-clinical sentence must NOT be changed to ANC
    text = "We will go to the conference and see nine hundred visitors tomorrow."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "ANC" not in res["corrected_text"]
    assert "and see" in res["corrected_text"]


def test_autocorrect_folfox_regimen():
    text = "Patient started on fall fox yesterday."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "mFOLFOX6" in res["corrected_text"]
    assert any("FOLFOX" in c["rule_id"] for c in res["changes"])


def test_autocorrect_folfiri_regimen():
    text = "Initiating fall feery cycle 2."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "FOLFIRI" in res["corrected_text"]


def test_autocorrect_taxol():
    text = "Premedicated with dexamethasone prior to tax all infusion."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "Paclitaxel (Taxol)" in res["corrected_text"]


def test_autocorrect_carbo():
    text = "Patient received carbo AUC 5."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "Carboplatin" in res["corrected_text"]


def test_autocorrect_cisplatin():
    text = "Switched to sis platin due to protocol requirements."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "Cisplatin" in res["corrected_text"]


def test_autocorrect_wbc_spoken():
    text = "wbc twenty one hundred recorded on morning draw."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "WBC 2,100" in res["corrected_text"]


def test_autocorrect_platelets_spoken():
    text = "platelets one hundred fifty thousand."
    res = autocorrect_clinical_text(text, use_gemini=False)
    assert "Platelets 150,000" in res["corrected_text"]


def test_autocorrect_all_changes_have_rule_ids():
    text = "patient on fall fox with wbc twenty one hundred and see nine hundred"
    res = autocorrect_clinical_text(text, use_gemini=False)
    for change in res["changes"]:
        assert "rule_id" in change
        assert len(change["rule_id"]) > 0
        assert "original" in change
        assert "corrected" in change


# ======================================================================
# SUITE 2: Polish Guard & Number/Negation Preservation (6 cases)
# ======================================================================

def test_polish_rejects_altered_numbers():
    original = "ANC is 900 cells/uL and WBC is 2100."
    tampered = "ANC is 950 cells/uL and WBC is 2100."
    valid, reason = _validate_gemini_polish(original, tampered)
    assert not valid
    assert "numbers" in reason.lower()


def test_polish_rejects_omitted_numbers():
    original = "Platelets 150000 with creatinine 1.2."
    tampered = "Platelets 150000 with normal creatinine."
    valid, reason = _validate_gemini_polish(original, tampered)
    assert not valid


def test_polish_rejects_altered_negations():
    original = "Patient has no fever and denies shortness of breath."
    tampered = "Patient has fever and denies shortness of breath."
    valid, reason = _validate_gemini_polish(original, tampered)
    assert not valid
    assert "negations" in reason.lower()


def test_polish_accepts_clean_phrasing_preserving_numbers_and_negations():
    original = "patient has fever 38.5C, anc 900, wbc 2100, no nausea"
    polished = "The patient presents with fever of 38.5C. ANC is 900, WBC is 2100, and no nausea is reported."
    valid, reason = _validate_gemini_polish(original, polished)
    assert valid


def test_polish_rejects_invented_numbers():
    original = "Patient is febrile."
    tampered = "Patient is febrile with temperature 39.5."
    valid, reason = _validate_gemini_polish(original, tampered)
    assert not valid


def test_polish_rejects_removed_negation_word():
    original = "Patient denies chest pain."
    tampered = "Patient reports chest pain."
    valid, reason = _validate_gemini_polish(original, tampered)
    assert not valid


# ======================================================================
# SUITE 3: Negation & Temporality Handling (8 cases)
# ======================================================================

def test_detect_no_fever():
    status = detect_fever_status("Patient reports no fever today.")
    assert not status["is_active_fever"]
    assert status["is_negated"]


def test_detect_afebrile():
    status = detect_fever_status("Patient is afebrile with stable vital signs.")
    assert not status["is_active_fever"]
    assert status["is_negated"]


def test_detect_fever_resolved():
    status = detect_fever_status("Previous fever resolved after antibiotics.")
    assert not status["is_active_fever"]
    assert status["is_resolved_or_past"]


def test_detect_fever_yesterday_not_active():
    status = detect_fever_status("Reported fever yesterday, but normal temperature today.")
    assert not status["is_active_fever"]
    assert status["is_resolved_or_past"]


def test_detect_active_fever_since_yesterday():
    status = detect_fever_status("Developed fever since yesterday with ongoing chills.")
    assert status["is_active_fever"]
    assert not status["is_negated"]


def test_detect_active_fever_temperature_threshold():
    status = detect_fever_status("Current temperature is 38.4C at bedside.")
    assert status["is_active_fever"]
    assert status["temperature"] == 38.4


def test_partition_symptoms_with_negation():
    raw_symptoms = ["fever", "nausea", "fatigue", "vomiting"]
    transcript = "Patient has fatigue and nausea, but denies vomiting and is afebrile."
    active, negated = partition_symptoms_by_negation(raw_symptoms, transcript)
    assert "fatigue" in active
    assert "nausea" in active
    assert "vomiting" in negated
    assert "fever" in negated


def test_partition_symptoms_all_positive():
    raw_symptoms = ["fatigue", "nausea"]
    transcript = "Patient has severe fatigue and moderate nausea."
    active, negated = partition_symptoms_by_negation(raw_symptoms, transcript)
    assert "fatigue" in active
    assert "nausea" in active
    assert len(negated) == 0


# ======================================================================
# SUITE 4: Lab Unit Normalization & Range Validation (10 cases)
# ======================================================================

def test_anc_standard_unit_normalization():
    # 0.9 x10^3/uL -> 900 cells/µL
    lab = LabValue(name="ANC", value=0.9, unit="x10^3/uL")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 900
    assert validated.unit == "cells/µL"
    assert validated.status == "verified"


def test_anc_integer_cells():
    lab = LabValue(name="ANC", value=900, unit="cells/µL")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 900
    assert validated.unit == "cells/µL"
    assert validated.status == "verified"


def test_anc_ambiguous_value_triggers_confirm():
    # Value 9 is likely 0.9 or 900 dictation error
    lab = LabValue(name="ANC", value=9, unit=None)
    validated, confirm = validate_and_normalize_lab(lab)
    assert confirm is not None
    assert "ambiguous" in confirm.reason.lower() or "scale" in confirm.reason.lower()


def test_wbc_thousands_normalization():
    lab = LabValue(name="WBC", value=2.1, unit="10^3/uL")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 2100
    assert validated.unit == "cells/µL"


def test_platelets_thousands_normalization():
    lab = LabValue(name="Platelets", value=150, unit="x10^3/µL")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 150000
    assert validated.unit == "/µL"


def test_platelets_extreme_low_implausible():
    # 0.05 without unit
    lab = LabValue(name="Platelets", value=0.05, unit=None)
    validated, confirm = validate_and_normalize_lab(lab)
    assert confirm is not None


def test_hemoglobin_gl_to_gdl_normalization():
    # 105 g/L -> 10.5 g/dL
    lab = LabValue(name="Hemoglobin", value=105, unit="g/L")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 10.5
    assert validated.unit == "g/dL"


def test_hemoglobin_plausible_gdl():
    lab = LabValue(name="Hemoglobin", value=10.5, unit="g/dL")
    validated, confirm = validate_and_normalize_lab(lab)
    assert validated.value == 10.5
    assert validated.status == "verified"


def test_creatinine_umol_to_mgdl_normalization():
    # 106.1 umol/L -> ~1.2 mg/dL
    lab = LabValue(name="Creatinine", value=106.1, unit="µmol/L")
    validated, confirm = validate_and_normalize_lab(lab)
    assert abs(validated.value - 1.2) < 0.05
    assert validated.unit == "mg/dL"


def test_validate_labs_collection_preserves_count():
    labs = [
        LabValue(name="WBC", value=2100),
        LabValue(name="ANC", value=900),
        LabValue(name="Platelets", value=150000),
    ]
    norm, confirms = validate_labs_collection(labs)
    assert len(norm) == 3
    assert len(confirms) == 0


# ======================================================================
# SUITE 5: CTCAE v5.0 Deterministic Boundary Grading (12 cases)
# ======================================================================

def test_ctcae_anc_normal():
    # ANC >= LLN (2000) -> Grade 0
    grade = compute_ctcae_grade("ANC", 2500)
    assert grade["grade"] == 0


def test_ctcae_anc_grade_1_mid():
    # ANC = 1800 -> Grade 1 (< LLN - 1500)
    grade = compute_ctcae_grade("ANC", 1800)
    assert grade["grade"] == 1


def test_ctcae_anc_boundary_2000_vs_1999():
    # Grade 0 (>= LLN 2000) vs Grade 1 (< LLN - 1500)
    assert compute_ctcae_grade("ANC", 2000)["grade"] == 0
    assert compute_ctcae_grade("ANC", 1999)["grade"] == 1


def test_ctcae_anc_boundary_1500_vs_1499():
    # Grade 1 (1500) vs Grade 2 (< 1500 - 1000)
    assert compute_ctcae_grade("ANC", 1500)["grade"] == 1
    assert compute_ctcae_grade("ANC", 1499)["grade"] == 2


def test_ctcae_anc_boundary_1000_vs_999():
    # Grade 2 (1000) vs Grade 3 (< 1000 - 500)
    assert compute_ctcae_grade("ANC", 1000)["grade"] == 2
    assert compute_ctcae_grade("ANC", 999)["grade"] == 3


def test_ctcae_anc_boundary_500_vs_499():
    # Grade 3 (500) vs Grade 4 (< 500)
    assert compute_ctcae_grade("ANC", 500)["grade"] == 3
    assert compute_ctcae_grade("ANC", 499)["grade"] == 4
    assert compute_ctcae_grade("ANC", 0)["grade"] == 4


def test_ctcae_platelets_boundary_150000_vs_149999():
    # Grade 0 (>= LLN 150000) vs Grade 1 (< LLN - 75000)
    assert compute_ctcae_grade("Platelets", 150000)["grade"] == 0
    assert compute_ctcae_grade("Platelets", 149999)["grade"] == 1


def test_ctcae_platelets_boundary_75000_vs_74999():
    # Grade 1 (75000) vs Grade 2 (< 75000 - 50000)
    assert compute_ctcae_grade("Platelets", 75000)["grade"] == 1
    assert compute_ctcae_grade("Platelets", 74999)["grade"] == 2


def test_ctcae_platelets_boundary_50000_vs_49999():
    # Grade 2 (50000) vs Grade 3 (< 50000 - 25000)
    assert compute_ctcae_grade("Platelets", 50000)["grade"] == 2
    assert compute_ctcae_grade("Platelets", 49999)["grade"] == 3


def test_ctcae_platelets_boundary_25000_vs_24999():
    # Grade 3 (25000) vs Grade 4 (< 25000)
    assert compute_ctcae_grade("Platelets", 25000)["grade"] == 3
    assert compute_ctcae_grade("Platelets", 24999)["grade"] == 4
    assert compute_ctcae_grade("Platelets", 0)["grade"] == 4


# ======================================================================
# SUITE 6: Sentinels & Clinical Assistive Safeguards (8 cases)
# ======================================================================

def test_febrile_neutropenia_fires_when_active_fever_and_low_anc():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever", "fatigue"],
            labs=[LabValue(name="ANC", value=450, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C since yesterday, ANC 450.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    fn_flags = [f for f in flags if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_flags) == 1
    # Check assistive wording
    assert "Criterion met, for clinician review" in fn_flags[0].message
    assert "Note: Thresholds require clinical review" in fn_flags[0].message
    assert "IDSA" in fn_flags[0].guideline or "ASCO" in fn_flags[0].guideline


def test_febrile_neutropenia_does_not_fire_when_fever_is_negated():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fatigue"],
            negated_symptoms=["fever"],
            labs=[LabValue(name="ANC", value=900, unit="cells/µL")],
        ),
        "transcript": "Patient is afebrile with no fever. ANC 900.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    fn_flags = [f for f in flags if "febrile neutropenia" in f.message.lower()]
    assert len(fn_flags) == 0, "Febrile neutropenia must NOT fire when patient is afebrile"


def test_febrile_neutropenia_does_not_fire_when_anc_is_normal():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=3200, unit="cells/µL")],
        ),
        "transcript": "Patient has fever 38.5C, ANC is 3200.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    fn_flags = [f for f in flags if "febrile neutropenia" in f.message.lower()]
    assert len(fn_flags) == 0, "Febrile neutropenia must NOT fire when ANC is normal (>1500)"


def test_critical_thrombocytopenia_fires():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=[],
            labs=[LabValue(name="Platelets", value=20000, unit="/µL")],
        ),
        "transcript": "Platelets down to twenty thousand.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    plt_flags = [f for f in flags if "thrombocytopenia" in f.message.lower()]
    assert len(plt_flags) >= 1
    assert "Criterion met, for clinician review" in plt_flags[0].message


def test_no_autonomous_diagnosis_in_review_flags():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=400, unit="cells/µL")],
        ),
        "transcript": "Fever and severe neutropenia.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    for flag in result.get("review_flags", []):
        assert "we diagnose" not in flag.message.lower()
        assert "start treatment" not in flag.message.lower()
        assert "prescribe" not in flag.message.lower()
        # Must be phrased as criterion met for clinician review
        assert "criterion met, for clinician review" in flag.message.lower()


def test_notes_stay_draft_status():
    from backend.services.persistence import persist_round, get_round
    round_data = {
        "round_id": "draft-check-round-1",
        "patient_id": "104",
        "draft_note": "Preliminary round note.",
    }
    persist_round(round_data)
    saved = get_round("draft-check-round-1")
    assert saved.get("status") == "draft"


def test_never_invent_clinical_values():
    # If transcript does not specify ANC, ANC should not be fabricated
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["cough"],
            labs=[],
        ),
        "transcript": "Patient 104 with cough.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    # Verify no sentinel flags were fabricated for absent lab values
    assert not any("anc" in f.message.lower() for f in flags)
    assert not any("febrile neutropenia" in f.message.lower() for f in flags)


def test_provenance_and_version_in_verification_output():
    state = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=[],
            labs=[LabValue(name="Platelets", value=40000, unit="/µL", source="Lab Sheet")],
        ),
        "transcript": "Morning round.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    result = verification_node(state)
    flags = result.get("review_flags", [])
    assert len(flags) >= 1
    assert flags[0].source == "Lab Sheet"
    assert flags[0].rule_id is not None


def test_febrile_neutropenia_anc_boundary_500_vs_499():
    # ANC = 500 without expected decline does NOT fire
    state_500 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=500, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 500.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_500 = verification_node(state_500)
    fn_500 = [f for f in res_500.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_500) == 0, "ANC = 500 without expected decline must NOT fire"

    # ANC = 499 (< 500) fires unconditionally
    state_499 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=499, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 499.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_499 = verification_node(state_499)
    fn_499 = [f for f in res_499.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_499) == 1, "ANC = 499 (< 500) must fire"
    assert "499" in fn_499[0].message
    assert "500" in fn_499[0].message


def test_febrile_neutropenia_anc_boundary_1000_vs_999_with_decline():
    # ANC = 1000 with expected decline does NOT fire (must be < 1000)
    state_1000 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=1000, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 1000 with expected decline.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_1000 = verification_node(state_1000)
    fn_1000 = [f for f in res_1000.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_1000) == 0, "ANC = 1000 must NOT fire even with expected decline"

    # ANC = 999 with expected decline MUST fire
    state_999_decline = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=999, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 999 with expected decline below 500.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_999_dec = verification_node(state_999_decline)
    fn_999_dec = [f for f in res_999_dec.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_999_dec) == 1, "ANC = 999 (< 1000) with expected decline MUST fire"
    assert "999" in fn_999_dec[0].message
    assert "1000" in fn_999_dec[0].message

    # ANC = 999 WITHOUT expected decline must NOT fire primary alert, but MUST fire secondary alert
    state_999_no_decline = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=999, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 999.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_999_no_dec = verification_node(state_999_no_decline)
    fn_999_no_dec = [f for f in res_999_no_dec.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_999_no_dec) == 0, "ANC = 999 without expected decline must NOT fire primary alert"

    fn_sec = [f for f in res_999_no_dec.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEVER_ANC_SUB1000_NO_DECLINE"]
    assert len(fn_sec) == 1, "ANC = 999 with fever must fire secondary alert when expected decline is not documented"
    assert fn_sec[0].severity == "medium"
    assert "Criterion met, for clinician review: fever with ANC <1000; expected decline to <500 not documented." in fn_sec[0].message


def test_febrile_neutropenia_trend_alone_never_triggers_primary_alert():
    # Downward lab trend alone must NOT satisfy "expected decline" - explicit wording in transcript is strictly required
    state_trend_only = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=900, unit="cells/µL")],
        ),
        "transcript": "Patient developed fever 38.4C, ANC 900.",
        "lab_trends": [LabTrend(name="ANC", value=900, previous_value=1200, trend="down")],
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res = verification_node(state_trend_only)
    primary = [f for f in res.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    secondary = [f for f in res.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEVER_ANC_SUB1000_NO_DECLINE"]
    assert len(primary) == 0, "Downward trend alone must NEVER trigger primary febrile neutropenia alert"
    assert len(secondary) == 1, "Must trigger secondary lower-severity alert"
    assert "Criterion met, for clinician review: fever with ANC <1000; expected decline to <500 not documented." in secondary[0].message


def test_configurable_per_lab_lln():
    # Default LLN for ANC is 2000 cells/µL
    grade_default = compute_ctcae_grade("ANC", 1800)
    assert grade_default["grade"] == 1
    assert grade_default["lln"] == 2000
    assert grade_default["lln_is_default"] is True
    assert "default adult laboratory LLN" in grade_default["lln_note"]

    # Custom per-lab LLN for ANC (e.g. 1700 cells/µL)
    grade_custom = compute_ctcae_grade("ANC", 1800, lln=1700)
    assert grade_custom["grade"] == 0
    assert grade_custom["lln"] == 1700
    assert grade_custom["lln_is_default"] is False
    assert "custom per-lab LLN" in grade_custom["lln_note"]

    # Default LLN for Platelets is 150000 /µL
    plt_default = compute_ctcae_grade("Platelets", 140000)
    assert plt_default["grade"] == 1
    assert plt_default["lln"] == 150000
    assert plt_default["lln_is_default"] is True
    assert "default adult laboratory LLN" in plt_default["lln_note"]

    # Custom per-lab LLN for Platelets (e.g. 130000 /µL)
    plt_custom = compute_ctcae_grade("Platelets", 140000, lln=130000)
    assert plt_custom["grade"] == 0
    assert plt_custom["lln"] == 130000
    assert plt_custom["lln_is_default"] is False
    assert "custom per-lab LLN" in plt_custom["lln_note"]


def test_febrile_neutropenia_temp_single_boundary_383_vs_382():
    # 38.3°C single measurement fires with ANC < 500
    state_383 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=450, unit="cells/µL")],
        ),
        "transcript": "Patient has temperature 38.3C, ANC 450.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_383 = verification_node(state_383)
    fn_383 = [f for f in res_383.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_383) == 1, "Temperature 38.3°C meets single measurement threshold"

    # 38.2°C single measurement does NOT fire
    state_382 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=450, unit="cells/µL")],
        ),
        "transcript": "Patient has temperature 38.2C, ANC 450.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_382 = verification_node(state_382)
    fn_382 = [f for f in res_382.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_382) == 0, "Temperature 38.2°C (single) is below 38.3°C threshold"


def test_febrile_neutropenia_temp_sustained_boundary_380_vs_379():
    # 38.0°C sustained for 1 hour fires with ANC < 500
    state_380_sustained = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=450, unit="cells/µL")],
        ),
        "transcript": "Patient has temperature 38.0C sustained for 1 hour, ANC 450.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_380 = verification_node(state_380_sustained)
    fn_380 = [f for f in res_380.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_380) == 1, "Temperature 38.0°C sustained for 1 hour meets sustained threshold"
    assert "sustained" in fn_380[0].message.lower()

    # 37.9°C sustained for 1 hour does NOT fire
    state_379_sustained = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=["fever"],
            labs=[LabValue(name="ANC", value=450, unit="cells/µL")],
        ),
        "transcript": "Patient has temperature 37.9C sustained for 1 hour, ANC 450.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_379 = verification_node(state_379_sustained)
    fn_379 = [f for f in res_379.get("review_flags", []) if f.rule_id == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"]
    assert len(fn_379) == 0, "Temperature 37.9°C sustained is below 38.0°C sustained threshold"


def test_critical_thrombocytopenia_platelets_boundary_25000_vs_24999():
    # At 25,000, critical Grade 4 flag must NOT fire (severe Grade 3 fires instead)
    state_25000 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=[],
            labs=[LabValue(name="Platelets", value=25000, unit="/µL")],
        ),
        "transcript": "Platelets 25000.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_25k = verification_node(state_25000)
    flags_25k = res_25k.get("review_flags", [])
    crit_25k = [f for f in flags_25k if f.rule_id == "RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA"]
    severe_25k = [f for f in flags_25k if f.rule_id == "RULE_SENTINEL_SEVERE_THROMBOCYTOPENIA"]
    assert len(crit_25k) == 0, "Platelets 25,000 is not < 25,000, critical flag must not fire"
    assert len(severe_25k) == 1, "Platelets 25,000 is Grade 3 severe thrombocytopenia"

    # At 24,999, critical Grade 4 flag MUST fire
    state_24999 = {
        "extraction": ClinicalExtraction(
            patient_id="104",
            symptoms=[],
            labs=[LabValue(name="Platelets", value=24999, unit="/µL")],
        ),
        "transcript": "Platelets 24999.",
        "images": [],
        "review_flags": [],
        "confirm_before_signing": [],
    }
    res_24k = verification_node(state_24999)
    flags_24k = res_24k.get("review_flags", [])
    crit_24k = [f for f in flags_24k if f.rule_id == "RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA"]
    assert len(crit_24k) == 1, "Platelets 24,999 is Grade 4 critical thrombocytopenia"


def test_pipeline_rejects_number_alteration():
    # Test that altering ANY number in the text triggers immediate rejection by diff verification
    original = "WBC 2100, ANC 900, Platelets 150000, temperature 38.4C"
    altered = "WBC 2100, ANC 901, Platelets 150000, temperature 38.4C"
    valid, reason = _validate_gemini_polish(original, altered)
    assert not valid
    assert "numbers altered" in reason.lower()


def test_rag_evidence_neutral_reference_only_and_matches_fired_alert():
    import json
    from backend.services.rag_service import retrieve_clinical_evidence, _load_guidelines

    forbidden_terms = (
        "empiric",
        "within 60 minutes",
        "mascc",
        "cisne",
        "urgency",
        "should",
        "recommend",
    )

    def assert_evidence_is_neutral(ev_list):
        for ev in ev_list:
            ev_dict = ev.model_dump() if hasattr(ev, "model_dump") else dict(ev)
            assert set(ev_dict.keys()) >= {"source", "title", "year", "description"}
            assert isinstance(ev_dict["year"], int) and ev_dict["year"] >= 2000
            assert "\n" not in ev_dict["description"].strip(), "description must be a single line"
            combined_text = " ".join(
                str(ev_dict.get(k, "")) for k in ("source", "title", "year", "description")
            ) + " " + json.dumps(ev_dict)
            low = combined_text.lower()
            assert "v2024" not in low, f"Unverified (v2024) found in evidence: {ev_dict}"
            for term in forbidden_terms:
                assert term not in low, f"Forbidden prescriptive term '{term}' found in evidence: {ev_dict}"

    # 1. Verify all raw guidelines in knowledge/oncology_guidelines.json are neutral
    raw_guidelines = _load_guidelines()
    assert len(raw_guidelines) >= 3
    assert_evidence_is_neutral(raw_guidelines)

    # 2. When no alert fires, retrieved_evidence must be empty
    ext_normal = ClinicalExtraction(
        patient_id="104",
        symptoms=["fatigue"],
        labs=[LabValue(name="ANC", value=2200, unit="cells/µL")],
    )
    ev_none = retrieve_clinical_evidence(ext_normal, review_flags=[])
    assert ev_none == [], "No evidence should be returned when no alert fired"

    # 3. When only Febrile Neutropenia alert fires, only FN guideline is returned
    fn_flag = ReviewFlag(
        severity="high",
        rule_id="RULE_SENTINEL_FEBRILE_NEUTROPENIA",
        message="Criterion met, for clinician review: fever and ANC < 500.",
        rationale="ANC 450 with fever 38.4C.",
    )
    ev_fn = retrieve_clinical_evidence(ext_normal, review_flags=[fn_flag])
    assert len(ev_fn) == 1
    assert ev_fn[0].year == 2018
    assert "Fever and Neutropenia" in ev_fn[0].title
    assert_evidence_is_neutral(ev_fn)

    # 4. When Thrombocytopenia and Anemia alerts fire, only matching guidelines are returned
    plt_flag = ReviewFlag(
        severity="high",
        rule_id="RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA",
        message="Criterion met, for clinician review: Platelets < 25,000.",
        rationale="Platelets 20000.",
    )
    anemia_flag = ReviewFlag(
        severity="medium",
        rule_id="RULE_SENTINEL_SEVERE_ANEMIA",
        message="Criterion met, for clinician review: Hemoglobin < 8.0.",
        rationale="Hemoglobin 7.5.",
    )
    ev_multi = retrieve_clinical_evidence(ext_normal, review_flags=[plt_flag, anemia_flag])
    assert len(ev_multi) == 2
    assert_evidence_is_neutral(ev_multi)

    # 5. Confirm the assertion fails if any forbidden term appears
    for bad_term in ("empiric", "within 60 minutes", "MASCC", "CISNE", "urgency", "should", "recommend"):
        with pytest.raises(AssertionError):
            assert_evidence_is_neutral([
                {
                    "source": "Test Journal",
                    "title": "Test Guideline",
                    "year": 2020,
                    "description": f"Text containing {bad_term} in description.",
                }
            ])

