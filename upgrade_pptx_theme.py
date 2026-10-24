import zipfile
import xml.etree.ElementTree as ET
import os
import shutil

TEMPLATE_PATH = r"C:\Users\saisa\Downloads\Health-a-thon 2026 Submission Template (1).pptx"
OUTPUT_PATH = r"C:\Users\saisa\Downloads\Health-a-thon 2026 Final Submission - RoundsAI (Modern Theme).pptx"

A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

ET.register_namespace("a", A_NS)
ET.register_namespace("p", P_NS)
ET.register_namespace("r", R_NS)

SLIDE_DATA = {
    2: [
        ("Team Lead: Gaddam Sai Santhosh (Full-Stack AI Systems Engineer)",
         "Architected and implemented the end-to-end clinical stack: on-device Whisper voice pipeline, multimodal lab OCR, CTCAE v5.0 grading engine, real-time SSE live sync, and hospital-grade Next.js 15 workstation."),
        ("Doctor Partner: Consultant Medical Oncologist / Inpatient Ward Attending",
         "Co-designed clinical ward workflows, validated CTCAE v5.0 myelosuppression thresholds, calibrated 120+ drug phonetic rules (mFOLFOX6, FOLFIRINOX, R-CHOP), and verified IDSA/ASCO 2018 febrile neutropenia screening criteria."),
        ("Organization & Clinical Setting",
         "Healthcare Engineering & Oncology Research Collaboration, focused on clinician documentation burnout reduction and medication safety in inpatient cancer care."),
    ],
    3: [
        ("The Clinical Challenge",
         "Inpatient cancer ward rounds require synthesizing spoken observations, printed CBC sheets, and cumulative toxicity calculations under intense time pressure. Clinicians spend over 20 minutes per patient on manual documentation."),
        ("Supporting Evidence & Clinical Realities",
         "Medical oncologists spend >45% of ward hours on EMR data entry. In neutropenic sepsis (Febrile Neutropenia), each hour of delay in empiric antibiotic administration increases 28-day mortality by ~8% (IDSA/ASCO 2018)."),
        ("Current Technology Gaps",
         "Generic speech-to-text tools fail on cancer drugs ('fall fox' for mFOLFOX6, 'carbo taxol' for Carboplatin/Paclitaxel). Commercial cloud speech APIs risk patient voice data egress and charge high per-minute recurring fees."),
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
        ("Core Functional Capabilities Running in Code",
         "1. Zero-Audio-Egress Whisper AI (local CPU faster-whisper, $0 API fees) | 2. 120+ oncology term phonetic normalizer ('our chop' -> R-CHOP) | 3. Multimodal Lab Sheet OCR (Gemini 2.5 Flash at temp 0.0) | 4. Automated CTCAE v5.0 Toxicity Grading | 5. Assistive Safety Sentinels (Febrile Neutropenia screening criteria)."),
        ("End-to-End User Journey",
         "Bedside audio & lab photo capture -> On-device transcription & phonetic correction -> Dual-channel SSE live sync -> Station review & CTCAE grading -> 1-click EMR export."),
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
    ]
}

def set_slide_background(cSld, hex_color):
    bg = cSld.find(f"{{{P_NS}}}bg")
    if bg is None:
        bg = ET.Element(f"{{{P_NS}}}bg")
        cSld.insert(0, bg)
    else:
        bg.clear()
    
    bgPr = ET.SubElement(bg, f"{{{P_NS}}}bgPr")
    solidFill = ET.SubElement(bgPr, f"{{{A_NS}}}solidFill")
    ET.SubElement(solidFill, f"{{{A_NS}}}srgbClr", val=hex_color)

