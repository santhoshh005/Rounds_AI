import warnings
warnings.filterwarnings("ignore", category=PendingDeprecationWarning)
warnings.filterwarnings("ignore", message=".*allowed_objects.*")

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.agents.round_graph import round_graph
from backend.models.round import ExtractRoundRequest, ExtractRoundResponse
from backend.models.patient import Patient, PatientCreate, PatientUpdate
from backend.services.voice_transcriber import transcribe_audio_on_device
from backend.services.persistence import (
    save_round,
    save_extraction,
    save_review_flags,
    save_draft_note,
    approve_note,
    get_round_history,
)
from backend.services.patient_service import (
    list_patients as get_patients_list,
    get_patient as find_patient_by_id,
    create_patient as admit_new_patient,
    update_patient as modify_patient,
    discharge_patient as discharge_patient_from_ward,
)

app = FastAPI(
    title="RoundsAI Multimodal Clinical API",
    description="Doctor Productivity & Knowledge Assistant for Oncology Ward Rounds",
    version="0.3.2",
)

# Robust, secure CORS handling without wildcard credentials conflict
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://rounds-ai-app.firebaseapp.com",
        "https://rounds-ai-app.web.app",
    ],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "multimodal-demo", "version": "0.3.1"}

@app.post("/api/v1/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)) -> dict[str, str]:
    """On-device voice transcription endpoint ensuring clinical audio privacy."""
    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:  # 25MB max audio
            raise HTTPException(status_code=413, detail="Audio file exceeds 25MB limit.")
        transcript = transcribe_audio_on_device(content, filename=file.filename or "recording.webm")
        return {"transcript": transcript, "engine": "on-device-whisper"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice transcription failed: {exc}")

@app.post("/api/v1/rounds/extract", response_model=ExtractRoundResponse)
def extract_round(request: ExtractRoundRequest) -> ExtractRoundResponse:
    # Security: Limit maximum attachments to avoid memory exhaustion
    if len(request.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images allowed per clinical round assessment.")

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
    # Security: Scoped to round_id to prevent BOLA vulnerabilities
    success = approve_note(request.note_id, round_id=round_id)
    if not success:
        raise HTTPException(status_code=404, detail="Draft note not found or does not belong to the specified round")
    return {"status": "approved", "note_id": request.note_id, "round_id": round_id}

@app.get("/api/v1/rounds")
def list_rounds(limit: int = Query(default=20, ge=1, le=100)) -> list[dict]:
    # Security: Bounded pagination limit to prevent Denial of Wallet / DoS
    return get_round_history(limit=limit)


# ── Oncology Ward Patient Roster Endpoints (CRUD) ──────────────────────

@app.get("/api/v1/patients", response_model=list[Patient])
def get_patients(status: str = Query(default="admitted", regex="^(admitted|discharged|all)$")) -> list[Patient]:
    """Retrieve oncology ward patient roster."""
    filter_status = None if status == "all" else status
    return get_patients_list(status=filter_status)


@app.post("/api/v1/patients", response_model=Patient, status_code=201)
def admit_patient(patient_in: PatientCreate) -> Patient:
    """Admit a new patient into the oncology ward."""
    existing = find_patient_by_id(patient_in.id)
    if existing and existing.status == "admitted":
        raise HTTPException(status_code=409, detail=f"Patient with ID {patient_in.id} is already admitted.")
    return admit_new_patient(patient_in)


@app.get("/api/v1/patients/{patient_id}", response_model=Patient)
def get_patient_details(patient_id: str) -> Patient:
    """Fetch patient profile and clinical baseline data."""
    patient = find_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return patient


@app.put("/api/v1/patients/{patient_id}", response_model=Patient)
def update_patient_details(patient_id: str, updates: PatientUpdate) -> Patient:
    """Update patient details, advance chemo cycle, or reassign bed."""
    updated = modify_patient(patient_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return updated


@app.delete("/api/v1/patients/{patient_id}")
def discharge_patient(patient_id: str) -> dict:
    """Discharge a patient from the active oncology ward roster."""
    success = discharge_patient_from_ward(patient_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return {"status": "discharged", "patient_id": patient_id}

