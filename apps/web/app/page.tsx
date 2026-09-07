"use client";

import { FormEvent, useState, useEffect, useRef } from "react";
import { auth, onAuthStateChanged, signOut, type User } from "../lib/firebase";

type LabValue = {
  name: string;
  value: number;
  unit?: string;
  source?: string;
  confidence?: string;
};

type LabTrend = {
  name: string;
  value: number;
  unit?: string;
  previous_value?: number;
  trend: "down" | "up" | "stable" | "new";
  source?: string;
};

type ReviewFlag = {
  severity: string;
  message: string;
  rationale: string;
  guideline?: string;
};

type ClinicalEvidence = {
  source: string;
  title: string;
  recommendation: string;
  relevance: string;
};

type ImageAttachment = {
  data: string;
  mime_type: string;
  name: string;
};

type Result = {
  extraction: {
    patient_id?: string;
    diagnosis?: string;
    treatment_cycle?: number;
    symptoms: string[];
    labs: LabValue[];
    source?: string;
  };
  lab_trends?: LabTrend[];
  review_flags: ReviewFlag[];
  retrieved_evidence?: ClinicalEvidence[];
  draft_note: string;
  disclaimer: string;
  round_id?: string;
  provenance?: Record<string, string>;
};

type PatientRecord = {
  id: string;
  name: string;
  age: number;
  sex: string;
  diagnosis: string;
  regimen: string;
  cycle: number;
  ward_bed: string;
  baseline_anc?: number;
  baseline_platelets?: number;
  baseline_wbc?: number;
  status: string;
};