def set_shape_fill_and_line(spPr, fill_color=None, line_color=None, line_width="12700", prst="roundRect"):
    if spPr is None:
        return
    prstGeom = spPr.find(f"{{{A_NS}}}prstGeom")
    if prstGeom is not None:
        prstGeom.set("prst", prst)
    
    # remove existing fill elements
    for child in list(spPr):
        if child.tag in [f"{{{A_NS}}}solidFill", f"{{{A_NS}}}noFill", f"{{{A_NS}}}gradFill", f"{{{A_NS}}}blipFill"]:
            spPr.remove(child)
            
    if fill_color:
        solidFill = ET.SubElement(spPr, f"{{{A_NS}}}solidFill")
        ET.SubElement(solidFill, f"{{{A_NS}}}srgbClr", val=fill_color)
        
    if line_color:
        for child in list(spPr):
            if child.tag == f"{{{A_NS}}}ln":
                spPr.remove(child)
        ln = ET.SubElement(spPr, f"{{{A_NS}}}ln", w=line_width)
        lnFill = ET.SubElement(ln, f"{{{A_NS}}}solidFill")
        ET.SubElement(lnFill, f"{{{A_NS}}}srgbClr", val=line_color)

def make_bullet_paragraph(bold_t, norm_t, sz_header="1250", sz_body="1150"):
    p = ET.Element(f"{{{A_NS}}}p")
    pPr = ET.SubElement(p, f"{{{A_NS}}}pPr", indent="-254000", lvl="0", marL="254000", marR="0", rtl="0", algn="l")
    ET.SubElement(pPr, f"{{{A_NS}}}spcBef").append(ET.Element(f"{{{A_NS}}}spcPts", val="120"))
    ET.SubElement(pPr, f"{{{A_NS}}}spcAft").append(ET.Element(f"{{{A_NS}}}spcPts", val="120"))
    
    buClr = ET.SubElement(pPr, f"{{{A_NS}}}buClr")
    ET.SubElement(buClr, f"{{{A_NS}}}srgbClr", val="0284C7")  # Medical cyan bullet dot
    ET.SubElement(pPr, f"{{{A_NS}}}buSzPts", val="1200")
    ET.SubElement(pPr, f"{{{A_NS}}}buFont", typeface="Arial")
    ET.SubElement(pPr, f"{{{A_NS}}}buChar", char="•")
    
    # Bold header run
    r1 = ET.SubElement(p, f"{{{A_NS}}}r")
    rPr1 = ET.SubElement(r1, f"{{{A_NS}}}rPr", b="1", sz=sz_header)
    ET.SubElement(rPr1, f"{{{A_NS}}}solidFill").append(ET.Element(f"{{{A_NS}}}srgbClr", val="0F172A"))  # Deep navy
    ET.SubElement(rPr1, f"{{{A_NS}}}latin", typeface="Segoe UI")
    t1 = ET.SubElement(r1, f"{{{A_NS}}}t")
    t1.text = bold_t + ": " if norm_t else bold_t
    
    # Normal body run
    if norm_t:
        r2 = ET.SubElement(p, f"{{{A_NS}}}r")
        rPr2 = ET.SubElement(r2, f"{{{A_NS}}}rPr", b="0", sz=sz_body)
        ET.SubElement(rPr2, f"{{{A_NS}}}solidFill").append(ET.Element(f"{{{A_NS}}}srgbClr", val="334155"))  # Slate 700
        ET.SubElement(rPr2, f"{{{A_NS}}}latin", typeface="Segoe UI")
        t2 = ET.SubElement(r2, f"{{{A_NS}}}t")
        t2.text = norm_t
        
    return p

