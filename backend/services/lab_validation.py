# -*- coding: utf-8 -*-
"""Deterministic Laboratory Value Normalization and Range Validation Service.

Ensures all clinical lab values extracted from transcripts and medical document OCR
are normalized to standard clinical units, checked against biological and physiological
plausibility boundaries, and flagged if ambiguous or indicating possible x10 dictation errors.
"""
from __future__ import annotations

import logging
from typing import Optional
from backend.models.round import LabValue, ConfirmItem

logger = logging.getLogger(__name__)

# Canonical clinical reference limits and standard units
LAB_SPECIFICATIONS = {
    "ANC": {
        "aliases": ["ANC", "ABSOLUTE NEUTROPHIL COUNT", "NEUTROPHILS", "NEUTROPHIL COUNT"],
        "standard_unit": "cells/µL",
        "min_plausible": 0.0,
        "max_plausible": 30000.0,
        "typical_low": 500.0,
        "typical_high": 8000.0,
    },
    "WBC": {
        "aliases": ["WBC", "WHITE BLOOD COUNT", "WHITE BLOOD CELLS", "LEUKOCYTES"],
        "standard_unit": "cells/µL",
        "min_plausible": 100.0,
        "max_plausible": 150000.0,
        "typical_low": 1000.0,
        "typical_high": 12000.0,
    },
    "PLATELETS": {
        "aliases": ["PLATELETS", "PLATELET", "PLT", "THROMBOCYTES"],
        "standard_unit": "/µL",
        "min_plausible": 1000.0,
        "max_plausible": 2000000.0,
        "typical_low": 20000.0,
        "typical_high": 450000.0,
    },
    "HEMOGLOBIN": {
        "aliases": ["HEMOGLOBIN", "HGB", "HB"],
        "standard_unit": "g/dL",
        "min_plausible": 2.0,
        "max_plausible": 25.0,
        "typical_low": 6.5,
        "typical_high": 18.0,
    },
    "CREATININE": {
        "aliases": ["CREATININE", "CR", "SERUM CREATININE", "SCR"],
        "standard_unit": "mg/dL",
        "min_plausible": 0.1,
        "max_plausible": 25.0,
        "typical_low": 0.4,
        "typical_high": 5.0,
    },
}


def _match_canonical_key(name: str) -> Optional[str]:
    """Match a raw analyte name to canonical key."""
    norm = name.strip().upper()
    for key, spec in LAB_SPECIFICATIONS.items():
        if norm == key or norm in spec["aliases"] or any(alias in norm for alias in spec["aliases"]):
            return key
    return None


