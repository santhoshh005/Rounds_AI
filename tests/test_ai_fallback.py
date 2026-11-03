# -*- coding: utf-8 -*-
"""Unit tests for AI model selection and 4-tier fallback hierarchy."""
import os
import pytest

from backend.services.ai_fallback import (
    get_candidate_models,
    is_transient_error,
    format_model_provenance,
)


def test_get_candidate_models_has_minimum_4_models():
    """Verify that every task category has at least 4 fallback models."""
    for task in ("vision", "extraction", "polish", "analytics", "audio"):
        candidates = get_candidate_models(task)
        assert len(candidates) >= 4, f"Task {task} should have at least 4 models, got {len(candidates)}"
        assert "gemini-2.5-flash" in candidates
        assert "gemini-1.5-flash" in candidates


def test_get_candidate_models_respects_custom_environment_override(monkeypatch):
    """Verify that user-configured environment variables take highest priority."""
    monkeypatch.setenv("GEMINI_MODEL_VISION", "gemini-custom-vision-model")
    candidates = get_candidate_models("vision")
    assert candidates[0] == "gemini-custom-vision-model"
    assert len(candidates) >= 4


def test_is_transient_error_identifies_retriable_codes():
    """Verify transient 503, 504, 429, and quota exceptions are caught."""
    assert is_transient_error(Exception("503 Service Unavailable: High demand"))
    assert is_transient_error(Exception("HTTP 429: Resource exhausted / rate limit exceeded"))
    assert is_transient_error(Exception("Deadline_exceeded after 15000ms"))
    assert not is_transient_error(ValueError("Invalid clinical syntax"))


def test_format_model_provenance_primary_ai_model(monkeypatch):
    """Verify primary AI model produces clear model identification without fallback flag."""
    monkeypatch.delenv("GEMINI_MODEL_DRAFT", raising=False)
    meta = format_model_provenance("gemini (gemini-2.5-flash)", task="extraction")
    assert meta["is_ai"] is True
    assert meta["is_fallback"] is False
    assert meta["model_name"] == "gemini-2.5-flash"
    assert "Gemini 2.5 Flash" in meta["engine_display"]
    assert "primary" in meta["attribution_text"].lower()


def test_format_model_provenance_fallback_ai_model(monkeypatch):
    """Verify cascading fallback AI model identifies fallback status and model name."""
    monkeypatch.delenv("GEMINI_MODEL_DRAFT", raising=False)
    meta = format_model_provenance("gemini (gemini-2.0-flash)", task="extraction")
    assert meta["is_ai"] is True
    assert meta["is_fallback"] is True
    assert meta["model_name"] == "gemini-2.0-flash"
    assert "AI Fallback" in meta["engine_display"]
    assert "Tier 2" in meta["engine_display"]
    assert "gemini-2.0-flash" in meta["attribution_text"]


def test_format_model_provenance_deterministic_rule_engine_fallback():
    """Verify deterministic clinical rule engine indicates fallback and zero hallucination."""
    meta = format_model_provenance("deterministic-clinical-rules (high-precision fallback)")
    assert meta["is_ai"] is False
    assert meta["is_fallback"] is True
    assert meta["model_name"] is None
    assert "Deterministic Clinical Rule Engine" in meta["engine_display"]
    assert "zero AI hallucination" in meta["attribution_text"]


def test_format_model_provenance_on_device_whisper():
    """Verify on-device whisper STT model attribution."""
    meta = format_model_provenance("faster-whisper-on-device (zero egress)")
    assert meta["is_ai"] is True
    assert meta["model_name"] == "whisper-base-int8"
    assert "On-Device Whisper" in meta["engine_display"]
    assert "zero audio egress" in meta["attribution_text"]

