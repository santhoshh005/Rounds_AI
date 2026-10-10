# -*- coding: utf-8 -*-
"""High-Accuracy Oncology Speech-to-Text & Audio Transcription Service.

Multi-engine architecture supporting strict privacy modes:
- "local": 100% on-device faster-whisper (CTranslate2 int8 on CPU), ZERO audio egress (Default)
- "cloud": Gemini Multimodal Audio (requires GEMINI_API_KEY)
- "hybrid": Gemini Multimodal Audio with automatic local faster-whisper fallback
"""
from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

from backend.services.clinical_autocorrect import correct_clinical_transcript

logger = logging.getLogger(__name__)

# Cached faster-whisper model instance to avoid reloading overhead
_FASTER_WHISPER_MODEL = None


def get_transcription_mode() -> str:
    """Return active STT privacy mode: 'local' (default), 'cloud', or 'hybrid'."""
    mode = os.getenv("TRANSCRIPTION_MODE", "local").strip().lower()
    if mode not in ("local", "cloud", "hybrid"):
        return "local"
    return mode


def _get_mime_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".webm": "audio/webm",
        ".wav": "audio/wav",
        ".mp3": "audio/mp3",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
    }
    return mapping.get(ext, "audio/webm")


def _transcribe_with_gemini(audio_bytes: bytes, mime_type: str) -> Optional[str]:
    """Transcribe clinician dictation using Gemini Multimodal Audio."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None

    model_name = os.getenv("GEMINI_MODEL_DRAFT", "gemini-3.5-flash")

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

        prompt = (
            "You are an expert oncology medical transcriptionist. "
            "Listen to this audio recording of a clinician during oncology inpatient ward rounds. "
            "Transcribe the spoken observations verbatim with 100% accurate oncology terminology: "
            "exact chemotherapy regimens (e.g. mFOLFOX6, R-CHOP, AC-T), laboratory names and counts "
            "(ANC, WBC, Platelets, Hemoglobin), vital signs (temperature in °C), and symptoms. "
            "Return ONLY the clean, verbatim clinical transcript without conversational commentary."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=[audio_part, prompt],
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=800,
            ),
        )

        if response.text and response.text.strip():
            logger.info("Transcribed audio using Gemini Multimodal Audio (%s).", model_name)
            return response.text.strip()
    except Exception as exc:
        err_msg = str(exc)
        if "404" in err_msg or "not found" in err_msg.lower():
            logger.error("Gemini model '%s' not found (404). Update GEMINI_MODEL_DRAFT in .env: %s", model_name, exc)
        else:
            logger.warning("Gemini audio transcription failed, falling back to local Whisper: %s", exc)

    return None


def _transcribe_with_faster_whisper(audio_bytes: bytes, filename: str) -> Optional[str]:
    """Transcribe audio using self-hosted local faster-whisper (CTranslate2)."""
    global _FASTER_WHISPER_MODEL

    suffix = os.path.splitext(filename)[1] or ".webm"
    tmp_path = None

    try:
        from faster_whisper import WhisperModel

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        if _FASTER_WHISPER_MODEL is None:
            # Use 'base' for high phonetic accuracy with int8 quantization on CPU
            model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
            logger.info("Loading faster-whisper model (%s) on CPU with int8 quantization...", model_size)
            try:
                _FASTER_WHISPER_MODEL = WhisperModel(model_size, device="cpu", compute_type="int8")
            except Exception as e:
                logger.warning("Could not load %s model, falling back to tiny: %s", model_size, e)
                _FASTER_WHISPER_MODEL = WhisperModel("tiny", device="cpu", compute_type="int8")

        clinical_initial_prompt = (
            "Oncology inpatient ward rounds. Chemotherapy regimens: mFOLFOX6, R-CHOP, AC-T, FOLFIRINOX, CAPOX. "
            "Antineoplastics: Oxaliplatin, Capecitabine, Pembrolizumab, Filgrastim, Ondansetron, Cefepime. "
            "Blood counts: ANC, WBC, Platelets, Hemoglobin, Absolute Neutrophil Count, creatinine. "
            "Vitals and toxicities: temperature °C, febrile neutropenia, mucositis, cold dysesthesia, CTCAE."
        )

        segments, info = _FASTER_WHISPER_MODEL.transcribe(
            tmp_path,
            beam_size=5,
            vad_filter=True,
            initial_prompt=clinical_initial_prompt,
        )

        transcription = " ".join([seg.text.strip() for seg in segments]).strip()
        if transcription:
            logger.info("Transcribed audio using faster-whisper (detected language: %s)", info.language)
            return transcription

    except Exception as exc:
        logger.info("faster-whisper inference deferred (%s); proceeding to fallback.", exc)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    return None


def transcribe_audio_with_details(audio_bytes: bytes, filename: str = "recording.webm") -> dict[str, str]:
    """Transcribe audio respecting TRANSCRIPTION_MODE (local | cloud | hybrid).

    Returns:
        dict with keys: transcript, engine, mode
    """
    mode = get_transcription_mode()
    if not audio_bytes:
        return {"transcript": "", "engine": "empty-audio", "mode": mode}

    mime_type = _get_mime_type(filename)
    raw_transcript: Optional[str] = None
    engine_name = "faster-whisper-on-device"

    if mode == "local":
        # Strict on-device mode: designed for zero audio egress in local mode (zero audio bytes sent to any cloud API)
        raw_transcript = _transcribe_with_faster_whisper(audio_bytes, filename)
        engine_name = "faster-whisper-on-device (zero egress)"
    elif mode == "cloud":
        raw_transcript = _transcribe_with_gemini(audio_bytes, mime_type)
        engine_name = f"gemini-audio ({os.getenv('GEMINI_MODEL_DRAFT', 'gemini-3.5-flash')})"
    else:  # hybrid
        raw_transcript = _transcribe_with_gemini(audio_bytes, mime_type)
        if raw_transcript:
            engine_name = f"gemini-audio ({os.getenv('GEMINI_MODEL_DRAFT', 'gemini-3.5-flash')})"
        else:
            raw_transcript = _transcribe_with_faster_whisper(audio_bytes, filename)
            engine_name = "faster-whisper-on-device (hybrid fallback)"

    if not raw_transcript:
        demo_mode = os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")
        if demo_mode:
            raw_transcript = (
                "[DEMO DATA - NOT TRANSCRIBED FROM AUDIO] "
                "Patient 104 is a 58-year-old male with colorectal cancer. "
                "He is currently on cycle 3 chemotherapy. He has developed fever since yesterday. "
                "WBC is 2100 and ANC is 900. He reports increased fatigue."
            )
            engine_name = f"{engine_name} (demo data - not transcribed from audio)"
        else:
            return {
                "transcript": "",
                "engine": f"{engine_name} (untranscribed)",
                "mode": mode,
                "egress": "0 bytes (on-device only)" if mode == "local" else "cloud-egress",
                "message": "Audio not transcribed (speech model unavailable or audio silent). Enter dictation manually.",
            }

    # In strict local mode, disable Gemini for autocorrect as well to maintain zero text egress
    allow_gemini_autocorrect = (mode != "local")
    correction_result = correct_clinical_transcript(raw_transcript, use_gemini=allow_gemini_autocorrect)
    final_text = correction_result.get("corrected_text", raw_transcript)

    return {
        "transcript": final_text,
        "engine": engine_name,
        "mode": mode,
        "egress": "0 bytes (on-device only)" if mode == "local" else "cloud-egress",
    }



def transcribe_audio_on_device(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    """Convenience wrapper returning plain string transcript."""
    res = transcribe_audio_with_details(audio_bytes, filename)
    return res["transcript"]
