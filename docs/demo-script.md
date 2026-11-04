# 🎬 RoundsAI — Walkthrough Video Script (≈ 4½ minutes)

**Format:** screen recording with voice-over, 1440×900 browser window (plus a phone-size window for the bedside scene).
**Pace:** ~140 words per minute; every scene lists what to click and what to say.
**Data:** demo mode only — all patients are synthetic.

### Before you record
1. Deploy the latest `main` (Vercel + Render) so the live site matches this script, or record locally (`npm run dev` + `uvicorn`).
2. Warm the backend once (open the site and run one *Analyze round*) — the first Gemini call after a cold start is slower.
3. In the browser: clear site data for the app, then use a fresh window. Hide the demo guide only if you want a cleaner frame (you can show it in Scene 2 instead).
4. Open two windows side by side for Scene 3: **Station** (desktop size) and **Mobile** (~390 px wide, or a real phone).
5. Download the sample report from the demo guide (`sample-cbc-report.txt`) to your desktop for Scene 6.

---

## Scene 1 — The problem (0:00–0:30)
**Screen:** landing page hero, slow scroll to the feature section.

> "Every morning on an oncology ward, a doctor listens at the bedside, reads a printed blood count, works out CTCAE toxicity grades in their head, and then types it all into a note. One of those findings — febrile neutropenia — needs antibiotics within the hour.
> RoundsAI takes the round as it's spoken, grades it, and drafts the note — and the clinician verifies every value before anything is signed."

**Caption:** *Inpatient oncology ward-round copilot · Health-a-thon 2026 · Binary Minds*

## Scene 2 — Demo mode and the ward (0:30–0:55)
**Click:** **Try demo** → Station opens. Point at the census, the admission baseline card and the demo guide.

> "This is demo mode — five synthetic patients, one for each CTCAE grade. Each patient has a fixed admission baseline, here David Miller's counts from admission, and this is his round two; round one is already in his history below."

**Caption:** *Accounts start with an empty ward — demo data never mixes in.*

## Scene 3 — Bedside capture to the station (0:55–1:35)
**Screen:** Mobile window. Select **Bed 12 · David Miller**. Choose **Whisper AI**, tap the mic and say (or show the prefilled dictation):
*"Febrile overnight to 38.4 with chills and fatigue. ANC 420, platelets 88,000, WBC 1,800. Denies cough, dysuria or focal pain."*
Tap **Send to station**. Cut to the Station window: the **Bedside round received** banner appears → click **Load into station**.

> "At the bedside I dictate on the phone. Whisper transcribes on our own server — the audio doesn't go to a third-party speech service. Live ASR is also available for real-time text through the browser's speech service.
> I send it, and the doctor's station picks it up live — one click loads it."

**Caption:** *Whisper: audio stays on your server · Live ASR: browser speech service*

## Scene 4 — Analyze and review (1:35–2:25)
**Click:** **Analyze round**. Pause on the Review step: the red **Febrile Neutropenia (Criteria Met)** alert, the provenance badge, the metric cards, then the checklist.

> "Analyze extracts the labs, temperature and symptoms from what was actually said and grades them against CTCAE version 5.
> ANC 420 with a temperature of 38.4 meets the IDSA/ASCO febrile-neutropenia criteria, so it's flagged — for clinician review, never as an order. The badge shows exactly which engine produced this: Gemini when it's available, our deterministic rule engine when it isn't.
> Notice 'denies cough, dysuria or focal pain' — all three are recorded as negatives. And every checklist item starts unticked."

**Click:** tick each checklist item one by one.

**Caption:** *Grading and safety rules are always deterministic — AI only extracts and drafts.*

## Scene 5 — Sign, attest, next round (2:25–3:05)
**Click:** **Continue to sign** → scroll the SOAP draft → edit one word in the Plan → **Attest & approve** → show **Round 2 saved to history** → expand **R1** in Round history → click **Start round 3**.

> "The SOAP note is drafted from the dictated values, and I can edit any part of it. Attestation unlocks only once every item is verified.
> The round is saved to the patient's history. When I start round three, the capture is blank for today's update — and every earlier note stays one click away for reference."

## Scene 6 — Auto-correct, scenarios and lab reports (3:05–3:45)
**Click:** **Try a scenario → Speech errors** → **Clinical auto-correct**. Show "our chop → R-CHOP", "ox ally platin → oxaliplatin"; untick one; **Apply**.
**Click:** **+** → attach `sample-cbc-report.txt` → the OCR review modal shows ANC 420, platelets 88,000 → confirm.
(Optional) **Try a scenario → Possible FN** → Analyze → show "Fever with Severe Neutropenia (Assess for FN)".

> "Speech tools mishear oncology words. Auto-correct fixes them term by term, and I decide which corrections to keep.
> Lab reports can be attached too — text reports are read on the device, photos by Gemini Vision — and the values are confirmed before they're used.
> The demo scenarios cover the edge cases: fever with an ANC between 500 and 1,000 is still surfaced, and if no labs are dictated, nothing is invented — the review simply asks for them."

## Scene 7 — Analytics (3:45–4:15)
**Click:** **Analytics** → KPIs → ANC nadir trajectory → platelet & hemoglobin chart → dose-modification card → audit log.

> "Analytics builds the longitudinal view from the recorded rounds: the ANC nadir trajectory against CTCAE bands, platelet and hemoglobin recovery, and guideline-based dose advice — here a 20% reduction and growth-factor support after a Grade 4 nadir. Anything not measured is shown as not recorded, never filled in."

## Scene 8 — Safety and close (4:15–4:35)
**Screen:** back to the landing page or the final slide.

> "RoundsAI is assistive by design: deterministic safety rules, honest provenance, and a clinician who verifies and signs every note. It's open source, it's tested — 110 backend and 83 frontend tests passing — and our next step is a supervised pilot on an oncology ward.
> RoundsAI — the round stays human."

**End card:** rounds-ai-umber.vercel.app · github.com/santhoshh005/Rounds_AI · Binary Minds · 1RKUPH

---

### Accuracy checklist for the voice-over
- Say **"Whisper keeps audio on our server"** — not "all audio stays on the device" (Live ASR uses the browser's speech service).
- Call time savings an **estimate**; nothing has been measured with clinicians yet.
- Say **"for clinician review"** for every alert; RoundsAI never orders treatment.
- If the badge shows *Deterministic Clinical Rule Engine*, that is expected when Gemini quota is exhausted — narrate it as the fallback working.
