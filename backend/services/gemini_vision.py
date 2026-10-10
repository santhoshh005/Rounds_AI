"""Modular Gemini Vision Service.

Extracts raw clinical observations from attached lab scans, pathology reports,
and document photos without making autonomous diagnostic inferences.
Enforces clinical assistance boundaries and tracks source provenance.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Optional
from pydantic import BaseModel, Field

from backend.models.round import ImageAttachment, LabValue

logger = logging.getLogger(__name__)


class RawVisionLab(BaseModel):
    name: str = Field(description="Visible lab test name, e.g. WBC, ANC, Platelets, Hemoglobin")
    value: float = Field(description="Extracted numeric value")
    unit: Optional[str] = Field(default=None, description="Extracted unit, e.g. /uL, cells/uL, g/dL")
    confidence: str = Field(default="High", description="High, Medium, or Uncertain")


class VisionObservation(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient ID visibly printed on document")
    document_type: str = Field(default="Laboratory Report", description="Type of document, e.g. Complete Blood Count, Pathology, Chemistry")
    date_recorded: Optional[str] = Field(default=None, description="Date visible on the document")
    labs: list[RawVisionLab] = Field(default_factory=list, description="Visible lab results")
    notes: Optional[str] = Field(default=None, description="Observations or flags explicitly stated on the document")
    source_file: str = Field(default="attachment", description="Filename of the image source")
    engine: str = Field(default="local-vision-fallback", description="Model or engine that produced this observation")


SYSTEM_VISION_PROMPT = """You are a specialized clinical document extraction assistant.
Your task is to extract EXPLICITLY VISIBLE clinical information from the supplied medical document or laboratory report image.
CRITICAL SAFETY BOUNDARIES:
- Do NOT infer diagnoses or treatment decisions.
- Extract ONLY what is legibly printed or handwritten on the document.
- Mark uncertain, blurry, or ambiguous values with confidence='Uncertain'.
- Extract lab names (e.g. WBC, ANC, Absolute Neutrophil Count, Hemoglobin, Platelets), their exact numerical values, and units.
- Extract any visible Patient ID or MRN.
This is an assistive tool for clinical review, not an autonomous diagnostic system."""


def _is_transient_503(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(tok in msg for tok in ("503", "unavailable", "deadline_exceeded", "504", "server disconnected", "high demand"))


def analyze_clinical_images(images: list[ImageAttachment]) -> list[VisionObservation]:
    """Process medical images using Gemini Vision with retry/backoff on transient 503 errors.

    Falls back to transparent local document parser if GEMINI_API_KEY is not set or Gemini is unavailable.
    """
    if not images:
        return []

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        logger.info("GEMINI_API_KEY not set; using transparent local vision baseline.")
        return _local_vision_fallback(images)

    import time
    model_name = os.getenv("GEMINI_MODEL_VISION", "gemini-3.5-flash")
    fallback_model = os.getenv("GEMINI_MODEL_POLISH", "gemini-3.5-flash-lite")
    candidate_models: list[str] = []
    for m in (model_name, "gemini-3.6-flash", fallback_model):
        if m and m not in candidate_models:
            candidate_models.append(m)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=15000))
        observations: list[VisionObservation] = []

        for img in images:
            raw_bytes = base64.b64decode(img.data)
            image_part = types.Part.from_bytes(
                data=raw_bytes,
                mime_type=img.mime_type,
            )

            prompt = f"Extract all visible clinical facts, lab values, and patient identifiers from this document: {img.name}"

            last_exc: Exception | None = None
            obs: VisionObservation | None = None
            used_model = model_name

            for candidate in candidate_models:
                for attempt in range(2):
                    try:
                        response = client.models.generate_content(
                            model=candidate,
                            contents=[image_part, prompt],
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                response_schema=VisionObservation,
                                temperature=0.0,
                                system_instruction=SYSTEM_VISION_PROMPT,
                            ),
                        )
                        obs = response.parsed
                        used_model = candidate
                        break
                    except Exception as call_exc:
                        last_exc = call_exc
                        if _is_transient_503(call_exc) and attempt == 0:
                            time.sleep(1.0)
                            continue
                        break
                if obs is not None:
                    break

            if obs is None:
                raise last_exc or RuntimeError("Gemini Vision returned empty observation")

            obs.source_file = img.name
            obs.engine = f"gemini ({used_model})"
            observations.append(obs)

        return observations

    except Exception as exc:
        err_msg = str(exc)
        if "404" in err_msg or "not found" in err_msg.lower():
            logger.error("Gemini Vision model '%s' not found (404). Please update GEMINI_MODEL_VISION in .env: %s", model_name, exc)
        else:
            logger.warning("Gemini Vision processing failed, falling back to local: %s", exc)
        return _local_vision_fallback(images)


def _local_vision_fallback(images: list[ImageAttachment]) -> list[VisionObservation]:
    """Local fallback when Gemini Vision is unavailable or GEMINI_API_KEY is not set.

    By default (DEMO_MODE=false), returns zero labs with a clear 'Image not analyzed'
    message so unverified values are never fabricated or labeled High confidence.
    Sample values are only returned if DEMO_MODE=true is explicitly set, and every
    value is explicitly labeled 'demo data - not read from image'.
    """
    demo_mode = os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes")
    observations: list[VisionObservation] = []

    for img in images:
        if demo_mode:
            name_lower = img.name.lower()
            labs: list[RawVisionLab] = []
            patient_id = None

            if "lab" in name_lower or "cbc" in name_lower or "report" in name_lower:
                demo_label = "demo data - not read from image"
                labs.append(RawVisionLab(name="WBC", value=2100.0, unit="cells/µL", confidence=demo_label))
                labs.append(RawVisionLab(name="ANC", value=900.0, unit="cells/µL", confidence=demo_label))
                labs.append(RawVisionLab(name="Platelets", value=145000.0, unit="/µL", confidence=demo_label))
                labs.append(RawVisionLab(name="Hemoglobin", value=10.8, unit="g/dL", confidence=demo_label))
                patient_id = "104"

            observations.append(
                VisionObservation(
                    patient_id=patient_id,
                    document_type="Demo Laboratory Report (not read from image)" if labs else "Unanalyzed Image",
                    date_recorded=None,
                    labs=labs,
                    notes=(
                        "demo data - not read from image"
                        if labs
                        else "Image not analyzed (vision model unavailable). Enter lab values manually."
                    ),
                    source_file=img.name,
                    engine="local-vision-fallback (demo)",
                )
            )
        else:
            observations.append(
                VisionObservation(
                    patient_id=None,
                    document_type="Unanalyzed Image",
                    date_recorded=None,
                    labs=[],
                    notes="Image not analyzed (vision model unavailable). Enter lab values manually.",
                    source_file=img.name,
                    engine="local-vision-fallback",
                )
            )
    return observations

