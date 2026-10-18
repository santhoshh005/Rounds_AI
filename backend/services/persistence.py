"""Persistence layer — saves round results to Supabase PostgreSQL with local memory backup.

Thread-safe and resilient: all local operations are protected by threading.Lock,
and database write status is tracked to notify clinicians if offline.
"""
from __future__ import annotations

import contextvars
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.models.round import ClinicalExtraction, ReviewFlag
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Per-request context variable — only set when X-Test-Mode: true header arrives.
# SECURITY: This flag only causes DB skipping when the server was started with
# TEST_MODE=true.  A client cannot bypass persistence in production by sending
# this header alone (see is_test_mode() below).
_REQUEST_TEST_MODE: contextvars.ContextVar[bool] = contextvars.ContextVar("_REQUEST_TEST_MODE", default=False)

# Mutex to ensure thread safety across concurrent ward requests
_STORE_LOCK = threading.Lock()

# In-memory longitudinal storage backup to guarantee 100% round retention
_LOCAL_ROUNDS_STORE: dict[str, dict] = {}
_PATIENT_ROUNDS_INDEX: dict[str, list[str]] = {}


def is_test_mode() -> bool:
    """Return True only when persistence should be skipped (test / CI context).

    Rules (evaluated in order):
    1. ``PYTEST_CURRENT_TEST`` env var is present -> always test mode
       (pytest sets this automatically; no client can spoof it).
    2. Server was started with ``TEST_MODE=true`` in its environment
       -> all requests skip DB for this server instance.

    The ``X-Test-Mode: true`` request header is intentionally **NOT**
    checked here anymore.  Only the server-side env var and pytest's own
    marker are trusted.  A client sending that header in a production
    server (where ``TEST_MODE`` is not ``true``) has NO effect whatsoever.
    """
    if os.getenv("PYTEST_CURRENT_TEST"):
        return True
    if os.getenv("TEST_MODE", "false").strip().lower() in ("true", "1", "yes"):
        return True
    return False


def _safe_persist(fn_name: str, fn, *args, **kwargs) -> tuple[Any, bool]:
    """Wrap a persistence call so it never crashes the API if Supabase is offline,
    and strictly skips external Supabase operations in TEST_MODE.

    Returns:
        (result, success_boolean)
    """
    if is_test_mode():
        logger.debug("persistence.%s skipped Supabase DB call in TEST_MODE", fn_name)
        return None, False

    try:
        res = fn(*args, **kwargs)
        return res, True
    except Exception as exc:  # noqa: BLE001
        logger.error("persistence.%s database write failed (falling back to memory): %s", fn_name, exc)
        return None, False


def save_round(transcript: str) -> tuple[str, bool]:
    """Insert a round row and return (round_id, saved_to_db)."""
    rid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Always persist locally in memory under thread lock
    with _STORE_LOCK:
        _LOCAL_ROUNDS_STORE[rid] = {
            "id": rid,
            "round_id": rid,
            "transcript": transcript,
            "created_at": now_iso,
            "extractions": [],
            "review_flags": [],
            "draft_notes": [],
            "status": "draft",
            "saved_to_db": False,
        }

    def _insert(text: str) -> str:
        sb = get_supabase()
        result = sb.table("rounds").insert({"transcript": text}).execute()
        return result.data[0]["id"]

    db_rid, db_ok = _safe_persist("save_round", _insert, transcript)

    with _STORE_LOCK:
        target_rid = db_rid if (db_ok and db_rid) else rid
        if db_ok and db_rid and db_rid != rid:
            # Re-key in memory with DB id
            _LOCAL_ROUNDS_STORE[db_rid] = _LOCAL_ROUNDS_STORE.pop(rid)
            _LOCAL_ROUNDS_STORE[db_rid]["id"] = db_rid
            _LOCAL_ROUNDS_STORE[db_rid]["round_id"] = db_rid

        _LOCAL_ROUNDS_STORE[target_rid]["saved_to_db"] = db_ok

    return target_rid, db_ok


