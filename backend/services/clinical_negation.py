# -*- coding: utf-8 -*-
"""Deterministic Clinical Negation and Temporality Analyzer.

Prevents false alarms by distinguishing active acute clinical findings
from negated symptoms ("no fever", "afebrile", "denies nausea"),
resolved episodes ("fever resolved"), and past history ("fever yesterday").
"""
from __future__ import annotations

import os
import re
from typing import Optional


# Negation triggers preceding or following clinical concepts
PRE_NEGATION_PATTERNS = [
    r"\bno\b",
    r"\bnot\b",
    r"\bdenies\b",
    r"\bdenied\b",
    r"\bwithout\b",
    r"\bnegative\s+for\b",
    r"\bzero\b",
    r"\bfree\s+of\b",
    r"\brules?\s+out\b",
    r"\bno\s+evidence\s+of\b",
]

# Historical and resolved triggers
HISTORICAL_OR_RESOLVED_PATTERNS = [
    r"\bresolved\b",
    r"\bcleared\b",
    r"\bsubsided\b",
    r"\byesterday\b",
    r"\blast\s+week\b",
    r"\bpast\b",
    r"\bprior\b",
    r"\bhistory\s+of\b",
    r"\bprevious\b",
    r"\bno\s+longer\b",
]


def extract_temperature_celsius(text: str) -> Optional[float]:
    """Extract clinical body temperature explicitly stated in text, converting to °C."""
    # Pattern e.g. "temp 38.4C", "temperature 38.3", "fever 39.1"
    c_match = re.search(r"\b(?:temp(?:erature)?|fever)?\s*[:=]?\s*([34]\d(?:\.\d+)?)\s*(?:°?c|degrees?\s*c)?\b", text, re.I)
    if c_match:
        try:
            val = float(c_match.group(1))
            if 35.0 <= val <= 43.0:
                return round(val, 1)
        except ValueError:
            pass

    # Fahrenheit pattern: e.g. "101.2F", "temperature 102"
    f_match = re.search(r"\b(?:temp(?:erature)?|fever)?\s*[:=]?\s*(10\d(?:\.\d+)?)\s*(?:°?f|degrees?\s*f)\b", text, re.I)
    if f_match:
        try:
            f_val = float(f_match.group(1))
            if 95.0 <= f_val <= 110.0:
                return round((f_val - 32.0) * (5.0 / 9.0), 1)
        except ValueError:
            pass

    return None


