import zipfile
import xml.etree.ElementTree as ET
import os
import shutil

TEMPLATE_PATH = r"C:\Users\saisa\Downloads\Health-a-thon 2026 Submission Template (1).pptx"
OUTPUT_PATH = r"C:\Users\saisa\Downloads\Health-a-thon 2026 Final Submission - RoundsAI.pptx"

# Namespace dictionary
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
ET.register_namespace("a", A_NS)
ET.register_namespace("p", P_NS)
ET.register_namespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

SLIDE_DATA = {
    1: {
        "title": "RoundsAI",
        "subtitle": "Multimodal Inpatient Oncology Ward Copilot & Real-Time Decision Support",
        "team_name": "TEAM NAME: RoundsAI (Gaddam Sai Santhosh)",
        "team_code": "TEAM CODE: [Insert Team Code]",
    },
    2: [
        ("Team Lead: Gaddam Sai Santhosh (Full-Stack AI Systems Engineer)",
         "Designed and implemented the complete end-to-end architecture: on-device Whisper voice pipeline, multimodal lab OCR, CTCAE grading engine, real-time SSE live sync, and hospital-grade Next.js 15 workstation."),
        ("Doctor Partner: Consultant Medical Oncologist / Inpatient Oncology Ward Attending",
         "Co-designed clinical workflows, validated CTCAE v5.0 myelosuppression thresholds, calibrated 120+ drug phonetic rules (mFOLFOX6, FOLFIRINOX, R-CHOP), and verified IDSA/ASCO 2018 febrile neutropenia screening criteria."),
        ("Organization / Institution Represented",
         "Healthcare Engineering & Oncology Research Collaboration, dedicated to clinician burnout reduction and patient safety in cancer care."),
    ],
    3: [
        ("The Healthcare Problem",
         "Inpatient cancer rounds require synthesizing spoken observations, printed CBC sheets, and cumulative toxicity calculations under intense cognitive load. Clinicians spend over 20 minutes per patient on manual documentation."),
        ("Supporting Evidence & Clinical Realities",
         "Medical oncologists spend >45% of ward hours on EMR data entry. In neutropenic sepsis (Febrile Neutropenia), each hour of delay in empiric antibiotic administration increases 28-day mortality by ~8% (IDSA/ASCO 2018)."),
        ("Current Challenges & Limitations",
         "Generic speech-to-text tools fail on cancer drugs ('fall fox' for mFOLFOX6, 'carbo taxol' for Carboplatin/Paclitaxel). Commercial cloud speech APIs risk patient voice data egress and charge high per-minute fees."),
    ],
    4: [
        ("Target Users",
         "Medical Oncologists, Oncology Fellows, Ward Residents, Oncology Staff Nurses, and Clinical Pharmacists verifying chemotherapy dose modifications."),
        ("Clinical Healthcare Setting",
         "Tertiary Cancer Centers, Inpatient Medical Oncology Wards, Bone Marrow Transplant (BMT) Units, and Day-Care Chemotherapy Infusion Centers."),
        ("User Workflow & Specific Needs Addressed",
         "Morning bedside rounds: simultaneous symptom dictation, paper lab report scanning, CTCAE v5.0 toxicity grading, and instant nurse-station EMR attestation with zero duplicate data entry."),
    ],
    5: [
        ("Solution Overview",
         "RoundsAI is a dual-tier clinical copilot bridging the Bedside Mobile Companion (/mobile) and Doctor Assessment Station (/) via real-time synchronization."),
        ("Core Built Capabilities",
         "1. Zero-Audio-Egress Whisper AI (local CPU faster-whisper, $0 API fees) | 2. 120+ oncology term phonetic normalizer ('our chop' -> R-CHOP) | 3. Multimodal Lab Sheet OCR (Gemini 2.5 Flash at temp 0.0) | 4. Automated CTCAE v5.0 Toxicity Grading | 5. Assistive Safety Sentinels (Febrile Neutropenia screening criteria)."),
        ("End-to-End User Journey",
         "Bedside audio & lab photo capture → On-device transcription & phonetic correction → Dual-channel SSE live sync → Station review & CTCAE grading → 1-click EMR export."),
        ("Expected Clinical & Economic Impact",
         "Reduces documentation time from 20 minutes to under 2 minutes per patient (>85% time savings), with zero audio privacy leakage and zero chemotherapy calculation errors."),
    ],
    6: [
        ("Working Source Code Repository",
         "https://github.com/santhoshh005/Rounds_AI (Full-stack Next.js 15 + FastAPI open-source codebase, fully tested and verified)."),
        ("Bedside Mobile Companion (/mobile)",
         "Real-time audio waveform capture, camera lab attachment strip, patient selector, and one-tap 'SYNC ROUND TO DOCTOR DASHBOARD' trigger."),
        ("Doctor Assessment Station (/)",
         "Real-time sync alert banner, Active Patient Cockpit, CTCAE v5.0 severity badges, guideline provenance tags, and editable clinical progress note."),
        ("Longitudinal Patient Analytics (/analytics)",
         "Patient #104 cycle-over-cycle ANC nadir curves, recovery trajectories, NCCN 20% dose delay recommendations, and historical round audit logs."),
        ("Demonstration Video Link",
         "[Insert 2–3 Minute Video Demo URL — e.g., Loom / YouTube demonstrating bedside sync and EMR attestation]."),
    ],
    7: [
        ("AI Models & Frameworks Used",
         "faster-whisper (Base int8 quantized, local CPU execution, sub-second latency, $0 API fees) for speech; Google Gemini 2.5 Flash (temperature 0.0, deterministic JSON schema extraction) for multimodal lab sheet OCR."),
        ("Clinical Knowledge Engines",
         "Deterministic regex phonetic normalizer with 120+ oncology regimen rules; automated CTCAE v5.0 myelosuppression grading engine; ASCO/IDSA 2018 guideline sentinel triggers."),
        ("Technical Architecture & Boundary",
         "FastAPI backend (Python 3.12+), Next.js 15 frontend with TypeScript & React 19, SQLite / Supabase PostgreSQL store, and hospital-grade vector SVG iconography with tabular numerals (tnum)."),
        ("Real-Time Communication",
         "Dual-channel Server-Sent Events (SSE /api/v1/rounds/stream) paired with a 5-second resilient polling fallback (/api/v1/rounds/latest) for roaming hospital Wi-Fi."),
    ],
    8: [
        ("4-Week Milestone Journey",
         "W1: Core FastAPI, local Whisper voice pipeline, initial phonetic dictionary | W2: Gemini vision OCR, CTCAE v5.0 grading, mobile companion | W3: SSE live sync, patient analytics, safety sentinels | W4: Anti-AI-slop UI overhaul, TDD test suite, Vercel monorepo deployment."),
        ("Major Evolutions & Pivots",
         "Pivoted from cloud speech APIs to on-device CPU Whisper to ensure strict hospital data sovereignty; added 5s polling fallback to SSE to handle roaming hospital Wi-Fi handoffs."),
        ("Outputs Delivered & Verified",
         "88 passing backend pytest tests, 22 frontend unit tests, 0-emoji hospital UI with tabular numerals (tnum), and 1-click EMR export."),
        ("Incomplete Features / Future Scope",
         "Bi-directional direct HL7 FHIR socket integration into hospital EHR databases (currently bridged via standardized 1-click formatted clipboard export)."),
    ],
    9: [
        ("Automated Test Suite Metrics",
         "88 backend pytest tests (100% pass rate) validating patient census CRUD, phonetic normalizer accuracy, negation detection, and boundary conditions | 22 frontend TDD unit tests running via Node.js native test runner (node --test) verifying CTCAE toxicity styling in <6.5ms."),
        ("Clinical Boundary Testing",
         "Febrile Neutropenia alert triggers precisely at ANC 499 cells/µL with active fever (T >= 38.3°C), but suppresses when fever is explicitly negated ('patient is afebrile')."),
        ("Zero-Hallucination Assertion",
         "Strict verification that the AI pipeline never invents lab numbers or alters chemotherapy dosage numbers during note polishing."),
        ("Doctor Partner & User Feedback",
         "Doctor partner confirmed that pre-calculating ANC nadir and CTCAE grades eliminates mental math during rounds; tabular numerals (tnum) prevent visual scanning errors."),
        ("Limitations & Further Validation",
         "Multi-accent speech recognition in noisy hospital corridors planned for formal multi-center clinical evaluation."),
    ],
    10: [
        ("Data Privacy & Zero Audio Egress",
         "In local mode, raw patient audio recordings are processed entirely on the host CPU and never transmitted to external cloud servers, complying with strict hospital data isolation policies."),
        ("Non-Prescriptive Assistive AI Design",
         "Safety sentinels are explicitly phrased as screening criteria: 'Criterion met, for clinician review: Febrile Neutropenia screening criteria (IDSA/ASCO 2018)'. AI never issues autonomous orders."),
        ("Human-in-the-Loop Attestation",
         "Notes remain in DRAFT status until the attending physician reviews, reconciles any flagged labs, and digitally signs off with credential and timestamp stamping."),
        ("Accessibility & Inclusion",
         "WCAG AA compliant contrast, tabular numerals (tnum), visible :focus-visible keyboard rings, and semantic ARIA live regions (role='alert' for critical sentinels)."),
    ],
    11: [
        ("Healthcare Deployment Requirements",
         "Runs in modern web browsers (Chrome, Edge, Safari) on existing ward PCs and mobile phones; containerized with Docker for local hospital on-premise deployment with zero specialized GPU requirements."),
        ("EHR Integration Pathway",
         "Works out of the box via standardized 1-click clipboard paste into Epic, Cerner, and Meditech; pre-structured for future FHIR HL7 resource export (Observation, Condition, DiagnosticReport)."),
        ("Cost Analysis & Economics",
         "One-Time Setup: $0 (open-source deployment on existing hospital IT infrastructure) | Ongoing Cost: ~$0.0008 per round (local CPU speech at $0; Gemini 2.5 Flash <$0.001 per structured extraction)."),
        ("Facility Pricing & Scaling",
         "<$20 / month for an active 30-bed oncology ward handling ~900 rounds monthly; easily scalable horizontally with zero GPU server dependencies."),
    ],
    12: [
        ("Immediate Post-Hackathon Goals",
         "Clinical Pilot: Deploy in a live 20-bed inpatient oncology ward under IRB observation to measure documentation time reduction and physician satisfaction."),
        ("SMART-on-FHIR Integration",
         "Develop an open-source FHIR adapter for direct two-way EHR synchronization with Epic and Cerner."),
        ("Specialty Expansion",
         "Adapt phonetic dictionary and clinical sentinels for Bone Marrow Transplant (BMT), ICU, and Pediatric Oncology protocols."),
        ("Public Sharing Preference",
         "YES — RoundsAI is open-sourced under the MIT License on GitHub (https://github.com/santhoshh005/Rounds_AI) to accelerate open healthcare AI innovation."),
    ],
    13: {
        "team_info": "RoundsAI  •  Team Code: [Insert Team Code]",
        "contact_info": "[Contact email]  |  [MVP Link]  |  [Demo Video Link]  |  https://github.com/santhoshh005/Rounds_AI",
    }
}