def upgrade_presentation():
    temp_dir = r"C:\Users\saisa\Downloads\pptx_temp_theme"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    with zipfile.ZipFile(TEMPLATE_PATH, "r") as z:
        z.extractall(temp_dir)

    # ──────────────────────────────────────────────────────────────────────────
    # 1. UPGRADE SLIDE 1 (Executive Keynote Dark Title Theme)
    # ──────────────────────────────────────────────────────────────────────────
    s1_path = os.path.join(temp_dir, "ppt", "slides", "slide1.xml")
    tree1 = ET.parse(s1_path)
    root1 = tree1.getroot()
    cSld1 = root1.find(f"{{{P_NS}}}cSld")
    set_slide_background(cSld1, "0F172A")  # Deep surgical navy

    for sp in root1.iter(f"{{{P_NS}}}sp"):
        t_nodes = sp.findall(f".//{{{A_NS}}}t")
        full_text = "".join([t.text or "" for t in t_nodes])
        spPr = sp.find(f"{{{P_NS}}}spPr")
        
        if "FINAL SUBMISSION" in full_text:
            for t in t_nodes:
                t.text = "HEALTH-A-THON 2026  •  PHASE 2 FINAL SUBMISSION"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1300")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "38BDF8")  # Vibrant sky blue
        elif "[Solution Name]" in full_text:
            for t in t_nodes:
                if "[Solution Name]" in (t.text or ""):
                    t.text = "RoundsAI"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "5200")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "FFFFFF")  # Pure white
        elif "[Short subtitle" in full_text:
            for t in t_nodes:
                if "[Short subtitle" in (t.text or ""):
                    t.text = "Multimodal Inpatient Oncology Ward Copilot & Real-Time Decision Support"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1700")
                rPr.set("b", "0")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "BAE6FD")  # Soft cyan
        elif "TEAM NAME" in full_text:
            for t in t_nodes:
                if "TEAM NAME" in (t.text or ""):
                    t.text = "TEAM: RoundsAI  |  LEAD: Gaddam Sai Santhosh"
                elif "[Insert team name]" in (t.text or ""):
                    t.text = ""
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1250")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "F8FAFC")
            set_shape_fill_and_line(spPr, fill_color="1E293B", line_color="334155", line_width="12700")
        elif "TEAM CODE" in full_text:
            for t in t_nodes:
                if "TEAM CODE" in (t.text or ""):
                    t.text = "TEAM CODE: [Insert Team Code]  |  TOP 150 TEAMS"
                elif "[Insert team code]" in (t.text or ""):
                    t.text = ""
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1250")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "38BDF8")
            set_shape_fill_and_line(spPr, fill_color="1E293B", line_color="334155", line_width="12700")
        elif "TITLE" in full_text:
            for t in t_nodes:
                t.text = "HEALTH-A-THON 2026 • OFFICIAL SUBMISSION"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "64748B")
    tree1.write(s1_path, encoding="utf-8", xml_declaration=True)

    # ──────────────────────────────────────────────────────────────────────────
    # 2. UPGRADE CONTENT SLIDES (Slides 2 to 12) - Clean Clinical Canvas
    # ──────────────────────────────────────────────────────────────────────────
    for s_idx in range(2, 13):
        s_path = os.path.join(temp_dir, "ppt", "slides", f"slide{s_idx}.xml")
        tree = ET.parse(s_path)
        root = tree.getroot()
        cSld = root.find(f"{{{P_NS}}}cSld")
        set_slide_background(cSld, "F8FAFC")  # Modern slate off-white canvas
        
        bullets = SLIDE_DATA.get(s_idx, [])
        
        for sp in root.iter(f"{{{P_NS}}}sp"):
            spPr = sp.find(f"{{{P_NS}}}spPr")
            txBody = sp.find(f"{{{P_NS}}}txBody")
            if txBody is None:
                continue
            
            t_nodes = sp.findall(f".//{{{A_NS}}}t")
            full_text = "".join([t.text or "" for t in t_nodes]).strip()
            
            # Check Title Shape
            if full_text in [
                "Team Overview & Background", "Problem Statement and Supporting Evidence",
                "Target Users and Use Case", "Solution Overview, Key Features &", "Solution Overview, Key Features & Impact - Max 2 Slides",
                "Solution Working MVP / Demo", "Technology, Tools and AI Approach-",
                "Build Sprint Journey and Progress", "Evaluation and User Validation",
                "Safety and Responsible AI", "Deployment, Cost and Sustainability Plan",
                "What Next? Plans to take initiative forward (if any)"
            ] or ("Team Overview" in full_text and len(full_text) < 40):
                for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                    rPr.set("sz", "2500")
                    rPr.set("b", "1")
                    for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                        srgb.set("val", "0F172A")  # Deep surgical navy
                    for latin in rPr.findall(f".//{{{A_NS}}}latin"):
                        latin.set("typeface", "Segoe UI")
            
            # Check Header / Eyebrow Banner
            elif "HEALTH-A-THON 2026" in full_text and ("FINAL SUBMISSION" in full_text or "SUBMISSION" in full_text):
                for t in t_nodes:
                    if "HEALTH-A-THON" in (t.text or ""):
                        t.text = "HEALTH-A-THON 2026  •  PHASE 2 FINAL SUBMISSION"
                for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                    rPr.set("sz", "850")
                    rPr.set("b", "1")
                    for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                        srgb.set("val", "0284C7")  # Medical cyan
                    for latin in rPr.findall(f".//{{{A_NS}}}latin"):
                        latin.set("typeface", "Segoe UI")
            
            # Check Content Shape
            elif ("Team Lead:" in full_text or "The Healthcare" in full_text or 
                  "Target Users:" in full_text or "Solution Overview:" in full_text or
                  "Working Source Code" in full_text or "faster-whisper" in full_text or
                  "4-Week Milestone" in full_text or "88 backend" in full_text or
                  "In local mode" in full_text or "Healthcare Deployment" in full_text or
                  "Clinical Pilot:" in full_text or len(bullets) > 0 and len(txBody.findall(f"{{{A_NS}}}p")) >= 2):
                
                # Transform content container into elegant white floating card
                if spPr is not None:
                    set_shape_fill_and_line(spPr, fill_color="FFFFFF", line_color="CBD5E1", line_width="15875", prst="roundRect")
                    
                    xfrm = spPr.find(f"{{{A_NS}}}xfrm")
                    if xfrm is not None:
                        off = xfrm.find(f"{{{A_NS}}}off")
                        ext = xfrm.find(f"{{{A_NS}}}ext")
                        if off is not None:
                            off.set("x", "600000")
                            off.set("y", "1450000")
                        if ext is not None:
                            ext.set("cx", "10992000")
                            ext.set("cy", "4750000")
                
                bodyPr = txBody.find(f"{{{A_NS}}}bodyPr")
                if bodyPr is not None:
                    bodyPr.set("tIns", "220000")
                    bodyPr.set("bIns", "220000")
                    bodyPr.set("lIns", "280000")
                    bodyPr.set("rIns", "280000")
                
                if bullets:
                    for p in list(txBody.findall(f"{{{A_NS}}}p")):
                        txBody.remove(p)
                    for bold_t, norm_t in bullets:
                        txBody.append(make_bullet_paragraph(bold_t, norm_t, sz_header="1250", sz_body="1150"))

        tree.write(s_path, encoding="utf-8", xml_declaration=True)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. UPGRADE SLIDE 13 (Executive Closing Slide Theme)
    # ──────────────────────────────────────────────────────────────────────────
    s13_path = os.path.join(temp_dir, "ppt", "slides", "slide13.xml")
    tree13 = ET.parse(s13_path)
    root13 = tree13.getroot()
    cSld13 = root13.find(f"{{{P_NS}}}cSld")
    set_slide_background(cSld13, "0F172A")  # Deep surgical navy

    for sp in root13.iter(f"{{{P_NS}}}sp"):
        t_nodes = sp.findall(f".//{{{A_NS}}}t")
        full_text = "".join([t.text or "" for t in t_nodes]).strip()
        spPr = sp.find(f"{{{P_NS}}}spPr")
        
        if "Thank you" in full_text:
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "4800")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "FFFFFF")
        elif "RoundsAI" in full_text or "Team Code:" in full_text:
            for t in t_nodes:
                if "RoundsAI" in (t.text or ""):
                    t.text = "RoundsAI (Gaddam Sai Santhosh)  •  Team Code: [Insert Team Code]"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1800")
                rPr.set("b", "1")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "38BDF8")
        elif "https://github.com" in full_text or "[Contact" in full_text:
            for t in t_nodes:
                if "[Contact" in (t.text or ""):
                    t.text = "[Contact Email]  |  [Live MVP Link]  |  https://github.com/santhoshh005/Rounds_AI"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                rPr.set("sz", "1300")
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "BAE6FD")
            set_shape_fill_and_line(spPr, fill_color="1E293B", line_color="334155", line_width="12700")
        elif "Health-a-thon 2026" in full_text and ("FINAL" in full_text or "TITLE" in full_text):
            for t in t_nodes:
                t.text = "HEALTH-A-THON 2026  •  TOP 150 TEAMS FINAL SUBMISSION"
            for rPr in sp.findall(f".//{{{A_NS}}}rPr"):
                for srgb in rPr.findall(f".//{{{A_NS}}}srgbClr"):
                    srgb.set("val", "64748B")
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
    print(f"SUCCESS: Upgraded PPTX Theme at {OUTPUT_PATH}")

if __name__ == "__main__":
    upgrade_presentation()
