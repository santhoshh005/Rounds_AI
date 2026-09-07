from enum import Enum
from pydantic import BaseModel, Field

class Sex(str, Enum):
    male = "male"
    female = "female"
    unknown = "unknown"

class LabValue(BaseModel):
    name: str
    value: float
    unit: str | None = None

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

class ExtractRoundRequest(BaseModel):
    transcript: str = Field(min_length=10, max_length=10_000)

class ExtractRoundResponse(BaseModel):
    extraction: ClinicalExtraction
    review_flags: list[ReviewFlag]
    draft_note: str
    disclaimer: str
    round_id: str | None = None
