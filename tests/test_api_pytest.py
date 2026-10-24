import os
import threading
import json
import asyncio
import pytest
from starlette.testclient import TestClient
from starlette.requests import Request

# Ensure environment variables for testing
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000,http://127.0.0.1:3000"
os.environ["REQUIRE_AUTH"] = "false"
os.environ["TRANSCRIPTION_MODE"] = "local"

from backend.api.main import app, stream_rounds, sse_manager
from backend.services.persistence import (
    persist_round,
    get_round,
    approve_note,
    _LOCAL_ROUNDS_STORE,
    _STORE_LOCK,
)
from backend.services.voice_transcriber import (
    get_transcription_mode,
    transcribe_audio_with_details,
)


@pytest.fixture
def client():
    return TestClient(app)


# ── 1. CORS Headers Verification ──────────────────────────────────────
def test_cors_allowed_origin(client):
    # Allowed origin should receive Access-Control-Allow-Origin
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
    }
    res = client.options("/health", headers=headers)
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"

    # Vercel production origin
    vercel_headers = {
        "Origin": "https://rounds-ai-umber.vercel.app",
        "Access-Control-Request-Method": "GET",
    }
    vercel_res = client.options("/health", headers=vercel_headers)
    assert vercel_res.headers.get("access-control-allow-origin") == "https://rounds-ai-umber.vercel.app"


def test_cors_disallowed_origin(client):
    # Disallowed origin should NOT receive Access-Control-Allow-Origin
    headers = {
        "Origin": "http://evil-attacker.com",
        "Access-Control-Request-Method": "GET",
    }
    res = client.options("/health", headers=headers)
    assert res.headers.get("access-control-allow-origin") != "http://evil-attacker.com"


# ── 2. Note Approval Semantics (200 on Valid, 404 on Unknown) ─────────
def test_approve_note_success(client):
    # First persist a real test note
    test_round_id = "test-round-valid-101"
    round_data = {
        "round_id": test_round_id,
        "patient_id": "104",
        "draft_note": "Patient 104 tolerated cycle 3 chemotherapy well.",
        "status": "draft",
    }
    persist_round(round_data)

    # 1. Unverified approval request without verified server identity records "unverified (client-supplied)"
    res_unverified = client.post(
        f"/api/v1/rounds/{test_round_id}/approve",
        json={"approved_by": "Dr. Client Claim, MD"},
    )
    assert res_unverified.status_code == 200
    body_unverified = res_unverified.json()
    assert body_unverified["status"] == "approved"
    assert body_unverified["approved_by"] == "unverified (client-supplied)"
    assert "approved_at" in body_unverified

    # 2. Client sending spoofable headers (X-Verified-User, X-Authenticated-Clinician) is NOT trusted
    res_spoofed = client.post(
        f"/api/v1/rounds/{test_round_id}/approve",
        headers={"X-Verified-User": "Dr. Attending Impersonator, MD", "X-Authenticated-Clinician": "admin"},
        json={"approved_by": "Dr. Spoofed, MD"},
    )
    assert res_spoofed.status_code == 200
    body_spoofed = res_spoofed.json()
    assert body_spoofed["status"] == "approved"
    assert body_spoofed["approved_by"] == "unverified (client-supplied)"

    # Verify persistence recorded unverified
    persisted = get_round(test_round_id)
    assert persisted is not None
    assert persisted.get("status") == "approved"
    assert persisted.get("approved_by") == "unverified (client-supplied)"


