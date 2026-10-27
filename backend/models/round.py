from __future__ import annotations

import base64
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, field_validator


class Sex(str, Enum):
    male = "male"
    female = "female"
    unknown = "unknown"


class ConfirmItem(BaseModel):
    """An unverified, ambiguous, low-confidence, or conflicting clinical datum requiring clinician review."""
    id: str
    item_type: str  # "lab_validation" | "ocr_confidence" | "conflict"
    label: str
    value: Any
    unit: str | None = None
    reason: str
    source: str
    confirmed: bool = False
    dismissed: bool = False


class LabValue(BaseModel):
    name: str
    value: float
    unit: str | None = None
    source: str | None = None  # e.g. "Lab_Report_01.jpg" or "transcript"
    confidence: str | None = "High"  # e.g. "High", "Medium", "Uncertain"
    status: str = "verified"  # "verified" | "needs_confirmation" | "implausible"
    flag_reason: str | None = None


class LabTrend(BaseModel):
    name: str
    value: float
    unit: str | None = None
    previous_value: float | None = None
    trend: str = "stable"  # "down" | "up" | "stable" | "new" | "insufficient data"
    source: str | None = None
    nadir_value: float | None = None
    status: str = "verified"


class ClinicalEvidence(BaseModel):
    source: str
    title: str
    year: int
    description: str


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
        est_bytes = len(v) * 0.75
        if est_bytes > 10 * 1024 * 1024:
            raise ValueError("Image exceeds maximum allowed size of 10MB.")
        try:
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
    negated_symptoms: list[str] = Field(default_factory=list)
    labs: list[LabValue] = Field(default_factory=list)
    source: str = "local-rules"


class ReviewFlag(BaseModel):
    severity: str  # "critical" | "high" | "medium" | "low"
    message: str   # Formatted as "Criterion met, for clinician review: ..."
    rationale: str
    guideline: str | None = None
    rule_id: str | None = None
    source: str | None = None
    input_values: dict[str, Any] = Field(default_factory=dict)


class ExtractRoundRequest(BaseModel):
    transcript: str = Field(default="", max_length=10_000)
    images: list[ImageAttachment] = Field(default_factory=list)
    patient_id: str | None = None


class ExtractRoundResponse(BaseModel):
    extraction: ClinicalExtraction
    lab_trends: list[LabTrend] = Field(default_factory=list)
    review_flags: list[ReviewFlag] = Field(default_factory=list)
    retrieved_evidence: list[ClinicalEvidence] = Field(default_factory=list)
    draft_note: str
    disclaimer: str
    round_id: str | None = None
    provenance: dict[str, str] = Field(default_factory=dict)
    saved_to_db: bool = False
    confirm_before_signing: list[ConfirmItem] = Field(default_factory=list)
    ctcae_version: str = "CTCAE v5.0 (November 27, 2017)"
    transcription_mode: str = "local"
    demo_mode: bool = False
    stage_engines: dict[str, str] = Field(default_factory=dict)
    fallback_used: bool = False
    fallback_message: str | None = None

