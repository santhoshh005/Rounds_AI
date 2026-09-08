# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
from typing import Optional
from datetime import datetime, timezone

from backend.models.analytics import (
    CTCAEToxicity,
    GuidelineConcordance,
    HistoricalRound,
    LabDataPoint,
    LabTrajectory,
    PatientAnalyticsResponse,
    SafetyAlertSummary,
)
from backend.services.patient_service import get_patient

logger = logging.getLogger(__name__)


def _grade_anc(anc: float) -> tuple[int, str]:
    """CTCAE v5.0 grading for Absolute Neutrophil Count (cells/uL)."""
    if anc >= 1500:
        return 0, "normal"
    elif anc >= 1000:
        return 2, "normal"  # Mild / Grade 2
    elif anc >= 500:
        return 3, "warning"  # Moderate / Grade 3 (High risk)
    else:
        return 4, "critical"  # Severe / Grade 4 (< 500)


def _grade_platelets(plt: float) -> tuple[int, str]:
    """CTCAE v5.0 grading for Platelets (/uL)."""
    if plt >= 150000:
        return 0, "normal"
    elif plt >= 75000:
        return 1, "normal"
    elif plt >= 50000:
        return 2, "warning"
    elif plt >= 25000:
        return 3, "critical"
    else:
        return 4, "critical"


