"""Transparent offline baseline: extracts facts explicitly present in dictation text.

Integrates deterministic symptom negation and laboratory value extraction.
"""
import re
from backend.models.round import ClinicalExtraction, LabValue, Sex
from backend.services.clinical_negation import partition_symptoms

def extract_clinical_facts(text: str) -> ClinicalExtraction:
    normalized = " ".join(text.split())
    lower = normalized.lower()

    age = re.search(r"\b(\d{1,3})[\s-]*(?:year|yr)s?[- ]old\b", lower)
    patient = re.search(r"\b(?:patient|pt)\s*(?:#|id)?\s*([a-z]?[-]?\d+)\b", normalized, re.I)
    cycle = re.search(r"\bcycle\s*(\d+)\b", lower)
    diagnosis = re.search(r"\b(?:with|diagnosis(?: of)?|has)\s+([a-z][a-z\s-]+?\s+(?:cancer|carcinoma|lymphoma|sarcoma|leukemia|melanoma|myeloma))\b", lower)
    sex = Sex.male if re.search(r"\bmale\b", lower) else Sex.female if re.search(r"\bfemale\b", lower) else Sex.unknown

    active_symptoms, negated_symptoms = partition_symptoms(normalized)

    labs = []
    lab_patterns = {
        "WBC": r"\bWBC\s*(?:is|of|was|:|=)?\s*(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:cells/µL|cells/ul|/µL|/ul|k/ul|k)?\b",
        "ANC": r"\bANC\s*(?:is|of|was|:|=)?\s*(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:cells/µL|cells/ul|/µL|/ul|k/ul|k)?\b",
        "PLATELETS": r"\b(?:platelets?|plt)\s*(?:is|of|was|:|=)?\s*(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:k|/µL|/ul|cells/ul)?\b",
        "HEMOGLOBIN": r"\b(?:hemo(?:glo)?bin|hgb|hb)\s*(?:is|of|was|:|=)?\s*(\d+(?:\.\d+)?)\s*(?:g/dl|g/l)?\b",
        "CREATININE": r"\b(?:creatinine|cr)\s*(?:is|of|was|:|=)?\s*(\d+(?:\.\d+)?)\s*(?:mg/dl|µmol/l)?\b",
    }

    for label, pattern in lab_patterns.items():
        match = re.search(pattern, normalized, re.I)
        if match:
            clean_num_str = match.group(1).replace(",", "")
            labs.append(
                LabValue(
                    name=label,
                    value=float(clean_num_str),
                    unit="cells/µL" if label in ("WBC", "ANC") else ("/µL" if label == "PLATELETS" else ("g/dL" if label == "HEMOGLOBIN" else "mg/dL")),
                    source="Transcript",
                    confidence="High",
                )
            )

    return ClinicalExtraction(
        patient_id=patient.group(1).upper() if patient else None,
        age=int(age.group(1)) if age else None,
        sex=sex,
        diagnosis=diagnosis.group(1).strip() if diagnosis else None,
        treatment_cycle=int(cycle.group(1)) if cycle else None,
        symptoms=active_symptoms,
        negated_symptoms=negated_symptoms,
        labs=labs,
        source="local-rules",
    )