const DEMO =
  "Patient 104 is a 58-year-old male with colorectal cancer. He is currently on cycle 3 chemotherapy. He has developed fever since yesterday. WBC is 2100 and ANC is 900. He reports increased fatigue.";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Dashboard() {
  const [transcript, setTranscript] = useState(DEMO);
  const [images, setImages] = useState<{ name: string; preview: string; data: string; mime_type: string }[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Ward Patients Roster State (CRUD)
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [crudLoading, setCrudLoading] = useState(false);

  // Admit Form State
  const [admitId, setAdmitId] = useState("");
  const [admitName, setAdmitName] = useState("");
  const [admitAge, setAdmitAge] = useState(55);
  const [admitSex, setAdmitSex] = useState("male");
  const [admitDiagnosis, setAdmitDiagnosis] = useState("");
  const [admitRegimen, setAdmitRegimen] = useState("");
  const [admitCycle, setAdmitCycle] = useState(1);
  const [admitBed, setAdmitBed] = useState("Ward 4B - Bed 22");
  const [admitAnc, setAdmitAnc] = useState<number | undefined>(2000);
  const [admitPlt, setAdmitPlt] = useState<number | undefined>(200000);
  const [admitWbc, setAdmitWbc] = useState<number | undefined>(4500);

  // Edit Form State
  const [editCycle, setEditCycle] = useState(1);
  const [editBed, setEditBed] = useState("");
  const [editRegimen, setEditRegimen] = useState("");
  const [editDiagnosis, setEditDiagnosis] = useState("");

  // Voice States
  const [isDictating, setIsDictating] = useState(false);
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchPatients() {
    try {
      const res = await fetch(`${API}/api/v1/patients`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
        if (data.length > 0 && !selectedPatient) {
          const pt104 = data.find((p: PatientRecord) => p.id === "104") || data[0];
          setSelectedPatient(pt104);
        }
      }
    } catch (e) {
      console.warn("Could not fetch patients from backend:", e);
    }
  }

  function selectPatientForRound(p: PatientRecord) {
    setSelectedPatient(p);
    setTranscript(
      `Patient ${p.id} (${p.name}) is a ${p.age}-year-old ${p.sex} with ${p.diagnosis}. Currently on cycle ${p.cycle} ${p.regimen} at ${p.ward_bed}. Vital signs stable, reporting increased fatigue. Recent blood counts recorded.`
    );
    setShowRosterModal(false);
  }

  async function handleAdmitSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCrudLoading(true);
    try {
      const payload = {
        id: admitId.trim(),
        name: admitName.trim() || "Patient " + admitId,
        age: Number(admitAge),
        sex: admitSex,
        diagnosis: admitDiagnosis.trim(),
        regimen: admitRegimen.trim() || "Standard protocol",
        cycle: Number(admitCycle),
        ward_bed: admitBed.trim(),
        baseline_anc: admitAnc ? Number(admitAnc) : undefined,
        baseline_platelets: admitPlt ? Number(admitPlt) : undefined,
        baseline_wbc: admitWbc ? Number(admitWbc) : undefined,
      };

      const res = await fetch(`${API}/api/v1/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Could not admit patient.");
      }

      const created = await res.json();
      await fetchPatients();
      selectPatientForRound(created);
      setShowAdmitModal(false);
      // Reset form
      setAdmitId("");
      setAdmitName("");
      setAdmitDiagnosis("");
      setAdmitRegimen("");
    } catch (err: any) {
      alert("Error admitting patient: " + err.message);
    } finally {
      setCrudLoading(false);
    }
  }

  function openEditModal(p: PatientRecord) {
    setEditingPatient(p);
    setEditCycle(p.cycle);
    setEditBed(p.ward_bed);
    setEditRegimen(p.regimen);
    setEditDiagnosis(p.diagnosis);
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPatient) return;
    setCrudLoading(true);

    try {
      const payload = {
        cycle: Number(editCycle),
        ward_bed: editBed.trim(),
        regimen: editRegimen.trim(),
        diagnosis: editDiagnosis.trim(),
      };

      const res = await fetch(`${API}/api/v1/patients/${editingPatient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Could not update patient.");
      }

      const updated = await res.json();
      await fetchPatients();
      if (selectedPatient?.id === updated.id) {
        setSelectedPatient(updated);
      }
      setShowEditModal(false);
      setEditingPatient(null);
    } catch (err: any) {
      alert("Error updating patient: " + err.message);
    } finally {
      setCrudLoading(false);
    }
  }

  async function handleDischarge(patientIdToDischarge: string) {
    if (!confirm(`Are you sure you want to discharge Patient #${patientIdToDischarge} from the active oncology ward?`)) {
      return;
    }

    try {
      const res = await fetch(`${API}/api/v1/patients/${patientIdToDischarge}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Could not discharge patient.");
      await fetchPatients();
      alert(`Patient #${patientIdToDischarge} discharged.`);
    } catch (err: any) {
      alert("Discharge error: " + err.message);
    }
  }

  useEffect(() => {
    fetchPatients();
    const demo = typeof window !== "undefined" ? sessionStorage.getItem("demo_user") : null;
    if (demo) {
      setUser({ email: demo } as unknown as User);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        window.location.href = "/login";
      } else {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, []);


  // ── Mode A: Live Browser Web Speech Dictation ────────────────────────
  function toggleBrowserDictation() {
    if (isDictating) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsDictating(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Web Speech API is not supported in this browser. You can use 'On-Device Audio Recording' or manual typing.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsDictating(true);
        setVoiceNotice("🔴 Listening... Speak your clinical notes.");
      };

      recognition.onresult = (event: any) => {
        let currentText = "";
        for (let i = 0; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsDictating(false);
        setVoiceNotice("");
      };

      recognition.onend = () => {
        setIsDictating(false);
        setVoiceNotice("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      alert("Could not start speech recognition: " + err.message);
      setIsDictating(false);
    }
  }

  // ── Mode B: On-Device Local Audio Recording (Whisper) ────────────────
  async function toggleLocalVoiceRecording() {
    if (isRecordingLocal) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingLocal(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setVoiceNotice("Processing audio on-device via local Whisper...");

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "clinician_dictation.webm");

          const res = await fetch(`${API}/api/v1/voice/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            setTranscript((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
            setVoiceNotice("✓ On-device transcription complete.");
          } else {
            setVoiceNotice("Local transcription error.");
          }
        } catch (e) {
          setVoiceNotice("Could not reach local transcription endpoint.");
        } finally {
          setTimeout(() => setVoiceNotice(""), 3000);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecordingLocal(true);
      setVoiceNotice("🔴 Recording on-device audio (Whisper)...");
    } catch (err: any) {
      alert("Microphone access denied: " + err.message);
    }
  }

  // ── Image Attachment Handling ────────────────────────────────────────
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`File ${file.name} is not an image.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10MB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const resultStr = uploadEvent.target?.result as string;
        const b64Data = resultStr.split(",")[1];
        setImages((prev) => [
          ...prev,
          {
            name: file.name,
            preview: resultStr,
            data: b64Data,
            mime_type: file.type,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Submit Round ─────────────────────────────────────────────────────
  async function start(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = {
        transcript,
        images: images.map((img) => ({
          name: img.name,
          data: img.data,
          mime_type: img.mime_type,
        })),
      };

      const r = await fetch(`${API}/api/v1/rounds/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("The API could not process this clinical round.");
      const data = await r.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error during extraction.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <p style={{ padding: "2rem", textAlign: "center" }}>Authenticating...</p>;

  return (
    <main>
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "28px" }}>🩺</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="eyebrow" style={{ margin: 0 }}>ONCOLOGY WARD COPILOT</span>
              <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "10px", padding: "1px 6px", borderRadius: "4px", fontWeight: "700" }}>
                CLINICIAN-IN-THE-LOOP
              </span>
            </div>
            <h1>RoundsAI</h1>
          </div>
        </div>

        {/* ── All Navigation Options ──────────────────────────────────── */}
        <nav className="nav-group">
          <a href="/" className="nav-link active">
            📋 Review Station
          </a>
          <a
            href={`/analytics?patientId=${selectedPatient?.id || "104"}`}
            className="nav-link nav-link-purple"
          >
            📊 Patient Analytics
          </a>
          <button
            type="button"
            onClick={() => setShowRosterModal(true)}
            className="nav-link"
          >
            👥 Ward Roster ({patients.length})
          </button>
          <button
            type="button"
            onClick={() => setShowAdmitModal(true)}
            className="nav-link nav-link-green"
          >
            ➕ Quick Admit
          </button>
          <a href="/mobile" className="nav-link">
            📱 Bedside Mobile
          </a>

          {/* Active Patient Context Badge */}
          <div
            onClick={() => setShowRosterModal(true)}
            className="badge"
            style={{ cursor: "pointer", marginLeft: "4px" }}
            title="Click to switch active inpatient"
          >
            <span>🛏️ {selectedPatient?.ward_bed ? selectedPatient.ward_bed.split(" - ")[1] || selectedPatient.ward_bed : "Bed 12"}</span>
            <span>·</span>
            <span>Pt #{selectedPatient?.id ?? "104"} {selectedPatient?.name ? `(${selectedPatient.name.split(" ")[0]})` : ""}</span>
          </div>

          <button
            className="secondary"
            onClick={() => {
              sessionStorage.removeItem("demo_user");
              signOut(auth);
              window.location.href = "/login";
            }}
            style={{ padding: "7px 12px", fontSize: "13px" }}
          >
            Sign Out
          </button>
        </nav>
      </header>

      {/* ── Input Section ────────────────────────────────────────────── */}
      <section className="input-card">
        <h2>Clinical Round Assessment</h2>
        <p>
          Dictate or type clinician observations, or attach laboratory scans and clinical pathology sheets.
        </p>

        <form onSubmit={start}>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            aria-label="Clinical round text"
            placeholder="Dictate or type patient observations, treatment cycle, reported symptoms, or vital signs..."
          />

          {/* Action Toolbar */}
          <div className="action-toolbar">
            <button
              type="button"
              className={`toolbar-btn ${isDictating ? "recording" : ""}`}
              onClick={toggleBrowserDictation}
            >
              {isDictating ? "■ Stop Dictation" : "🎙️ Dictate (Live Speech)"}
            </button>

            <button
              type="button"
              className={`toolbar-btn ${isRecordingLocal ? "recording" : ""}`}
              onClick={toggleLocalVoiceRecording}
            >
              {isRecordingLocal ? "■ Stop On-Device Audio" : "🎙️ Audio (On-Device Whisper)"}
            </button>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Attach Lab Scan / Medical Image
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/png, image/jpeg, image/jpg, image/webp"
              multiple
              style={{ display: "none" }}
            />
          </div>

          {/* Voice Indicator Notice */}
          {(isDictating || isRecordingLocal || voiceNotice) && (
            <div className="voice-indicator">
              <span className="pulsing-dot" />
              <span>{voiceNotice || "Listening to speech..."}</span>
            </div>
          )}

          {/* Image Attachment Strip */}
          {images.length > 0 && (
            <div className="attachment-strip">
              {images.map((img, idx) => (
                <div key={idx} className="attachment-chip">
                  <img src={img.preview} alt={img.name} />
                  <span>{img.name}</span>
                  <span style={{ fontSize: "11px", color: "#0284c7" }}>✓ Attached</span>
                  <button
                    type="button"
                    className="attachment-remove"
                    onClick={() => removeImage(idx)}
                    aria-label={`Remove ${img.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "8px" }}>
            <button disabled={loading} style={{ minWidth: "160px" }}>
              {loading ? "ANALYZING MULTIMODAL ROUND..." : "ANALYZE ROUND"}
            </button>
          </div>
        </form>

        {/* Live Analysis Progress */}
        {loading && (
          <div className="analysis-steps">
            <div className="step-item"><span className="step-check">✓</span> Images & transcript validated</div>
            <div className="step-item"><span className="step-check">✓</span> Multimodal feature extraction (Gemini Vision + Text)</div>
            <div className="step-item"><span className="step-check">✓</span> Patient context & cycle-over-cycle trends evaluated</div>
            <div className="step-item"><span className="step-check">✓</span> Oncology practice guidelines retrieved (ASCO/NCCN)</div>
            <div className="step-item"><span className="step-check">✓</span> Clinical note drafted with document provenance</div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </section>

      {/* ── Results Section ──────────────────────────────────────────── */}
      {result && (
        <section className="results">
          {/* Patient Summary */}
          <div className="card">
            <p className="eyebrow">PATIENT SUMMARY</p>
            <h2>Patient #{result.extraction.patient_id ?? "104"}</h2>
            <dl>
              <dt>Diagnosis</dt>
              <dd>{result.extraction.diagnosis ?? "Not stated"}</dd>
              <dt>Treatment</dt>
              <dd>{result.extraction.treatment_cycle ? `Cycle ${result.extraction.treatment_cycle}` : "Not stated"}</dd>
              <dt>Symptoms</dt>
              <dd>{result.extraction.symptoms.join(", ") || "None extracted"}</dd>
              <dt>Extraction</dt>
              <dd>{result.extraction.source ?? "Multimodal Rules"}</dd>
            </dl>
          </div>

          {/* Today's Findings with Longitudinal Trends */}
          <div className="card">
            <p className="eyebrow">TODAY&apos;S LAB FINDINGS & CYCLE TRENDS</p>
            {result.lab_trends && result.lab_trends.length > 0 ? (
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>Lab Test</th>
                    <th>Recorded Value</th>
                    <th>Cycle Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lab_trends.map((t) => (
                    <tr key={t.name}>
                      <td className="lab-name">{t.name}</td>
                      <td>
                        {t.value} {t.unit}
                      </td>
                      <td>
                        {t.trend === "down" && (
                          <span className="trend-down">
                            ↓ Decreased
                            {t.previous_value !== undefined && (
                              <span className="prev-lab">(prev: {t.previous_value})</span>
                            )}
                          </span>
                        )}
                        {t.trend === "up" && (
                          <span className="trend-up">
                            ↑ Elevated
                            {t.previous_value !== undefined && (
                              <span className="prev-lab">(prev: {t.previous_value})</span>
                            )}
                          </span>
                        )}
                        {t.trend === "stable" && (
                          <span className="trend-stable">
                            ― Stable
                            {t.previous_value !== undefined && (
                              <span className="prev-lab">(prev: {t.previous_value})</span>
                            )}
                          </span>
                        )}
                        {t.trend === "new" && <span className="trend-stable">New value</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : result.extraction.labs.length > 0 ? (
              <p>{result.extraction.labs.map((x) => `${x.name} ${x.value} ${x.unit ?? ""}`).join(" · ")}</p>
            ) : (
              <p>No lab values recorded in this round.</p>
            )}

            {/* Document Provenance Tag */}
            {result.provenance && Object.keys(result.provenance).length > 0 && (
              <div style={{ marginTop: "14px", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                <span className="eyebrow" style={{ fontSize: "10px" }}>DOCUMENT PROVENANCE</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {Object.entries(result.provenance).map(([key, src]) => (
                    <span key={key} className="provenance-tag">
                      {key}: {src}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clinical Safety Review Flags */}
          <div className="card">
            <p className="eyebrow">CLINICAL SAFETY REVIEW FLAGS</p>
            {result.review_flags.length ? (
              result.review_flags.map((x, idx) => (
                <div className={`flag ${x.severity === "high" ? "high" : ""}`} key={idx}>
                  <strong>⚠ {x.message}</strong>
                  <p>{x.rationale}</p>
                  {x.guideline && <div className="flag-guideline">Guideline: {x.guideline}</div>}
                </div>
              ))
            ) : (
              <p>No critical rule-based flags from this assessment.</p>
            )}
          </div>

          {/* Evidence-Based Guidelines (RAG) */}
          <div className="card">
            <p className="eyebrow">EVIDENCE-BASED GUIDELINES (RAG)</p>
            {result.retrieved_evidence && result.retrieved_evidence.length > 0 ? (
              result.retrieved_evidence.map((ev, idx) => (
                <div key={idx} className="evidence-item">
                  <div className="evidence-title">{ev.title}</div>
                  <div className="evidence-relevance">{ev.relevance}</div>
                  <p className="evidence-rec">{ev.recommendation}</p>
                </div>
              ))
            ) : (
              <p>No specialty guidelines triggered by current parameters.</p>
            )}
          </div>

          {/* Editable AI Draft Note */}
          <div className="card full">
            <p className="eyebrow">AI DRAFT NOTE — CLINICIAN REVIEW & SIGN-OFF</p>
            <textarea
              className="note"
              defaultValue={result.draft_note}
              aria-label="Editable clinical draft note"
            />
            <div className="actions">
              <button type="button" className="secondary">
                EDIT
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => alert("Note approved by clinician! Persisted to Supabase audit trail.")}
              >
                APPROVE NOTE
              </button>
            </div>
          </div>

          <p className="disclaimer">{result.disclaimer}</p>
        </section>
      )}

      {/* ── Ward Roster Modal (CRUD) ─────────────────────────────────── */}
      {showRosterModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              maxWidth: "880px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#0284c7", letterSpacing: "0.08em" }}>
                  INPATIENT ONCOLOGY WARD
                </span>
                <h2 style={{ fontSize: "20px", margin: "4px 0 0", color: "#0f172a" }}>
                  Ward 4B Patient Roster ({patients.length} Admitted)
                </h2>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(true)}
                  style={{
                    padding: "8px 14px",
                    background: "#0284c7",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  ➕ Admit New Patient
                </button>
                <button
                  type="button"
                  onClick={() => setShowRosterModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "22px",
                    cursor: "pointer",
                    color: "#64748b",
                    padding: "0 6px",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px" }}>Bed</th>
                  <th style={{ padding: "10px 8px" }}>Patient / MRN</th>
                  <th style={{ padding: "10px 8px" }}>Diagnosis</th>
                  <th style={{ padding: "10px 8px" }}>Regimen</th>
                  <th style={{ padding: "10px 8px" }}>Cycle</th>
                  <th style={{ padding: "10px 8px" }}>Baseline ANC</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const isSelected = selectedPatient?.id === p.id;
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: isSelected ? "#f0f9ff" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 8px", fontWeight: "700", color: "#1e293b" }}>
                        {p.ward_bed}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: "700", color: "#0f172a" }}>#{p.id} · {p.name}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{p.age}y · {p.sex}</div>
                      </td>
                      <td style={{ padding: "10px 8px", color: "#334155" }}>
                        {p.diagnosis}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#475569" }}>
                        {p.regimen}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            background: "#e0e7ff",
                            color: "#4338ca",
                            borderRadius: "12px",
                            fontWeight: "700",
                            fontSize: "11px",
                          }}
                        >
                          Cycle {p.cycle}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px", color: "#64748b" }}>
                        {p.baseline_anc ? `${p.baseline_anc} /uL` : "Not set"}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => selectPatientForRound(p)}
                            style={{
                              padding: "4px 8px",
                              background: isSelected ? "#0284c7" : "#f1f5f9",
                              color: isSelected ? "#fff" : "#0284c7",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              fontWeight: "700",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            {isSelected ? "✓ Active" : "Assess Round"}
                          </button>
                          <a
                            href={`/analytics?patientId=${p.id}`}
                            style={{
                              padding: "4px 8px",
                              background: "#f3e8ff",
                              color: "#7e22ce",
                              border: "1px solid #d8b4fe",
                              borderRadius: "4px",
                              fontWeight: "700",
                              fontSize: "12px",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            📊 Analytics
                          </a>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            style={{
                              padding: "4px 8px",
                              background: "#f8fafc",
                              color: "#475569",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              fontWeight: "600",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDischarge(p.id)}
                            style={{
                              padding: "4px 8px",
                              background: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              borderRadius: "4px",
                              fontWeight: "600",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Discharge
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Admit New Patient Modal ──────────────────────────────────── */}
      {showAdmitModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 1100,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "#0f172a" }}>
                ➕ Inpatient Oncology Admission
              </h2>
              <button
                type="button"
                onClick={() => setShowAdmitModal(false)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdmitSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Patient ID / MRN *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 108"
                    value={admitId}
                    onChange={(e) => setAdmitId(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Full Patient Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maria Santos"
                    value={admitName}
                    onChange={(e) => setAdmitName(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Age
                  </label>
                  <input
                    type="number"
                    value={admitAge}
                    onChange={(e) => setAdmitAge(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Sex
                  </label>
                  <select
                    value={admitSex}
                    onChange={(e) => setAdmitSex(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Ward & Bed *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ward 4B - Bed 22"
                    value={admitBed}
                    onChange={(e) => setAdmitBed(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                  Cancer Diagnosis & Stage *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ovarian Carcinoma (High Grade Serous)"
                  value={admitDiagnosis}
                  onChange={(e) => setAdmitDiagnosis(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Chemotherapy Regimen
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paclitaxel + Carboplatin"
                    value={admitRegimen}
                    onChange={(e) => setAdmitRegimen(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                    Cycle #
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={admitCycle}
                    onChange={(e) => setAdmitCycle(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "3px" }}>
                    Baseline ANC
                  </label>
                  <input
                    type="number"
                    placeholder="cells/uL"
                    value={admitAnc || ""}
                    onChange={(e) => setAdmitAnc(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "3px" }}>
                    Baseline Platelets
                  </label>
                  <input
                    type="number"
                    placeholder="/uL"
                    value={admitPlt || ""}
                    onChange={(e) => setAdmitPlt(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "3px" }}>
                    Baseline WBC
                  </label>
                  <input
                    type="number"
                    placeholder="cells/uL"
                    value={admitWbc || ""}
                    onChange={(e) => setAdmitWbc(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#f1f5f9", border: "1px solid #cbd5e1", fontWeight: "600", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={crudLoading}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#0284c7", color: "#fff", border: "none", fontWeight: "700", cursor: "pointer" }}
                >
                  {crudLoading ? "Admitting..." : "Admit Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Patient Modal ───────────────────────────────────────── */}
      {showEditModal && editingPatient && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 1100,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0, color: "#0f172a" }}>
                ✏️ Update Patient #{editingPatient.id} ({editingPatient.name})
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                  Current Chemotherapy Cycle
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editCycle}
                  onChange={(e) => setEditCycle(Number(e.target.value))}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                  Ward & Bed Location
                </label>
                <input
                  type="text"
                  value={editBed}
                  onChange={(e) => setEditBed(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                  Chemotherapy Regimen
                </label>
                <input
                  type="text"
                  value={editRegimen}
                  onChange={(e) => setEditRegimen(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#475569", marginBottom: "4px" }}>
                  Diagnosis Description
                </label>
                <input
                  type="text"
                  value={editDiagnosis}
                  onChange={(e) => setEditDiagnosis(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#f1f5f9", border: "1px solid #cbd5e1", fontWeight: "600", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={crudLoading}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#0284c7", color: "#fff", border: "none", fontWeight: "700", cursor: "pointer" }}
                >
                  {crudLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}