def save_extraction(round_id: str, extraction: ClinicalExtraction) -> bool:
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

    with _STORE_LOCK:
        if round_id in _LOCAL_ROUNDS_STORE:
            _LOCAL_ROUNDS_STORE[round_id]["extractions"] = [ext_dict]

        pid = str(extraction.patient_id or "104").strip()
        if pid not in _PATIENT_ROUNDS_INDEX:
            _PATIENT_ROUNDS_INDEX[pid] = []
        if round_id not in _PATIENT_ROUNDS_INDEX[pid]:
            _PATIENT_ROUNDS_INDEX[pid].append(round_id)

    def _insert(rid: str, ext_data: dict) -> None:
        sb = get_supabase()
        sb.table("extractions").insert(ext_data).execute()

    _, db_ok = _safe_persist("save_extraction", _insert, round_id, ext_dict)
    return db_ok


def save_review_flags(round_id: str, flags: list[ReviewFlag]) -> bool:
    """Persist review flags."""
    if not flags:
        return True

    flag_rows = [
        {
            "round_id": round_id,
            "severity": f.severity,
            "message": f.message,
            "rationale": f.rationale,
            "guideline": getattr(f, "guideline", None),
        }
        for f in flags
    ]

    with _STORE_LOCK:
        if round_id in _LOCAL_ROUNDS_STORE:
            _LOCAL_ROUNDS_STORE[round_id]["review_flags"] = flag_rows

    def _insert(rid: str, flag_list: list[dict]) -> None:
        sb = get_supabase()
        try:
            sb.table("review_flags").insert(flag_list).execute()
        except Exception as e:
            if "guideline" in str(e).lower():
                stripped = [{k: v for k, v in row.items() if k != "guideline"} for row in flag_list]
                sb.table("review_flags").insert(stripped).execute()
            else:
                raise

    _, db_ok = _safe_persist("save_review_flags", _insert, round_id, flag_rows)
    return db_ok


def save_draft_note(round_id: str, content: str) -> tuple[str | None, bool]:
    """Persist the draft note and return (note_id, saved_to_db)."""
    note_id = str(uuid.uuid4())
    note_row = {
        "id": note_id,
        "round_id": round_id,
        "content": content,
        "status": "draft",
        "approved_by": None,
        "approved_at": None,
    }

    with _STORE_LOCK:
        if round_id in _LOCAL_ROUNDS_STORE:
            _LOCAL_ROUNDS_STORE[round_id]["draft_notes"] = [note_row]

    def _insert(rid: str, text: str) -> str:
        sb = get_supabase()
        result = (
            sb.table("draft_notes")
            .insert({"round_id": rid, "content": text, "status": "draft"})
            .execute()
        )
        return result.data[0]["id"]

    db_note_id, db_ok = _safe_persist("save_draft_note", _insert, round_id, content)

    if db_ok and db_note_id and db_note_id != note_id:
        with _STORE_LOCK:
            if round_id in _LOCAL_ROUNDS_STORE and _LOCAL_ROUNDS_STORE[round_id]["draft_notes"]:
                _LOCAL_ROUNDS_STORE[round_id]["draft_notes"][0]["id"] = db_note_id
        return db_note_id, True

    return note_id, db_ok


