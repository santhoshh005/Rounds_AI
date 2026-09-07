from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.agents.round_graph import round_graph
from backend.models.round import ExtractRoundRequest, ExtractRoundResponse
from backend.services.persistence import (
    save_round,
    save_extraction,
    save_review_flags,
    save_draft_note,
    approve_note,
    get_round_history,
)

app = FastAPI(title="RoundsAI API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "demo-only"}

@app.post("/api/v1/rounds/extract", response_model=ExtractRoundResponse)
def extract_round(request: ExtractRoundRequest) -> ExtractRoundResponse:
    state = round_graph.invoke({"transcript": request.transcript})

    # Persist to Supabase (non-fatal if DB is unavailable)
    round_id = save_round(request.transcript)
    if round_id:
        save_extraction(round_id, state["extraction"])
        save_review_flags(round_id, state["review_flags"])
        save_draft_note(round_id, state["draft_note"])

    return ExtractRoundResponse(
        extraction=state["extraction"],
        review_flags=state["review_flags"],
        draft_note=state["draft_note"],
        disclaimer="Demo / research prototype. Not for autonomous clinical decision-making or real patient data.",
        round_id=round_id,
    )

class ApproveRequest(BaseModel):
    note_id: str

@app.patch("/api/v1/rounds/{round_id}/approve")
def approve_round_note(round_id: str, request: ApproveRequest) -> dict:
    success = approve_note(request.note_id)
    if not success:
        raise HTTPException(status_code=500, detail="Could not approve note")
    return {"status": "approved", "note_id": request.note_id}

@app.get("/api/v1/rounds")
def list_rounds(limit: int = 20) -> list[dict]:
    return get_round_history(limit=limit)
