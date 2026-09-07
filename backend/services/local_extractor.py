"""Transparent offline baseline: extracts facts explicitly present in demo text."""
import re
from backend.models.round import ClinicalExtraction, LabValue, Sex

def extract_clinical_facts(text: str) -> ClinicalExtraction:
    normalized = " ".join(text.split()); lower = normalized.lower()
    age = re.search(r"\b(\d{1,3})[\s-]*(?:year|yr)s?[- ]old\b", lower)
    patient = re.search(r"\b(?:patient|pt)\s*(?:#|id)?\s*([a-z]?[-]?\d+)\b", normalized, re.I)
    cycle = re.search(r"\bcycle\s*(\d+)\b", lower)
    diagnosis = re.search(r"\b(?:with|diagnosis(?: of)?|has)\s+([a-z][a-z\s-]+?\s+cancer)\b", lower)
    sex = Sex.male if re.search(r"\bmale\b", lower) else Sex.female if re.search(r"\bfemale\b", lower) else Sex.unknown
    patterns = {"fever": r"\bfever\b|\bfebrile\b", "increased fatigue": r"\b(?:increased|worsening)\s+fatigue\b", "nausea": r"\bnausea\b", "vomiting": r"\bvomiting\b|\bemesis\b", "pain": r"\bpain\b"}
    symptoms = [label for label, pattern in patterns.items() if re.search(pattern, lower)]
    labs = []
    for label, pattern in {"WBC": r"\bWBC\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)", "ANC": r"\bANC\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)"}.items():
        match = re.search(pattern, normalized, re.I)
        if match: labs.append(LabValue(name=label, value=float(match.group(1)), unit="cells/uL"))
    return ClinicalExtraction(patient_id=patient.group(1).upper() if patient else None, age=int(age.group(1)) if age else None, sex=sex, diagnosis=diagnosis.group(1).strip() if diagnosis else None, treatment_cycle=int(cycle.group(1)) if cycle else None, symptoms=symptoms, labs=labs)
