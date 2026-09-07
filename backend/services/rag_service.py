"""Evidence & RAG Agent.

Matches clinical findings against curated oncology practice guidelines (ASCO/NCCN).
Provides evidence-based reference prompts for clinician consideration.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from backend.models.round import ClinicalEvidence, ClinicalExtraction

logger = logging.getLogger(__name__)

KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent.parent / "knowledge" / "oncology_guidelines.json"

_cached_guidelines: list[dict] = []

def _load_guidelines() -> list[dict]:
    global _cached_guidelines
    if not _cached_guidelines and KNOWLEDGE_PATH.exists():
        try:
            with open(KNOWLEDGE_PATH, "r", encoding="utf-8") as f:
                _cached_guidelines = json.load(f)
        except Exception as exc:
            logger.warning("Failed to load guidelines: %s", exc)
    return _cached_guidelines

def retrieve_clinical_evidence(extraction: ClinicalExtraction) -> list[ClinicalEvidence]:
    """Search curated guidelines matching symptoms, diagnoses, and lab values."""
    guidelines = _load_guidelines()
    evidence: list[ClinicalEvidence] = []

    symptoms_lower = [s.lower() for s in extraction.symptoms]
    labs_dict = {lab.name.upper(): lab.value for lab in extraction.labs}

    has_fever = any("fever" in s or "febrile" in s for s in symptoms_lower)
    anc_val = labs_dict.get("ANC", float("inf"))
    platelets_val = labs_dict.get("PLATELETS", float("inf"))
    hgb_val = labs_dict.get("HEMOGLOBIN", labs_dict.get("HGB", float("inf")))

    for g in guidelines:
        matched = False
        relevance_reason = ""

        if g["id"] == "ASCO-IDSA-FN-2018":
            if has_fever and anc_val < 1000:
                matched = True
                relevance_reason = f"Triggered by recorded fever + ANC of {anc_val:g} cells/uL (<1000 threshold)."
        elif g["id"] == "NCCN-PANC-THROMBO-2023":
            if platelets_val < 50000:
                matched = True
                relevance_reason = f"Triggered by low platelet count of {platelets_val:g} /uL."
        elif g["id"] == "ASCO-ANEMIA-2020":
            if hgb_val < 10.0:
                matched = True
                relevance_reason = f"Triggered by low Hemoglobin of {hgb_val:g} g/dL."
        elif g["id"] == "NCCN-FATIGUE-2023":
            if any("fatigue" in s for s in symptoms_lower):
                matched = True
                relevance_reason = "Triggered by documented increased or worsening fatigue."

        if matched:
            evidence.append(
                ClinicalEvidence(
                    source=g["source"],
                    title=g["title"],
                    recommendation=g["recommendation"],
                    relevance=relevance_reason,
                )
            )

    return evidence