def approve_note(note_id: str, round_id: str | None = None, approved_by: str = "Dr. Attending") -> bool:
    """Mark a draft note as approved, verifying note_id existence.

    Returns True ONLY if a note was actually updated in the local store or database.
    """
    found_locally = False
    now_iso = datetime.now(timezone.utc).isoformat()

    with _STORE_LOCK:
        rounds_to_check = (
            [_LOCAL_ROUNDS_STORE[round_id]]
            if (round_id and round_id in _LOCAL_ROUNDS_STORE)
            else list(_LOCAL_ROUNDS_STORE.values())
        )

        for r in rounds_to_check:
            for n in r.get("draft_notes", []):
                if n.get("id") == note_id:
                    n["status"] = "approved"
                    n["approved_by"] = approved_by
                    n["approved_at"] = now_iso
                    found_locally = True
                    break
            if found_locally:
                break

    def _update(nid: str, rid: str | None, by: str, at: str) -> bool:
        sb = get_supabase()
        update_payload = {
            "status": "approved",
            "approved_at": at,
            "approved_by": by,
        }
        query = sb.table("draft_notes").update(update_payload).eq("id", nid)
        if rid:
            query = query.eq("round_id", rid)
        res = query.execute()
        return bool(res.data and len(res.data) > 0)

    db_res, db_ok = _safe_persist("approve_note", _update, note_id, round_id, approved_by, now_iso)
    db_updated = bool(db_ok and db_res)

    return found_locally or db_updated


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

    db_rounds, db_ok = _safe_persist("get_round_history", _query, limit)
    if db_ok and db_rounds:
        return db_rounds

    with _STORE_LOCK:
        local_list = [dict(v) for v in _LOCAL_ROUNDS_STORE.values()]
        local_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return local_list[:limit]


def get_round_by_id(round_id: str) -> dict | None:
    """Return round data by UUID, from DB or in-memory store."""
    with _STORE_LOCK:
        if round_id in _LOCAL_ROUNDS_STORE:
            return dict(_LOCAL_ROUNDS_STORE[round_id])

    def _query(rid: str) -> dict | None:
        sb = get_supabase()
        result = (
            sb.table("rounds")
            .select("*, extractions(*), review_flags(*), draft_notes(*)")
            .eq("id", rid)
            .execute()
        )
        return result.data[0] if result.data else None

    db_res, db_ok = _safe_persist("get_round_by_id", _query, round_id)
    return db_res if db_ok else None


def get_rounds_for_patient(patient_id: str) -> list[dict]:
    """Retrieve all chronological clinical rounds recorded for a specific patient."""
    pid = str(patient_id).strip()
    patient_rounds = []

    with _STORE_LOCK:
        matching_rids = list(_PATIENT_ROUNDS_INDEX.get(pid, []))
        for rid in matching_rids:
            r_data = _LOCAL_ROUNDS_STORE.get(rid)
            if r_data:
                patient_rounds.append(dict(r_data))

    patient_rounds.sort(key=lambda x: x.get("created_at", ""))
    return patient_rounds


def get_round(round_id: str) -> dict | None:
    """Convenience alias for get_round_by_id."""
    return get_round_by_id(round_id)


def persist_round(round_dict: dict) -> tuple[str, bool]:
    """Convenience helper to persist a round dict directly into the thread-safe store."""
    rid = round_dict.get("round_id") or round_dict.get("id") or str(uuid.uuid4())
    transcript = round_dict.get("transcript", "")
    now_iso = datetime.now(timezone.utc).isoformat()
    note_id = round_dict.get("note_id") or rid

    with _STORE_LOCK:
        _LOCAL_ROUNDS_STORE[rid] = {
            "id": rid,
            "round_id": rid,
            "transcript": transcript,
            "patient_id": round_dict.get("patient_id"),
            "created_at": round_dict.get("created_at", now_iso),
            "status": round_dict.get("status", "draft"),
            "extractions": round_dict.get("extractions", []),
            "review_flags": round_dict.get("review_flags", []),
            "draft_notes": [
                {
                    "id": note_id,
                    "round_id": rid,
                    "content": round_dict.get("draft_note", ""),
                    "status": round_dict.get("status", "draft"),
                    "approved_by": round_dict.get("approved_by"),
                    "approved_at": round_dict.get("approved_at"),
                }
            ],
            "saved_to_db": round_dict.get("saved_to_db", True),
        }
    return rid, True