def evaluate_fever_status(
    text: str,
    single_temp_threshold_c: float | None = None,
    sustained_temp_threshold_c: float | None = None,
    temp_threshold_c: float | None = None,
) -> dict[str, str | bool | float | None]:
    """Deterministically analyze fever status in clinical dictation.

    Follows IDSA/ASCO criteria:
    - Single oral temperature measurement >= 38.3°C (101°F)
    - Temperature >= 38.0°C (100.4°F) sustained over >= 1 hour

    Distinguishes:
    - Active current fever (meeting single or sustained threshold, or documented fever without numeric temp)
    - Sub-threshold temperatures (e.g. 38.1°C not sustained)
    - Negated / Afebrile (e.g. "no fever", "afebrile", "denies fever")
    - Resolved / Historical (e.g. "fever yesterday", "fever resolved")
    """
    lower = text.lower()
    temp_c = extract_temperature_celsius(text)

    # Resolve configurable single threshold (default: 38.3°C)
    if single_temp_threshold_c is None:
        if temp_threshold_c is not None:
            single_temp_threshold_c = temp_threshold_c
        else:
            try:
                single_temp_threshold_c = float(
                    os.getenv("THRESHOLD_FN_TEMP_SINGLE_C", os.getenv("THRESHOLD_FEVER_TEMP_C", "38.3"))
                )
            except (ValueError, TypeError):
                single_temp_threshold_c = 38.3

    # Resolve configurable sustained threshold (default: 38.0°C)
    if sustained_temp_threshold_c is None:
        try:
            sustained_temp_threshold_c = float(
                os.getenv("THRESHOLD_FN_TEMP_SUSTAINED_C", "38.0")
            )
        except (ValueError, TypeError):
            sustained_temp_threshold_c = 38.0

    # 1. Check explicit "afebrile"
    if re.search(r"\bafebrile\b", lower):
        # Unless phrase is "not afebrile"
        if not re.search(r"\b(?:not|never)\s+afebrile\b", lower):
            return {
                "active_fever": False,
                "status": "negated",
                "rationale": "Explicitly documented as afebrile.",
                "temperature": temp_c,
                "is_sustained": False,
                "fever_criterion": None,
            }

    # 2. Check explicit pre-negations e.g. "no fever", "denies fever", "without any fever"
    for pre in PRE_NEGATION_PATTERNS:
        if re.search(rf"{pre}\s+(?:any\s+)?(?:signs\s+of\s+)?(?:fever|fevers|febrile)\b", lower):
            return {
                "active_fever": False,
                "status": "negated",
                "rationale": f"Explicitly negated: '{pre} fever'.",
                "temperature": temp_c,
                "is_sustained": False,
                "fever_criterion": None,
            }

    # 3. Check historical / resolved fever (e.g. "fever resolved", "fever subsided")
    if re.search(r"\b(?:fever|fevers)\s+(?:has\s+)?(?:resolved|cleared|subsided|improved)\b", lower):
        return {
            "active_fever": False,
            "status": "resolved",
            "rationale": "Documented as fever resolved.",
            "temperature": temp_c,
            "is_sustained": False,
            "fever_criterion": None,
        }

    # "fever yesterday" without "since"
    if re.search(r"\b(?:had\s+a\s+|reported\s+)?(?:fever|febrile)\s+yesterday\b", lower):
        # Distinguish "fever since yesterday" (ongoing) vs "fever yesterday" (past)
        if not re.search(r"\b(?:fever|febrile)\s+since\s+yesterday\b", lower):
            return {
                "active_fever": False,
                "status": "historical",
                "rationale": "Historical fever yesterday (not documented as ongoing).",
                "temperature": temp_c,
                "is_sustained": False,
                "fever_criterion": None,
            }

    # Detect sustained fever indicator in documentation
    sustained_pattern = (
        r"\b(?:sustained(?:\s+(?:for|over)?\s*(?:at\s+least\s+)?(?:1|one|\d+)\s*(?:hours?|hrs?))?|"
        r"(?:persisting|persistent|lasting|for|over)\s+(?:at\s+least\s+)?(?:1|one|\d+)\s*(?:hours?|hrs?))\b"
    )
    is_sustained = bool(re.search(sustained_pattern, lower))

    # 4. Check for active acute fever signals
    has_fever_term = bool(re.search(r"\b(?:fever|fevers|febrile|pyrexia)\b", lower))
    has_single_fever = bool(temp_c is not None and temp_c >= single_temp_threshold_c)
    has_sustained_fever = bool(temp_c is not None and temp_c >= sustained_temp_threshold_c and is_sustained)

    if has_single_fever:
        fever_criterion = f"fever observed with temperature of {temp_c:g}°C (>= {single_temp_threshold_c:g}°C threshold)"
        return {
            "active_fever": True,
            "status": "active",
            "is_sustained": is_sustained,
            "fever_criterion": fever_criterion,
            "rationale": f"Single temperature measurement of {temp_c:g}°C meets or exceeds the {single_temp_threshold_c:g}°C threshold.",
            "temperature": temp_c,
        }
    elif has_sustained_fever:
        fever_criterion = f"temperature of {temp_c:g}°C sustained for >= 1 hour (>= {sustained_temp_threshold_c:g}°C threshold)"
        return {
            "active_fever": True,
            "status": "active",
            "is_sustained": True,
            "fever_criterion": fever_criterion,
            "rationale": f"Temperature of {temp_c:g}°C sustained for >= 1 hour meets or exceeds the {sustained_temp_threshold_c:g}°C threshold.",
            "temperature": temp_c,
        }
    elif temp_c is not None:
        # Temperature measured but below both single and sustained criteria
        return {
            "active_fever": False,
            "status": "below_threshold",
            "is_sustained": is_sustained,
            "fever_criterion": None,
            "rationale": f"Temperature {temp_c:g}°C is below the fever threshold ({single_temp_threshold_c:g}°C single / {sustained_temp_threshold_c:g}°C sustained for 1h).",
            "temperature": temp_c,
        }
    elif has_fever_term:
        # Fever is explicitly noted in dictation but without a numeric temperature reading
        fever_criterion = "active fever documented in dictation"
        return {
            "active_fever": True,
            "status": "active",
            "is_sustained": is_sustained,
            "fever_criterion": fever_criterion,
            "rationale": "Active fever documented in clinical dictation.",
            "temperature": None,
        }

    return {
        "active_fever": False,
        "status": "none_mentioned",
        "is_sustained": False,
        "fever_criterion": None,
        "rationale": "No fever mentioned.",
        "temperature": temp_c,
    }


