# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from backend.models.patient import Patient, PatientCreate, PatientUpdate

logger = logging.getLogger(__name__)

# Pre-seeded default oncology ward patients
_DEFAULT_PATIENTS: list[dict] = [
    {
        "id": "104",
        "name": "David Miller",
        "age": 58,
        "sex": "male",
        "diagnosis": "Colorectal Cancer (Stage III)",
        "regimen": "mFOLFOX6",
        "cycle": 3,
        "ward_bed": "Ward 4B - Bed 12",
        "baseline_anc": 1400.0,
        "baseline_platelets": 180000.0,
        "baseline_wbc": 3100.0,
        "status": "admitted",
        "created_at": "2026-09-01T08:00:00Z",
    },
    {
        "id": "105",
        "name": "Sarah Jenkins",
        "age": 46,
        "sex": "female",
        "diagnosis": "Diffuse Large B-Cell Lymphoma",
        "regimen": "R-CHOP",
        "cycle": 2,
        "ward_bed": "Ward 4B - Bed 14",
        "baseline_anc": 2200.0,
        "baseline_platelets": 210000.0,
        "baseline_wbc": 4500.0,
        "status": "admitted",
        "created_at": "2026-09-03T10:30:00Z",
    },
    {
        "id": "106",
        "name": "Elena Rostova",
        "age": 62,
        "sex": "female",
        "diagnosis": "Invasive Ductal Breast Carcinoma",
        "regimen": "AC-T (Doxorubicin/Cyclophosphamide)",
        "cycle": 4,
        "ward_bed": "Ward 4B - Bed 16",
        "baseline_anc": 1650.0,
        "baseline_platelets": 160000.0,
        "baseline_wbc": 3800.0,
        "status": "admitted",
        "created_at": "2026-09-04T14:15:00Z",
    },
]

_PATIENTS_STORE: dict[str, dict] = {p["id"]: dict(p) for p in _DEFAULT_PATIENTS}


def list_patients(status: Optional[str] = "admitted") -> list[Patient]:
    """Return all oncology ward patients, optionally filtered by status."""
    patients = list(_PATIENTS_STORE.values())
    if status:
        patients = [p for p in patients if p.get("status") == status]
    patients.sort(key=lambda x: x.get("ward_bed", ""))
    return [Patient(**p) for p in patients]


def get_patient(patient_id: str) -> Optional[Patient]:
    """Retrieve a single patient by ID."""
    p = _PATIENTS_STORE.get(str(patient_id))
    if not p:
        for k, v in _PATIENTS_STORE.items():
            if k.lower() == str(patient_id).lower():
                return Patient(**v)
        return None
    return Patient(**p)


def create_patient(data: PatientCreate) -> Patient:
    """Admit a new oncology patient into the ward."""
    pid = str(data.id).strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    record = data.model_dump()
    record["id"] = pid
    record["created_at"] = now_iso
    record["status"] = "admitted"

    _PATIENTS_STORE[pid] = record
    logger.info("Admitted new patient: %s (%s)", pid, data.name)
    return Patient(**record)


def update_patient(patient_id: str, data: PatientUpdate) -> Optional[Patient]:
    """Update patient information (e.g. advance chemo cycle, change bed)."""
    pid = str(patient_id)
    existing = _PATIENTS_STORE.get(pid)
    if not existing:
        return None

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    existing.update(updates)
    _PATIENTS_STORE[pid] = existing
    logger.info("Updated patient %s: %s", pid, updates)
    return Patient(**existing)


def discharge_patient(patient_id: str) -> bool:
    """Discharge patient from active oncology ward."""
    pid = str(patient_id)
    if pid in _PATIENTS_STORE:
        _PATIENTS_STORE[pid]["status"] = "discharged"
        logger.info("Discharged patient %s from ward", pid)
        return True
    return False
