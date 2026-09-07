# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class PatientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Patient full name or initials")
    age: int = Field(..., ge=0, le=125, description="Patient age")
    sex: str = Field(..., description="Biological sex (male, female, other)")
    diagnosis: str = Field(..., min_length=2, max_length=200, description="Oncology diagnosis")
    regimen: str = Field("Not stated", max_length=200, description="Chemotherapy regimen")
    cycle: int = Field(1, ge=1, le=50, description="Current chemotherapy cycle number")
    ward_bed: str = Field(..., min_length=2, max_length=50, description="Ward and bed location")
    baseline_anc: Optional[float] = Field(None, ge=0, description="Baseline ANC (cells/uL)")
    baseline_platelets: Optional[float] = Field(None, ge=0, description="Baseline Platelet count (/uL)")
    baseline_wbc: Optional[float] = Field(None, ge=0, description="Baseline WBC count (cells/uL)")


class PatientCreate(PatientBase):
    id: str = Field(..., min_length=1, max_length=50, description="Patient ID or MRN")


class PatientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    age: Optional[int] = Field(None, ge=0, le=125)
    sex: Optional[str] = None
    diagnosis: Optional[str] = Field(None, min_length=2, max_length=200)
    regimen: Optional[str] = Field(None, max_length=200)
    cycle: Optional[int] = Field(None, ge=1, le=50)
    ward_bed: Optional[str] = Field(None, min_length=2, max_length=50)
    baseline_anc: Optional[float] = Field(None, ge=0)
    baseline_platelets: Optional[float] = Field(None, ge=0)
    baseline_wbc: Optional[float] = Field(None, ge=0)
    status: Optional[str] = Field(None, description="Status (admitted | discharged)")


class Patient(PatientBase):
    id: str
    created_at: str
    status: str = "admitted"
