"use client";

import { useState, useRef, useEffect } from "react";


const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
};

export default function MobileCapturePage() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientId, setPatientId] = useState("104");
  const [currentBed, setCurrentBed] = useState("Ward 4B - Bed 12");
  const [transcript, setTranscript] = useState(
    "Patient 104 is a 58-year-old male with colorectal cancer. Cycle 3 chemotherapy. Developed fever since yesterday. WBC 2100, ANC 900. Complaining of severe fatigue."
  );
  const [isRecording, setIsRecording] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Bedside Admission Modal State
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [admitLoading, setAdmitLoading] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState(55);
  const [newSex, setNewSex] = useState("male");
  const [newDiagnosis, setNewDiagnosis] = useState("");
  const [newRegimen, setNewRegimen] = useState("");
  const [newCycle, setNewCycle] = useState(1);
  const [newBed, setNewBed] = useState("Ward 4B - Bed 20");
  const [newAnc, setNewAnc] = useState<number | undefined>(2000);
  const [newPlt, setNewPlt] = useState<number | undefined>(200000);

  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load patients from API
  async function fetchPatients() {
    try {
      const res = await fetch(`${API}/api/v1/patients`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
        if (data.length > 0 && !data.some((p: PatientRecord) => p.id === patientId)) {
          selectPatient(data[0]);
        }
      }
    } catch (e) {
      console.warn("Could not load patients, using default fallback");
    }
  }

  useEffect(() => {
    fetchPatients();
  }, []);

  function selectPatient(p: PatientRecord) {
    setPatientId(p.id);
    setCurrentBed(p.ward_bed);
    setTranscript(
      `Patient ${p.id} (${p.name}) is a ${p.age}-year-old ${p.sex} with ${p.diagnosis}. Currently on cycle ${p.cycle} ${p.regimen}. Vital signs stable, reporting mild fatigue. Lab review in progress.`
    );
  }

  function handlePatientChange(selectedId: string) {
    const found = patients.find((p) => p.id === selectedId);
    if (found) {
      selectPatient(found);
    } else {
      setPatientId(selectedId);
    }
  }

  async function handleAdmitSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdmitLoading(true);
    try {
      const payload = {
        id: newId.trim(),
        name: newName.trim() || "Anonymous Patient",
        age: Number(newAge),
        sex: newSex,
        diagnosis: newDiagnosis.trim(),
        regimen: newRegimen.trim() || "Observation / Protocol pending",
        cycle: Number(newCycle),
        ward_bed: newBed.trim(),
        baseline_anc: newAnc ? Number(newAnc) : undefined,
        baseline_platelets: newPlt ? Number(newPlt) : undefined,
      };

      const res = await fetch(`${API}/api/v1/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Admit failed");
      }

      const created = await res.json();
      await fetchPatients();
      selectPatient(created);
      setShowAdmitModal(false);
      alert(`Patient #${created.id} (${created.name}) admitted to ${created.ward_bed}!`);
    } catch (err: any) {
      alert("Error admitting patient: " + err.message);
    } finally {
      setAdmitLoading(false);
    }
  }


  // Live Speech Dictation on Phone
  function toggleSpeech() {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Please type or use mic permissions.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  }

  // Camera / Document Scan
  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      setImageData(result.split(",")[1]);
      setImageName(file.name || "Bedside_Scan.jpg");
    };
    reader.readAsDataURL(file);
  }

  // Sync to Doctor Dashboard
  async function syncToDashboard() {
    setSyncing(true);
    setSyncSuccess(false);
    setSyncMessage("Transmitting round data to Laptop Doctor Station...");

    try {
      const payload = {
        transcript,
        images: imageData
          ? [
              {
                name: imageName || "Bedside_Scan.jpg",
                data: imageData,
                mime_type: "image/jpeg",
              },
            ]
          : [],
      };

      const res = await fetch(`${API}/api/v1/rounds/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();

      setSyncSuccess(true);
      setSyncMessage(`✓ Synced to Doctor Station! Round ID: ${data.round_id?.slice(0, 8) ?? "Live"}`);
    } catch (err) {
      setSyncMessage("Sync error. Please check connection to backend.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ maxWidth: "440px", margin: "0 auto", padding: "16px", minHeight: "100vh", background: "#f8fafc" }}>
      {/* Mobile Top App Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#0284c7", letterSpacing: "0.08em" }}>
            MOBILE CLINICAL CAPTURE
          </span>
          <h1 style={{ fontSize: "22px", margin: "2px 0 0", color: "#0f172a" }}>RoundsAI Companion</h1>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <a
            href={`/analytics?patientId=${patientId}`}
            style={{ fontSize: "12px", color: "#7e22ce", textDecoration: "none", fontWeight: "700", padding: "6px 8px", background: "#f3e8ff", border: "1px solid #d8b4fe", borderRadius: "6px" }}
          >
            📊 Analytics
          </a>
          <a
            href="/"
            style={{ fontSize: "12px", color: "#0284c7", textDecoration: "none", fontWeight: "600", padding: "6px 10px", background: "#e0f2fe", borderRadius: "6px" }}
          >
            💻 Laptop
          </a>
        </div>
      </div>

      {/* Ward & Patient Selector */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>CURRENT BED</span>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b" }}>{currentBed}</div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <select
              value={patientId}
              onChange={(e) => handlePatientChange(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "600", maxWidth: "170px" }}
            >
              {patients.length > 0 ? (
                patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    Pt #{p.id} ({p.diagnosis.slice(0, 14)}...)
                  </option>
                ))
              ) : (
                <option value="104">Patient #104 (Colorectal)</option>
              )}
            </select>
            <button
              type="button"
              onClick={() => setShowAdmitModal(true)}
              style={{
                padding: "6px 8px",
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + Admit
            </button>
          </div>
        </div>
      </div>


      {/* Voice Dictation Card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155" }}>🎙️ CLINICIAN BEDSIDE DICTATION</span>
          {isRecording && (
            <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
              RECORDING
            </span>
          )}
        </div>

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Speak or type clinical observations..."
          style={{ width: "100%", minHeight: "110px", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", lineHeight: "1.4", resize: "none" }}
        />

        <div style={{ marginTop: "12px" }}>
          <button
            type="button"
            onClick={toggleSpeech}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              background: isRecording ? "#dc2626" : "#0284c7",
              color: "#fff",
              fontWeight: "700",
              fontSize: "14px",
              border: "none",
              cursor: "pointer",
            }}
          >
            {isRecording ? "■ STOP DICTATION" : "🎙️ START VOICE DICTATION"}
          </button>
        </div>
      </div>

      {/* Camera Document Capture Card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155" }}>📷 SCAN BEDSIDE LAB REPORT</span>
          {imagePreview && (
            <button
              onClick={() => { setImagePreview(null); setImageData(null); }}
              style={{ background: "none", border: "none", color: "#dc2626", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
            >
              Clear
            </button>
          )}
        </div>

        {imagePreview ? (
          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #bae6fd", marginBottom: "10px", textAlign: "center", background: "#f0f9ff" }}>
            <img src={imagePreview} alt="Scan preview" style={{ maxHeight: "160px", maxWidth: "100%", objectFit: "contain" }} />
            <div style={{ padding: "6px", fontSize: "12px", color: "#0369a1", fontWeight: "600" }}>
              ✓ {imageName || "Document"} attached
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #cbd5e1",
              borderRadius: "8px",
              padding: "20px 10px",
              textAlign: "center",
              cursor: "pointer",
              background: "#fafbfc",
              marginBottom: "10px",
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "4px" }}>📷</div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>Tap to Photograph / Scan Lab Sheet</div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>Supports camera capture & photo library</div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraCapture}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            background: "#f1f5f9",
            color: "#334155",
            fontWeight: "600",
            fontSize: "13px",
            border: "1px solid #cbd5e1",
            cursor: "pointer",
          }}
        >
          {imagePreview ? "📷 Retake Document Photo" : "📷 Open Bedside Camera"}
        </button>
      </div>

      {/* Transmission / Sync Card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
        <button
          type="button"
          onClick={syncToDashboard}
          disabled={syncing}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "8px",
            background: "#0f172a",
            color: "#fff",
            fontWeight: "700",
            fontSize: "15px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {syncing ? "TRANSMITTING TO LAPTOP..." : "📡 SYNC ROUND TO DOCTOR DASHBOARD"}
        </button>

        {syncMessage && (
          <div
            style={{
              marginTop: "10px",
              padding: "10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "600",
              textAlign: "center",
              background: syncSuccess ? "#f0fdf4" : "#fef2f2",
              color: syncSuccess ? "#16a34a" : "#dc2626",
              border: `1px solid ${syncSuccess ? "#bbf7d0" : "#fca5a5"}`,
            }}
          >
            {syncMessage}
          </div>
        )}
      </div>

      {/* Bedside Admission Modal */}
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
            padding: "16px",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              padding: "20px",
              maxWidth: "400px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: "700", margin: 0, color: "#0f172a" }}>
                ➕ Bedside Patient Admission
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
              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                  Patient ID / MRN *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 107 or MRN-4421"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                  Patient Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Robert Chen"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Age
                  </label>
                  <input
                    type="number"
                    value={newAge}
                    onChange={(e) => setNewAge(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Sex
                  </label>
                  <select
                    value={newSex}
                    onChange={(e) => setNewSex(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                  Cancer Diagnosis *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Non-Small Cell Lung Cancer"
                  value={newDiagnosis}
                  onChange={(e) => setNewDiagnosis(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px", marginBottom: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Chemo Regimen
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Carboplatin + Pemetrexed"
                    value={newRegimen}
                    onChange={(e) => setNewRegimen(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Cycle #
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newCycle}
                    onChange={(e) => setNewCycle(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                  Ward & Bed Location *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ward 4B · Bed 18"
                  value={newBed}
                  onChange={(e) => setNewBed(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Baseline ANC
                  </label>
                  <input
                    type="number"
                    placeholder="cells/uL"
                    value={newAnc || ""}
                    onChange={(e) => setNewAnc(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "3px" }}>
                    Baseline Platelets
                  </label>
                  <input
                    type="number"
                    placeholder="/uL"
                    value={newPlt || ""}
                    onChange={(e) => setNewPlt(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#f1f5f9", border: "1px solid #cbd5e1", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={admitLoading}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", background: "#0284c7", color: "#fff", border: "none", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
                >
                  {admitLoading ? "Admitting..." : "Admit Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
        RoundsAI Clinical Capture Device · Protected Health Interface
      </div>
    </div>
  );
}

