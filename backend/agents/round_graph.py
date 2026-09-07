from typing import TypedDict
from langgraph.graph import END, START, StateGraph
from backend.models.round import ClinicalExtraction, ReviewFlag
from backend.services.local_extractor import extract_clinical_facts

class RoundState(TypedDict, total=False):
    transcript: str
    extraction: ClinicalExtraction
    review_flags: list[ReviewFlag]
    draft_note: str

def extraction_node(state: RoundState) -> RoundState:
    return {"extraction": extract_clinical_facts(state["transcript"])}

def verification_node(state: RoundState) -> RoundState:
    facts = state["extraction"]; values = {lab.name: lab.value for lab in facts.labs}; flags: list[ReviewFlag] = []
    if "fever" in facts.symptoms and values.get("ANC", float("inf")) < 1000:
        flags.append(ReviewFlag(severity="high", message="Clinician review required: fever with low recorded ANC.", rationale="The entered text contains fever and ANC below 1000 cells/uL. This is a review prompt, not a diagnosis or treatment recommendation."))
    return {"review_flags": flags}

def drafting_node(state: RoundState) -> RoundState:
    facts = state["extraction"]; patient = facts.patient_id or "Unidentified demo patient"
    demographic = " ".join(x for x in [str(facts.age) if facts.age else None, facts.sex.value if facts.sex.value != "unknown" else None] if x)
    lines = [f"ONCOLOGY ROUND NOTE - {patient}", f"Patient: {demographic or 'Age/sex not stated'}; diagnosis: {facts.diagnosis or 'not stated'}." ]
    if facts.treatment_cycle is not None: lines.append(f"Treatment: cycle {facts.treatment_cycle} (regimen not stated).")
    if facts.symptoms: lines.append(f"Reported symptoms: {', '.join(facts.symptoms)}.")
    if facts.labs: lines.append("Recorded labs: " + ", ".join(f"{lab.name} {lab.value:g} {lab.unit or ''}".strip() for lab in facts.labs) + ".")
    lines.append("Draft generated from entered demo text; clinician must review, edit, and approve.")
    return {"draft_note": "\n\n".join(lines)}

def build_round_graph():
    graph = StateGraph(RoundState)
    graph.add_node("extract", extraction_node); graph.add_node("verify", verification_node); graph.add_node("draft", drafting_node)
    graph.add_edge(START, "extract"); graph.add_edge("extract", "verify"); graph.add_edge("verify", "draft"); graph.add_edge("draft", END)
    return graph.compile()

round_graph = build_round_graph()
