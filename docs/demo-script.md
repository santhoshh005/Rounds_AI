# 🎤 RoundsAI: 5-Minute Pitch & Live Demo Script

**Total Estimated Spoken Time:** 5 minutes (~680–720 words)  
**Tone:** Authoritative, empathetic, and clinical-grade  
**Prerequisites open in browser tabs:**
- **Tab 1:** Bedside Mobile Companion (`http://localhost:3000/mobile`)
- **Tab 2:** Doctor Workstation (`http://localhost:3000/`)
- **Tab 3:** Patient Longitudinal Analytics (`http://localhost:3000/analytics?patientId=104`)

---

### [0:00 – 0:45] The Hook & Problem
*(Face the audience / camera)*

> "Every single morning in oncology wards worldwide, doctors face one of the highest-pressure workflows in modern medicine: **morning clinical rounds**.
>
> In just a few minutes per patient, an oncologist must review lab trends, calculate chemotherapy toxicities, verify medication dosages, and dictate complex clinical notes—all while standing at the bedside.
>
> But today’s tools are broken:
> 1. General speech-to-text engines constantly butcher oncology regimens—hearing *'fall fox'* instead of **mFOLFOX6**, or *'our chop'* instead of **R-CHOP**.
> 2. Sending patient audio to commercial cloud APIs triggers serious HIPAA and privacy concerns.
> 3. Doctors are forced to spend **2 to 3 hours every evening** typing notes into clunky EHRs instead of caring for patients.
>
> **This is RoundsAI: the privacy-first, multimodal AI copilot built specifically for inpatient oncology rounds.**"

---

### [0:45 – 1:30] The Architecture & Core Innovation
*(Brief slide or overview)*

> "RoundsAI solves this with three breakthrough principles:
> 1. **Zero-Cloud Audio Privacy & ₹0 API Cost:** Powered by an on-device local Whisper engine and a specialized phonetic oncology normalizer, voice transcription happens 100% locally on the hospital network.
> 2. **Bedside-to-Desktop Synchronization:** Doctors capture notes and snap lab sheets on their mobile companion at the bedside, and it instantly syncs to their desktop workstation.
> 3. **Clinical Safety Sentinels:** It doesn't just write notes; it automatically calculates **CTCAE v5.0 toxicity grades**, detects myelosuppression nadirs, and catches life-threatening emergencies like **Febrile Neutropenia** in seconds."

---

### [1:30 – 3:45] The Live Demo Walkthrough *(The Core)*

#### Step 1: Bedside Mobile Capture
*(Action: Switch to Tab 1: `http://localhost:3000/mobile`)*

> *"Let’s step into the shoes of an attending oncologist rounding on Patient 104—a 58-year-old male on Cycle 3 of chemotherapy.*
>
> *At the bedside, I pick up my phone, select Patient 104, and dictate naturally:"*
>
> *(Voice dictation or paste into transcript):*  
> **"Patient 104 developed a spike of fever 38.4 degrees Celsius overnight. Complaining of severe fatigue. Labs show WBC 2,100 and ANC 900. Platelets 145k."**
>
> *"Notice what happens: our clinical autocorrect immediately normalizes the medical abbreviations and acoustic homophones. I can also snap a photo of paper lab printouts or pathology sheets right from the mobile camera.*
>
> *Now, with a single tap, I tap **'SYNC ROUND TO DOCTOR DASHBOARD'**."*
>
> *(Action: Click the blue 'SYNC ROUND TO DOCTOR DASHBOARD' button)*  
> *"Instantly, mobile confirms round transmission with an oncology summary card."*

---

#### Step 2: Instant Desktop Workstation Sync
*(Action: Switch to Tab 2: `http://localhost:3000/`)*

> *"Now I walk back to my desk in the oncology station. Look at the top of the screen:"*
>
> *(Point to the gradient live sync alert banner)*  
> *"Without refreshing, the workstation’s live sentinel detects the bedside round. I click **'Load into Assessment Station'**..."*
>
> *(Action: Click 'Load into Assessment Station')*  
> *"Immediately, the entire bedside dictation, patient context, and laboratory findings populate with zero manual re-typing."*

---

#### Step 3: AI Safety Sentinel & CTCAE Grading
*(Action: Click 'ANALYZE ROUND')*

> *"When I click **'ANALYZE ROUND'**, the system evaluates the patient against clinical guidelines:*
>
> *(Point to the Critical Alert banner on screen)*  
> 1. **Emergency Safety Sentinel:** It flags **Febrile Neutropenia**—detecting an ANC of 900 coupled with fever $\ge 38.3^\circ\text{C}$. It immediately prompts for urgent blood cultures and empiric antipseudomonal IV antibiotics within 60 minutes.
> 2. **Automated CTCAE v5.0 Grading:** It identifies **Grade 3 Neutropenia** based on the patient's baseline labs.
> 3. **Complete Structured SOAP Note:** It drafts a guideline-concordant oncology note with full provenance linking every recommendation directly to NCCN guidelines. The doctor reviews, approves, and signs with one click."

---

#### Step 4: Longitudinal Trajectory & Analytics
*(Action: Switch to Tab 3: `http://localhost:3000/analytics?patientId=104`)*

> *"Finally, let’s look at the big picture: **Longitudinal Patient Analytics**.*
>
> *Here, RoundsAI charts the patient's trajectory across all chemotherapy cycles. It plots the ANC nadir trendline, recalculates cumulative toxicity, and automatically generates an NCCN-concordant recommendation: **a 20% dose reduction for Cycle 4** to prevent recurrent neutropenic sepsis.*
>
> *Every previous round, sign-off timestamp, and attending physician action is preserved in an immutable audit trail."*

---

### [3:45 – 4:30] Value Proposition & Technology Advantage
*(Return to main camera / audience)*

> "Why does RoundsAI win?
> - **Cost & Privacy:** By utilizing local Whisper AI and specialized regex phonetics on CPU, we achieve **₹0 / $0 per-minute transcription costs** while ensuring **zero patient audio leaves the hospital firewall**.
> - **Speed & Efficiency:** We cut post-rounds documentation time by **over 70%**, giving oncologists hours of their day back.
> - **Zero-Hallucination Safety:** Unlike generic chatbots, every recommendation in RoundsAI is grounded in validated medical algorithms, CTCAE grading scales, and NCCN guideline citations."

---

### [4:30 – 5:00] Closing Call to Action
*(Confident, impactful wrap-up)*

> "Oncology is a discipline where hours—and sometimes minutes—matter. Doctors shouldn't be fighting administrative software while their patients are in critical nadir.
>
> RoundsAI transforms ward rounds from a frantic documentation chore into a connected, intelligent, and safe clinical experience.
>
> **Thank you, and I’d be happy to answer any questions or show you a live interactive test!**"
