import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import warnings
warnings.filterwarnings("ignore", category=PendingDeprecationWarning)
warnings.filterwarnings("ignore", message=".*allowed_objects.*")

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.agents.round_graph import round_graph, CTCAE_V5_CONFIG
from backend.models.round import ExtractRoundRequest, ExtractRoundResponse
from backend.models.patient import Patient, PatientCreate, PatientUpdate
from backend.models.analytics import PatientAnalyticsResponse
from backend.services.voice_transcriber import (
    transcribe_audio_on_device,
    transcribe_audio_with_details,
    get_transcription_mode,
)
from backend.services.persistence import (
    save_round,
    save_extraction,
    save_review_flags,
    save_draft_note,
    approve_note,
    get_round_history,
    get_round_by_id,
    _LOCAL_ROUNDS_STORE,
    _STORE_LOCK,
)
from backend.services.patient_service import (
    list_patients as get_patients_list,
    get_patient as find_patient_by_id,
    create_patient as admit_new_patient,
    update_patient as modify_patient,
    discharge_patient as discharge_patient_from_ward,
)
from backend.services.patient_analytics import get_patient_analytics
from backend.services.clinical_autocorrect import correct_clinical_transcript

logger = logging.getLogger(__name__)

app = FastAPI(
    title="RoundsAI Multimodal Clinical API",
    description="Doctor Productivity & Knowledge Assistant for Oncology Ward Rounds",
    version="0.4.0",
)


# ── Server-Sent Events (SSE) Real-Time Manager ────────────────────────
class RoundSSEManager:
    """Manages real-time asynchronous streaming queues for active doctor workstations."""

    def __init__(self):
        self._listeners: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def subscribe(self, patient_id: str | None = None) -> asyncio.Queue:
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        key = patient_id.strip() if patient_id else "all"
        q: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if key not in self._listeners:
                self._listeners[key] = []
            self._listeners[key].append(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue, patient_id: str | None = None):
        key = patient_id.strip() if patient_id else "all"
        async with self._lock:
            if key in self._listeners and q in self._listeners[key]:
                self._listeners[key].remove(q)

    async def broadcast_round(self, round_data: dict, patient_id: str | None = None):
        payload = json.dumps(round_data)
        async with self._lock:
            for q in list(self._listeners.get("all", [])):
                await q.put(payload)
            if patient_id and patient_id in self._listeners:
                for q in list(self._listeners[patient_id]):
                    await q.put(payload)

    def broadcast_sync(self, round_data: dict, patient_id: str | None = None):
        """Thread-safe broadcast invocation for synchronous worker threads."""
        if self._loop and self._loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self.broadcast_round(round_data, patient_id), self._loop)
            except Exception as e:
                logger.warning("Could not dispatch SSE broadcast: %s", e)


sse_manager = RoundSSEManager()


# ── Security: Configurable CORS without Wildcard Regex ────────────────
allowed_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,https://rounds-ai-app.firebaseapp.com,https://rounds-ai-app.web.app",
)
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Security: Configurable API Key / Bearer Auth Middleware ───────────
class ApiKeyAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = dict(scope.get("headers", []))
        test_mode_header = headers.get(b"x-test-mode", b"").decode("latin-1").strip().lower()
        from backend.services.persistence import _REQUEST_TEST_MODE
        token = _REQUEST_TEST_MODE.set(test_mode_header in ("true", "1", "yes"))

        try:
            path = scope.get("path", "")
            method = scope.get("method", "")
            require_auth = os.getenv("REQUIRE_AUTH", "false").strip().lower() in ("true", "1", "yes")

            # Allow public endpoints and preflight
            if not require_auth or method == "OPTIONS" or path in ("/", "/health", "/api/v1/health", "/docs", "/openapi.json", "/redoc"):
                return await self.app(scope, receive, send)

            expected_key = os.getenv("API_KEY") or os.getenv("AUTH_TOKEN") or ""
            if not expected_key:
                response = JSONResponse(status_code=500, content={"detail": "Server auth misconfigured: no API_KEY set"})
                return await response(scope, receive, send)

            api_key_header = headers.get(b"x-api-key", b"").decode("latin-1")
            auth_header = headers.get(b"authorization", b"").decode("latin-1")
            bearer_token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""

            if api_key_header == expected_key or bearer_token == expected_key:
                return await self.app(scope, receive, send)

            response = JSONResponse(status_code=401, content={"detail": "Unauthorized: Invalid or missing API key"})
            return await response(scope, receive, send)
        finally:
            _REQUEST_TEST_MODE.reset(token)


