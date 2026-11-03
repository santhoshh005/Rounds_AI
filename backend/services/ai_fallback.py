# -*- coding: utf-8 -*-
"""Centralized AI Model Selection & 4-Tier Fallback Hierarchy.

Provides resilient multi-model selection and fallback cascades across all AI endpoints:
- Vision OCR Document Processing (Gemini Vision)
- Clinical Fact Extraction & SOAP Note Structuring
- Phonetic Grammar Polish & Normalization
- Longitudinal Oncology Trajectory Analytics

If any model encounters quota limits, rate limits, timeouts, 404, or transient 503 errors,
the system transparently cascades through 4 fallback models before falling back to
the deterministic zero-hallucination local rule engine.
"""
from __future__ import annotations

import logging
import os
from typing import Sequence

logger = logging.getLogger(__name__)

# Canonical 4-Tier Clinical AI Model Cascades
DEFAULT_MODELS = {
    "vision": [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.5-pro",
    ],
    "extraction": [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.5-pro",
    ],
    "polish": [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
    "analytics": [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-2.5-pro",
    ],
    "audio": [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
}


def get_candidate_models(task: str = "extraction") -> list[str]:
    """Retrieve an ordered list of 4+ fallback models for an AI task.

    Respects environment variable overrides first, followed by tiered backups.
    """
    env_keys = {
        "vision": ("GEMINI_MODEL_VISION", "GEMINI_MODEL_VISION_FALLBACK"),
        "extraction": ("GEMINI_MODEL_DRAFT", "GEMINI_MODEL_EXTRACT_FALLBACK"),
        "polish": ("GEMINI_MODEL_POLISH", "GEMINI_MODEL_DRAFT"),
        "analytics": ("GEMINI_MODEL_ANALYTICS", "GEMINI_MODEL_DRAFT"),
        "audio": ("GEMINI_MODEL_AUDIO", "GEMINI_MODEL_DRAFT"),
    }

    primary_env, secondary_env = env_keys.get(task, ("GEMINI_MODEL_DRAFT", "GEMINI_MODEL_EXTRACT_FALLBACK"))
    user_primary = os.getenv(primary_env, "").strip()
    user_secondary = os.getenv(secondary_env, "").strip()

    base_list = DEFAULT_MODELS.get(task, DEFAULT_MODELS["extraction"])

    candidates: list[str] = []
    for candidate in [user_primary, user_secondary, *base_list]:
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    return candidates


def is_transient_error(exc: Exception) -> bool:
    """Check if an exception is a transient HTTP/RPC error eligible for immediate retry."""
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "503",
            "unavailable",
            "deadline_exceeded",
            "504",
            "server disconnected",
            "high demand",
            "resource_exhausted",
            "rate limit",
            "429",
            "quota",
        )
    )


def format_model_provenance(
    engine_str: str,
    task: str = "general",
) -> dict[str, object]:
    """Analyze an engine or model identifier and return structured provenance metadata.

    Informs the caller and UI:
    - is_ai: bool (Whether an AI/ML generative model produced this response)
    - is_fallback: bool (Whether a fallback model or deterministic engine was used)
    - model_name: str | None (Exact model name if AI, e.g. 'gemini-2.5-flash', 'gemini-2.0-flash')
    - fallback_tier: int (0 = primary, 1 = tier 2, 2 = tier 3, ..., -1 = deterministic rule fallback)
    - engine_display: str (Clear user-facing badge label)
    - attribution_text: str (Detailed human-readable explanation of what gave the response)
    """
    engine_clean = (engine_str or "").strip()
    engine_lower = engine_clean.lower()
    candidate_models = get_candidate_models(task)
    primary_model = candidate_models[0] if candidate_models else "gemini-2.5-flash"

    # 1. Check for Gemini models
    if "gemini" in engine_lower:
        matched_model = None
        for candidate in [primary_model, *candidate_models, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-pro"]:
            if candidate in engine_lower:
                matched_model = candidate
                break
        if not matched_model:
            matched_model = primary_model

        is_fallback = (matched_model != primary_model)
        tier_index = candidate_models.index(matched_model) if matched_model in candidate_models else 0
        tier_label = f"Tier {tier_index + 1} Cascade" if is_fallback else "Primary Model"

        pretty_name = matched_model.replace("gemini-", "Gemini ").replace("-flash", " Flash").replace("-pro", " Pro")
        if is_fallback:
            display_label = f"AI Fallback: {pretty_name} ({tier_label})"
            attribution = f"Primary AI model unavailable; responded via fallback model {pretty_name} ({matched_model}) [{tier_label}]."
        else:
            display_label = f"AI Model: {pretty_name}"
            attribution = f"Generated by primary AI model {pretty_name} ({matched_model})."

        return {
            "is_ai": True,
            "is_fallback": is_fallback,
            "model_name": matched_model,
            "fallback_tier": tier_index if is_fallback else 0,
            "engine_raw": engine_clean,
            "engine_display": display_label,
            "attribution_text": attribution,
        }

    # 2. Check for Whisper / On-Device STT
    if "whisper" in engine_lower:
        is_fb = "fallback" in engine_lower
        return {
            "is_ai": True,
            "is_fallback": is_fb,
            "model_name": "whisper-base-int8",
            "fallback_tier": 1 if is_fb else 0,
            "engine_raw": engine_clean,
            "engine_display": "On-Device Whisper (Local CPU)" if not is_fb else "On-Device Whisper (Offline Fallback)",
            "attribution_text": "Transcribed on-device via faster-whisper (CTranslate2 int8 on CPU · zero audio egress).",
        }

    # 3. Check for Live ASR
    if "live-asr" in engine_lower or "browser" in engine_lower or "web speech" in engine_lower:
        return {
            "is_ai": False,
            "is_fallback": False,
            "model_name": None,
            "fallback_tier": 0,
            "engine_raw": engine_clean,
            "engine_display": "Browser Live Speech ASR",
            "attribution_text": "Transcribed live in browser via Web Speech Recognition API.",
        }

    # 4. Deterministic Clinical Rule Engine
    return {
        "is_ai": False,
        "is_fallback": True,
        "model_name": None,
        "fallback_tier": -1,
        "engine_raw": engine_clean,
        "engine_display": "Deterministic Clinical Rule Engine (Offline Fallback)",
        "attribution_text": "Cloud AI unavailable or offline; generated via 100% deterministic oncology rule engine (zero AI hallucination).",
    }

