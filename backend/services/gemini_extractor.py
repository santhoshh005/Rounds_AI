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

# ── Pydantic schema for Gemini structured output ───────────────────────
# We define a clean schema without validators so Gemini can produce it.

class GeminiLabValue(BaseModel):
    name: str = Field(description="Lab test name, e.g. WBC, ANC, Hgb")
    value: float = Field(description="Numeric lab value")
    unit: Optional[str] = Field(default=None, description="Unit of measurement")

class GeminiClinicalExtraction(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient identifier from the transcript")
    age: Optional[int] = Field(default=None, description="Patient age in years (0-130)")
    sex: str = Field(default="unknown", description="Patient sex: male, female, or unknown")
    diagnosis: Optional[str] = Field(default=None, description="Primary diagnosis mentioned")
    treatment_cycle: Optional[int] = Field(default=None, description="Chemotherapy cycle number")
    symptoms: list[str] = Field(default_factory=list, description="List of symptoms reported")
    labs: list[GeminiLabValue] = Field(default_factory=list, description="Lab values mentioned")


SYSTEM_INSTRUCTION = """You are a clinical data extraction assistant for a demonstration prototype.
Extract structured clinical facts that are EXPLICITLY stated in the provided round transcript.
Do NOT infer, diagnose, or add information not present in the text.
If a field cannot be determined from the text, leave it as null or empty.
This is a demo tool — not for real clinical use."""


def extract_clinical_facts_gemini(text: str) -> ClinicalExtraction:
    """Use Gemini to extract clinical facts with structured output.

    Falls back to local regex extractor on any failure.
    """
    try:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            logger.info("GEMINI_API_KEY not set, falling back to local extractor")
            return local_extract(text)

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=text,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiClinicalExtraction,
                temperature=0.1,
                system_instruction=SYSTEM_INSTRUCTION,
            ),
        )

        gemini_result: GeminiClinicalExtraction = response.parsed

        # Convert to our internal ClinicalExtraction model
        sex_map = {"male": Sex.male, "female": Sex.female}
        return ClinicalExtraction(
            patient_id=gemini_result.patient_id,
            age=gemini_result.age,
            sex=sex_map.get(gemini_result.sex, Sex.unknown),
            diagnosis=gemini_result.diagnosis,
            treatment_cycle=gemini_result.treatment_cycle,
            symptoms=gemini_result.symptoms,
            labs=[
                LabValue(name=lab.name, value=lab.value, unit=lab.unit)
                for lab in gemini_result.labs
            ],
            source="gemini",
        )

    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini extraction failed, falling back to local: %s", exc)
        return local_extract(text)