app.add_middleware(ApiKeyAuthMiddleware)


# ── Startup Model & Pipeline Verification ─────────────────────────────
@app.on_event("startup")
def startup_checks():
    v_model = os.getenv("GEMINI_MODEL_VISION", "gemini-3.5-flash")
    d_model = os.getenv("GEMINI_MODEL_DRAFT", "gemini-3.5-flash")
    p_model = os.getenv("GEMINI_MODEL_POLISH", "gemini-3.5-flash-lite")
    stt_mode = get_transcription_mode()
    req_auth = os.getenv("REQUIRE_AUTH", "false").lower() in ("true", "1", "yes")
    test_mode_active = os.getenv("TEST_MODE", "false").strip().lower() in ("true", "1", "yes")

    logger.info("==================================================")
    logger.info("       ROUNDSAI CLINICAL BACKEND INITIALIZED      ")
    logger.info("==================================================")
    logger.info("Vision OCR Model:       %s", v_model)
    logger.info("Draft / Extract Model:  %s", d_model)
    logger.info("Grammar Polish Model:   %s", p_model)
    logger.info("Transcription Mode:     %s (Default: local/zero-egress)", stt_mode)
    logger.info("Authentication Active:  %s", req_auth)
    logger.info("Allowed CORS Origins:   %s", allowed_origins)
    logger.info("CTCAE Standard:         %s", CTCAE_V5_CONFIG["version"])
    if test_mode_active:
        logger.warning("==================================================")
        logger.warning("  ⚠  TEST_MODE=true: ALL SUPABASE DB WRITES ARE  ")
        logger.warning("     DISABLED FOR THIS SERVER INSTANCE.           ")
        logger.warning("     DO NOT USE IN PRODUCTION.                    ")
        logger.warning("==================================================")
    logger.info("==================================================")


