import json
import urllib.request
import urllib.error
import sys
import pytest

BASE_BACKEND = "http://localhost:8000"
BASE_FRONTEND = "http://localhost:3000"


def _is_server_running() -> bool:
    """Check if live backend server is reachable on http://localhost:8000."""
    try:
        req = urllib.request.Request(f"{BASE_BACKEND}/health", method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as res:
            return res.status == 200
    except Exception:
        return False


# Skip all integration tests in this file if the live backend is not running
pytestmark = pytest.mark.skipif(
    not _is_server_running(),
    reason="Live backend server is not running on http://localhost:8000 (integration test)",
)


def request_json(url, method="GET", data=None, headers=None, retries=3):
    import time
    if headers is None:
        headers = {}
    else:
        headers = dict(headers)
    headers.setdefault("X-Test-Mode", "true")
    encoded_data = data
    if data is not None and not isinstance(data, (bytes, bytearray)):
        encoded_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    for attempt in range(retries):
        req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=35.0) as response:
                body = response.read().decode("utf-8")
                status = response.status
                resp_headers = dict(response.headers)
                try:
                    parsed = json.loads(body)
                except Exception:
                    parsed = body
                return status, parsed, resp_headers
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            if e.code in (503, 504) and attempt < retries - 1:
                time.sleep(1.5 * (2 ** attempt))
                continue
            return e.code, parsed, dict(e.headers)
        except Exception as e:
            err_str = str(e).lower()
            if ("503" in err_str or "timed out" in err_str or "unavailable" in err_str) and attempt < retries - 1:
                time.sleep(1.5 * (2 ** attempt))
                continue
            return 500, str(e), {}
    return 503, "Service unavailable after retries", {}


def skip_if_gemini_503(status: int, resp_body):
    """Skip Gemini-dependent test with a clear message if Gemini API remains 503 after backoff retries."""
    body_str = str(resp_body).lower()
    if status in (503, 504) or "503" in body_str or "high demand" in body_str:
        pytest.skip(f"Gemini API returned 503 UNAVAILABLE after backoff retries: {resp_body}")



# ── 1. Frontend Web Interfaces ─────────────────────────────────────────
def test_e2e_frontend_routes():
    frontend_routes = [
        ("/", "Doctor Workstation"),
        ("/mobile", "Bedside Mobile Companion"),
        ("/analytics?patientId=104", "Patient Analytics"),
        ("/login", "Login Page"),
    ]
    for route, label in frontend_routes:
        url = f"{BASE_FRONTEND}{route}"
        status, body, _ = request_json(url)
        assert status == 200, f"Frontend route {route} ({label}) failed with HTTP {status}"
        assert isinstance(body, str) and len(body) > 200, f"Frontend route {route} returned empty body"


# ── 2. Backend Health & Voice Configuration ───────────────────────────
def test_e2e_backend_health_and_voice():
    status, body, _ = request_json(f"{BASE_BACKEND}/health")
    assert status == 200
    assert body.get("status") == "ok"
    assert "CTCAE" in body.get("ctcae_version", "")

    status_voice, voice_body, _ = request_json(f"{BASE_BACKEND}/api/v1/voice/mode")
    assert status_voice == 200
    assert voice_body.get("mode") == "local"


