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


def test_stage_budget_skips_a_call_that_cannot_finish(monkeypatch):
    # After a 10 s timeout, a 12 s budget has no room for another 10 s call.
    import time as _time

    monkeypatch.setattr(ai_fallback, "AI_STAGE_BUDGET_S", 12.0)
    monkeypatch.setattr(ai_fallback, "GEMINI_CALL_TIMEOUT_MS", 10000)
    now = _time.monotonic()
    assert not ai_fallback.stage_budget_exhausted(now)          # first call always runs
    assert not ai_fallback.stage_budget_exhausted(now - 0.5)    # after a fast 429
    assert ai_fallback.stage_budget_exhausted(now - 10.0)       # after a timeout


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


def test_analytics_insight_is_cached_until_data_changes(monkeypatch):
    from backend.services import gemini_analytics as ga

    calls = []
    real = ga._generate_ai_analytics_insight_uncached

    def counting(**kwargs):
        calls.append(kwargs["rounds"])
        return real(**kwargs)

    monkeypatch.setattr(ga, "_generate_ai_analytics_insight_uncached", counting)
    rounds = [{"anc": 420, "platelets": 88000, "ctcae_grade": 4}]
    a = ga.generate_ai_analytics_insight(patient_id="104", patient_name="Demo", rounds=rounds)
    b = ga.generate_ai_analytics_insight(patient_id="104", patient_name="Demo", rounds=rounds)
    assert a is b and len(calls) == 1  # same data: no second generation
    ga.generate_ai_analytics_insight(patient_id="104", patient_name="Demo", rounds=rounds, force_refresh=True)
    assert len(calls) == 2  # Re-analyze bypasses the cache
    ga.generate_ai_analytics_insight(patient_id="104", patient_name="Demo", rounds=rounds + [{"anc": 900}])
    assert len(calls) == 3  # new round data: regenerated


def test_gemini_call_timeout_meets_api_minimum():
    # The Gemini API returns 400 INVALID_ARGUMENT for deadlines under 10 s, which made
    # every call fail and fall back to rules.
    from backend.services import ai_fallback

    assert ai_fallback.GEMINI_CALL_TIMEOUT_MS >= 10000
    assert ai_fallback.gemini_call_timeout_ms("9000") == 10000
    assert ai_fallback.gemini_call_timeout_ms(None) == 10000
    assert ai_fallback.gemini_call_timeout_ms("abc") == 10000
    assert ai_fallback.gemini_call_timeout_ms("20000") == 20000


def test_fast_thinking_config_per_model_family():
    # Default thinking pushed Flash calls past the 10 s timeout and, on 2.5 models,
    # used up max_output_tokens before the JSON answer.
    from backend.services.ai_fallback import fast_thinking_config

    assert fast_thinking_config("gemini-3.5-flash").thinking_level.name == "LOW"
    assert fast_thinking_config("gemini-2.5-flash").thinking_budget == 0
    assert fast_thinking_config("gemini-2.5-pro").thinking_budget == 128
    assert fast_thinking_config("gemini-2.0-flash") is None
    assert fast_thinking_config("gemini-flash-latest") is None


def test_polish_guard_accepts_spoken_numbers_written_as_digits():
    from backend.services.clinical_autocorrect import _validate_gemini_polish

    ok, _ = _validate_gemini_polish("anc four twenty on folfox", "ANC 420 on FOLFOX")
    assert ok
    ok, reason = _validate_gemini_polish("anc four twenty on folfox", "ANC 520 on FOLFOX")
    assert not ok and "Numbers altered" in reason
