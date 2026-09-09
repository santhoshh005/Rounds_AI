import urllib.request
import json
import sys

def run_tests():
    print("==================================================")
    print("   ROUNDSAI END-TO-END FEATURE VERIFICATION       ")
    print("==================================================")

    # 1. Health Check
    print("\n[1/6] Health Check:")
    with urllib.request.urlopen("http://localhost:8000/health") as res:
        health = json.loads(res.read().decode())
        print(f"  Status: {health.get('status')} | Version: {health.get('version')}")
        assert health.get("status") == "ok"

    # 2. Patient Census
    print("\n[2/6] Patient Census API (GET /api/v1/patients):")
    with urllib.request.urlopen("http://localhost:8000/api/v1/patients") as res:
        patients = json.loads(res.read().decode())
        print(f"  Total Patients Loaded: {len(patients)}")
        for p in patients[:3]:
            pid = p.get("patient_id") or p.get("id")
            print(f"  - Patient #{pid}: {p.get('name')} | Diagnosis: {p.get('diagnosis')} | Regimen: {p.get('regimen')}")
        assert len(patients) >= 3

    # 3. Clinical Phonetic Auto-Correct
    print("\n[3/6] Clinical Auto-Correct (POST /api/v1/clinical/autocorrect):")
    test_phrase = "patient on fall fox cycle 3 developed fever anc nine hundred wbc twenty one hundred"
    body = json.dumps({"text": test_phrase}).encode()
    req = urllib.request.Request("http://localhost:8000/api/v1/clinical/autocorrect", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        ac = json.loads(res.read().decode())
        corrected = ac.get("corrected_text")
        terms = len(ac.get("changes", []))
        print(f"  Input:     '{test_phrase}'")
        print(f"  Corrected: '{corrected}'")
        print(f"  Terms Changed: {terms}")
        assert "mFOLFOX6" in corrected or "FOLFOX" in corrected
        assert "ANC 900" in corrected
        assert "WBC 2,100" in corrected

    # 4. Multimodal Round Extraction, CTCAE Grading & Safety Sentinels
    print("\n[4/6] Round Extraction & Sentinels (POST /api/v1/rounds/extract):")
    round_payload = {
        "patient_id": "104",
        "transcript": "Patient 104 is a 58-year-old male with colorectal cancer. Cycle 3 chemotherapy. Developed fever since yesterday, temp 38.4C. WBC 2100, ANC 900. Complaining of severe fatigue.",
        "images": []
    }
    body = json.dumps(round_payload).encode()
    req = urllib.request.Request("http://localhost:8000/api/v1/rounds/extract", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        extracted = json.loads(res.read().decode())
        round_id = extracted.get("round_id")
        extractions = extracted.get("extractions", {})
        flags = extracted.get("review_flags", [])
        draft_note = extracted.get("draft_note", "")
        print(f"  Generated Round ID: {round_id}")
        print(f"  Extracted Labs: {extractions.get('labs')}")
        print(f"  Review Flags Triggered: {len(flags)}")
        for f in flags:
            print(f"    - [{f.get('severity').upper()}] {f.get('message')}")
        assert round_id is not None
        assert any("fever" in f.get("message").lower() and ("anc" in f.get("message").lower() or "neutropen" in f.get("message").lower()) for f in flags)
        assert len(draft_note) > 50

    # 5. Live Sync API: Round Retrieval
    print("\n[5/6] Bedside Sync API (GET /api/v1/rounds/latest & /rounds/{id}):")
    with urllib.request.urlopen("http://localhost:8000/api/v1/rounds/latest?patient_id=104") as res:
        latest = json.loads(res.read().decode())
        latest_id = latest.get("round_id")
        print(f"  Latest Round for Pt #104: {latest_id}")
        assert latest_id == round_id

    with urllib.request.urlopen(f"http://localhost:8000/api/v1/rounds/{round_id}") as res:
        single = json.loads(res.read().decode())
        print(f"  Retrieved Round by ID: {single.get('round_id')} (status 200 OK)")
        assert single.get("round_id") == round_id

    # 6. Longitudinal Patient Analytics
    print("\n[6/6] Patient Longitudinal Analytics (GET /api/v1/analytics/104):")
    with urllib.request.urlopen("http://localhost:8000/api/v1/analytics/104") as res:
        analytics = json.loads(res.read().decode())
        patient = analytics.get("patient", {})
        pname = patient.get("name")
        trajectories = analytics.get("trajectories", [])
        safety_alerts = analytics.get("safety_alerts", [])
        guidelines = analytics.get("guidelines", [])
        synthesis = analytics.get("clinical_synthesis", "")
        print(f"  Patient: {pname} (MRN: {patient.get('id')})")
        print(f"  Trajectories Found: {[t.get('lab_name') for t in trajectories]}")
        print(f"  Safety Alerts: {[a.get('title') for a in safety_alerts]}")
        print(f"  Guidelines Count: {len(guidelines)}")
        print(f"  Clinical Synthesis: {synthesis[:80]}...")
        assert pname == "David Miller"
        assert len(trajectories) >= 2
        assert len(guidelines) >= 1

    print("\n==================================================")
    print("   ALL 6 FEATURE TEST SUITES PASSED (100% OK)     ")
    print("==================================================")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\nTEST FAILED WITH ERROR: {e}")
        sys.exit(1)