def partition_symptoms(transcript: str) -> tuple[list[str], list[str]]:
    """Partition extracted symptoms into active vs negated/resolved."""
    lower = transcript.lower()
    active_symptoms: list[str] = []
    negated_symptoms: list[str] = []

    symptom_checks = [
        ("fever", r"\b(?:fever|fevers|febrile)\b"),
        ("fatigue", r"\b(?:fatigue|tiredness|exhaustion)\b"),
        ("nausea", r"\b(?:nausea|queasiness)\b"),
        ("vomiting", r"\b(?:vomiting|emesis)\b"),
        ("diarrhea", r"\b(?:diarrhea|loose\s+stools)\b"),
        ("pain", r"\b(?:pain|aching)\b"),
        ("mucositis", r"\b(?:mucositis|mouth\s+sores|stomatitis)\b"),
        ("cold dysesthesia", r"\b(?:cold\s+dysesthesia|cold\s+sensitivity)\b"),
        ("neuropathy", r"\b(?:neuropathy|paresthesias?|tingling)\b"),
    ]

    for name, pattern in symptom_checks:
        matches = list(re.finditer(pattern, lower))
        if not matches:
            if name == "fever" and re.search(r"\bafebrile\b", lower):
                negated_symptoms.append("fever (afebrile)")
            continue

        if name == "fever":
            f_eval = evaluate_fever_status(transcript)
            if f_eval["active_fever"]:
                active_symptoms.append("fever")
            else:
                negated_symptoms.append(f"fever ({f_eval['status']})")
            continue

        # Check for pre-negation within preceding 5 words
        is_negated = False
        for m in matches:
            start_pos = max(0, m.start() - 35)
            prefix = lower[start_pos:m.start()]
            if any(re.search(rf"{pre}\s+(?:any\s+)?$", prefix) for pre in PRE_NEGATION_PATTERNS):
                is_negated = True
                break

        if is_negated:
            negated_symptoms.append(f"{name} (negated)")
        else:
            active_symptoms.append(name)

    return active_symptoms, negated_symptoms


def detect_fever_status(
    text: str,
    single_temp_threshold_c: float | None = None,
    sustained_temp_threshold_c: float | None = None,
    temp_threshold_c: float | None = None,
) -> dict[str, bool | float | str | None]:
    """Convenience evaluator returning boolean flags for test assertions and sentinel rules."""
    res = evaluate_fever_status(
        text,
        single_temp_threshold_c=single_temp_threshold_c,
        sustained_temp_threshold_c=sustained_temp_threshold_c,
        temp_threshold_c=temp_threshold_c,
    )
    return {
        "is_active_fever": bool(res.get("active_fever")),
        "is_negated": res.get("status") == "negated",
        "is_resolved_or_past": res.get("status") in ("resolved", "historical"),
        "status": res.get("status"),
        "temperature": res.get("temperature"),
        "is_sustained": bool(res.get("is_sustained")),
        "fever_criterion": res.get("fever_criterion"),
        "rationale": res.get("rationale"),
    }


def partition_symptoms_by_negation(raw_symptoms: list[str], transcript: str) -> tuple[list[str], list[str]]:
    """Partition a list of raw symptoms according to deterministically analyzed transcript context."""
    active, negated = partition_symptoms(transcript)
    active_clean = {s.split(" (")[0].lower() for s in active}
    negated_clean = {s.split(" (")[0].lower() for s in negated}

    final_active = []
    final_negated = []

    for s in raw_symptoms:
        s_low = s.lower().strip()
        if s_low in negated_clean:
            final_negated.append(s_low)
        elif s_low in active_clean or s_low in transcript.lower():
            final_active.append(s_low)

    return final_active, final_negated

