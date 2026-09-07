"""Persistence layer — saves round results to Supabase PostgreSQL."""
from __future__ import annotations

import logging
from typing import Any

from backend.models.round import ClinicalExtraction, ReviewFlag
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def _safe_persist(fn_name: str, fn, *args, **kwargs) -> Any:
    """Wrap a persistence call so it never breaks the API if Supabase is down."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("persistence.%s failed (non-fatal): %s", fn_name, exc)
        return None


def save_round(transcript: str) -> str | None:
    """Insert a round row and return its UUID, or None on failure."""

    def _insert(text: str) -> str:
        sb = get_supabase()
        result = sb.table("rounds").insert({"transcript": text}).execute()
        return result.data[0]["id"]

    return _safe_persist("save_round", _insert, transcript)


def save_extraction(round_id: str, extraction: ClinicalExtraction) -> None:
    """Persist the structured clinical extraction."""

    def _insert(rid: str, ext: ClinicalExtraction) -> None:
        sb = get_supabase()
        sb.table("extractions").insert(
            {
                "round_id": rid,
                "patient_id": ext.patient_id,
                "age": ext.age,
                "sex": ext.sex.value if ext.sex else None,
                "diagnosis": ext.diagnosis,
                "treatment_cycle": str(ext.treatment_cycle) if ext.treatment_cycle is not None else None,
                "symptoms": ext.symptoms,
                "labs": [lab.model_dump() for lab in ext.labs],
                "source": ext.source,
            }
        ).execute()

    _safe_persist("save_extraction", _insert, round_id, extraction)


def save_review_flags(round_id: str, flags: list[ReviewFlag]) -> None:
    """Persist review flags."""
    if not flags:
        return

    def _insert(rid: str, flag_list: list[ReviewFlag]) -> None:
        sb = get_supabase()
        rows = [
            {
                "round_id": rid,
                "severity": f.severity,
                "message": f.message,
                "rationale": f.rationale,
            }
            for f in flag_list
        ]
        sb.table("review_flags").insert(rows).execute()

    _safe_persist("save_review_flags", _insert, round_id, flags)


def save_draft_note(round_id: str, content: str) -> str | None:
    """Persist the draft note and return its UUID."""

    def _insert(rid: str, text: str) -> str:
        sb = get_supabase()
        result = (
            sb.table("draft_notes")
            .insert({"round_id": rid, "content": text})
            .execute()
        )
        return result.data[0]["id"]

    return _safe_persist("save_draft_note", _insert, round_id, content)


def approve_note(note_id: str, round_id: str | None = None) -> bool:
    """Mark a draft note as approved, verifying round_id ownership if provided."""

    def _update(nid: str, rid: str | None) -> bool:
        sb = get_supabase()
        query = sb.table("draft_notes").update(
            {"status": "approved", "approved_at": "now()"}
        ).eq("id", nid)
        if rid:
            query = query.eq("round_id", rid)
        res = query.execute()
        return bool(res.data)

    return _safe_persist("approve_note", _update, note_id, round_id) or False


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

    return _safe_persist("get_round_history", _query, limit) or []
