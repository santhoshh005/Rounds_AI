from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.agents.round_graph import round_graph
from backend.models.round import ExtractRoundRequest, ExtractRoundResponse
from backend.services.voice_transcriber import transcribe_audio_on_device
from backend.services.persistence import (
    save_round,
    save_extraction,
    save_review_flags,
    save_draft_note,
    approve_note,
    get_round_history,
)

app = FastAPI(title="RoundsAI Multimodal Clinical API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "multimodal-demo", "version": "0.3.0"}

@app.post("/api/v1/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)) -> dict[str, str]:
    """On-device voice transcription endpoint ensuring clinical audio privacy."""
    try:
        content = await file.read()
        transcript = transcribe_audio_on_device(content, filename=file.filename or "recording.webm")
        return {"transcript": transcript, "engine": "on-device-whisper"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice transcription failed: {exc}")

@app.post("/api/v1/rounds/extract", response_model=ExtractRoundResponse)
def extract_round(request: ExtractRoundRequest) -> ExtractRoundResponse:
    # Invoke full 5-stage agent graph (Extraction -> Context -> RAG -> Verify -> Draft)
    state = round_graph.invoke({
        "transcript": request.transcript,
        "images": request.images,
    })

    # Persist to Supabase (non-fatal if DB is unavailable)
    round_id = save_round(request.transcript or f"Multimodal round with {len(request.images)} image(s)")
    if round_id:
        save_extraction(round_id, state["extraction"])
        save_review_flags(round_id, state.get("review_flags", []))
        save_draft_note(round_id, state.get("draft_note", ""))

    return ExtractRoundResponse(
        extraction=state["extraction"],
        lab_trends=state.get("lab_trends", []),
        review_flags=state.get("review_flags", []),
        retrieved_evidence=state.get("retrieved_evidence", []),
        draft_note=state.get("draft_note", ""),
        disclaimer="Demo / research prototype. Not for autonomous clinical decision-making or real patient data.",
        round_id=round_id,
        provenance=state.get("provenance", {}),
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
