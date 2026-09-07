"""5-Stage Clinical Agent Workflow with LangGraph.

Pipeline:
  START
    ↓
  extraction_node  (Transcripts + Gemini Vision image observations)
    ↓
  context_node     (Patient history & cycle-over-cycle lab trends)
    ↓
  rag_node         (Evidence retrieval from ASCO/NCCN guidelines)
    ↓
  verify_node      (Expanded oncology safety guardrails)
    ↓
  drafting_node    (Structured clinical note with trends & provenance)
    ↓
  END
"""
from __future__ import annotations

import os
import warnings
warnings.filterwarnings("ignore")

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from backend.models.round import (
    ClinicalEvidence,
    ClinicalExtraction,
    ImageAttachment,
    LabTrend,
    LabValue,
    ReviewFlag,
)
from backend.services.gemini_vision import analyze_clinical_images
from backend.services.local_extractor import extract_clinical_facts
from backend.services.patient_context import build_patient_context
from backend.services.rag_service import retrieve_clinical_evidence


class RoundState(TypedDict, total=False):
    transcript: str
    images: list[ImageAttachment]
    extraction: ClinicalExtraction
    lab_trends: list[LabTrend]
    retrieved_evidence: list[ClinicalEvidence]
    review_flags: list[ReviewFlag]
    draft_note: str
    provenance: dict[str, str]


# ── Stage 1: Clinical Extraction Agent ─────────────────────────────────
def extraction_node(state: RoundState) -> RoundState:
    provider = os.getenv("LLM_PROVIDER", "local").lower()
    transcript = state.get("transcript", "")
    images = state.get("images", [])
    provenance: dict[str, str] = {}

    # 1. Text extraction
    if provider == "gemini" and transcript.strip():
        from backend.services.gemini_extractor import extract_clinical_facts_gemini
        extraction = extract_clinical_facts_gemini(transcript)
    else:
        extraction = extract_clinical_facts(transcript) if transcript.strip() else ClinicalExtraction()

    for lab in extraction.labs:
        lab.source = "Spoken / Written Transcript"
        lab.confidence = "High"
        provenance[lab.name] = "Transcript"

    # 2. Vision document extraction
    if images:
        vision_obs = analyze_clinical_images(images)
        for obs in vision_obs:
            if not extraction.patient_id and obs.patient_id:
                extraction.patient_id = obs.patient_id
                provenance["patient_id"] = obs.source_file

            for vlab in obs.labs:
                existing = next((l for l in extraction.labs if l.name.upper() == vlab.name.upper()), None)
                if not existing:
                    extraction.labs.append(
                        LabValue(
                            name=vlab.name,
                            value=vlab.value,
                            unit=vlab.unit,
                            source=obs.source_file,
                            confidence=vlab.confidence,
                        )
                    )
                provenance[vlab.name] = f"{obs.source_file} (Gemini Vision)"

    return {"extraction": extraction, "provenance": provenance}


# ── Stage 2: Patient Context Agent ─────────────────────────────────────
def context_node(state: RoundState) -> RoundState:
    extraction = state["extraction"]
    lab_trends = build_patient_context(extraction)
    return {"lab_trends": lab_trends}


# ── Stage 3: Evidence / RAG Agent ──────────────────────────────────────
def rag_node(state: RoundState) -> RoundState:
    extraction = state["extraction"]
    evidence = retrieve_clinical_evidence(extraction)
    return {"retrieved_evidence": evidence}


# ── Stage 4: Verification Agent (Expanded Oncology Guardrails) ─────────
def verification_node(state: RoundState) -> RoundState:
    facts = state["extraction"]
    trends = state.get("lab_trends", [])
    values = {lab.name.upper(): lab.value for lab in facts.labs}
    symptoms_lower = [s.lower() for s in facts.symptoms]
    flags: list[ReviewFlag] = []

    # Rule 1: Neutropenic Fever
    has_fever = any("fever" in s or "febrile" in s for s in symptoms_lower)
    anc_val = values.get("ANC", float("inf"))
    if has_fever and anc_val < 1000:
        flags.append(
            ReviewFlag(
                severity="high",
                message="Clinician review required: fever with low recorded ANC.",
                rationale=f"Patient presents with fever and ANC of {anc_val:g} cells/uL (< 1000 threshold). Prompt clinical evaluation for febrile neutropenia is indicated.",
                guideline="ASCO/IDSA Clinical Practice Guideline for Management of Febrile Neutropenia",
            )
        )

    # Rule 2: Severe Thrombocytopenia
    platelets = values.get("PLATELETS", float("inf"))
    if platelets < 25000:
        flags.append(
            ReviewFlag(
                severity="high",
                message="Critical thrombocytopenia warning: Platelets < 25,000 /uL.",
                rationale=f"Recorded platelet count of {platelets:g} /uL is below critical bleeding threshold. Hold myelosuppressive therapy and assess for transfusion.",
                guideline="NCCN Clinical Practice Guidelines in Oncology: Hematopoietic Growth Factors",
            )
        )

    # Rule 3: Severe Anemia
    hgb = values.get("HEMOGLOBIN", values.get("HGB", float("inf")))
    if hgb < 8.0:
        flags.append(
            ReviewFlag(
                severity="medium",
                message=f"Severe anemia alert: Hemoglobin {hgb:g} g/dL.",
                rationale="Hemoglobin below 8.0 g/dL. Clinical evaluation for red blood cell transfusion or supportive therapy recommended.",
                guideline="ASCO / ASH Clinical Practice Guideline: Cancer-Related Anemia",
            )
        )

    # Rule 4: Longitudinal Trajectory Alert (Rapid Drop)
    for t in trends:
        if t.trend == "down" and t.previous_value and t.value < t.previous_value * 0.7:
            flags.append(
                ReviewFlag(
                    severity="medium",
                    message=f"Rapid decline detected: {t.name} dropped from {t.previous_value:g} to {t.value:g} {t.unit or ''}.",
                    rationale=f"{t.name} dropped by more than 30% compared to previous cycle baseline.",
                    guideline="Longitudinal Patient Trajectory Analysis",
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
        guideline_refs = [f"{e.title} ({e.source})" for e in evidence[:2]]
        lines.append("Evidence-Based Guidelines Consulted: " + "; ".join(guideline_refs) + ".")

    lines.append("Draft note generated from clinical multimodal inputs. Clinician must review, edit, and approve.")

    return {"draft_note": "\n\n".join(lines)}


def build_round_graph():
    graph = StateGraph(RoundState)
    graph.add_node("extract", extraction_node)
    graph.add_node("context", context_node)
    graph.add_node("rag", rag_node)
    graph.add_node("verify", verification_node)
    graph.add_node("draft", drafting_node)

    graph.add_edge(START, "extract")
    graph.add_edge("extract", "context")
    graph.add_edge("context", "rag")
    graph.add_edge("rag", "verify")
    graph.add_edge("verify", "draft")
    graph.add_edge("draft", END)

    return graph.compile()


round_graph = build_round_graph()
