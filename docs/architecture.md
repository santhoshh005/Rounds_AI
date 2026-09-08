# 🏛️ RoundsAI System Architecture

RoundsAI is architected around a privacy-first, multimodal clinical workflow designed for inpatient oncology wards.

---

## 1. High-Level Architectural Flow

```mermaid
flowchart TB
    subgraph ClientLayer["1. Clinical Client Tier (Next.js 15 App Router)"]
        Mobile["📱 Bedside Mobile Companion\n(/mobile)\n• Local Audio MediaRecorder Buffer\n• Native Camera File Input\n• Patient Context Selector\n• Bedside Sync Trigger"]
        Desktop["💻 Doctor Assessment Station\n(/)\n• Live Bedside Sync Sentinel (Polling)\n• 1-Click Bedside Round Ingestion\n• CTCAE Safety Sentinel Alerts\n• Formatted SOAP Note Editor & Sign-off"]
        Analytics["📊 Longitudinal Patient Analytics\n(/analytics)\n• Dynamic Round Cache Integration\n• CTCAE v5.0 Toxicity Recalculation\n• ANC Nadir & Recovery Trajectory\n• Chemo Dose Reduction Advisor"]
    end

    subgraph APILayer["2. FastAPI Application Boundary (:8000)"]
        Router["Core FastAPI HTTP Router\n• POST /api/v1/voice/transcribe\n• POST /api/v1/clinical/autocorrect\n• POST /api/v1/rounds/extract\n• GET  /api/v1/rounds/latest\n• GET  /api/v1/rounds/{round_id}\n• GET  /api/v1/analytics/{patient_id}\n• GET  /api/v1/patients"]
    end

    subgraph BrainLayer["3. Clinical Intelligence & Multi-Agent Brain"]
        Whisper["🎙️ Local Whisper Engine\n(faster-whisper base-int8 on CPU)\n• Zero external cloud egress\n• Oncology lexicon priming"]
        AutoCorrect["✨ Oncology Phonetic Normalizer\n• 120+ Chemotherapy & Lab Rules\n• Homophone & Acoustic Normalization\n• Zero-Hallucination Fallback"]
        Multimodal["📷 Vision / OCR Extractor\n• Paper lab printout extraction\n• Multimodal CBC table parser"]
        CTCAE["🧪 CTCAE v5.0 Toxicity Engine\n• Baseline vs Current Lab Delta\n• Grade 1-4 Myelosuppression Nadir"]
        Sentinel["🚨 Safety Sentinel System\n• Febrile Neutropenia Emergency Protocol\n• Severe Thrombocytopenia Alert\n• NCCN 20% Dose Reduction Rule"]
        SOAP["📝 Clinical SOAP Note Generator\n• Standardized Oncology Documentation\n• Source Provenance & NCCN Citations"]
    end

    subgraph DataLayer["4. Persistence & Evidence Repository"]
        Cache["💾 Local Round Store & SQLite Cache\n• _LOCAL_ROUNDS_STORE index\n• In-memory fast round lookup\n• Round audit trail persistence"]
        Guidelines["📚 Curated Guidelines Database\n• ASCO / IDSA Febrile Neutropenia Protocol\n• NCCN Colorectal & Lymphoma Guidelines"]
    end

    Mobile -->|"POST /api/v1/voice/transcribe"| Router
    Mobile -->|"POST /api/v1/rounds/extract"| Router
    Desktop -->|"GET /api/v1/rounds/latest"| Router
    Desktop -->|"POST /api/v1/rounds/extract"| Router
    Analytics -->|"GET /api/v1/analytics/{id}"| Router

    Router --> Whisper
    Router --> AutoCorrect
    Router --> Multimodal
    Router --> CTCAE
    Router --> Sentinel
    Router --> SOAP

    CTCAE --> Cache
    Sentinel --> Guidelines
    SOAP --> Guidelines
    SOAP --> Cache
    Cache --> Router
```

---

## 2. Component Breakdown

### A. Bedside Mobile Companion (`/mobile`)
- Optimized for mobile handheld devices at the patient bedside.
- Captures audio via HTML5 `MediaRecorder` or native Web Speech API.
- Captures paper lab sheets, pathology reports, and vital monitors using device camera.
- Transmits complete payload (`patient_id`, `transcript`, `images`) to backend with 1-tap confirmation feedback.

### B. Doctor Assessment Station (`/`)
- Desktop workstation for attending oncologists.
- Features a **live background sentinel** checking for transmitted bedside rounds every 8 seconds.
- Displays a prominent alert banner with 1-click **"Load into Assessment Station"** action.
- Directly populates bedside findings, CTCAE evaluation flags, and drafts the clinical SOAP note.

### C. On-Device Speech Pipeline (`faster-whisper`)
- Zero external API costs and 100% HIPAA/hospital network privacy.
- Uses `faster-whisper` base-int8 model quantized for sub-second CPU inference.
- Employs an oncology-specific vocabulary prompt (`initial_prompt`) to prime the acoustic model on drug regimens (`mFOLFOX6`, `FOLFIRINOX`, `R-CHOP`, `ANC`, `Platelets`, `CTCAE`).

### D. Clinical Phonetic Normalizer (`backend/services/clinical_autocorrect.py`)
- Standardizes over 120 specialized oncology terms, laboratory metrics, and chemotherapy protocols.
- Fixes phonetic homophones (e.g., *"fall fox"* $\rightarrow$ **mFOLFOX6**, *"carbo taxol"* $\rightarrow$ **Carboplatin + Paclitaxel**).
- Fallback to Gemini 2.5 Flash at `temperature=0.0` with strict zero-hallucination prompting.
- Clinician UI displays a 1-click **Undo** banner for full clinician oversight.

### E. Automated CTCAE v5.0 & Clinical Safety Sentinels
- Compares extracted laboratory metrics against patient baseline values.
- Evaluates Grade 1–4 toxicities according to the Common Terminology Criteria for Adverse Events (CTCAE v5.0):
  - **Grade 3 Neutropenia**: $500 \le \text{ANC} < 1000$ /µL
  - **Grade 4 Severe Neutropenia**: $\text{ANC} < 500$ /µL
- **Emergency Sentinel**: Flags **Febrile Neutropenia** when fever ($\ge 38.3^\circ\text{C}$ or sustained $\ge 38.0^\circ\text{C}$) coincides with $\text{ANC} < 1000$ /µL. Urgently recommends blood cultures and empiric antipseudomonal IV beta-lactams (*Cefepime 2g IV q8h*) within 60 minutes.

### F. Longitudinal Patient Analytics (`/analytics`)
- Aggregates rounds from in-memory cache (`_LOCAL_ROUNDS_STORE`) and database.
- Plots cycle-over-cycle laboratory trends for ANC, WBC, and Platelets.
- Recommends NCCN guideline-concordant dose modifications (e.g., 20% dose reduction for subsequent cycles upon Grade 3/4 nadir).