# ── 3. Patients Census CRUD ───────────────────────────────────────────
def test_e2e_patients_census_crud():
    # List initial
    status, patients, _ = request_json(f"{BASE_BACKEND}/api/v1/patients")
    assert status == 200
    assert len(patients) >= 3

    # Create new patient
    test_patient = {
        "id": "pt-test-integration-99",
        "name": "Integration Test Subject",
        "age": 52,
        "sex": "female",
        "diagnosis": "Ovarian Carcinoma",
        "regimen": "Carboplatin / Paclitaxel",
        "cycle": 1,
        "ward_bed": "Ward 4B - Bed 99",
        "baseline_anc": 2500,
        "baseline_platelets": 210000,
        "baseline_wbc": 5500,
    }
    status, created, _ = request_json(f"{BASE_BACKEND}/api/v1/patients", method="POST", data=test_patient)
    assert status in (200, 201)
    assert created.get("id") == "pt-test-integration-99"

    # Read Single
    status, fetched, _ = request_json(f"{BASE_BACKEND}/api/v1/patients/pt-test-integration-99")
    assert status == 200
    assert fetched.get("name") == "Integration Test Subject"

    # Update
    update_data = {"ward_bed": "Ward 4B - Bed 100", "cycle": 2}
    status, updated, _ = request_json(f"{BASE_BACKEND}/api/v1/patients/pt-test-integration-99", method="PUT", data=update_data)
    assert status == 200
    assert updated.get("ward_bed") == "Ward 4B - Bed 100"

    # Discharge
    status, del_res, _ = request_json(f"{BASE_BACKEND}/api/v1/patients/pt-test-integration-99", method="DELETE")
    assert status == 200

    # Confirm Discharged from active admitted census
    status, active_census, _ = request_json(f"{BASE_BACKEND}/api/v1/patients")
    assert not any(p.get("id") == "pt-test-integration-99" for p in active_census)

    # Details retain status == 'discharged'
    status, discharged_rec, _ = request_json(f"{BASE_BACKEND}/api/v1/patients/pt-test-integration-99")
    assert status == 200
    assert discharged_rec.get("status") == "discharged"


# ── 4. Clinical Speech Normalizer & Context Safeguards ─────────────────
def test_e2e_clinical_autocorrect():
    # Regimen & spoken labs
    text_1 = "patient on fall fox cycle 3 developed fever wbc twenty one hundred and anc nine hundred"
    status_1, res_1, _ = request_json(f"{BASE_BACKEND}/api/v1/clinical/autocorrect", method="POST", data={"text": text_1})
    skip_if_gemini_503(status_1, res_1)
    assert status_1 == 200
    corr_1 = res_1.get("corrected_text", "")
    assert "mFOLFOX6" in corr_1
    assert "ANC 900" in corr_1
    assert "WBC 2,100" in corr_1
    assert len(res_1.get("changes", [])) >= 3

    # Non-lab context preservation (no false ANC injection)
    text_2 = "we saw nine hundred patients at the hospital conference yesterday"
    status_2, res_2, _ = request_json(f"{BASE_BACKEND}/api/v1/clinical/autocorrect", method="POST", data={"text": text_2})
    skip_if_gemini_503(status_2, res_2)
    assert status_2 == 200
    corr_2 = res_2.get("corrected_text", "")
    assert "900" in corr_2
    assert "ANC" not in corr_2


# ── 5. Round Extraction, CTCAE Grading & Safety Sentinels ──────────────
def test_e2e_round_extraction_and_sentinels():
    # Case 5A: Patient 104 (ANC 900, Fever 38.4C, unconfirmed decline -> Medium Alert)
    pt104_payload = {
        "patient_id": "104",
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. Cycle 3 chemotherapy. Developed fever since yesterday, temp 38.4C. WBC 2100, ANC 900. Complaining of severe fatigue.",
        "images": [],
    }
    status, r104, _ = request_json(f"{BASE_BACKEND}/api/v1/rounds/extract", method="POST", data=pt104_payload)
    skip_if_gemini_503(status, r104)
    assert status == 200
    assert "stage_engines" in r104
    assert "extraction" in r104["stage_engines"]
    assert "polish" in r104["stage_engines"]
    assert "vision" in r104["stage_engines"]
    flags_104 = r104.get("review_flags", [])
    sec_alert = next((f for f in flags_104 if f.get("rule_id") == "RULE_SENTINEL_FEVER_ANC_SUB1000_NO_DECLINE"), None)
    assert sec_alert is not None, "Missing secondary alert for ANC 900 with fever"
    assert sec_alert.get("severity") == "medium"
    assert "expected decline to <500 not documented" in sec_alert.get("message")
    assert r104.get("draft_note") is not None

    # Case 5B: Patient 105 (ANC 450, Fever 38.5C -> Primary High Emergency Sentinel)
    pt105_payload = {
        "patient_id": "105",
        "transcript": "Patient 105 is a 46-year-old female with lymphoma. Cycle 2 chemotherapy. Developed fever 38.5C, severe chills. ANC 450, WBC 1800, platelets 120000.",
        "images": [],
    }
    status, r105, _ = request_json(f"{BASE_BACKEND}/api/v1/rounds/extract", method="POST", data=pt105_payload)
    skip_if_gemini_503(status, r105)
    assert status == 200
    flags_105 = r105.get("review_flags", [])
    prim_alert = next((f for f in flags_105 if f.get("rule_id") == "RULE_SENTINEL_FEBRILE_NEUTROPENIA"), None)
    assert prim_alert is not None, "Missing primary alert for ANC 450 with fever"
    assert prim_alert.get("severity") == "high"
    assert "Criterion met, for clinician review" in prim_alert.get("message")

    # Case 5C: Patient with Critical Thrombocytopenia (< 25,000 /µL)
    plt_payload = {
        "patient_id": "106",
        "transcript": "Patient 106 has severe petechiae. Platelets 22000, WBC 4000.",
        "images": [],
    }
    status, r_plt, _ = request_json(f"{BASE_BACKEND}/api/v1/rounds/extract", method="POST", data=plt_payload)
    skip_if_gemini_503(status, r_plt)
    assert status == 200
    flags_plt = r_plt.get("review_flags", [])
    crit_plt = next((f for f in flags_plt if f.get("rule_id") == "RULE_SENTINEL_CRITICAL_THROMBOCYTOPENIA"), None)
    assert crit_plt is not None, "Missing Grade 4 Critical Thrombocytopenia flag"


