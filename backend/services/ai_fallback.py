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
import re
import threading
import time
from typing import Sequence

logger = logging.getLogger(__name__)

# Rolling aliases that Google keeps pointed at current models; tried last because
# they can resolve to slow preview models.
CURRENT_MODEL_ALIASES = ["gemini-flash-latest", "gemini-flash-lite-latest"]

# Pinned tiers, checked against the API in Nov 2026: 2.x and 1.5 models now return
# 404, and on a free-tier key gemini-3.5-flash allows 20 requests per day, so the
# fast gemini-3.1-flash-lite is the main backup.
_FLASH_FIRST = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]
_LITE_FIRST = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash"]
DEFAULT_MODELS = {
    "vision": _FLASH_FIRST,
    "extraction": _FLASH_FIRST,
    "polish": _LITE_FIRST,
    "analytics": _FLASH_FIRST,
    "audio": _FLASH_FIRST,
}


# ── Model cooldown circuit-breaker ──────────────────────────────────────
# A model that is out of quota or retired keeps failing; skipping it for a while saves
# the API key's quota and seconds of latency on every request.
QUOTA_COOLDOWN_S = 600
# A daily quota (429 with retryDelay of hours) is honoured up to this cap.
MAX_QUOTA_COOLDOWN_S = 6 * 3600
NOT_FOUND_COOLDOWN_S = 3600
# Short: on a free-tier key one slow answer is usually congestion, and the backup
# model may be the only fast one.
TIMEOUT_COOLDOWN_S = 60

# Wall-clock budget for one AI stage (all models tried for it). When it runs out the
# caller falls back to deterministic rules instead of trying more models.
AI_STAGE_BUDGET_S = float(os.getenv("AI_STAGE_BUDGET_S", "12"))
# Per-request HTTP timeout for a single Gemini call, in milliseconds. The Gemini API
# rejects deadlines under 10 s with 400 INVALID_ARGUMENT, so lower values are raised.
GEMINI_MIN_TIMEOUT_MS = 10000


def gemini_call_timeout_ms(raw: str | None) -> int:
    try:
        value = int(raw) if raw else GEMINI_MIN_TIMEOUT_MS
    except ValueError:
        value = GEMINI_MIN_TIMEOUT_MS
    return max(GEMINI_MIN_TIMEOUT_MS, value)


GEMINI_CALL_TIMEOUT_MS = gemini_call_timeout_ms(os.getenv("GEMINI_CALL_TIMEOUT_MS"))


def fast_thinking_config(model: str):
    """Keeps model "thinking" short so a call fits the 10 s timeout.

    Thinking tokens also count against max_output_tokens on 2.5 models, so default
    thinking can leave an extraction cut off or empty. Gemini 3 takes a thinking
    level, 2.5 a token budget (Pro cannot go below 128). Older models and rolling
    aliases (whose family can change) keep their defaults.
    """
    m = model.lower()
    try:
        from google.genai import types

        if m.startswith("gemini-3"):
            return types.ThinkingConfig(thinking_level="low")
        if m.startswith("gemini-2.5"):
            return types.ThinkingConfig(thinking_budget=128 if "pro" in m else 0)
    except Exception:
        # Older SDKs without these fields: send the request with default thinking.
        return None
    return None


_UNAVAILABLE_UNTIL: dict[str, float] = {}
_UNAVAILABLE_LOCK = threading.Lock()


def is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(tok in msg for tok in ("429", "resource_exhausted", "quota", "rate limit"))


def is_not_found_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "404" in msg or "not_found" in msg or "no longer available" in msg


def is_timeout_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(tok in msg for tok in ("timed out", "timeout", "deadline_exceeded", "deadline exceeded"))


def should_retry_same_model(exc: Exception) -> bool:
    """Only short-lived overloads are worth an immediate retry; quota errors and
    timeouts are not (a timed-out call already consumed the stage budget)."""
    return is_transient_error(exc) and not is_quota_error(exc) and not is_timeout_error(exc)


def stage_budget_exhausted(started_at: float) -> bool:
    """True when another Gemini call could not finish inside the stage budget.

    Checked before each model is tried (time.monotonic() start). The first call always
    runs; after that a new call starts only if a full per-call timeout still fits, so
    one slow model costs ~10 s instead of two back-to-back timeouts.
    """
    elapsed = time.monotonic() - started_at
    if elapsed < 0.05:
        return False
    return elapsed + GEMINI_CALL_TIMEOUT_MS / 1000 > AI_STAGE_BUDGET_S