def test_approve_note_not_found(client):
    # Unknown note should return 404
    res = client.post(
        "/api/v1/rounds/nonexistent-round-999/approve",
        json={"approved_by": "Dr. Someone"},
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# ── 3. Transcription Mode Guarantee (Zero Egress in Local Mode) ───────
def test_transcription_mode_endpoint(client):
    res = client.get("/api/v1/voice/mode")
    assert res.status_code == 200
    assert res.json()["mode"] == "local"


def test_transcription_mode_zero_egress(monkeypatch):
    gemini_called = False

    def fake_gemini_audio(*args, **kwargs):
        nonlocal gemini_called
        gemini_called = True
        return "Transcribed by cloud"

    monkeypatch.setattr("backend.services.voice_transcriber._transcribe_with_gemini", fake_gemini_audio)
    monkeypatch.setenv("TRANSCRIPTION_MODE", "local")

    # In local mode, transcribe_audio_with_details must NOT call Gemini
    result = transcribe_audio_with_details(b"mock audio bytes")
    assert not gemini_called, "Gemini audio must NOT be called in local transcription mode"
    assert result["mode"] == "local"
    assert result["egress"] == "0 bytes (on-device only)"


# ── 4. Multithreaded Store Concurrency (20 Parallel Threads) ─────────
def test_multithreaded_persistence_concurrency():
    thread_count = 20
    errors = []

    def worker(worker_id: int):
        try:
            for i in range(10):
                round_id = f"thread-round-{worker_id}-{i}"
                persist_round({
                    "round_id": round_id,
                    "patient_id": f"pt-{worker_id}",
                    "draft_note": f"Worker note {worker_id}-{i}",
                })
                # Read back
                retrieved = get_round(round_id)
                assert retrieved is not None
                # Approve
                ok = approve_note(round_id, approved_by=f"Worker {worker_id}")
                assert ok is True
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(thread_count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0, f"Thread concurrency errors: {errors}"


# ── 5. End-to-End Round Extraction Flow ──────────────────────────────
def test_end_to_end_round_extraction(client):
    payload = {
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. Cycle 3. Developed fever since yesterday. WBC 2100, ANC 900.",
        "images": [],
    }
    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()

    # Core contracts
    assert "round_id" in data
    assert "extraction" in data
    assert "draft_note" in data
    assert "review_flags" in data
    assert "confirm_before_signing" in data
    assert data.get("transcription_mode") == "local"

    # Status must be draft
    round_id = data["round_id"]
    persisted = get_round(round_id)
    assert persisted is not None
    assert persisted.get("status") == "draft"

    # Check CTCAE version is cited
    assert "CTCAE" in data.get("ctcae_version", "")


# ── 6. Local Fallback Persistence when Supabase is Offline ────────────
def test_local_persistence_fallback_when_db_offline(client, monkeypatch):
    # Simulate DB client raising an exception (unconfigured or offline)
    def mock_get_supabase():
        raise ConnectionError("Supabase connection offline")

    monkeypatch.setattr("backend.services.persistence.get_supabase", mock_get_supabase)

    payload = {
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. Platelets 45000.",
        "images": [],
    }
    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["saved_to_db"] is False, "saved_to_db must be False when DB is offline"
    round_id = data["round_id"]

    # Local store must retain round safely
    persisted = get_round(round_id)
    assert persisted is not None
    assert persisted["saved_to_db"] is False
    assert persisted.get("status") == "draft"

    # Approving note locally must still succeed
    approve_res = client.post(
        f"/api/v1/rounds/{round_id}/approve",
        headers={"X-Verified-User": "Dr. Offline Fallback, MD"},
        json={"approved_by": "Dr. Offline Fallback, MD"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"
    assert get_round(round_id)["status"] == "approved"
    assert get_round(round_id)["approved_by"] == "unverified (client-supplied)"


# ── 7. Negated Fever Safeguards (API Level) ───────────────────────────
def test_extract_negated_fever_produces_no_fever_alert(client):
    # Patient with ANC < 500 (critical), but explicit "no fever" in transcript
    payload_no_fever = {
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. ANC 450, WBC 1800. No fever reported, denies chills.",
        "images": [],
    }
    res_no_fever = client.post("/api/v1/rounds/extract", json=payload_no_fever)
    assert res_no_fever.status_code == 200
    data_no_fever = res_no_fever.json()
    flags_no_fever = data_no_fever.get("review_flags", [])
    fn_flags_no_fever = [f for f in flags_no_fever if "FEBRILE" in f.get("rule_id", "") or "FEVER" in f.get("rule_id", "")]
    assert len(fn_flags_no_fever) == 0, "Explicit 'no fever' must NOT produce any febrile neutropenia alert"

    # Patient with ANC < 1000, but explicit "afebrile"
    payload_afebrile = {
        "transcript": "Patient 104 is currently afebrile. Temperature normal at 36.8C. ANC 900, WBC 2100.",
        "images": [],
    }
    res_afebrile = client.post("/api/v1/rounds/extract", json=payload_afebrile)
    assert res_afebrile.status_code == 200
    data_afebrile = res_afebrile.json()
    flags_afebrile = data_afebrile.get("review_flags", [])
    fn_flags_afebrile = [f for f in flags_afebrile if "FEBRILE" in f.get("rule_id", "") or "FEVER" in f.get("rule_id", "")]
    assert len(fn_flags_afebrile) == 0, "'afebrile' must NOT produce any febrile neutropenia alert"


# ── 8. Ambiguous / Low-Confidence Lab Validation (API Level) ───────────
def test_low_confidence_ambiguous_lab_produces_confirm_item(client):
    # Dictating ANC 9 without unit is ambiguous scale (0.9 vs 900 vs 9000) -> triggers ConfirmItem
    payload = {
        "transcript": "Patient 104 has ANC 9, WBC 2100. Temperature 37.0C.",
        "images": [],
    }
    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()
    confirms = data.get("confirm_before_signing", [])
    assert len(confirms) >= 1, "Ambiguous/low-confidence lab must produce a ConfirmItem"
    anc_confirm = next((c for c in confirms if "anc" in c.get("id", "").lower() or "anc" in c.get("label", "").lower()), None)
    assert anc_confirm is not None, "ANC ambiguous value must produce a specific ConfirmItem"
    assert "confirm" in anc_confirm.get("reason", "").lower() or "ambiguous" in anc_confirm.get("reason", "").lower()


# ── 9. Server-Sent Events Endpoint Delivery (API Level) ───────────────
@pytest.mark.anyio
async def test_sse_endpoint_stream_connected_and_delivers_round():
    # Directly invoke endpoint generator to verify SSE framing and delivery
    async def mock_receive():
        await asyncio.sleep(100)
        return {"type": "http.disconnect"}

    mock_scope = {"type": "http", "method": "GET", "path": "/api/v1/rounds/stream", "headers": []}
    mock_request = Request(mock_scope, receive=mock_receive)

    response = await stream_rounds(mock_request, patient_id="104")
    assert response.status_code == 200
    assert response.media_type == "text/event-stream"

    gen = response.body_iterator

    # 1. First event is 'connected'
    first_chunk = await anext(gen)
    assert "event: connected" in first_chunk
    assert "104" in first_chunk

    # 2. Broadcast a new round to patient 104
    test_round = {
        "round_id": "sse-test-delivery-104",
        "patient_id": "104",
        "draft_note": "Real-time delivery verification note.",
    }
    await sse_manager.broadcast_round(test_round, "104")

    # 3. Second event is 'round_update' containing the broadcast round
    second_chunk = await anext(gen)
    assert "event: round_update" in second_chunk
    assert "sse-test-delivery-104" in second_chunk


# ── 10. Blank Image Without API Key (Zero Labs + Not Analyzed Msg) ────
def test_blank_image_without_api_key_returns_zero_labs_and_not_analyzed_message(client, monkeypatch):
    from backend.models.round import ImageAttachment
    from backend.services.gemini_vision import analyze_clinical_images

    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("DEMO_MODE", "false")

    # 1x1 blank white PNG
    blank_png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8"
        "/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
    )

    # 1. Direct vision service check (even with 'cbc_report' in filename)
    img = ImageAttachment(name="blank_cbc_report.png", mime_type="image/png", data=blank_png_b64)
    observations = analyze_clinical_images([img])
    assert len(observations) == 1
    assert len(observations[0].labs) == 0, "Blank image without API key must return zero labs"
    assert observations[0].notes is not None
    assert "not analyzed" in observations[0].notes.lower()

    # 2. Full API round extraction check with blank image and no transcript
    payload = {
        "transcript": "",
        "images": [
            {
                "name": "blank_cbc_report.png",
                "mime_type": "image/png",
                "data": blank_png_b64,
            }
        ],
    }
    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()
    extracted_labs = data.get("extraction", {}).get("labs", [])
    assert len(extracted_labs) == 0, f"Expected 0 labs for blank image without API key, got {extracted_labs}"

    confirms = data.get("confirm_before_signing", [])
    assert any(
        "not analyzed" in c.get("reason", "").lower()
        for c in confirms
    ), f"Expected 'not analyzed' message in confirm_before_signing, got {confirms}"


# ── 11. Auth Middleware 401 Enforcement When REQUIRE_AUTH=true ────────
def test_require_auth_rejects_unauthenticated_request_with_401(client, monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    monkeypatch.setenv("API_KEY", "test-secret-api-key-999")

    # 1. Request without API key to protected endpoint must return 401
    res_no_key = client.get("/api/v1/patients")
    assert res_no_key.status_code == 401
    assert "api key" in res_no_key.json().get("detail", "").lower()

    res_post_no_key = client.post(
        "/api/v1/rounds/extract",
        json={"transcript": "Patient 104 afebrile.", "images": []},
    )
    assert res_post_no_key.status_code == 401

    # 2. Request with wrong API key must return 401
    res_wrong_key = client.get(
        "/api/v1/patients",
        headers={"X-API-Key": "wrong-key"},
    )
    assert res_wrong_key.status_code == 401

    # 3. Request with valid X-API-Key header succeeds (200)
    res_valid_key = client.get(
        "/api/v1/patients",
        headers={"X-API-Key": "test-secret-api-key-999"},
    )
    assert res_valid_key.status_code == 200

    # 4. /health endpoint remains accessible without API key
    res_health = client.get("/health")
    assert res_health.status_code == 200


# ── 12. Patient 104 Analytics: DEMO_MODE=false vs DEMO_MODE=true ──────
def test_patient_104_analytics_demo_mode_false_vs_true(client, monkeypatch):
    from backend.services.persistence import _LOCAL_ROUNDS_STORE, _PATIENT_ROUNDS_INDEX, _STORE_LOCK

    with _STORE_LOCK:
        saved_rounds = dict(_LOCAL_ROUNDS_STORE)
        saved_index = {k: list(v) for k, v in _PATIENT_ROUNDS_INDEX.items()}
        _LOCAL_ROUNDS_STORE.clear()
        _PATIENT_ROUNDS_INDEX.clear()

    try:
        # 1. DEMO_MODE=false with zero recorded rounds -> shows "insufficient data"
        monkeypatch.setenv("DEMO_MODE", "false")
        res_false = client.get("/api/v1/analytics/104")
        assert res_false.status_code == 200
        data_false = res_false.json()
        assert data_false["demo_mode"] is False
        assert "insufficient data" in data_false["clinical_synthesis"].lower()
        assert len(data_false["rounds_history"]) == 0
        assert len(data_false["toxicities"]) == 0
        assert len(data_false["safety_alerts"]) == 0
        for traj in data_false["trajectories"]:
            assert traj["trend"] == "insufficient data"
            assert traj["percent_change"] is None
            assert len(traj["data_points"]) == 1  # Admission baseline only

        # 2. DEMO_MODE=true -> shows multi-cycle synthetic demo data labeled with [DEMO DATA]
        monkeypatch.setenv("DEMO_MODE", "true")
        res_true = client.get("/api/v1/analytics/104")
        assert res_true.status_code == 200
        data_true = res_true.json()
        assert data_true["demo_mode"] is True
        assert "[DEMO DATA]" in data_true["clinical_synthesis"]
        assert len(data_true["rounds_history"]) == 3
        assert all("[DEMO DATA]" in r["summary"] for r in data_true["rounds_history"])
        anc_traj_demo = next(t for t in data_true["trajectories"] if "ANC" in t["lab_name"])
        assert len(anc_traj_demo["data_points"]) == 4
        assert anc_traj_demo["current_value"] == 900.0
        assert anc_traj_demo["trend"] == "down"
    finally:
        with _STORE_LOCK:
            _LOCAL_ROUNDS_STORE.clear()
            _LOCAL_ROUNDS_STORE.update(saved_rounds)
            _PATIENT_ROUNDS_INDEX.clear()
            _PATIENT_ROUNDS_INDEX.update(saved_index)


# ── 13. Stage Engines & Local Rules Fallback Reporting ────────────────
def test_stage_engines_and_local_fallback_fields(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "local")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("DEMO_MODE", "false")

    payload = {
        "patient_id": "104",
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer on cycle 3. WBC 2100, ANC 900.",
        "images": [],
    }
    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "stage_engines" in data
    engines = data["stage_engines"]
    assert "polish" in engines
    assert "extraction" in engines
    assert "vision" in engines
    assert "rule_based" in engines["polish"]
    assert "local-rules" in engines["extraction"]
    assert engines["vision"] == "not_run"
    assert data["fallback_used"] is True
    assert data["fallback_message"] is not None
    assert "local" in data["fallback_message"].lower()


# ── 14. Source Consistency & Conflict Confirmation (Transcript ANC 900 vs Image ANC 90) ──
def test_source_consistency_and_conflict_confirm_transcript_anc_900_image_anc_90(client, monkeypatch):
    from backend.services.gemini_vision import VisionObservation, RawVisionLab

    monkeypatch.setenv("LLM_PROVIDER", "local")
    monkeypatch.setenv("GEMINI_API_KEY", "")

    def fake_analyze_clinical_images(images):
        return [
            VisionObservation(
                patient_id="104",
                document_type="Complete Blood Count",
                labs=[
                    RawVisionLab(name="WBC", value=2100.0, unit="cells/µL", confidence="High"),
                    RawVisionLab(name="ANC", value=90.0, unit="cells/µL", confidence="High"),
                    RawVisionLab(name="Platelets", value=145000.0, unit="/µL", confidence="High"),
                ],
                source_file="cbc_scan_104.png",
                engine="gemini (gemini-3.5-flash)",
            )
        ]

    monkeypatch.setattr("backend.agents.round_graph.analyze_clinical_images", fake_analyze_clinical_images)

    blank_png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8"
        "/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
    )
    payload = {
        "patient_id": "104",
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. WBC 2100, ANC 900.",
        "images": [
            {
                "name": "cbc_scan_104.png",
                "mime_type": "image/png",
                "data": blank_png_b64,
            }
        ],
    }

    res = client.post("/api/v1/rounds/extract", json=payload)
    assert res.status_code == 200
    data = res.json()

    labs = data["extraction"]["labs"]
    provenance = data["provenance"]
    confirms = data["confirm_before_signing"]

    # 1. Every lab's source must match provenance[lab.name]
    for lab in labs:
        assert lab["name"] in provenance, f"Lab {lab['name']} missing from provenance"
        assert lab["source"] == provenance[lab["name"]], (
            f"Source mismatch for {lab['name']}: lab.source={lab['source']} vs provenance={provenance[lab['name']]}"
        )

    # 2. Both WBC and ANC appeared in both transcript and image -> both sources must be recorded
    wbc_lab = next(l for l in labs if l["name"].upper() == "WBC")
    anc_lab = next(l for l in labs if l["name"].upper() == "ANC")
    plt_lab = next(l for l in labs if l["name"].upper() == "PLATELETS")

    assert "Transcript" in wbc_lab["source"] and "cbc_scan_104.png (Vision)" in wbc_lab["source"]
    assert "Transcript" in anc_lab["source"] and "cbc_scan_104.png (Vision)" in anc_lab["source"]
    assert plt_lab["source"] == "cbc_scan_104.png (Vision)"

    # 3. ANC values differ (transcript 900 vs image 90) -> must create a "Confirm before signing" conflict item
    assert anc_lab["status"] == "needs_confirmation"
    anc_conflict = next(
        (c for c in confirms if c["item_type"] == "conflict" and "anc" in c["id"].lower()),
        None,
    )
    assert anc_conflict is not None, f"Expected conflict ConfirmItem for ANC 900 vs 90, got {confirms}"
    assert anc_conflict["value"] == {"transcript": 900.0, "image": 90.0}
    assert "900" in anc_conflict["reason"] and "90" in anc_conflict["reason"]
    assert "Transcript" in anc_conflict["source"] and "cbc_scan_104.png (Vision)" in anc_conflict["source"]



# ── 15. X-Test-Mode Header Is Ignored Without Server-Side TEST_MODE ────
def test_x_test_mode_header_ignored_without_server_test_mode(client, monkeypatch):
    """With TEST_MODE unset in the server environment, a request that sends
    X-Test-Mode: true must NOT cause is_test_mode() to return True.

    Because pytest always sets PYTEST_CURRENT_TEST, we test is_test_mode()
    directly with both env vars absent to confirm the correct logic.
    """
    import backend.services.persistence as pers_mod

    # Temporarily remove both env vars so we can test the logic in isolation
    saved_pytest_ct = os.environ.pop("PYTEST_CURRENT_TEST", None)
    saved_test_mode = os.environ.pop("TEST_MODE", None)
    try:
        # Neither PYTEST_CURRENT_TEST nor TEST_MODE is set -> not test mode
        result_without_header = pers_mod.is_test_mode()
        assert result_without_header is False, (
            "is_test_mode() must be False when neither PYTEST_CURRENT_TEST nor TEST_MODE is set"
        )

        # Even with the context var set to True (as if X-Test-Mode header arrived),
        # is_test_mode() must still return False because the server was not
        # started with TEST_MODE=true.
        token = pers_mod._REQUEST_TEST_MODE.set(True)
        try:
            result_with_header_no_server_flag = pers_mod.is_test_mode()
            assert result_with_header_no_server_flag is False, (
                "is_test_mode() must be False when X-Test-Mode: true arrives but "
                "TEST_MODE is not set in the server environment"
            )
        finally:
            pers_mod._REQUEST_TEST_MODE.reset(token)
    finally:
        # Restore env vars so the rest of the pytest session runs normally
        if saved_pytest_ct is not None:
            os.environ["PYTEST_CURRENT_TEST"] = saved_pytest_ct
        if saved_test_mode is not None:
            os.environ["TEST_MODE"] = saved_test_mode


# ── 16. /health Exposes test_mode Field When TEST_MODE=true ───────────
def test_health_exposes_test_mode_when_active(client, monkeypatch):
    """When the server is started with TEST_MODE=true, /health must include
    test_mode='true' and a 'persistence' field describing the limitation."""
    monkeypatch.setenv("TEST_MODE", "true")
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("test_mode") == "true", f"Expected test_mode='true' in /health, got {data}"
    assert "persistence" in data
    assert "disabled" in data["persistence"].lower()


# ── 17. HEAD Probes for Load Balancers & Health Checkers ──────────────
def test_head_probes_return_200(client):
    res_root = client.head("/")
    assert res_root.status_code == 200

    res_health = client.head("/health")
    assert res_health.status_code == 200

    res_api_health = client.head("/api/v1/health")
    assert res_api_health.status_code == 200
