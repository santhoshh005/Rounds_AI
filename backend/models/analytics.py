# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field

from backend.models.patient import Patient


class LabDataPoint(BaseModel):
    label: str = Field(..., description="E.g. Baseline, C1D1, C2D1, C3D1 (Current)")
    date: str
    value: float
    unit: str
    ctcae_grade: int = Field(0, ge=0, le=4)
    status: str = Field("normal", description="normal | warning | critical")


class LabTrajectory(BaseModel):
    lab_name: str
    unit: str
    reference_range: str
    baseline_value: Optional[float] = None
    current_value: float
    percent_change: Optional[float] = None
    trend: str = Field("stable", description="up | down | stable | new")
    data_points: list[LabDataPoint] = Field(default_factory=list)


class CTCAEToxicity(BaseModel):
    category: str
    symptom: str
    grade: int = Field(..., ge=0, le=4)
    description: str
    management_recommendation: str
    trend: str = Field("stable", description="improving | stable | worsening")


class SafetyAlertSummary(BaseModel):
    id: str
    severity: str = Field("moderate", description="critical | high | moderate")
    title: str
    message: str
    rationale: str
    action_required: str
    timestamp: str
    status: str = Field("active", description="active | acknowledged | resolved")


class HistoricalRound(BaseModel):
    round_id: str
    date: str
    cycle: int
    clinician: str
    summary: str
    note_snippet: str
    status: str = Field("approved", description="approved | pending_review")


class GuidelineConcordance(BaseModel):
    title: str
    source: str
    evidence_level: str
    recommendation: str
    concordance: str = Field("Concordant", description="Concordant | Requires Action | Review Recommended")


class PatientAnalyticsResponse(BaseModel):
    patient: Patient
    ecog_performance_status: int = Field(1, ge=0, le=4)
    days_inpatient: int = 4
    trajectories: list[LabTrajectory] = Field(default_factory=list)
    toxicities: list[CTCAEToxicity] = Field(default_factory=list)
    safety_alerts: list[SafetyAlertSummary] = Field(default_factory=list)
    guidelines: list[GuidelineConcordance] = Field(default_factory=list)
    rounds_history: list[HistoricalRound] = Field(default_factory=list)
    clinical_synthesis: str
