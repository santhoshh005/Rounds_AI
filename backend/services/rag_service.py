"""Evidence & RAG Service.

Matches fired clinical review flags against curated oncology practice guidelines (ASCO/IDSA/NCCN).
Returns neutral reference metadata (source, title, year, description) only for alerts that actually fired.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from backend.models.round import ClinicalEvidence, ClinicalExtraction, ReviewFlag

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


def retrieve_clinical_evidence(
    extraction: ClinicalExtraction,
    review_flags: list[ReviewFlag] | None = None,
) -> list[ClinicalEvidence]:
    """Return neutral guideline reference metadata matching only the alerts that actually fired."""
    guidelines = _load_guidelines()
    evidence: list[ClinicalEvidence] = []

    fired_rule_ids: set[str] = set()
    if review_flags is not None:
        fired_rule_ids = {f.rule_id for f in review_flags if f.rule_id}
    else:
        # Fallback if called directly without review_flags: check if extraction alone triggers a lab/symptom rule
        symptoms_lower = [s.lower() for s in extraction.symptoms]
        labs_dict = {lab.name.upper(): lab.value for lab in extraction.labs}
        has_fever = any("fever" in s or "febrile" in s for s in symptoms_lower)
        anc_val = labs_dict.get("ANC", float("inf"))
        platelets_val = labs_dict.get("PLATELETS", float("inf"))
        hgb_val = labs_dict.get("HEMOGLOBIN", labs_dict.get("HGB", float("inf")))

        if has_fever and anc_val < 1000:
            fired_rule_ids.add("RULE_SENTINEL_FEBRILE_NEUTROPENIA")
        if platelets_val < 25000:
            fired_rule_ids.add("RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA")
        elif platelets_val < 50000:
            fired_rule_ids.add("RULE_SENTINEL_SEVERE_THROMBOCYTOPENIA")
        if hgb_val < 8.0:
            fired_rule_ids.add("RULE_SENTINEL_SEVERE_ANEMIA")

    if not fired_rule_ids:
        return []

    for g in guidelines:
        rule_ids = set(g.get("rule_ids", []))
        if rule_ids and rule_ids.intersection(fired_rule_ids):
            evidence.append(
                ClinicalEvidence(
                    source=g["source"],
                    title=g["title"],
                    year=int(g["year"]),
                    description=g["description"],
                )
            )

    return evidence
