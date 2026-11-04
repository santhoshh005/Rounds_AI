# -*- coding: utf-8 -*-
"""Regression tests for issues fixed in the end-to-end audit."""
import asyncio

import pytest

from backend.agents.round_graph import round_graph
from backend.services import ai_fallback
from backend.services.clinical_negation import partition_symptoms


@pytest.mark.parametrize(
    "text, active, negated",
    [
        ("Febrile 38.6, ANC 400. Denies chest pain.", ["fever"], ["pain (negated)"]),
        ("No fever and reports severe pain.", ["pain"], ["fever (negated)"]),
        ("Denies nausea, vomiting or diarrhea.", [], ["nausea (negated)", "vomiting (negated)", "diarrhea (negated)"]),
        ("No nausea but has diarrhea.", ["diarrhea"], ["nausea (negated)"]),
        ("Patient is having nausea.", ["nausea"], []),
    ],
)
def test_negation_is_scoped_to_its_clause(text, active, negated):
    assert partition_symptoms(text) == (active, negated)


def test_round_graph_keeps_selected_patient_id():
    state = round_graph.invoke({"transcript": "ANC 400. Temp 38.6 C.", "images": [], "patient_id": "104"})
    assert state["extraction"].patient_id == "104"
    assert "Unidentified" not in state["draft_note"]


def test_quota_errors_put_model_on_cooldown_and_are_not_retried(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL_VISION", "gemini-test-primary")
    quota = Exception("429 RESOURCE_EXHAUSTED: quota exceeded")
    assert not ai_fallback.should_retry_same_model(quota)
    assert ai_fallback.should_retry_same_model(Exception("503 UNAVAILABLE: high demand"))

    ai_fallback.note_model_failure("gemini-test-primary", quota)
    assert "gemini-test-primary" not in ai_fallback.get_candidate_models("vision")
    ai_fallback.reset_model_cooldowns()
    assert ai_fallback.get_candidate_models("vision")[0] == "gemini-test-primary"


def test_sse_manager_lock_is_lazy_and_listeners_are_cleaned_up():
    from backend.api.main import RoundSSEManager

    manager = RoundSSEManager()
    assert manager._lock is None  # no asyncio primitive created at import/construction time

    async def scenario():
        q = await manager.subscribe("104")
        await manager.broadcast_round({"round_id": "r1"}, "104")
        assert q.get_nowait() == '{"round_id": "r1"}'
        for i in range(RoundSSEManager.MAX_QUEUED_EVENTS + 5):
            await manager.broadcast_round({"i": i}, "104")
        assert q.qsize() == RoundSSEManager.MAX_QUEUED_EVENTS  # bounded for stalled clients
        await manager.unsubscribe(q, "104")
        assert manager.listener_count() == 0
        assert "104" not in manager._listeners

    asyncio.run(scenario())


def test_bedside_sync_relays_without_ai_or_persistence():
    from starlette.testclient import TestClient

    from backend.api.main import app

    client = TestClient(app)
    res = client.post(
        "/api/v1/rounds/bedside-sync",
        json={"patient_id": "104", "transcript": "ANC 420. Temp 38.4 C.", "word_count": 5, "timestamp": 1},
    )
    assert res.status_code == 202
    assert res.json()["status"] == "relayed"
    assert client.post("/api/v1/rounds/bedside-sync", json={"patient_id": ""}).status_code == 422


def test_timeouts_are_not_retried_and_cool_down():
    timeout = Exception("504 DEADLINE_EXCEEDED: request timed out")
    assert ai_fallback.is_timeout_error(timeout)
    assert not ai_fallback.should_retry_same_model(timeout)
    ai_fallback.note_model_failure("gemini-test-slow", timeout)
    assert ai_fallback._is_cooling("gemini-test-slow")
    ai_fallback.reset_model_cooldowns()


def test_stage_budget_stops_the_cascade(monkeypatch):
    import time as _time

    monkeypatch.setattr(ai_fallback, "AI_STAGE_BUDGET_S", 5.0)
    started = _time.monotonic()
    assert not ai_fallback.stage_budget_exhausted(started)
    assert ai_fallback.stage_budget_exhausted(started - 6.0)


def test_round_graph_polish_does_not_call_gemini_by_default(monkeypatch):
    import backend.services.clinical_autocorrect as ca

    calls = []
    real = ca.correct_clinical_transcript

    def spy(text, use_gemini=True):
        calls.append(use_gemini)
        return real(text, use_gemini=False)

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_POLISH", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(ca, "correct_clinical_transcript", spy)
    round_graph.invoke({"transcript": "ANC 420. Temp 38.4 C.", "images": [], "patient_id": "104"})
    assert calls == [False]
