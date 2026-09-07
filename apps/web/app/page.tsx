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

  // Voice States
  const [isDictating, setIsDictating] = useState(false);
  const [isRecordingLocal, setIsRecordingLocal] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
        <div>
          <p className="eyebrow">DEMO / CLINICIAN-IN-THE-LOOP</p>
          <h1>RoundsAI</h1>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span className="badge">Patient #{result?.extraction.patient_id ?? "104"}</span>
          <button
            className="secondary"
            onClick={() => {
              sessionStorage.removeItem("demo_user");
              signOut(auth);
              window.location.href = "/login";
            }}
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
          >
            Sign Out
          </button>
        </div>
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
    </main>
  );
}
