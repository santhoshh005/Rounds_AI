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
from backend.services.ai_fallback import (
    get_candidate_models,
    is_transient_error,
    note_model_failure,
    should_retry_same_model,
)

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


SYSTEM_INSTRUCTION = """You extract structured facts from an oncology ward-round dictation.
Output only facts EXPLICITLY stated in the transcript; never infer, diagnose or add values.

Rules:
- Labs: one entry per lab actually dictated. Use canonical names: ANC, WBC, PLATELETS, HEMOGLOBIN, CREATININE.
  Copy the number exactly as spoken (convert number words to digits, e.g. "four twenty" -> 420) and keep the
  dictated unit; if counts are stated in thousands ("1.8 K", "88k", "x10^3") put that in unit, do not rescale.
  Ignore reference ranges, percentages of differential counts, and values described as previous/baseline.
- Symptoms: lower-case symptom names. A symptom is negated when denied or absent in its own clause
  ("denies chest pain", "no nausea, vomiting or diarrhea", "afebrile", "fever resolved") -> negated_symptoms.
  "a febrile episode" / "was febrile" means fever is ACTIVE.
- treatment_cycle: the integer cycle number only; patient_id only when an ID/MRN is spoken.
- Leave any field null/empty when the transcript does not state it.
This is assistive documentation; a clinician verifies every value."""


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
    candidate_models = get_candidate_models("extraction")
    model_name = candidate_models[0]

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
                    note_model_failure(candidate, call_exc)
                    last_exc = call_exc
                    if should_retry_same_model(call_exc) and attempt == 0:
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
