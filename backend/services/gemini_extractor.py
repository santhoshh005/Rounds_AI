"""Gemini-backed clinical extraction using structured output.

Activated when LLM_PROVIDER=gemini and GEMINI_API_KEY is set.
Falls back to the local regex extractor on any failure.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from pydantic import BaseModel, Field

from backend.models.round import ClinicalExtraction, LabValue, Sex
from backend.services.local_extractor import extract_clinical_facts as local_extract

logger = logging.getLogger(__name__)


class GeminiLabValue(BaseModel):
    name: str = Field(description="Lab test name, e.g. WBC, ANC, Hgb, Platelets")
    value: float = Field(description="Numeric lab value")
    unit: Optional[str] = Field(default=None, description="Unit of measurement")


class GeminiClinicalExtraction(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient identifier from the transcript")
    age: Optional[int] = Field(default=None, description="Patient age in years (0-130)")
    sex: str = Field(default="unknown", description="Patient sex: male, female, or unknown")
    diagnosis: Optional[str] = Field(default=None, description="Primary diagnosis mentioned")
    treatment_cycle: Optional[int] = Field(default=None, description="Chemotherapy cycle number")
    symptoms: list[str] = Field(default_factory=list, description="Active symptoms currently reported")
    negated_symptoms: list[str] = Field(default_factory=list, description="Symptoms explicitly denied, resolved, or absent")
    labs: list[GeminiLabValue] = Field(default_factory=list, description="Lab values explicitly mentioned")


SYSTEM_INSTRUCTION = """You are a clinical data extraction assistant for a demonstration prototype.
Extract structured clinical facts that are EXPLICITLY stated in the provided round transcript.
CRITICAL SAFETY BOUNDARIES:
- Do NOT infer, diagnose, or add information not present in the text.
- If a field cannot be determined from the text, leave it as null or empty.
- Distinguish active symptoms from negated symptoms (e.g. 'no fever', 'afebrile', 'fever resolved' belong in negated_symptoms).
- Extract exact numbers for lab values without rounding or altering.
This is a demo tool — not for autonomous clinical use."""


def _is_transient_503(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(tok in msg for tok in ("503", "unavailable", "deadline_exceeded", "504", "server disconnected", "high demand"))


def extract_clinical_facts_gemini(text: str) -> ClinicalExtraction:
    """Use Gemini to extract clinical facts with structured output.

    Retries with backoff on transient 503 spikes and falls back to local regex extractor on failure.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        logger.info("GEMINI_API_KEY not set, falling back to local extractor")
        return local_extract(text)

    import time
    model_name = os.getenv("GEMINI_MODEL_DRAFT", "gemini-3.5-flash")
    fallback_model = os.getenv("GEMINI_MODEL_POLISH", "gemini-3.5-flash-lite")
    candidate_models: list[str] = []
    for m in (model_name, "gemini-3.6-flash", fallback_model):
        if m and m not in candidate_models:
            candidate_models.append(m)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=15000))
        gemini_result: GeminiClinicalExtraction | None = None
        used_model = model_name
        last_exc: Exception | None = None

        for candidate in candidate_models:
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=candidate,
                        contents=text,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=GeminiClinicalExtraction,
                            temperature=0.0,
                            system_instruction=SYSTEM_INSTRUCTION,
                        ),
                    )
                    gemini_result = response.parsed
                    used_model = candidate
                    break
                except Exception as call_exc:
                    last_exc = call_exc
                    if _is_transient_503(call_exc) and attempt == 0:
                        time.sleep(1.0)
                        continue
                    break
            if gemini_result is not None:
                break

        if gemini_result is None:
            raise last_exc or RuntimeError("Gemini extraction returned empty parsed result")

        sex_map = {"male": Sex.male, "female": Sex.female}
        return ClinicalExtraction(
            patient_id=gemini_result.patient_id,
            age=gemini_result.age,
            sex=sex_map.get(gemini_result.sex, Sex.unknown),
            diagnosis=gemini_result.diagnosis,
            treatment_cycle=gemini_result.treatment_cycle,
            symptoms=gemini_result.symptoms,
            negated_symptoms=gemini_result.negated_symptoms,
            labs=[
                LabValue(name=lab.name, value=lab.value, unit=lab.unit, source="Transcript", confidence="High")
                for lab in gemini_result.labs
            ],
            source=f"gemini ({used_model})",
        )

    except Exception as exc:  # noqa: BLE001
        err_msg = str(exc)
        if "404" in err_msg or "not found" in err_msg.lower():
            logger.error("Gemini model '%s' not found (404). Please update GEMINI_MODEL_DRAFT in .env: %s", model_name, exc)
        else:
            logger.warning("Gemini extraction failed, falling back to local: %s", exc)
        return local_extract(text)
