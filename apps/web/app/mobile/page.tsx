"use client";

import { useState, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function MobileCapturePage() {
  const [patientId, setPatientId] = useState("104");
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

  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        <a
          href="/"
          style={{ fontSize: "12px", color: "#0284c7", textDecoration: "none", fontWeight: "600", padding: "6px 10px", background: "#e0f2fe", borderRadius: "6px" }}
        >
          💻 Laptop View
        </a>
      </div>

      {/* Ward & Patient Selector */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>CURRENT BED</span>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#1e293b" }}>Ward 4B · Bed 12</div>
          </div>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "600" }}
          >
            <option value="104">Patient #104 (Colorectal Ca)</option>
            <option value="105">Patient #105 (Lymphoma)</option>
            <option value="106">Patient #106 (Breast Ca)</option>
          </select>
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

      {/* Footer Navigation */}
      <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>
        RoundsAI Clinical Capture Device · Protected Health Interface
      </div>
    </div>
  );
}