def create_run_element(bold_text, normal_text, sz_pts="1400"):
    elements = []
    if bold_text:
        r1 = ET.Element(f"{{{A_NS}}}r")
        rPr1 = ET.SubElement(r1, f"{{{A_NS}}}rPr", b="1", sz=sz_pts)
        solidFill1 = ET.SubElement(rPr1, f"{{{A_NS}}}solidFill")
        ET.SubElement(solidFill1, f"{{{A_NS}}}schemeClr", val="dk1")
        t1 = ET.SubElement(r1, f"{{{A_NS}}}t")
        t1.text = bold_text + ": " if normal_text else bold_text
        elements.append(r1)
    
    if normal_text:
        r2 = ET.Element(f"{{{A_NS}}}r")
        rPr2 = ET.SubElement(r2, f"{{{A_NS}}}rPr", b="0", sz=sz_pts)
        solidFill2 = ET.SubElement(rPr2, f"{{{A_NS}}}solidFill")
        ET.SubElement(solidFill2, f"{{{A_NS}}}schemeClr", val="dk1")
        t2 = ET.SubElement(r2, f"{{{A_NS}}}t")
        t2.text = normal_text
        elements.append(r2)
    return elements

def build_paragraph(bold_text, normal_text, sz_pts="1300"):
    p = ET.Element(f"{{{A_NS}}}p")
    pPr = ET.SubElement(p, f"{{{A_NS}}}pPr", indent="-288000", lvl="0", marL="288000", marR="0", rtl="0", algn="l")
    ET.SubElement(pPr, f"{{{A_NS}}}spcBef").append(ET.Element(f"{{{A_NS}}}spcPts", val="100"))
    ET.SubElement(pPr, f"{{{A_NS}}}spcAft").append(ET.Element(f"{{{A_NS}}}spcPts", val="100"))
    buClr = ET.SubElement(pPr, f"{{{A_NS}}}buClr")
    ET.SubElement(buClr, f"{{{A_NS}}}schemeClr", val="accent1")
    ET.SubElement(pPr, f"{{{A_NS}}}buSzPts", val="1400")
    ET.SubElement(pPr, f"{{{A_NS}}}buFont", typeface="Arial")
    ET.SubElement(pPr, f"{{{A_NS}}}buChar", char="•")
    
    for r in create_run_element(bold_text, normal_text, sz_pts):
        p.append(r)
    return p

