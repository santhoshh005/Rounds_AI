# -*- coding: utf-8 -*-
"""Test suite for AI-powered clinical analytics and high-precision fallback engine."""
from backend.services.gemini_analytics import (
    generate_ai_analytics_insight,
    generate_deterministic_analytics_insight,
)


def test_deterministic_fallback_grade4_david_miller():
    rounds = [
        {"date": "2026-10-24", "anc": 420, "platelets": 88000, "ctcae_grade": 4, "notes": "Fever 38.4C, severe fatigue"},
        {"date": "2026-10-18", "anc": 1100, "platelets": 150000, "ctcae_grade": 2, "notes": "C3D1 cycle continuation"},
    ]
    res = generate_deterministic_analytics_insight(
        patient_id="104",
        patient_name="David Miller",
        regimen="mFOLFOX6",
        cycle="Cycle 3",
        diagnosis="Colorectal Cancer Stage III",
        baseline_anc=1400.0,
        rounds=rounds,
    )

    assert res.patient_id == "104"
    assert res.risk_level == "Critical"
    assert res.engine == "deterministic-clinical-rules (high-precision fallback)"
    assert "420" in res.executive_summary or "420" in res.nadir_and_kinetics
    assert "Grade 4" in res.toxicity_stratification
    assert "20% dose reduction" in res.dose_and_cycle_guidance or "Oxaliplatin" in res.dose_and_cycle_guidance
    assert len(res.surveillance_milestones) >= 3


def test_deterministic_fallback_grade0_stable_elena():
    rounds = [
        {"date": "2026-10-27", "anc": 1620, "platelets": 215000, "ctcae_grade": 0, "notes": "Afebrile, clinically robust"},
    ]
    res = generate_deterministic_analytics_insight(
        patient_id="106",
        patient_name="Elena Rostova",
        regimen="AC-T",
        cycle="Cycle 4",
        diagnosis="Invasive Ductal Carcinoma",
        baseline_anc=1650.0,
        rounds=rounds,
    )

    assert res.patient_id == "106"
    assert res.risk_level in ("Low", "Moderate")
    assert "100%" in res.dose_and_cycle_guidance
    assert "Grade 0" in res.toxicity_stratification or "Stable" in res.toxicity_stratification


def test_ai_analytics_insight_uses_fallback_when_no_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    res = generate_ai_analytics_insight(
        patient_id="105",
        patient_name="Sarah Jenkins",
        regimen="R-CHOP",
        cycle="Cycle 2",
        diagnosis="DLBCL Stage II",
        baseline_anc=2200.0,
        rounds=[{"date": "2026-10-25", "anc": 750, "platelets": 110000, "ctcae_grade": 3}],
    )
    assert res.risk_level == "High"
    assert "deterministic" in res.engine.lower()
    assert len(res.surveillance_milestones) >= 3