def validate_and_normalize_lab(
    lab: LabValue,
    source_context: str = "transcript",
) -> tuple[LabValue, Optional[ConfirmItem]]:
    """Normalize units and validate value boundaries for an extracted lab value.

    Never invents or guesses values; flags ambiguous or implausible inputs for clinician review.
    """
    key = _match_canonical_key(lab.name)
    if not key:
        # Unknown analyte: retain as-is, marked as verified unless confidence was low
        status = "verified" if (lab.confidence != "Uncertain") else "needs_confirmation"
        confirm = None
        if status == "needs_confirmation":
            confirm = ConfirmItem(
                id=f"unverified-{lab.name.lower()}",
                item_type="lab_validation",
                label=f"Unverified Lab: {lab.name}",
                value=lab.value,
                unit=lab.unit,
                reason="Analyte not recognized in oncology reference index or has uncertain confidence.",
                source=lab.source or source_context,
            )
        return LabValue(
            name=lab.name,
            value=lab.value,
            unit=lab.unit,
            source=lab.source or source_context,
            confidence=lab.confidence or "High",
            status=status,
        ), confirm

    spec = LAB_SPECIFICATIONS[key]
    val = float(lab.value)
    raw_unit = (lab.unit or "").strip().lower()
    norm_unit = spec["standard_unit"]
    flag_reason = None
    status = "verified"
    confirm_item = None

    # ── Unit normalization ──────────────────────────────────────────────
    if key in ("ANC", "WBC"):
        # If expressed in thousands (e.g. 0.9 or 2.1 or 'k/uL' or 'x10^9/L')
        if "k" in raw_unit or "10^9" in raw_unit or "10^3" in raw_unit:
            val = round(val * 1000.0, 1)
        elif val <= 25.0 and val > 0:
            # Ambiguous scale without explicit unit (e.g. dictated 9 or 0.9)
            original_num = val
            val = round(val * 1000.0, 1)
            status = "needs_confirmation"
            flag_reason = f"{key} dictated as {original_num:g} without explicit unit; assumed scale 10^3 ({val:g} {norm_unit}). Ambiguous value, please confirm."
        elif val < 50.0 and val > 0:
            val = round(val * 1000.0, 1)

    elif key == "PLATELETS":
        # If expressed as e.g. 145 or 145k instead of 145,000
        if "k" in raw_unit or "10^3" in raw_unit or (val <= 1000.0 and val > 0):
            if val <= 1000.0:
                original_num = val
                val = round(val * 1000.0, 1)
                flag_reason = f"Platelet count dictated as {original_num:g}; normalized to {val:g} /µL. Please confirm."
                status = "needs_confirmation"

    elif key == "HEMOGLOBIN":
        # If expressed in g/L (e.g. 106 g/L -> 10.6 g/dL)
        if "g/l" in raw_unit or val > 35.0:
            val = round(val / 10.0, 1)

    elif key == "CREATININE":
        # If expressed in µmol/L (e.g. 88.4 µmol/L -> 1.0 mg/dL)
        if "µmol" in raw_unit or "umol" in raw_unit or val > 35.0:
            val = round(val / 88.4, 2)

    # ── Boundary and plausibility verification ──────────────────────────
    if val < spec["min_plausible"] or val > spec["max_plausible"]:
        status = "implausible"
        flag_reason = (
            f"Value {val:g} {norm_unit} is outside physiological plausibility range "
            f"({spec['min_plausible']:g} - {spec['max_plausible']:g} {norm_unit}). Possible transcription or OCR error."
        )
    elif key == "ANC" and val > 20000.0:
        # Potential x10 / x100 error
        status = "needs_confirmation"
        flag_reason = f"Extremely high ANC ({val:g} cells/µL). Please verify if a x10 dictation multiplier occurred."
    elif key == "WBC" and val > 100000.0:
        status = "needs_confirmation"
        flag_reason = f"Extremely elevated WBC ({val:g} cells/µL). Please verify."

    if lab.confidence == "Uncertain" and status == "verified":
        status = "needs_confirmation"
        flag_reason = "OCR extraction reported uncertain visual confidence for this number."
    elif lab.confidence == "demo data - not read from image" and status == "verified":
        status = "needs_confirmation"
        flag_reason = "demo data - not read from image"


    if status in ("needs_confirmation", "implausible"):
        confirm_item = ConfirmItem(
            id=f"flag-{key.lower()}-{int(val)}",
            item_type="lab_validation",
            label=f"{key} ({val:g} {norm_unit})",
            value=val,
            unit=norm_unit,
            reason=flag_reason or "Verification required",
            source=lab.source or source_context,
        )

    validated_lab = LabValue(
        name=key if key != "HEMOGLOBIN" else "Hemoglobin",
        value=val,
        unit=norm_unit,
        source=lab.source or source_context,
        confidence=lab.confidence or "High",
        status=status,
        flag_reason=flag_reason,
    )

    return validated_lab, confirm_item


def validate_labs_collection(
    labs: list[LabValue],
    source_context: str = "transcript",
) -> tuple[list[LabValue], list[ConfirmItem]]:
    """Validate and normalize a collection of lab values."""
    validated: list[LabValue] = []
    confirm_items: list[ConfirmItem] = []

    for lab in labs:
        v_lab, c_item = validate_and_normalize_lab(lab, source_context=source_context)
        validated.append(v_lab)
        if c_item:
            confirm_items.append(c_item)

    return validated, confirm_items
