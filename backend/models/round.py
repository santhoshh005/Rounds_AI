from __future__ import annotations

import base64
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class Sex(str, Enum):
    male = "male"
    female = "female"
    unknown = "unknown"

class LabValue(BaseModel):
    name: str
    value: float
    unit: str | None = None
    source: str | None = None  # e.g. "Lab_Report_01.jpg" or "transcript"
    confidence: str | None = None  # e.g. "High", "Medium"

class LabTrend(BaseModel):
    name: str
    value: float
    unit: str | None = None
    previous_value: float | None = None
    trend: str = "stable"  # "down" | "up" | "stable" | "new"
    source: str | None = None

class ClinicalEvidence(BaseModel):
    source: str
    title: str
    recommendation: str
    relevance: str

class ImageAttachment(BaseModel):
    data: str  # base64 encoded string
    mime_type: str = "image/png"
    name: str = "attachment.png"

    @field_validator("mime_type")
    @classmethod
    def validate_mime(cls, v: str) -> str:
        allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
        if v.lower() not in allowed:
            raise ValueError(f"Unsupported image MIME type: {v}. Allowed types: image/png, image/jpeg, image/webp.")
        return v.lower()

    @field_validator("data")
    @classmethod
    def validate_size(cls, v: str) -> str:
        # Check base64 payload size (max 10MB)
        # Base64 string length * 3/4 approximates byte size
        est_bytes = len(v) * 0.75
        if est_bytes > 10 * 1024 * 1024:
            raise ValueError("Image exceeds maximum allowed size of 10MB.")
        try:
            # Quick validation that it decodes cleanly
            base64.b64decode(v[:100], validate=False)
        except Exception:
            raise ValueError("Invalid base64 encoding for image data.")
        return v

class ClinicalExtraction(BaseModel):
    patient_id: str | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    sex: Sex = Sex.unknown
    diagnosis: str | None = None
    treatment_cycle: int | None = Field(default=None, ge=0)
    symptoms: list[str] = Field(default_factory=list)
    labs: list[LabValue] = Field(default_factory=list)
    source: str = "local-rules"

class ReviewFlag(BaseModel):
    severity: str
    message: str
    rationale: str
    guideline: str | None = None  # Reference guideline, e.g. "ASCO / IDSA Neutropenic Fever Guidelines"

class ExtractRoundRequest(BaseModel):
    transcript: str = Field(default="", max_length=10_000)
    images: list[ImageAttachment] = Field(default_factory=list)

class ExtractRoundResponse(BaseModel):
    extraction: ClinicalExtraction
    lab_trends: list[LabTrend] = Field(default_factory=list)
    review_flags: list[ReviewFlag] = Field(default_factory=list)
    retrieved_evidence: list[ClinicalEvidence] = Field(default_factory=list)
    draft_note: str
    disclaimer: str
    round_id: str | None = None
    provenance: dict[str, str] = Field(default_factory=dict)
