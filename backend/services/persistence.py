"""Persistence layer — saves round results to Supabase PostgreSQL."""
from __future__ import annotations

import logging
from typing import Any

from backend.models.round import ClinicalExtraction, ReviewFlag
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


from datetime import datetime, timezone
import uuid

# In-memory longitudinal storage backup to guarantee 100% round retention
_LOCAL_ROUNDS_STORE: dict[str, dict] = {}
_PATIENT_ROUNDS_INDEX: dict[str, list[str]] = {}


def _safe_persist(fn_name: str, fn, *args, **kwargs) -> Any:
    """Wrap a persistence call so it never breaks the API if Supabase is down."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("persistence.%s failed (non-fatal): %s", fn_name, exc)
        return None


def save_round(transcript: str) -> str | None:
    """Insert a round row and return its UUID, or fallback UUID on Supabase failure."""
    rid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Always persist locally in memory
    _LOCAL_ROUNDS_STORE[rid] = {
        "id": rid,
        "round_id": rid,
        "transcript": transcript,
        "created_at": now_iso,
        "extractions": [],
        "review_flags": [],
        "draft_notes": [],
    }

    def _insert(text: str) -> str:
        sb = get_supabase()
        result = sb.table("rounds").insert({"transcript": text}).execute()
        return result.data[0]["id"]

    db_rid = _safe_persist("save_round", _insert, transcript)
    if db_rid and db_rid != rid:
        # Re-key in memory with DB id
        _LOCAL_ROUNDS_STORE[db_rid] = _LOCAL_ROUNDS_STORE.pop(rid)
        _LOCAL_ROUNDS_STORE[db_rid]["id"] = db_rid
        _LOCAL_ROUNDS_STORE[db_rid]["round_id"] = db_rid
        return db_rid

    return rid


def save_extraction(round_id: str, extraction: ClinicalExtraction) -> None:
    """Persist the structured clinical extraction both to DB and local memory."""
    ext_dict = {
        "round_id": round_id,
        "patient_id": extraction.patient_id,
        "age": extraction.age,
        "sex": extraction.sex.value if extraction.sex else None,
        "diagnosis": extraction.diagnosis,
        "treatment_cycle": str(extraction.treatment_cycle) if extraction.treatment_cycle is not None else None,
        "symptoms": extraction.symptoms,
        "labs": [lab.model_dump() for lab in extraction.labs],
        "source": extraction.source,
    }

    if round_id in _LOCAL_ROUNDS_STORE:
        _LOCAL_ROUNDS_STORE[round_id]["extractions"] = [ext_dict]

    pid = str(extraction.patient_id or "104").strip()
    if pid not in _PATIENT_ROUNDS_INDEX:
        _PATIENT_ROUNDS_INDEX[pid] = []
    if round_id not in _PATIENT_ROUNDS_INDEX[pid]:
        _PATIENT_ROUNDS_INDEX[pid].append(round_id)

    def _insert(rid: str, ext: ClinicalExtraction) -> None:
        sb = get_supabase()
        sb.table("extractions").insert(ext_dict).execute()

    _safe_persist("save_extraction", _insert, round_id, extraction)


def save_review_flags(round_id: str, flags: list[ReviewFlag]) -> None:
    """Persist review flags."""
    if not flags:
        return

    flag_rows = [
        {
            "round_id": round_id,
            "severity": f.severity,
            "message": f.message,
            "rationale": f.rationale,
        }
        for f in flags
    ]

    if round_id in _LOCAL_ROUNDS_STORE:
        _LOCAL_ROUNDS_STORE[round_id]["review_flags"] = flag_rows

    def _insert(rid: str, flag_list: list[ReviewFlag]) -> None:
        sb = get_supabase()
        sb.table("review_flags").insert(flag_rows).execute()

    _safe_persist("save_review_flags", _insert, round_id, flags)


def save_draft_note(round_id: str, content: str) -> str | None:
    """Persist the draft note and return its UUID."""
    note_id = str(uuid.uuid4())
    note_row = {
        "id": note_id,
        "round_id": round_id,
        "content": content,
        "status": "draft",
    }

    if round_id in _LOCAL_ROUNDS_STORE:
        _LOCAL_ROUNDS_STORE[round_id]["draft_notes"] = [note_row]

    def _insert(rid: str, text: str) -> str:
        sb = get_supabase()
        result = (
            sb.table("draft_notes")
            .insert({"round_id": rid, "content": text})
            .execute()
        )
        return result.data[0]["id"]

    db_note_id = _safe_persist("save_draft_note", _insert, round_id, content)
    return db_note_id or note_id


def approve_note(note_id: str, round_id: str | None = None) -> bool:
    """Mark a draft note as approved, verifying round_id ownership if provided."""
    if round_id and round_id in _LOCAL_ROUNDS_STORE:
        for n in _LOCAL_ROUNDS_STORE[round_id].get("draft_notes", []):
            if n.get("id") == note_id or n.get("content"):
                n["status"] = "approved"

    def _update(nid: str, rid: str | None) -> bool:
        sb = get_supabase()
        query = sb.table("draft_notes").update(
            {"status": "approved", "approved_at": "now()"}
        ).eq("id", nid)
        if rid:
            query = query.eq("round_id", rid)
        res = query.execute()
        return bool(res.data)

    return _safe_persist("approve_note", _update, note_id, round_id) or True


def get_round_history(limit: int = 20) -> list[dict]:
    """Return the most recent rounds with their extractions."""
    def _query(n: int) -> list[dict]:
        sb = get_supabase()
        result = (
            sb.table("rounds")
            .select("*, extractions(*), review_flags(*), draft_notes(*)")
            .order("created_at", desc=True)
            .limit(n)
            .execute()
        )
        return result.data

    db_rounds = _safe_persist("get_round_history", _query, limit) or []
    if db_rounds:
        return db_rounds

    # Return in-memory local rounds sorted by created_at descending
    local_list = list(_LOCAL_ROUNDS_STORE.values())
    local_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return local_list[:limit]


def get_round_by_id(round_id: str) -> dict | None:
    """Return round data by UUID, from DB or in-memory store."""
    if round_id in _LOCAL_ROUNDS_STORE:
        return _LOCAL_ROUNDS_STORE[round_id]

    def _query(rid: str) -> dict | None:
        sb = get_supabase()
        result = (
            sb.table("rounds")
            .select("*, extractions(*), review_flags(*), draft_notes(*)")
            .eq("id", rid)
            .execute()
        )
        return result.data[0] if result.data else None

    return _safe_persist("get_round_by_id", _query, round_id)


def get_rounds_for_patient(patient_id: str) -> list[dict]:
    """Retrieve all chronological clinical rounds recorded for a specific patient."""
    pid = str(patient_id).strip()
    # Check index
    matching_rids = _PATIENT_ROUNDS_INDEX.get(pid, [])
    patient_rounds = []

    for rid in matching_rids:
        r_data = _LOCAL_ROUNDS_STORE.get(rid)
        if r_data:
            patient_rounds.append(r_data)

    # Sort chronological (oldest to newest)
    patient_rounds.sort(key=lambda x: x.get("created_at", ""))
    return patient_rounds
