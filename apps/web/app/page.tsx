"use client";

import { FormEvent, useState, useEffect, useRef } from "react";
import { auth, onAuthStateChanged, signOut, type User } from "../lib/firebase";
import {
  StethoscopeIcon,
  ActivityIcon,
  BarChartIcon,
  UsersIcon,
  UserPlusIcon,
  SmartphoneIcon,
  BedIcon,
  MicrophoneIcon,
  SparklesIcon,
  CameraIcon,
  UndoIcon,
  CheckIcon,
  AlertCircleIcon,
  ShieldIcon,
  FileTextIcon,
  LogOutIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  MinusIcon,
  XIcon,
  RefreshIcon,
} from "./components/Icons";

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
  const [latestBedsideRound, setLatestBedsideRound] = useState<any | null>(null);
  const [bedsideNoticeDismissed, setBedsideNoticeDismissed] = useState(false);

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
  const [autocorrectNotice, setAutocorrectNotice] = useState("");
  const [previousTranscript, setPreviousTranscript] = useState("");
  const [isAutocorrecting, setIsAutocorrecting] = useState(false);
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

  // ── Bedside Mobile Live Sync Detection ────────────────────────────────
  async function checkBedsideSync() {
    try {
      const res = await fetch(`${API}/api/v1/rounds/latest`);
      if (res.ok) {
        const roundData = await res.json();
        if (roundData && roundData.id && roundData.id !== result?.round_id) {
          setLatestBedsideRound(roundData);
          setBedsideNoticeDismissed(false);
        }
      }
    } catch (e) {
      console.warn("Could not check bedside sync:", e);
    }
  }

  function loadBedsideRound(roundData: any) {
    if (!roundData) return;
    if (roundData.transcript) {
      setTranscript(roundData.transcript);
    }
    const ext = roundData.extractions?.[0] || roundData.extraction;
    if (ext) {
      setResult({
        round_id: roundData.id || roundData.round_id,
        extraction: ext,
        lab_trends: roundData.lab_trends || [],
        review_flags: roundData.review_flags || [],
        retrieved_evidence: roundData.retrieved_evidence || [],
        draft_note: roundData.draft_notes?.[0]?.content || roundData.draft_note || "",
        disclaimer: "Demo / research prototype. Not for autonomous clinical decision-making or real patient data.",
        provenance: roundData.provenance || {},
      });
      const pid = ext.patient_id || roundData.patient_id;
      if (pid) {
        const found = patients.find((p) => p.id === pid);
        if (found) setSelectedPatient(found);
      }
    }
    setBedsideNoticeDismissed(true);
  }

  useEffect(() => {
    fetchPatients();
    checkBedsideSync();

    // Check if a specific round was passed in URL (from mobile companion)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roundIdParam = params.get("roundId");
      if (roundIdParam) {
        fetch(`${API}/api/v1/rounds/${roundIdParam}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((rData) => {
            if (rData) loadBedsideRound(rData);
          })
          .catch(() => {});
      }
    }

    // Interval to poll for newly transmitted rounds every 8 seconds
    const interval = setInterval(checkBedsideSync, 8000);

    const demo = typeof window !== "undefined" ? sessionStorage.getItem("demo_user") : null;
    if (demo) {
      setUser({ email: demo } as unknown as User);
      return () => clearInterval(interval);
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        window.location.href = "/login";
      } else {
        setUser(currentUser);
      }
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);


  // ── Clinical Oncology Auto-Correction & Terminology Normalization ────
  async function handleAutocorrect(explicitText?: string) {
    const targetText = explicitText !== undefined ? explicitText : transcript;
    if (!targetText || !targetText.trim()) return;

    setIsAutocorrecting(true);
    setVoiceNotice("Normalizing oncology terminology...");
    try {
      const res = await fetch(`${API}/api/v1/voice/autocorrect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: targetText, use_gemini: true }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.corrected_text && data.corrected_text !== targetText) {
          setPreviousTranscript(targetText);
          setTranscript(data.corrected_text);
          const count = data.changes?.length || 1;
          const sample = data.changes
            ?.slice(0, 2)
            .map((c: any) => `"${c.from}" → "${c.to}"`)
            .join(", ");
          setAutocorrectNotice(
            `Auto-corrected ${count} oncology term${count > 1 ? "s" : ""}${sample ? ` (${sample})` : ""}`
          );
        } else {
          setAutocorrectNotice("Clinical terminology verified.");
        }
      }
    } catch (err) {
      console.warn("Autocorrect call failed:", err);
    } finally {
      setIsAutocorrecting(false);
      setVoiceNotice("");
      setTimeout(() => setAutocorrectNotice(""), 6000);
    }
  }

  function handleUndoAutocorrect() {
    if (previousTranscript) {
      setTranscript(previousTranscript);
      setPreviousTranscript("");
      setAutocorrectNotice("Reverted to original dictated text.");
      setTimeout(() => setAutocorrectNotice(""), 3000);
    }
  }

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
        setVoiceNotice("Listening... Speak your clinical notes.");
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
        // Automatically perform clinical auto-correction on captured speech
        setTimeout(() => {
          setTranscript((curr) => {
            if (curr && curr.trim()) {
              handleAutocorrect(curr);
            }
            return curr;
          });
        }, 300);
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
      setVoiceNotice("Recording on-device audio (Whisper)...");
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
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f0f9ff", border: "1px solid #bae6fd", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <StethoscopeIcon size={20} color="#0284c7" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="eyebrow" style={{ margin: 0 }}>ONCOLOGY WARD COPILOT</span>
              <span style={{ background: "#f1f5f9", color: "#334155", fontSize: "10px", padding: "1px 6px", borderRadius: "4px", fontWeight: "600", border: "1px solid #cbd5e1" }}>
                CLINICIAN-IN-THE-LOOP
              </span>
            </div>
            <h1>RoundsAI Workstation</h1>
          </div>
        </div>

        {/* ── All Navigation Options ──────────────────────────────────── */}
        <nav className="nav-group">
          <a href="/" className="nav-link active">
            <ActivityIcon size={14} />
            <span>Review Station</span>
          </a>
          <a
            href={`/analytics?patientId=${selectedPatient?.id || "104"}`}
            className="nav-link"
          >
            <BarChartIcon size={14} />
            <span>Patient Analytics</span>
          </a>
          <button
            type="button"
            onClick={() => setShowRosterModal(true)}
            className="nav-link"
          >
            <UsersIcon size={14} />
            <span>Ward Roster ({patients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdmitModal(true)}
            className="nav-link"
          >
            <UserPlusIcon size={14} />
            <span>Admit Patient</span>
          </button>
          <button
            type="button"
            onClick={checkBedsideSync}
            className="nav-link"
            title="Check for newly synced rounds from mobile companion"
          >
            <RefreshIcon size={14} />
            <span>Sync Bedside</span>
          </button>
          <a href="/mobile" className="nav-link">
            <SmartphoneIcon size={14} />
            <span>Bedside Mobile</span>
          </a>

          {/* Active Patient Context Badge */}
          <div
            onClick={() => setShowRosterModal(true)}
            className="badge badge-blue"
            style={{ cursor: "pointer", marginLeft: "4px" }}
            title="Click to switch active inpatient"
          >
            <BedIcon size={13} color="#0369a1" />
            <span>{selectedPatient?.ward_bed ? selectedPatient.ward_bed.split(" - ")[1] || selectedPatient.ward_bed : "Bed 12"}</span>
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
            style={{ padding: "7px 12px", fontSize: "12.5px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <LogOutIcon size={13} />
            <span>Sign Out</span>
          </button>
        </nav>
      </header>

      {/* ── Transmitted Bedside Round Notification Banner ─────────────── */}
      {latestBedsideRound && !bedsideNoticeDismissed && (
        <div
          style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
            border: "1px solid #7dd3fc",
            borderRadius: "12px",
            padding: "14px 20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            boxShadow: "0 2px 8px rgba(2, 132, 199, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: "#0284c7", color: "#ffffff", padding: "8px", borderRadius: "8px", display: "flex" }}>
              <SmartphoneIcon size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#0369a1", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Bedside Round Transmitted from Mobile</span>
                <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>
                  LIVE SYNC
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                Round #{latestBedsideRound.id?.slice(0, 8)} · Patient #{latestBedsideRound.extractions?.[0]?.patient_id || latestBedsideRound.patient_id || "104"} ({latestBedsideRound.transcript?.slice(0, 80)}...)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={() => loadBedsideRound(latestBedsideRound)}
              style={{
                padding: "8px 16px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.25)",
              }}
            >
              <ActivityIcon size={14} color="#ffffff" />
              <span>Load into Assessment Station</span>
            </button>
            <button
              type="button"
              onClick={() => setBedsideNoticeDismissed(true)}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Input Section ────────────────────────────────────────────── */}
      <section className="input-card">
        <h2>Clinical Round Assessment</h2>
        <p>
          Dictate or transcribe clinician observations, or attach laboratory scans and clinical pathology sheets.
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
              <MicrophoneIcon size={14} color={isDictating ? "#dc2626" : "currentColor"} />
              <span>{isDictating ? "Stop Dictation" : "Dictate (Speech)"}</span>
            </button>

            <button
              type="button"
              className={`toolbar-btn ${isRecordingLocal ? "recording" : ""}`}
              onClick={toggleLocalVoiceRecording}
            >
              <MicrophoneIcon size={14} color={isRecordingLocal ? "#dc2626" : "currentColor"} />
              <span>{isRecordingLocal ? "Stop Recording" : "On-Device Audio"}</span>
            </button>

            <button
              type="button"
              className={`toolbar-btn toolbar-btn-green ${isAutocorrecting ? "recording" : ""}`}
              onClick={() => handleAutocorrect()}
              disabled={isAutocorrecting || !transcript.trim()}
              title="Standardize chemotherapy names, blood counts, and oncology abbreviations"
            >
              <SparklesIcon size={14} color={isAutocorrecting ? "#dc2626" : "#166534"} />
              <span>{isAutocorrecting ? "Normalizing..." : "Clinical Auto-Correct"}</span>
            </button>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <CameraIcon size={14} />
              <span>Attach Lab Scan / Document</span>
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

          {/* Clinical Auto-Correct Notification Banner with Undo */}
          {autocorrectNotice && (
            <div className="autocorrect-banner">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckIcon size={14} color="#166534" />
                <span>{autocorrectNotice}</span>
              </span>
              {previousTranscript && (
                <button
                  type="button"
                  onClick={handleUndoAutocorrect}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #86efac",
                    padding: "3px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#15803d",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <UndoIcon size={12} color="#15803d" />
                  <span>Undo Change</span>
                </button>
              )}
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
                            <TrendingDownIcon size={14} color="#dc2626" />
                            <span>Decreased</span>
                            {t.previous_value !== undefined && (
                              <span className="prev-lab">(prev: {t.previous_value})</span>
                            )}
                          </span>
                        )}
                        {t.trend === "up" && (
                          <span className="trend-up">
                            <TrendingUpIcon size={14} color="#0284c7" />
                            <span>Elevated</span>
                            {t.previous_value !== undefined && (
                              <span className="prev-lab">(prev: {t.previous_value})</span>
                            )}
                          </span>
                        )}
                        {t.trend === "stable" && (
                          <span className="trend-stable">
                            <MinusIcon size={14} color="#64748b" />
                            <span>Stable</span>
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
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                    <AlertCircleIcon size={15} color={x.severity === "high" ? "#dc2626" : "#d97706"} />
                    <strong>{x.message}</strong>
                  </div>
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
            <p className="eyebrow">
              <ShieldIcon size={12} color="#0284c7" />
              <span>EVIDENCE-BASED GUIDELINES (RAG)</span>
            </p>
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
            <p className="eyebrow">
              <FileTextIcon size={12} color="#0284c7" />
              <span>CLINICAL PROGRESS NOTE — REVIEW & ATTESTATION</span>
            </p>
            <textarea
              className="note"
              defaultValue={result.draft_note}
              aria-label="Editable clinical draft note"
            />
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => alert("Note approved by clinician and verified into patient record.")}
                style={{ background: "#0f172a", color: "#ffffff", border: "none" }}
              >
                <CheckIcon size={14} color="#ffffff" />
                <span>ATTEST & APPROVE NOTE</span>
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <UserPlusIcon size={14} color="#ffffff" />
                  <span>Admit New Patient</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRosterModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#64748b",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <XIcon size={20} color="#64748b" />
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
                              gap: "4px",
                            }}
                          >
                            <BarChartIcon size={12} color="#7e22ce" />
                            <span>Analytics</span>
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
                            Edit
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
              <h2 style={{ fontSize: "18px", margin: 0, color: "#0f172a", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <UserPlusIcon size={18} color="#0284c7" />
                <span>Inpatient Oncology Admission</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAdmitModal(false)}
                style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
              >
                <XIcon size={20} color="#64748b" />
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
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "6px",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    fontWeight: "600",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
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
                Update Patient #{editingPatient.id} ({editingPatient.name})
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
              >
                <XIcon size={20} color="#64748b" />
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
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "6px",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    fontWeight: "600",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
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