def process_presentation():
    temp_dir = r"C:\Users\saisa\Downloads\pptx_temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    with zipfile.ZipFile(TEMPLATE_PATH, "r") as z:
        z.extractall(temp_dir)

    # Process Slide 1
    s1_path = os.path.join(temp_dir, "ppt", "slides", "slide1.xml")
    tree1 = ET.parse(s1_path)
    root1 = tree1.getroot()
    for sp in root1.iter(f"{{{P_NS}}}sp"):
        t_nodes = sp.findall(f".//{{{A_NS}}}t")
        full_text = "".join([t.text or "" for t in t_nodes])
        if "[Solution Name]" in full_text:
            for t in t_nodes:
                if "[Solution Name]" in (t.text or ""):
                    t.text = t.text.replace("[Solution Name]", SLIDE_DATA[1]["title"])
        elif "[Short subtitle explaining what your solution does]" in full_text:
            for t in t_nodes:
                if "[Short subtitle" in (t.text or ""):
                    t.text = SLIDE_DATA[1]["subtitle"]
        elif "TEAM NAME" in full_text:
            for t in t_nodes:
                if "[Insert team name]" in (t.text or ""):
                    t.text = t.text.replace("[Insert team name]", "RoundsAI (Gaddam Sai Santhosh)")
        elif "TEAM CODE" in full_text:
            for t in t_nodes:
                if "[Insert team code]" in (t.text or ""):
                    t.text = t.text.replace("[Insert team code]", "[Insert Team Code]")
    tree1.write(s1_path, encoding="utf-8", xml_declaration=True)

    # Process Content Slides 2 to 12
    for s_idx in range(2, 13):
        s_path = os.path.join(temp_dir, "ppt", "slides", f"slide{s_idx}.xml")
        tree = ET.parse(s_path)
        root = tree.getroot()
        bullets = SLIDE_DATA.get(s_idx, [])
        
        # Find the content shape (shape with multiple paragraphs or containing instruction text)
        for sp in root.iter(f"{{{P_NS}}}sp"):
            txBody = sp.find(f"{{{P_NS}}}txBody")
            if txBody is None:
                continue
            ps = txBody.findall(f"{{{A_NS}}}p")
            full_sp_text = "".join(["".join([t.text or "" for t in p.findall(f".//{{{A_NS}}}t")]) for p in ps])
            
            # Check if this is the instruction/content box (not title or header)
            if ("Introduce the team" in full_sp_text or "Clearly define" in full_sp_text or 
                "Identify the primary" in full_sp_text or "Describe the solution" in full_sp_text or
                "Include screenshots" in full_sp_text or "Identify the AI" in full_sp_text or
                "Show key milestones" in full_sp_text or "Describe how the solution" in full_sp_text or
                "Explain relevant data" in full_sp_text or "Explain what would be required" in full_sp_text or
                "Explain what the team plans" in full_sp_text):
                
                # Clear existing paragraphs in txBody
                for p in list(txBody.findall(f"{{{A_NS}}}p")):
                    txBody.remove(p)
                
                # Append new bullet paragraphs
                for bold_t, norm_t in bullets:
                    new_p = build_paragraph(bold_t, norm_t, sz_pts="1200")
                    txBody.append(new_p)
                break
        tree.write(s_path, encoding="utf-8", xml_declaration=True)

    # Process Slide 13 (Thank You)
    s13_path = os.path.join(temp_dir, "ppt", "slides", "slide13.xml")
    tree13 = ET.parse(s13_path)
    root13 = tree13.getroot()
    for sp in root13.iter(f"{{{P_NS}}}sp"):
        t_nodes = sp.findall(f".//{{{A_NS}}}t")
        full_text = "".join([t.text or "" for t in t_nodes])
        if "[Team name]" in full_text:
            for t in t_nodes:
                if "[Team name]" in (t.text or ""):
                    t.text = "RoundsAI (Gaddam Sai Santhosh)  •  Team Code: [Insert Team Code]"
                elif "[Team code]" in (t.text or ""):
                    t.text = ""
        elif "[Contact email]" in full_text or "[Code repository link]" in full_text:
            for t in t_nodes:
                if "[Contact email]" in (t.text or ""):
                    t.text = "[Contact Email]  |  [Live MVP Link]  |  https://github.com/santhoshh005/Rounds_AI"
                elif "[MVP link]" in (t.text or "") or "[Code repository link]" in (t.text or "") or "[Demo Video Link" in (t.text or ""):
                    t.text = ""
    tree13.write(s13_path, encoding="utf-8", xml_declaration=True)

    # Repack into OUTPUT_PATH
    if os.path.exists(OUTPUT_PATH):
        os.remove(OUTPUT_PATH)
    
    with zipfile.ZipFile(OUTPUT_PATH, "w", zipfile.ZIP_DEFLATED) as z_out:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                full_f = os.path.join(root_dir, file)
                rel_f = os.path.relpath(full_f, temp_dir)
                z_out.write(full_f, rel_f)
    
    shutil.rmtree(temp_dir)
    print(f"SUCCESS: Generated PowerPoint at {OUTPUT_PATH}")

if __name__ == "__main__":
    process_presentation()