@app.get("/")
def root() -> dict[str, str]:
    return {
        "status": "online",
        "service": "RoundsAI Inpatient Oncology Copilot API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
@app.get("/api/v1/health")
def health() -> dict[str, str]:
    test_mode_active = os.getenv("TEST_MODE", "false").strip().lower() in ("true", "1", "yes")
    result = {
        "status": "ok",
        "mode": "multimodal-demo",
        "version": "0.4.0",
        "transcription_mode": get_transcription_mode(),
        "ctcae_version": CTCAE_V5_CONFIG["version"],
    }
    if test_mode_active:
        result["test_mode"] = "true"
        result["persistence"] = "disabled (TEST_MODE=true — no DB writes)"
    return result



class AutoCorrectRequest(BaseModel):
    text: str
    use_gemini: bool = True


class AutoCorrectResponse(BaseModel):
    original_text: str
    corrected_text: str
    changes: list[dict]
    engine: str


@app.post("/api/v1/voice/autocorrect", response_model=AutoCorrectResponse)
@app.post("/api/v1/clinical/autocorrect", response_model=AutoCorrectResponse)
def autocorrect_clinical_text(request: AutoCorrectRequest) -> AutoCorrectResponse:
    """Intelligently correct oncology phonetic speech errors with context validation."""
    result = correct_clinical_transcript(request.text, use_gemini=request.use_gemini)
    return AutoCorrectResponse(**result)


@app.get("/api/v1/voice/mode")
def get_voice_mode() -> dict:
    """Retrieve active audio speech-to-text mode and privacy level."""
    demo_mode = os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")
    return {"mode": get_transcription_mode(), "demo_mode": demo_mode}



@app.post("/api/v1/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)) -> dict[str, str]:
    """Transcribe clinical dictation respecting TRANSCRIPTION_MODE (local | cloud | hybrid)."""
    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:  # 25MB max audio
            raise HTTPException(status_code=413, detail="Audio file exceeds 25MB limit.")
        details = transcribe_audio_with_details(content, filename=file.filename or "recording.webm")
        return details
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice transcription failed: {exc}")


# ── Server-Sent Events Endpoint ───────────────────────────────────────
@app.get("/api/v1/rounds/stream")
async def stream_rounds(request: Request, patient_id: str | None = None):
    """Stream real-time bedside round transmissions via Server-Sent Events (SSE)."""
    queue = await sse_manager.subscribe(patient_id)

    async def event_generator():
        try:
            yield f"event: connected\ndata: {json.dumps({'status': 'connected', 'patient_id': patient_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=3.0)
                    yield f"event: round_update\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            await sse_manager.unsubscribe(queue, patient_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/rounds/extract", response_model=ExtractRoundResponse)
def extract_round(request: ExtractRoundRequest) -> ExtractRoundResponse:
    if len(request.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images allowed per clinical round assessment.")

    # 5-stage agent graph execution
    state = round_graph.invoke({
        "transcript": request.transcript,
        "images": request.images,
        "patient_id": request.patient_id,
    })

    if request.patient_id and not state["extraction"].patient_id:
        state["extraction"].patient_id = request.patient_id

    # Persist with resilience tracking
    round_id, saved_to_db = save_round(request.transcript or f"Multimodal round with {len(request.images)} image(s)")
    if round_id:
        save_extraction(round_id, state["extraction"])
        save_review_flags(round_id, state.get("review_flags", []))
        note_id, note_db_ok = save_draft_note(round_id, state.get("draft_note", ""))

        pid = state["extraction"].patient_id or request.patient_id
        cached_data = None
        with _STORE_LOCK:
            if round_id in _LOCAL_ROUNDS_STORE:
                _LOCAL_ROUNDS_STORE[round_id]["lab_trends"] = [lt.model_dump() for lt in state.get("lab_trends", [])]
                _LOCAL_ROUNDS_STORE[round_id]["review_flags"] = [rf.model_dump() for rf in state.get("review_flags", [])]
                _LOCAL_ROUNDS_STORE[round_id]["retrieved_evidence"] = [ev.model_dump() for ev in state.get("retrieved_evidence", [])]
                _LOCAL_ROUNDS_STORE[round_id]["provenance"] = state.get("provenance", {})
                _LOCAL_ROUNDS_STORE[round_id]["patient_id"] = pid
                _LOCAL_ROUNDS_STORE[round_id]["draft_note"] = state.get("draft_note", "")
                _LOCAL_ROUNDS_STORE[round_id]["confirm_before_signing"] = [c.model_dump() for c in state.get("confirm_before_signing", [])]
                _LOCAL_ROUNDS_STORE[round_id]["ctcae_version"] = state.get("ctcae_version", CTCAE_V5_CONFIG["version"])
                _LOCAL_ROUNDS_STORE[round_id]["saved_to_db"] = saved_to_db
                _LOCAL_ROUNDS_STORE[round_id]["stage_engines"] = state.get("stage_engines", {})
                _LOCAL_ROUNDS_STORE[round_id]["fallback_used"] = state.get("fallback_used", False)
                _LOCAL_ROUNDS_STORE[round_id]["fallback_message"] = state.get("fallback_message")
                cached_data = dict(_LOCAL_ROUNDS_STORE[round_id])

        # Asynchronously broadcast to real-time doctor workstations
        if cached_data:
            sse_manager.broadcast_sync(cached_data, pid)

    demo_mode = os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")
    return ExtractRoundResponse(
        extraction=state["extraction"],
        lab_trends=state.get("lab_trends", []),
        review_flags=state.get("review_flags", []),
        retrieved_evidence=state.get("retrieved_evidence", []),
        draft_note=state.get("draft_note", ""),
        disclaimer="Demo / research prototype. Not for autonomous clinical decision-making or real patient data.",
        round_id=round_id,
        provenance=state.get("provenance", {}),
        saved_to_db=saved_to_db,
        confirm_before_signing=state.get("confirm_before_signing", []),
        ctcae_version=state.get("ctcae_version", CTCAE_V5_CONFIG["version"]),
        transcription_mode=get_transcription_mode(),
        demo_mode=demo_mode,
        stage_engines=state.get("stage_engines", {}),
        fallback_used=state.get("fallback_used", False),
        fallback_message=state.get("fallback_message"),
    )



class ApproveRequest(BaseModel):
    note_id: str | None = None
    approved_by: str = "Dr. Attending"


@app.post("/api/v1/rounds/{round_id}/approve")
@app.patch("/api/v1/rounds/{round_id}/approve")
def approve_round_note(round_id: str, request: ApproveRequest, raw_request: Request) -> dict:
    """Approve a draft note, requiring human clinician confirmation."""
    target_note_id = request.note_id
    if not target_note_id:
        with _STORE_LOCK:
            r = _LOCAL_ROUNDS_STORE.get(round_id)
            if r and r.get("draft_notes"):
                target_note_id = r["draft_notes"][0].get("id")
        if not target_note_id:
            target_note_id = round_id

    # Stop trusting spoofable client headers (X-Verified-User, X-Authenticated-Clinician).
    # Validate Firebase ID token server-side if present; otherwise always store as "unverified (client-supplied)".
    final_approved_by = "unverified (client-supplied)"
    auth_header = raw_request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:].strip()
        try:
            import firebase_admin
            from firebase_admin import auth as fb_auth

            if not firebase_admin._apps:
                proj_id = os.getenv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") or os.getenv("FIREBASE_PROJECT_ID")
                if proj_id:
                    firebase_admin.initialize_app(options={"projectId": proj_id})
                else:
                    firebase_admin.initialize_app()
            decoded = fb_auth.verify_id_token(bearer_token, check_revoked=False)
            verified_id = decoded.get("email") or decoded.get("name") or decoded.get("uid")
            if verified_id and str(verified_id).strip():
                final_approved_by = str(verified_id).strip()
        except Exception as exc:
            logger.debug("Firebase ID token verification failed or unconfigured: %s", exc)

    success = approve_note(target_note_id, round_id=round_id, approved_by=final_approved_by)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Draft note '{target_note_id}' not found or does not belong to specified round",
        )
    with _STORE_LOCK:
        if round_id in _LOCAL_ROUNDS_STORE:
            _LOCAL_ROUNDS_STORE[round_id]["status"] = "approved"
            _LOCAL_ROUNDS_STORE[round_id]["approved_by"] = final_approved_by

    return {
        "status": "approved",
        "note_id": target_note_id,
        "round_id": round_id,
        "approved_by": final_approved_by,
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/rounds/latest")
def get_latest_round(patient_id: str | None = None) -> dict:
    """Retrieve the most recent round, optionally filtered by patient_id."""
    rounds = get_round_history(limit=50)
    if not rounds:
        raise HTTPException(status_code=404, detail="No rounds recorded yet.")

    if patient_id:
        pid = str(patient_id).strip()
        for r in rounds:
            for ext in r.get("extractions", []):
                if str(ext.get("patient_id", "")).strip() == pid:
                    r["round_id"] = r.get("round_id") or r.get("id")
                    return r
            if str(r.get("patient_id", "")).strip() == pid:
                r["round_id"] = r.get("round_id") or r.get("id")
                return r
        raise HTTPException(status_code=404, detail=f"No rounds found for patient {patient_id}.")

    top = rounds[0]
    top["round_id"] = top.get("round_id") or top.get("id")
    return top


@app.get("/api/v1/rounds/{round_id}")
def get_single_round(round_id: str) -> dict:
    """Retrieve round by ID."""
    r = get_round_by_id(round_id)
    if not r:
        raise HTTPException(status_code=404, detail=f"Round {round_id} not found.")
    r["round_id"] = r.get("round_id") or r.get("id")
    return r


@app.get("/api/v1/rounds")
def list_rounds(limit: int = Query(default=20, ge=1, le=100)) -> list[dict]:
    return get_round_history(limit=limit)


# ── Oncology Ward Patient Roster Endpoints (CRUD) ──────────────────────
@app.get("/api/v1/patients", response_model=list[Patient])
def get_patients(status: str = Query(default="admitted", pattern="^(admitted|discharged|all)$")) -> list[Patient]:
    filter_status = None if status == "all" else status
    return get_patients_list(status=filter_status)


@app.post("/api/v1/patients", response_model=Patient, status_code=201)
def admit_patient(patient_in: PatientCreate) -> Patient:
    existing = find_patient_by_id(patient_in.id)
    if existing and existing.status == "admitted":
        raise HTTPException(status_code=409, detail=f"Patient with ID {patient_in.id} is already admitted.")
    return admit_new_patient(patient_in)


@app.get("/api/v1/patients/{patient_id}", response_model=Patient)
def get_patient_details(patient_id: str) -> Patient:
    patient = find_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return patient


@app.put("/api/v1/patients/{patient_id}", response_model=Patient)
def update_patient_details(patient_id: str, updates: PatientUpdate) -> Patient:
    updated = modify_patient(patient_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return updated


@app.delete("/api/v1/patients/{patient_id}")
def discharge_patient(patient_id: str) -> dict:
    success = discharge_patient_from_ward(patient_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return {"status": "discharged", "patient_id": patient_id}


@app.get("/api/v1/patients/{patient_id}/analytics", response_model=PatientAnalyticsResponse)
@app.get("/api/v1/analytics/{patient_id}", response_model=PatientAnalyticsResponse)
def get_patient_analytics_data(patient_id: str) -> PatientAnalyticsResponse:
    analytics = get_patient_analytics(patient_id)
    if not analytics:
        raise HTTPException(status_code=404, detail=f"Analytics data for patient {patient_id} not found.")
    return analytics