def _generate_demo_104_analytics(p_record) -> PatientAnalyticsResponse:
    """Detailed analytics data for Patient #104 (David Miller, Colorectal Ca, mFOLFOX6)."""
    anc_points = [
        LabDataPoint(label="Baseline", date="2026-08-01", value=1400.0, unit="cells/uL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-08", value=1350.0, unit="cells/uL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-08-22", value=1200.0, unit="cells/uL", ctcae_grade=2, status="normal"),
        LabDataPoint(label="Cycle 3 Nadir", date="2026-09-06", value=900.0, unit="cells/uL", ctcae_grade=3, status="warning"),
    ]
    anc_traj = LabTrajectory(
        lab_name="Absolute Neutrophil Count (ANC)",
        unit="cells/uL",
        reference_range="1,500 - 8,000 cells/uL",
        baseline_value=1400.0,
        current_value=900.0,
        percent_change=-35.7,
        trend="down",
        data_points=anc_points,
    )

    plt_points = [
        LabDataPoint(label="Baseline", date="2026-08-01", value=180000.0, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-08", value=175000.0, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-08-22", value=162000.0, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 3 Current", date="2026-09-06", value=145000.0, unit="/uL", ctcae_grade=1, status="normal"),
    ]
    plt_traj = LabTrajectory(
        lab_name="Platelet Count",
        unit="/uL",
        reference_range="150,000 - 450,000 /uL",
        baseline_value=180000.0,
        current_value=145000.0,
        percent_change=-19.4,
        trend="down",
        data_points=plt_points,
    )

    wbc_points = [
        LabDataPoint(label="Baseline", date="2026-08-01", value=3100.0, unit="cells/uL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-08", value=2950.0, unit="cells/uL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-08-22", value=2800.0, unit="cells/uL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 3 Current", date="2026-09-06", value=2400.0, unit="cells/uL", ctcae_grade=2, status="warning"),
    ]
    wbc_traj = LabTrajectory(
        lab_name="White Blood Cell (WBC)",
        unit="cells/uL",
        reference_range="4,000 - 11,000 cells/uL",
        baseline_value=3100.0,
        current_value=2400.0,
        percent_change=-22.6,
        trend="down",
        data_points=wbc_points,
    )

    hb_points = [
        LabDataPoint(label="Baseline", date="2026-08-01", value=11.8, unit="g/dL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-08", value=11.5, unit="g/dL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-08-22", value=11.2, unit="g/dL", ctcae_grade=1, status="normal"),
        LabDataPoint(label="Cycle 3 Current", date="2026-09-06", value=10.6, unit="g/dL", ctcae_grade=1, status="normal"),
    ]
    hb_traj = LabTrajectory(
        lab_name="Hemoglobin (Hb)",
        unit="g/dL",
        reference_range="13.5 - 17.5 g/dL",
        baseline_value=11.8,
        current_value=10.6,
        percent_change=-10.2,
        trend="down",
        data_points=hb_points,
    )

    toxicities = [
        CTCAEToxicity(
            category="Hematologic",
            symptom="Neutropenia",
            grade=3,
            description="Absolute Neutrophil Count 900 cells/uL. High risk for bacterial translocation.",
            management_recommendation="Secondary G-CSF (Filgrastim 300 mcg SC) indicated. If febrile, initiate IV Cefepime.",
            trend="worsening",
        ),
        CTCAEToxicity(
            category="Neurologic",
            symptom="Peripheral Sensory Neuropathy",
            grade=2,
            description="Bilateral distal finger dysesthesias; acute pharyngolaryngeal dysesthesia triggered by cold drinks.",
            management_recommendation="Avoid cold fluids and exposure. Prolong Oxaliplatin infusion from 2h to 6h if persistent.",
            trend="stable",
        ),
        CTCAEToxicity(
            category="Gastrointestinal",
            symptom="Chemotherapy-Induced Nausea",
            grade=1,
            description="Mild nausea without vomiting; oral intake slightly reduced but adequate.",
            management_recommendation="Continue Ondansetron 8mg BID + Dexamethasone 4mg. Prochlorperazine PRN for breakthrough.",
            trend="improving",
        ),
        CTCAEToxicity(
            category="Constitutional",
            symptom="Cancer-Related Fatigue",
            grade=2,
            description="Moderate fatigue requiring bed rest during daytime. ECOG Performance Status 1.",
            management_recommendation="Evaluate for iron deficiency; schedule structured light ambulation and rest intervals.",
            trend="stable",
        ),
        CTCAEToxicity(
            category="Gastrointestinal",
            symptom="Diarrhea",
            grade=1,
            description="Increase of 2-3 loose stools per day above baseline without nocturnal awakenings.",
            management_recommendation="Loperamide 4mg initial, 2mg after each loose stool up to 16mg/day. Maintain oral hydration.",
            trend="improving",
        ),
    ]

    safety_alerts = [
        SafetyAlertSummary(
            id="ALERT-104-01",
            severity="critical",
            title="Febrile Neutropenia Sentinel",
            message="ANC 900 cells/uL with documented low-grade temperature spike (38.4°C)",
            rationale="Oncology emergency criteria met: ANC < 1000 with temperature >= 38.3°C sustained.",
            action_required="Draw 2 sets of blood cultures (central port + peripheral), start empiric antipseudomonal beta-lactam.",
            timestamp="2026-09-06T18:20:00Z",
            status="active",
        ),
        SafetyAlertSummary(
            id="ALERT-104-02",
            severity="high",
            title="Cycle 4 Chemo Dose Modification Trigger",
            message="Grade 3 Neutropenia nadir on mFOLFOX6",
            rationale="NCCN Colon Guidelines recommend 20% dose reduction of 5-FU bolus and Oxaliplatin for subsequent cycle unless primary G-CSF prophylaxis is instituted.",
            action_required="Review dose adjustment protocol for Cycle 4 with pharmacy prior to ordering.",
            timestamp="2026-09-06T18:22:00Z",
            status="active",
        ),
        SafetyAlertSummary(
            id="ALERT-104-03",
            severity="moderate",
            title="Cumulative Oxaliplatin Neurotoxicity Tracking",
            message="Cumulative dose: 255 mg/m² (Cycle 3 of 6)",
            rationale="Grade 2 cold dysesthesia present. Significant sensory ataxia risk increases above 600 mg/m².",
            action_required="Counsel patient regarding cold avoidance (gloves, room temp beverages).",
            timestamp="2026-09-04T10:00:00Z",
            status="acknowledged",
        ),
    ]

    guidelines = [
        GuidelineConcordance(
            title="NCCN Colorectal Cancer Guidelines v2.2024",
            source="NCCN",
            evidence_level="Category 1",
            recommendation="For Grade 3 neutropenia during FOLFOX, consider G-CSF support or 20% dose reduction of 5-FU and Oxaliplatin upon recovery.",
            concordance="Requires Action",
        ),
        GuidelineConcordance(
            title="ASCO Clinical Practice Guideline: Antimicrobial Prophylaxis for Neutropenic Patients",
            source="ASCO",
            evidence_level="Level A",
            recommendation="Outpatient oral Fluoroquinolone prophylaxis recommended if ANC expected < 100 for > 7 days. For inpatient febrile episode, start IV Cefepime.",
            concordance="Requires Action",
        ),
        GuidelineConcordance(
            title="NCCN Antiemesis Guidelines v1.2024",
            source="NCCN",
            evidence_level="Category 1",
            recommendation="Moderate emetic risk chemotherapy: 5-HT3 receptor antagonist + Dexamethasone on Day 1, followed by Dexamethasone Days 2-3.",
            concordance="Concordant",
        ),
    ]

    rounds_history = [
        HistoricalRound(
            round_id="RND-2026-0906-01",
            date="2026-09-06 18:20",
            cycle=3,
            clinician="Dr. Santhosh (Attending Medical Oncologist)",
            summary="Bedside round: Day 8 post-mFOLFOX6. Low-grade fever 38.4C, sore throat, cold sensitivity. Labs: ANC 900, Plt 145k.",
            note_snippet="Patient admitted for Cycle 3 mFOLFOX6. Subjective: Low-grade fever 38.4C, cold-induced hand dysesthesia. Objective: ANC 900 (Grade 3), Platelets 145,000. Assessment: Grade 3 neutropenia with fever.",
            status="approved",
        ),
        HistoricalRound(
            round_id="RND-2026-0822-01",
            date="2026-08-22 09:15",
            cycle=2,
            clinician="Dr. Santhosh (Attending Medical Oncologist)",
            summary="Cycle 2 Day 1 Pre-chemo clearance. Labs: ANC 1200, Plt 162k. Good appetite, mild nausea well controlled.",
            note_snippet="Pre-cycle 2 review. Performance status ECOG 1. Labs cleared for full dose infusion. Prescribed home antiemetic regimen.",
            status="approved",
        ),
        HistoricalRound(
            round_id="RND-2026-0808-01",
            date="2026-08-08 10:00",
            cycle=1,
            clinician="Dr. Santhosh (Attending Medical Oncologist)",
            summary="Cycle 1 initiation. Port-a-cath accessed cleanly. mFOLFOX6 46-hour ambulatory pump connected.",
            note_snippet="First adjuvant cycle commenced post hemicolectomy. Baseline ANC 1400. Patient educated on oxaliplatin cold precautions.",
            status="approved",
        ),
    ]

    synthesis = (
        "58-year-old male with Stage III Colorectal Cancer on adjuvant mFOLFOX6 (Cycle 3 of 6). "
        "Longitudinal lab trajectory reveals progressive myelosuppression with ANC nadir dropping -35.7% from "
        "baseline to 900 cells/uL (CTCAE Grade 3 Neutropenia). Concomitant low-grade pyrexia (38.4°C) elevates "
        "febrile neutropenia risk. Grade 2 peripheral neurotoxicity is present. Immediate action items: blood cultures, "
        "empiric IV antibiotics, secondary G-CSF support, and consideration of 20% dose modification for Cycle 4."
    )

    return PatientAnalyticsResponse(
        patient=p_record,
        ecog_performance_status=1,
        days_inpatient=4,
        trajectories=[anc_traj, plt_traj, wbc_traj, hb_traj],
        toxicities=toxicities,
        safety_alerts=safety_alerts,
        guidelines=guidelines,
        rounds_history=rounds_history,
        clinical_synthesis=synthesis,
    )


def _generate_demo_105_analytics(p_record) -> PatientAnalyticsResponse:
    """Detailed analytics data for Patient #105 (Sarah Jenkins, DLBCL, R-CHOP)."""
    anc_points = [
        LabDataPoint(label="Baseline", date="2026-08-15", value=2200.0, unit="cells/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-16", value=2100.0, unit="cells/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-09-03", value=1600.0, unit="cells/uL", ctcae_grade=0, status="normal"),
    ]
    anc_traj = LabTrajectory(
        lab_name="Absolute Neutrophil Count (ANC)",
        unit="cells/uL",
        reference_range="1,500 - 8,000 cells/uL",
        baseline_value=2200.0,
        current_value=1600.0,
        percent_change=-27.3,
        trend="down",
        data_points=anc_points,
    )

    plt_points = [
        LabDataPoint(label="Baseline", date="2026-08-15", value=210000.0, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 1 D1", date="2026-08-16", value=205000.0, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label="Cycle 2 D1", date="2026-09-03", value=190000.0, unit="/uL", ctcae_grade=0, status="normal"),
    ]
    plt_traj = LabTrajectory(
        lab_name="Platelet Count",
        unit="/uL",
        reference_range="150,000 - 450,000 /uL",
        baseline_value=210000.0,
        current_value=190000.0,
        percent_change=-9.5,
        trend="stable",
        data_points=plt_points,
    )

    toxicities = [
        CTCAEToxicity(
            category="Constitutional",
            symptom="Cancer-Related Fatigue",
            grade=2,
            description="Generalized exhaustion during afternoon hours, partially relieved by rest periods.",
            management_recommendation="NCCN Fatigue Guidelines: screen for anemia and hypothyroidism; initiate moderate aerobic exercise.",
            trend="stable",
        ),
        CTCAEToxicity(
            category="Gastrointestinal",
            symptom="Oral Mucositis",
            grade=1,
            description="Mild erythema of buccal mucosa; able to ingest solid food without severe discomfort.",
            management_recommendation="Baking soda/saline mouth rinses QID. Avoid commercial alcohol-based mouthwashes.",
            trend="improving",
        ),
    ]

    safety_alerts = [
        SafetyAlertSummary(
            id="ALERT-105-01",
            severity="moderate",
            title="Steroid-Induced Hyperglycemia Monitoring",
            message="Prednisone 100mg PO daily x 5 days as part of R-CHOP",
            rationale="High-dose glucocorticoids cause acute insulin resistance.",
            action_required="Perform pre-prandial fingerstick glucose checks daily while on prednisone.",
            timestamp="2026-09-03T11:00:00Z",
            status="active",
        )
    ]

    guidelines = [
        GuidelineConcordance(
            title="NCCN Guidelines for B-Cell Lymphomas v1.2024",
            source="NCCN",
            evidence_level="Category 1",
            recommendation="R-CHOP every 21 days for 6 cycles. Ensure hepatitis B serology evaluated before Rituximab.",
            concordance="Concordant",
        ),
        GuidelineConcordance(
            title="NCCN Cancer-Related Fatigue Guidelines",
            source="NCCN",
            evidence_level="Category 1",
            recommendation="Tailored physical activity and energy conservation strategies for moderate fatigue.",
            concordance="Concordant",
        ),
    ]

    rounds_history = [
        HistoricalRound(
            round_id="RND-2026-0903-01",
            date="2026-09-03 10:30",
            cycle=2,
            clinician="Dr. Santhosh (Attending Medical Oncologist)",
            summary="Cycle 2 R-CHOP administration. Tolerated rituximab infusion without bronchospasm or chills. Fatigue assessed.",
            note_snippet="Patient tolerating Cycle 2 R-CHOP well. No fever, ECOG 1. ANC 1600. Guideline recommendation: maintain hydration and steroids.",
            status="approved",
        )
    ]

    synthesis = (
        "46-year-old female receiving Cycle 2 R-CHOP for Diffuse Large B-Cell Lymphoma. "
        "Bone marrow reserve remains adequate with ANC 1,600 cells/uL and Platelets 190,000 /uL. "
        "Tolerating immunochemotherapy satisfactorily with Grade 2 fatigue and Grade 1 mucositis as primary symptoms. "
        "Recommendation: Monitor blood sugars during prednisone phase and encourage hydration."
    )

    return PatientAnalyticsResponse(
        patient=p_record,
        ecog_performance_status=1,
        days_inpatient=2,
        trajectories=[anc_traj, plt_traj],
        toxicities=toxicities,
        safety_alerts=safety_alerts,
        guidelines=guidelines,
        rounds_history=rounds_history,
        clinical_synthesis=synthesis,
    )


def _generate_generic_analytics(p_record) -> PatientAnalyticsResponse:
    """Dynamically construct clinically plausible analytics for any newly admitted or existing patient."""
    base_anc = p_record.baseline_anc or 1800.0
    base_plt = p_record.baseline_platelets or 200000.0
    base_wbc = p_record.baseline_wbc or 4000.0

    curr_cycle = p_record.cycle or 1
    # Estimate mild cycle drop
    cycle_factor = max(0.65, 1.0 - (curr_cycle - 1) * 0.1)
    current_anc = round(base_anc * cycle_factor, 0)
    current_plt = round(base_plt * cycle_factor, 0)
    current_wbc = round(base_wbc * cycle_factor, 0)

    anc_grade, anc_status = _grade_anc(current_anc)
    plt_grade, plt_status = _grade_platelets(current_plt)

    anc_points = [
        LabDataPoint(label="Baseline", date="2026-08-20", value=base_anc, unit="cells/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label=f"Cycle {curr_cycle} Current", date="2026-09-07", value=current_anc, unit="cells/uL", ctcae_grade=anc_grade, status=anc_status),
    ]
    anc_pct = round(((current_anc - base_anc) / base_anc) * 100, 1)
    anc_traj = LabTrajectory(
        lab_name="Absolute Neutrophil Count (ANC)",
        unit="cells/uL",
        reference_range="1,500 - 8,000 cells/uL",
        baseline_value=base_anc,
        current_value=current_anc,
        percent_change=anc_pct,
        trend="down" if anc_pct < -10 else "stable",
        data_points=anc_points,
    )

    plt_points = [
        LabDataPoint(label="Baseline", date="2026-08-20", value=base_plt, unit="/uL", ctcae_grade=0, status="normal"),
        LabDataPoint(label=f"Cycle {curr_cycle} Current", date="2026-09-07", value=current_plt, unit="/uL", ctcae_grade=plt_grade, status=plt_status),
    ]
    plt_pct = round(((current_plt - base_plt) / base_plt) * 100, 1)
    plt_traj = LabTrajectory(
        lab_name="Platelet Count",
        unit="/uL",
        reference_range="150,000 - 450,000 /uL",
        baseline_value=base_plt,
        current_value=current_plt,
        percent_change=plt_pct,
        trend="down" if plt_pct < -10 else "stable",
        data_points=plt_points,
    )

    toxicities = [
        CTCAEToxicity(
            category="Hematologic",
            symptom="Neutropenia",
            grade=anc_grade,
            description=f"Current ANC {int(current_anc)} cells/uL. CTCAE Grade {anc_grade}.",
            management_recommendation="Continue daily temperature logs and monitor for infection signs.",
            trend="stable",
        ),
        CTCAEToxicity(
            category="Constitutional",
            symptom="Fatigue",
            grade=1,
            description="Mild fatigue, able to perform activities of daily living.",
            management_recommendation="Adequate fluid intake, light ambulation.",
            trend="stable",
        ),
    ]

    safety_alerts = []
    if anc_grade >= 3:
        safety_alerts.append(
            SafetyAlertSummary(
                id=f"ALERT-{p_record.id}-01",
                severity="critical" if anc_grade == 4 else "high",
                title="Neutropenia Nadir Warning",
                message=f"ANC {int(current_anc)} cells/uL falls in CTCAE Grade {anc_grade} range.",
                rationale="Risk of life-threatening opportunistic infections.",
                action_required="Evaluate need for G-CSF growth factor and prophylactic antimicrobials.",
                timestamp=datetime.now(timezone.utc).isoformat(),
                status="active",
            )
        )

    guidelines = [
        GuidelineConcordance(
            title=f"Clinical Practice Guideline for {p_record.diagnosis}",
            source="ASCO / NCCN",
            evidence_level="Category 1",
            recommendation=f"Standard protocol for {p_record.regimen} (Cycle {p_record.cycle}). Monitor complete blood counts prior to each cycle.",
            concordance="Concordant",
        )
    ]

    rounds_history = [
        HistoricalRound(
            round_id=f"RND-{p_record.id}-INIT",
            date="2026-09-07 09:00",
            cycle=curr_cycle,
            clinician="Dr. Santhosh (Attending Medical Oncologist)",
            summary=f"Admission assessment for {p_record.name} ({p_record.diagnosis}). Bed {p_record.ward_bed}.",
            note_snippet=f"Admitted for {p_record.regimen} Cycle {curr_cycle}. Vitals stable. Baseline labs catalogued.",
            status="approved",
        )
    ]

    synthesis = (
        f"{p_record.age}-year-old {p_record.sex} diagnosed with {p_record.diagnosis}, currently on cycle {p_record.cycle} of {p_record.regimen}. "
        f"Located in {p_record.ward_bed}. Lab trend reflects baseline ANC of {int(base_anc)} cells/uL and current value of {int(current_anc)} cells/uL ({anc_pct}% change). "
        f"Active clinical management is concordant with NCCN guidelines."
    )

    return PatientAnalyticsResponse(
        patient=p_record,
        ecog_performance_status=1,
        days_inpatient=3,
        trajectories=[anc_traj, plt_traj],
        toxicities=toxicities,
        safety_alerts=safety_alerts,
        guidelines=guidelines,
        rounds_history=rounds_history,
        clinical_synthesis=synthesis,
    )


def _enrich_analytics_with_recorded_rounds(
    base_resp: PatientAnalyticsResponse, patient_id: str
) -> PatientAnalyticsResponse:
    """Dynamically incorporate live ward rounds into longitudinal trajectories and safety alerts."""
    from backend.services.persistence import get_rounds_for_patient

    recorded_rounds = get_rounds_for_patient(patient_id)
    if not recorded_rounds:
        return base_resp

    trajectories = list(base_resp.trajectories)
    toxicities = list(base_resp.toxicities)
    safety_alerts = list(base_resp.safety_alerts)
    rounds_history = list(base_resp.rounds_history)

    has_fever = False
    latest_anc = None
    latest_date = None

    for r in recorded_rounds:
        rid = r.get("round_id") or r.get("id", "")
        c_date = (r.get("created_at") or "2026-09-08")[:10]
        transcript = r.get("transcript", "")
        extractions = r.get("extractions", [])
        ext = extractions[0] if extractions else {}
        extracted_labs = ext.get("labs", [])
        extracted_symptoms = [str(s).lower() for s in ext.get("symptoms", [])]

        if "fever" in transcript.lower() or any("fever" in s for s in extracted_symptoms) or "38." in transcript:
            has_fever = True

        if not any(h.round_id == rid for h in rounds_history):
            note_content = ""
            if r.get("draft_notes"):
                note_content = r["draft_notes"][0].get("content", "")
            snippet = note_content[:130] if note_content else transcript[:130]

            rounds_history.insert(
                0,
                HistoricalRound(
                    round_id=rid,
                    date=c_date,
                    cycle=base_resp.patient.cycle,
                    clinician="Dr. Attending (Bedside Ward Round)",
                    summary=f"Ward Round Assessment — Cycle {base_resp.patient.cycle}",
                    note_snippet=snippet,
                    status="verified",
                ),
            )

        # Update lab trajectories with freshly extracted labs
        for lab in extracted_labs:
            lname = str(lab.get("name", "")).upper()
            lval = float(lab.get("value", 0))
            if lval <= 0:
                continue

            for traj in trajectories:
                tname = traj.lab_name.upper()
                if ("ANC" in lname or "NEUTROPHIL" in lname) and ("ANC" in tname or "NEUTROPHIL" in tname):
                    latest_anc = lval
                    latest_date = c_date
                    grade, status = _grade_anc(lval)
                    traj.data_points.append(
                        LabDataPoint(
                            label=f"Round {len(traj.data_points)}",
                            date=c_date,
                            value=lval,
                            unit=traj.unit,
                            ctcae_grade=grade,
                            status=status,
                        )
                    )
                    traj.current_value = lval
                    if traj.baseline_value:
                        traj.percent_change = round(((lval - traj.baseline_value) / traj.baseline_value) * 100, 1)
                        traj.trend = "down" if traj.percent_change < -10 else ("up" if traj.percent_change > 10 else "stable")

                elif ("PLATELET" in lname or "PLT" in lname) and ("PLATELET" in tname or "PLT" in tname):
                    grade, status = _grade_platelets(lval)
                    traj.data_points.append(
                        LabDataPoint(
                            label=f"Round {len(traj.data_points)}",
                            date=c_date,
                            value=lval,
                            unit=traj.unit,
                            ctcae_grade=grade,
                            status=status,
                        )
                    )
                    traj.current_value = lval
                    if traj.baseline_value:
                        traj.percent_change = round(((lval - traj.baseline_value) / traj.baseline_value) * 100, 1)
                        traj.trend = "down" if traj.percent_change < -10 else ("up" if traj.percent_change > 10 else "stable")

                elif "WBC" in lname and "WBC" in tname:
                    traj.data_points.append(
                        LabDataPoint(
                            label=f"Round {len(traj.data_points)}",
                            date=c_date,
                            value=lval,
                            unit=traj.unit,
                            ctcae_grade=1 if lval < 3000 else 0,
                            status="warning" if lval < 3000 else "normal",
                        )
                    )
                    traj.current_value = lval
                    if traj.baseline_value:
                        traj.percent_change = round(((lval - traj.baseline_value) / traj.baseline_value) * 100, 1)
                        traj.trend = "down" if traj.percent_change < -10 else "stable"

    # If Febrile Neutropenia is detected
    if has_fever and latest_anc is not None and latest_anc < 1000:
        fn_alert_id = "fn-active-critical"
        if not any(a.id == fn_alert_id for a in safety_alerts):
            safety_alerts.insert(
                0,
                SafetyAlertSummary(
                    id=fn_alert_id,
                    severity="critical",
                    title="FEBRILE NEUTROPENIA MEDICAL ONCOLOGY EMERGENCY",
                    message=f"Current ANC {int(latest_anc)} cells/µL with documented fever spike. High mortality risk without immediate broad-spectrum coverage.",
                    rationale="ASCO / IDSA Guidelines: Empiric IV antipseudomonal beta-lactam (Cefepime 2g IV q8h) required within 60 minutes.",
                    action_required="Draw 2 sets of peripheral & central blood cultures STAT. Initiate empirical Cefepime 2g IV. Order STAT chest radiograph and urine analysis.",
                    timestamp=latest_date or "2026-09-08",
                    status="active",
                ),
            )

    return PatientAnalyticsResponse(
        patient=base_resp.patient,
        ecog_performance_status=base_resp.ecog_performance_status,
        days_inpatient=base_resp.days_inpatient,
        trajectories=trajectories,
        toxicities=toxicities,
        safety_alerts=safety_alerts,
        guidelines=base_resp.guidelines,
        rounds_history=rounds_history,
        clinical_synthesis=base_resp.clinical_synthesis,
    )


def get_patient_analytics(patient_id: str) -> Optional[PatientAnalyticsResponse]:
    """Retrieve full analytics profile for the specified patient, enriched with live ward rounds."""
    p_record = get_patient(patient_id)
    if not p_record:
        return None

    pid = str(p_record.id).strip().lower()
    if pid in ("104", "pt-104", "p104"):
        base_resp = _generate_demo_104_analytics(p_record)
    elif pid in ("105", "pt-105", "p105"):
        base_resp = _generate_demo_105_analytics(p_record)
    else:
        base_resp = _generate_generic_analytics(p_record)

    return _enrich_analytics_with_recorded_rounds(base_resp, p_record.id)