def quota_retry_delay_s(exc: Exception) -> float | None:
    """Seconds until a quota resets, from the 429 body's retryDelay (e.g. '55953s')."""
    match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", str(exc))
    return float(match.group(1)) if match else None


def note_model_failure(model: str, exc: Exception) -> None:
    quota_delay = quota_retry_delay_s(exc) if is_quota_error(exc) else None
    cooldown = (
        min(MAX_QUOTA_COOLDOWN_S, max(QUOTA_COOLDOWN_S, quota_delay or 0)) if is_quota_error(exc)
        else NOT_FOUND_COOLDOWN_S if is_not_found_error(exc)
        else TIMEOUT_COOLDOWN_S if is_timeout_error(exc)
        else 0
    )
    if cooldown:
        with _UNAVAILABLE_LOCK:
            _UNAVAILABLE_UNTIL[model] = time.monotonic() + cooldown
        logger.info("Skipping model %s for %ss after: %s", model, cooldown, str(exc)[:120])


def reset_model_cooldowns() -> None:
    with _UNAVAILABLE_LOCK:
        _UNAVAILABLE_UNTIL.clear()


def _is_cooling(model: str) -> bool:
    with _UNAVAILABLE_LOCK:
        until = _UNAVAILABLE_UNTIL.get(model)
        if until is None:
            return False
        if until <= time.monotonic():
            del _UNAVAILABLE_UNTIL[model]
            return False
        return True


def _configured_models(task: str) -> list[str]:
    """Every model configured for a task in order (env overrides, pinned tiers, aliases)."""
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
    for candidate in [user_primary, user_secondary, *base_list, *CURRENT_MODEL_ALIASES]:
        if candidate and candidate not in candidates:
            candidates.append(candidate)
    return candidates


def get_candidate_models(task: str = "extraction") -> list[str]:
    """Retrieve an ordered list of 4+ fallback models for an AI task.

    Respects environment variable overrides first, followed by tiered backups.
    Models on cooldown are left out.
    """
    candidates = _configured_models(task)
    available = [c for c in candidates if not _is_cooling(c)]
    # When every model is cooling down, still offer the primary so callers fail fast
    # into their deterministic fallback instead of erroring on an empty list.
    return available or candidates[:1]


def gemini_engine_label(task: str, model: str) -> str:
    """Engine string for a Gemini answer; marks it when a backup model answered."""
    primary = _configured_models(task)[0]
    return f"gemini ({model})" if model == primary else f"gemini ({model}, fallback)"


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
    - model_name: str | None (Exact model name if AI, e.g. 'gemini-3.5-flash', 'gemini-3.1-flash-lite')
    - fallback_tier: int (0 = primary, 1 = tier 2, 2 = tier 3, ..., -1 = deterministic rule fallback)
    - engine_display: str (Clear user-facing badge label)
    - attribution_text: str (Detailed human-readable explanation of what gave the response)
    """
    engine_clean = (engine_str or "").strip()
    engine_lower = engine_clean.lower()
    candidate_models = _configured_models(task)
    primary_model = candidate_models[0] if candidate_models else "gemini-3.5-flash"

    # 1. Check for Gemini models
    if "gemini" in engine_lower:
        # Longest match wins: "gemini-3.5-flash" is a prefix of "gemini-3.5-flash-lite".
        known = [primary_model, *candidate_models, *CURRENT_MODEL_ALIASES]
        known += re.findall(r"gemini-[a-z0-9.\-]+", engine_lower)
        matches = [c for c in known if c in engine_lower]
        matched_model = max(matches, key=len) if matches else primary_model

        is_fallback = (matched_model != primary_model)
        tier_index = candidate_models.index(matched_model) if matched_model in candidate_models else 0
        tier_label = f"Tier {tier_index + 1} Cascade" if is_fallback else "Primary Model"

        pretty_name = (
            matched_model.replace("gemini-", "Gemini ")
            .replace("-flash", " Flash")
            .replace("-pro", " Pro")
            .replace("-lite", " Lite")
            .replace("-latest", " Latest")
            .replace("-preview", " Preview")
        )
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