# ── 6. Note Approval & Auth Honesty ────────────────────────────────────
def test_e2e_note_approval_and_auth_honesty():
    # Persist a test round
    payload = {
        "patient_id": "104",
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. Platelets 45000.",
        "images": [],
    }
    status, r_extract, _ = request_json(f"{BASE_BACKEND}/api/v1/rounds/extract", method="POST", data=payload)
    assert status == 200
    round_id = r_extract.get("round_id")

    # Spoofed client headers must NOT be trusted
    spoof_headers = {"X-Verified-User": "Dr. Attending Hacker, MD", "X-Authenticated-Clinician": "hacker"}
    status, approve_resp, _ = request_json(
        f"{BASE_BACKEND}/api/v1/rounds/{round_id}/approve",
        method="POST",
        data={"approved_by": "Dr. Hacker, MD"},
        headers=spoof_headers,
    )
    assert status == 200
    assert approve_resp.get("status") == "approved"
    assert approve_resp.get("approved_by") == "unverified (client-supplied)"

    # Unknown round ID approval -> 404
    status_404, _, _ = request_json(f"{BASE_BACKEND}/api/v1/rounds/nonexistent-id-0000/approve", method="POST", data={})
    assert status_404 == 404


# ── 7. CORS Security Headers ───────────────────────────────────────────
def test_e2e_cors_headers():
    status, _, cors_allowed = request_json(f"{BASE_BACKEND}/health", headers={"Origin": "http://localhost:3000"})
    assert cors_allowed.get("access-control-allow-origin") == "http://localhost:3000"

    status, _, cors_disallowed = request_json(f"{BASE_BACKEND}/health", headers={"Origin": "http://malicious-site.com"})
    assert cors_disallowed.get("access-control-allow-origin") != "http://malicious-site.com"


# ── 8. Longitudinal Patient Analytics ──────────────────────────────────
def test_e2e_patient_analytics():
    status, analytics, _ = request_json(f"{BASE_BACKEND}/api/v1/analytics/104")
    assert status == 200
    assert len(analytics.get("trajectories", [])) >= 2
    assert len(analytics.get("safety_alerts", [])) >= 1
    assert len(analytics.get("guidelines", [])) >= 1


def run():
    print("=" * 60)
    print(" ROUNDSAI COMPREHENSIVE FULL-SYSTEM VERIFICATION")
    print("=" * 60)
    if not _is_server_running():
        print("Backend server is not running on http://localhost:8000. Skipping live run.")
        sys.exit(0)

    test_e2e_frontend_routes()
    test_e2e_backend_health_and_voice()
    test_e2e_patients_census_crud()
    test_e2e_clinical_autocorrect()
    test_e2e_round_extraction_and_sentinels()
    test_e2e_note_approval_and_auth_honesty()
    test_e2e_cors_headers()
    test_e2e_patient_analytics()
    print("ALL FULL-SYSTEM INTEGRATION TESTS PASSED (100% OK)!")


if __name__ == "__main__":
    run()
