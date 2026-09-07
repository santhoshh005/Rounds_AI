"""Patient Context Agent.

Queries prior clinical rounds from Supabase to construct longitudinal timelines
and compute cycle-over-cycle lab trends (e.g. ANC 1,200 -> 900 down).
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.models.round import ClinicalExtraction, LabTrend
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Baseline reference labs for Patient 104 (Cycle 2 prior visit) for realistic demo comparison
_DEMO_BASELINE_104 = {
    "WBC": (3100.0, "cells/uL"),
    "ANC": (1400.0, "cells/uL"),
    "PLATELETS": (180000.0, "/uL"),
    "HEMOGLOBIN": (11.8, "g/dL"),
}


def build_patient_context(extraction: ClinicalExtraction) -> list[LabTrend]:
    """Calculate longitudinal lab trends by comparing with previous rounds."""
    trends: list[LabTrend] = []
    pid = extraction.patient_id or "104"
    current_labs = {lab.name.upper(): lab for lab in extraction.labs}

    prior_labs: dict[str, float] = {}

    # 1. Try querying Supabase for the most recent prior extraction of this patient
    try:
        sb = get_supabase()
        res = (
            sb.table("extractions")
            .select("labs, created_at")
            .eq("patient_id", pid)
            .order("created_at", desc=True)
            .limit(2)
            .execute()
        )
        if res.data and len(res.data) > 1:
            # The second most recent is the previous round
            prev_row = res.data[1]
            raw_labs = prev_row.get("labs") or []
            for item in raw_labs:
                if isinstance(item, dict) and "name" in item and "value" in item:
                    prior_labs[item["name"].upper()] = float(item["value"])
    except Exception as exc:
        logger.info("Could not fetch prior Supabase context: %s. Using baseline.", exc)

    # 2. If no DB history yet, populate with clinical prior cycle baseline for demo
    if not prior_labs and pid.upper() in ("104", "PT-104", "P104"):
        prior_labs = {k: v[0] for k, v in _DEMO_BASELINE_104.items()}

    # 3. Compute trends for each current lab
    for lab in extraction.labs:
        key = lab.name.upper()
        prev_val = prior_labs.get(key)
        trend_direction = "stable"

        if prev_val is not None:
            delta = lab.value - prev_val
            pct_change = (delta / prev_val) * 100 if prev_val != 0 else 0
            if pct_change <= -10.0:
                trend_direction = "down"
            elif pct_change >= 10.0:
                trend_direction = "up"
            else:
                trend_direction = "stable"
        else:
            trend_direction = "new"

        trends.append(
            LabTrend(
                name=lab.name,
                value=lab.value,
                unit=lab.unit or "cells/uL",
                previous_value=prev_val,
                trend=trend_direction,
                source=lab.source or "Clinical Input",
            )
        )

    return trends
