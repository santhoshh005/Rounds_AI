"use client";

import React, { useState, useEffect } from "react";
import {
  StethoscopeIcon,
  ActivityIcon,
  BarChartIcon,
  UsersIcon,
  SmartphoneIcon,
  BedIcon,
  AlertCircleIcon,
  ShieldIcon,
  FileTextIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  MinusIcon,
  RefreshIcon,
  CheckIcon,
  SparklesIcon,
} from "../components/Icons";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Patient = {
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

type LabDataPoint = {
  label: string;
  date: string;
  value: number;
  unit: string;
  ctcae_grade: number;
  status: string;
};

type LabTrajectory = {
  lab_name: string;
  unit: string;
  reference_range: string;
  baseline_value?: number;
  current_value: number;
  percent_change?: number;
  trend: string;
  data_points: LabDataPoint[];
};

type CTCAEToxicity = {
  category: string;
  symptom: string;
  grade: number;
  description: string;
  management_recommendation: string;
  trend: string;
};

type SafetyAlert = {
  id: string;
  severity: "critical" | "high" | "moderate";
  title: string;
  message: string;
  rationale: string;
  action_required: string;
  timestamp: string;
  status: string;
};

type Guideline = {
  title: string;
  source: string;
  evidence_level: string;
  recommendation: string;
  concordance: string;
};

type HistoricalRound = {
  round_id: string;
  date: string;
  cycle: number;
  clinician: string;
  summary: string;
  note_snippet: string;
  status: string;
};

type AnalyticsData = {
  patient: Patient;
  ecog_performance_status: number;
  days_inpatient: number;
  trajectories: LabTrajectory[];
  toxicities: CTCAEToxicity[];
  safety_alerts: SafetyAlert[];
  guidelines: Guideline[];
  rounds_history: HistoricalRound[];
  clinical_synthesis: string;
};

export default function PatientAnalyticsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("104");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [hoveredPoint, setHoveredPoint] = useState<LabDataPoint | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Initialize from URL search params if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const pid = params.get("patientId");
      if (pid) setSelectedPatientId(pid);
    }
  }, []);

  // Fetch patient roster
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await fetch(`${API}/api/v1/patients`);
        if (res.ok) {
          const list: Patient[] = await res.json();
          setPatients(list);
          if (list.length > 0 && !list.some((p) => p.id === selectedPatientId)) {
            setSelectedPatientId(list[0].id);
          }
        }
      } catch (err) {
        console.warn("Error fetching patients:", err);
      }
    }
    loadPatients();
  }, []);

  // Fetch analytics data for selected patient
  useEffect(() => {
    if (!selectedPatientId) return;

    let isMounted = true;
    setLoading(true);
    setError("");

    async function loadAnalytics() {
      try {
        const res = await fetch(`${API}/api/v1/patients/${selectedPatientId}/analytics`);
        if (!res.ok) {
          throw new Error(`Failed to load analytics for patient #${selectedPatientId} (HTTP ${res.status})`);
        }
        const data: AnalyticsData = await res.json();
        if (isMounted) {
          setAnalytics(data);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Could not retrieve patient analytics");
          setLoading(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, [selectedPatientId]);

  function handlePatientSwitch(pid: string) {
    setSelectedPatientId(pid);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("patientId", pid);
      window.history.pushState({}, "", url.toString());
    }
  }

  const patient = analytics?.patient;
  const ancTraj = analytics?.trajectories?.find((t) => t.lab_name.includes("ANC"));
  const pltTraj = analytics?.trajectories?.find((t) => t.lab_name.includes("Platelet"));
  const wbcTraj = analytics?.trajectories?.find((t) => t.lab_name.includes("White Blood Cell"));

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", color: "#0f172a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "14px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f0f9ff", border: "1px solid #bae6fd", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <StethoscopeIcon size={20} color="#0284c7" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: "800", color: "#0284c7", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                RoundsAI Clinical Intelligence
              </span>
              <span style={{ background: "#f1f5f9", color: "#334155", fontSize: "10px", padding: "2px 7px", borderRadius: "4px", fontWeight: "600", border: "1px solid #cbd5e1" }}>
                LONGITUDINAL COCKPIT
              </span>
            </div>
            <h1 style={{ fontSize: "20px", margin: "2px 0 0", color: "#0f172a", fontWeight: "700" }}>
              Patient Longitudinal Analytics & Trajectory
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <a
            href="/"
            style={{
              padding: "7px 13px",
              background: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ActivityIcon size={14} />
            <span>Review Station</span>
          </a>
          <a
            href={`/analytics?patientId=${selectedPatientId}`}
            style={{
              padding: "7px 13px",
              background: "#0f172a",
              color: "#ffffff",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <BarChartIcon size={14} />
            <span>Patient Analytics</span>
          </a>
          <a
            href="/"
            style={{
              padding: "7px 13px",
              background: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <UsersIcon size={14} />
            <span>Ward Roster ({patients.length})</span>
          </a>
          <a
            href="/mobile"
            style={{
              padding: "7px 13px",
              background: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <SmartphoneIcon size={14} />
            <span>Bedside Mobile</span>
          </a>
          <button
            type="button"
            onClick={() => handlePatientSwitch(selectedPatientId)}
            style={{
              padding: "7px 13px",
              background: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Refresh analytics and incorporate newly recorded rounds"
          >
            <RefreshIcon size={14} />
            <span>Sync Rounds</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: "7px 13px",
              background: "#f8fafc",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileTextIcon size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Container ──────────────────────────────────── */}
      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px 20px 60px" }}>
        {/* ── Patient Selector & Quick Switcher ─────────────────────────── */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Select Inpatient:
            </span>
            <select
              value={selectedPatientId}
              onChange={(e) => handlePatientSwitch(e.target.value)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "2px solid #0284c7",
                background: "#f0f9ff",
                color: "#0369a1",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  Pt #{p.id} · {p.name} ({p.ward_bed}) — {p.diagnosis}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {patients.map((p) => {
              const active = p.id === selectedPatientId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePatientSwitch(p.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: active ? "2px solid #0284c7" : "1px solid #cbd5e1",
                    background: active ? "#e0f2fe" : "#ffffff",
                    color: active ? "#0369a1" : "#475569",
                    fontSize: "12px",
                    fontWeight: active ? "700" : "500",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  #{p.id} {p.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div style={{ padding: "60px 20px", textAlign: "center", background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <ActivityIcon size={36} color="#0284c7" />
            </div>
            <h3 style={{ margin: "0 0 6px", color: "#1e293b" }}>Synthesizing Longitudinal Analytics...</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Computing cycle-over-cycle lab trends, CTCAE v5.0 toxicities, and guideline concordance.
            </p>
          </div>
        )}

        {error && (
          <div style={{ padding: "24px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", color: "#b91c1c", marginBottom: "20px" }}>
            <strong>Error Loading Analytics:</strong> {error}
          </div>
        )}

        {!loading && analytics && patient && (
          <>
            {/* ── Comprehensive Patient Header Banner ───────────────────── */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "16px",
                padding: "24px",
                marginBottom: "20px",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                {/* Demographics & Clinical Profile */}
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "14px",
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                      fontWeight: "800",
                    }}
                  >
                    {patient.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: "24px", margin: 0, color: "#0f172a", fontWeight: "800" }}>{patient.name}</h2>
                      <span style={{ background: "#f1f5f9", color: "#334155", padding: "3px 10px", borderRadius: "6px", fontSize: "13px", fontWeight: "700" }}>
                        MRN: {patient.id}
                      </span>
                      <span style={{ background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: "6px", fontSize: "13px", fontWeight: "700" }}>
                        ● {patient.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "16px", marginTop: "6px", color: "#475569", fontSize: "14px", flexWrap: "wrap" }}>
                      <span>
                        <strong>Age/Sex:</strong> {patient.age}y {patient.sex}
                      </span>
                      <span>•</span>
                      <span>
                        <strong>Location:</strong> {patient.ward_bed}
                      </span>
                      <span>•</span>
                      <span>
                        <strong>Inpatient Duration:</strong> Day {analytics.days_inpatient}
                      </span>
                      <span>•</span>
                      <span>
                        <strong>ECOG:</strong> {analytics.ecog_performance_status} (Ambulatory)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Regimen & Cycle Progress Indicator */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", minWidth: "280px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", fontWeight: "700", color: "#64748b" }}>
                    <span>CHEMOTHERAPY PROTOCOL</span>
                    <span style={{ color: "#0284c7" }}>Cycle {patient.cycle}</span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "800", color: "#1e293b", marginBottom: "8px" }}>
                    {patient.regimen}
                  </div>
                  {/* Progress Bar */}
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, (patient.cycle / 6) * 100)}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#64748b" }}>
                    <span>Primary: {patient.diagnosis}</span>
                    <span>Cycle {patient.cycle}/6</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── KPI Metric Cards ──────────────────────────────────────── */}
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              {/* Card 1: ANC */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Absolute Neutrophils (ANC)
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0 4px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "800", color: ancTraj && ancTraj.current_value < 1000 ? "#dc2626" : "#0284c7" }}>
                    {ancTraj ? ancTraj.current_value.toLocaleString() : "N/A"}
                  </span>
                  <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "600" }}>cells/µL</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                  {ancTraj && ancTraj.percent_change !== undefined && (
                    <span style={{ color: ancTraj.percent_change < 0 ? "#dc2626" : "#16a34a" }}>
                      {ancTraj.percent_change < 0 ? "↓" : "↑"} {Math.abs(ancTraj.percent_change)}% vs baseline
                    </span>
                  )}
                  <span
                    style={{
                      background: ancTraj && ancTraj.current_value < 1000 ? "#fee2e2" : "#f0fdf4",
                      color: ancTraj && ancTraj.current_value < 1000 ? "#991b1b" : "#166534",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    {ancTraj && ancTraj.current_value < 500
                      ? "CTCAE Gr 4"
                      : ancTraj && ancTraj.current_value < 1000
                      ? "CTCAE Gr 3 (Nadir)"
                      : "Normal Reserve"}
                  </span>
                </div>
              </div>

              {/* Card 2: Platelets */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Platelet Reserve
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0 4px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a" }}>
                    {pltTraj ? pltTraj.current_value.toLocaleString() : "N/A"}
                  </span>
                  <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "600" }}>/µL</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                  {pltTraj && pltTraj.percent_change !== undefined && (
                    <span style={{ color: pltTraj.percent_change < -15 ? "#dc2626" : "#64748b" }}>
                      {pltTraj.percent_change < 0 ? "↓" : "↑"} {Math.abs(pltTraj.percent_change)}% vs baseline
                    </span>
                  )}
                  <span style={{ background: "#f0fdf4", color: "#166534", padding: "2px 6px", borderRadius: "4px" }}>
                    Adequate for Chemo
                  </span>
                </div>
              </div>

              {/* Card 3: Graded Toxicities */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Active Graded Toxicities
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0 4px" }}>
                  <span style={{ fontSize: "28px", fontWeight: "800", color: "#ea580c" }}>
                    {analytics.toxicities.length}
                  </span>
                  <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "600" }}>CTCAE Symptoms</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                  <span style={{ background: "#fff7ed", color: "#c2410c", padding: "2px 6px", borderRadius: "4px" }}>
                    Highest: Grade {Math.max(...analytics.toxicities.map((t) => t.grade), 0)}
                  </span>
                  <span style={{ color: "#64748b" }}>
                    {analytics.toxicities.filter((t) => t.grade >= 2).length} require clinical action
                  </span>
                </div>
              </div>

              {/* Card 4: Clinical Safety Alerts */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Clinical Risk Level
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "8px 0 4px" }}>
                  <span style={{ fontSize: "24px", fontWeight: "800", color: analytics.safety_alerts.some((a) => a.severity === "critical") ? "#dc2626" : "#0284c7" }}>
                    {analytics.safety_alerts.some((a) => a.severity === "critical") ? "HIGH RISK" : "MODERATE"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                  <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px" }}>
                    {analytics.safety_alerts.length} Active Safety Sentinels
                  </span>
                </div>
              </div>
            </section>

            {/* ── Interactive Longitudinal Biomarker Charts (Inline SVG) ─── */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", margin: "0 0 4px", color: "#0f172a", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                    <BarChartIcon size={18} color="#0284c7" />
                    <span>Longitudinal Hematologic Trajectory & CTCAE Severity Zones</span>
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Cycle-over-cycle Absolute Neutrophil Count (ANC) trajectory plotted against CTCAE v5.0 bone marrow suppression thresholds.
                  </p>
                </div>

                {/* Severity Legend */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", fontWeight: "600", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", background: "#fee2e2", border: "1px solid #f87171", borderRadius: "2px" }} />
                    Gr 4 (&lt;500)
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "2px" }} />
                    Gr 3 (500-1000)
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: "2px" }} />
                    Gr 2 (1000-1500)
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", background: "#dcfce7", border: "1px solid #4ade80", borderRadius: "2px" }} />
                    Normal (&gt;1500)
                  </span>
                </div>
              </div>

              {/* Inline SVG Chart */}
              {ancTraj && ancTraj.data_points.length > 0 && (
                <div style={{ position: "relative", width: "100%", overflowX: "auto", paddingBottom: "10px" }}>
                  <svg
                    viewBox="0 0 800 280"
                    style={{ width: "100%", height: "auto", minWidth: "650px", display: "block" }}
                    aria-label="ANC Longitudinal Chart"
                  >
                    <defs>
                      <linearGradient id="ancGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* CTCAE Background Severity Zones */}
                    {/* Normal Zone (> 1500 cells/uL) */}
                    <rect x="70" y="20" width="700" height="70" fill="#f0fdf4" fillOpacity="0.6" />
                    <text x="760" y="55" fontSize="10" fill="#16a34a" fontWeight="700" textAnchor="end">NORMAL RESERVE (&gt;1,500)</text>

                    {/* Grade 2 Zone (1000 - 1500 cells/uL) */}
                    <rect x="70" y="90" width="700" height="60" fill="#fefce8" fillOpacity="0.7" />
                    <text x="760" y="125" fontSize="10" fill="#ca8a04" fontWeight="700" textAnchor="end">CTCAE GR 2 (1,000 - 1,500)</text>

                    {/* Grade 3 Zone (500 - 1000 cells/uL) */}
                    <rect x="70" y="150" width="700" height="60" fill="#fffbeb" fillOpacity="0.8" />
                    <text x="760" y="185" fontSize="10" fill="#d97706" fontWeight="700" textAnchor="end">CTCAE GR 3 MODERATE (500 - 1,000)</text>

                    {/* Grade 4 Zone (< 500 cells/uL) */}
                    <rect x="70" y="210" width="700" height="40" fill="#fef2f2" fillOpacity="0.9" />
                    <text x="760" y="235" fontSize="10" fill="#dc2626" fontWeight="700" textAnchor="end">CTCAE GR 4 SEVERE (&lt;500)</text>

                    {/* Dose Modification Threshold Line at 1,000 */}
                    <line x1="70" y1="150" x2="770" y2="150" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="4 3" />
                    <text x="75" y="146" fontSize="10" fill="#ea580c" fontWeight="800">
                      CHEMOTHERAPY WITHHOLD / DOSE-REDUCTION THRESHOLD (1,000 /µL)
                    </text>

                    {/* Horizontal Gridlines & Y-Axis Labels */}
                    {[
                      { y: 20, val: "2,000" },
                      { y: 90, val: "1,500" },
                      { y: 150, val: "1,000" },
                      { y: 210, val: "500" },
                      { y: 250, val: "0" },
                    ].map((g, idx) => (
                      <g key={idx}>
                        <line x1="60" y1={g.y} x2="770" y2={g.y} stroke="#e2e8f0" strokeWidth="1" />
                        <text x="55" y={g.y + 4} fontSize="11" fill="#64748b" textAnchor="end" fontWeight="600">
                          {g.val}
                        </text>
                      </g>
                    ))}

                    {/* Coordinate Calculation Helper:
                        Y: val 2000 -> 20, val 0 -> 250
                        yPos = 250 - (value / 2000) * 230
                        X spacing across points:
                    */}
                    {(() => {
                      const count = ancTraj.data_points.length;
                      const xStart = 130;
                      const xEnd = 720;
                      const step = count > 1 ? (xEnd - xStart) / (count - 1) : 0;

                      const coords = ancTraj.data_points.map((pt, i) => {
                        const cx = count > 1 ? xStart + i * step : 400;
                        const cy = Math.max(20, Math.min(250, 250 - (pt.value / 2000) * 230));
                        return { cx, cy, pt };
                      });

                      const pathD = coords.reduce((acc, c, i) => (i === 0 ? `M ${c.cx} ${c.cy}` : `${acc} L ${c.cx} ${c.cy}`), "");
                      const areaD = `${pathD} L ${coords[coords.length - 1].cx} 250 L ${coords[0].cx} 250 Z`;

                      return (
                        <g>
                          {/* Filled Area */}
                          <path d={areaD} fill="url(#ancGradient)" />

                          {/* Connecting Line */}
                          <path d={pathD} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                          {/* Data Nodes */}
                          {coords.map((c, i) => {
                            const isCurrent = i === coords.length - 1;
                            const isWarning = c.pt.value < 1000;
                            const circleColor = isWarning ? "#dc2626" : "#0284c7";

                            return (
                              <g
                                key={i}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={() => setHoveredPoint(c.pt)}
                                onMouseLeave={() => setHoveredPoint(null)}
                              >
                                {isCurrent && (
                                  <circle cx={c.cx} cy={c.cy} r="14" fill={circleColor} fillOpacity="0.2" />
                                )}
                                <circle
                                  cx={c.cx}
                                  cy={c.cy}
                                  r={isCurrent ? "7" : "5"}
                                  fill="#ffffff"
                                  stroke={circleColor}
                                  strokeWidth="3"
                                />

                                {/* Value Label above point */}
                                <text
                                  x={c.cx}
                                  y={c.cy - 12}
                                  fontSize="12"
                                  fontWeight="800"
                                  fill={circleColor}
                                  textAnchor="middle"
                                >
                                  {c.pt.value.toLocaleString()}
                                </text>

                                {/* X-Axis Label */}
                                <text
                                  x={c.cx}
                                  y="270"
                                  fontSize="12"
                                  fill={isCurrent ? "#0f172a" : "#64748b"}
                                  fontWeight={isCurrent ? "800" : "600"}
                                  textAnchor="middle"
                                >
                                  {c.pt.label}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })()}
                  </svg>

                  {/* Tooltip Hover Overlay */}
                  {hoveredPoint && (
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        left: "80px",
                        background: "#1e293b",
                        color: "#ffffff",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        pointerEvents: "none",
                        zIndex: 10,
                      }}
                    >
                      <div style={{ fontWeight: "700" }}>{hoveredPoint.label} ({hoveredPoint.date})</div>
                      <div>ANC: {hoveredPoint.value} {hoveredPoint.unit}</div>
                      <div style={{ color: hoveredPoint.ctcae_grade >= 3 ? "#f87171" : "#4ade80" }}>
                        Severity: CTCAE Grade {hoveredPoint.ctcae_grade} ({hoveredPoint.status.toUpperCase()})
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── CTCAE v5.0 Toxicity & Symptom Severity Matrix ──────────── */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", margin: "0 0 4px", color: "#0f172a", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                    <ActivityIcon size={18} color="#0284c7" />
                    <span>CTCAE v5.0 Adverse Event Toxicity Matrix</span>
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Standardized Common Terminology Criteria for Adverse Events grading with oncology management protocols.
                  </p>
                </div>
                <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "4px 10px", borderRadius: "6px", fontWeight: "700", color: "#475569" }}>
                  v5.0 NCI Criteria
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "14px" }}>
                {analytics.toxicities.map((tox, idx) => {
                  let gradeBg = "#f0fdf4";
                  let gradeText = "#166534";
                  let border = "#bbf7d0";

                  if (tox.grade === 1) {
                    gradeBg = "#f0f9ff";
                    gradeText = "#0369a1";
                    border = "#bae6fd";
                  } else if (tox.grade === 2) {
                    gradeBg = "#fefce8";
                    gradeText = "#854d0e";
                    border = "#fef08a";
                  } else if (tox.grade >= 3) {
                    gradeBg = "#fef2f2";
                    gradeText = "#991b1b";
                    border = "#fecaca";
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        background: "#fafbfc",
                        border: `1px solid ${border}`,
                        borderLeft: `5px solid ${tox.grade >= 3 ? "#dc2626" : tox.grade === 2 ? "#ca8a04" : "#0284c7"}`,
                        borderRadius: "10px",
                        padding: "16px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>
                            {tox.category}
                          </span>
                          <h4 style={{ fontSize: "15px", margin: "2px 0 0", color: "#0f172a", fontWeight: "700" }}>
                            {tox.symptom}
                          </h4>
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span
                            style={{
                              background: gradeBg,
                              color: gradeText,
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "800",
                            }}
                          >
                            Grade {tox.grade}
                          </span>
                          <span style={{ fontSize: "11px", color: tox.trend === "worsening" ? "#dc2626" : "#16a34a", fontWeight: "700" }}>
                            {tox.trend === "worsening" ? "↗ Worsening" : tox.trend === "improving" ? "↘ Improving" : "→ Stable"}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: "13px", color: "#334155", margin: "0 0 10px", lineHeight: "1.4" }}>
                        {tox.description}
                      </p>

                      <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#0369a1", marginBottom: "2px", textTransform: "uppercase" }}>
                          Protocol Recommendation:
                        </div>
                        <div style={{ fontSize: "12px", color: "#1e293b", lineHeight: "1.4" }}>
                          {tox.management_recommendation}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Two Columns: Safety Alerts & Guideline Concordance ──────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "20px", marginBottom: "24px" }}>
              {/* Left Column: Safety Radar & Alerts */}
              <section
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "18px", margin: 0, color: "#0f172a", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <AlertCircleIcon size={18} color="#dc2626" />
                    <span>Active Clinical Safety Radar</span>
                  </h3>
                  <span style={{ background: "#fee2e2", color: "#991b1b", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700" }}>
                    {analytics.safety_alerts.length} ALERTS
                  </span>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  {analytics.safety_alerts.map((alert) => {
                    const isCrit = alert.severity === "critical";
                    return (
                      <div
                        key={alert.id}
                        style={{
                          background: isCrit ? "#fef2f2" : "#fff7ed",
                          border: `1px solid ${isCrit ? "#fca5a5" : "#fed7aa"}`,
                          borderLeft: `5px solid ${isCrit ? "#dc2626" : "#ea580c"}`,
                          borderRadius: "10px",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: isCrit ? "#991b1b" : "#9a3412" }}>
                            {isCrit ? "CRITICAL: " : "WARNING: "} {alert.title}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>
                            {alert.status.toUpperCase()}
                          </span>
                        </div>

                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b", marginBottom: "6px" }}>
                          {alert.message}
                        </div>

                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px", lineHeight: "1.4" }}>
                          <strong>Rationale:</strong> {alert.rationale}
                        </div>

                        <div style={{ background: "#ffffff", padding: "8px 10px", borderRadius: "6px", fontSize: "12px", color: "#0f172a", border: "1px solid #e2e8f0" }}>
                          <strong>Immediate Action:</strong> {alert.action_required}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Right Column: ASCO / NCCN Guideline Concordance */}
              <section
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "18px", margin: 0, color: "#0f172a", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <ShieldIcon size={18} color="#0284c7" />
                    <span>ASCO / NCCN Guideline Concordance</span>
                  </h3>
                  <span style={{ background: "#f0fdf4", color: "#166534", padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700" }}>
                    EVIDENCE-LINKED
                  </span>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  {analytics.guidelines.map((g, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "14px 16px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <h4 style={{ fontSize: "14px", margin: 0, color: "#0f172a", fontWeight: "700" }}>
                          {g.title}
                        </h4>
                        <span
                          style={{
                            background: g.concordance === "Concordant" ? "#dcfce7" : "#fee2e2",
                            color: g.concordance === "Concordant" ? "#166534" : "#991b1b",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.concordance}
                        </span>
                      </div>

                      <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: "700", marginBottom: "6px" }}>
                        Source: {g.source} · Evidence Level: {g.evidence_level}
                      </div>

                      <p style={{ fontSize: "13px", color: "#334155", margin: 0, lineHeight: "1.4" }}>
                        {g.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ── Longitudinal Ward Rounds History & Note Audit Timeline ─── */}
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "24px",
                marginBottom: "24px",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", margin: "0 0 4px", color: "#0f172a", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <FileTextIcon size={18} color="#0284c7" />
                    <span>Longitudinal Ward Rounds & Clinical Notes Timeline</span>
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Audit trail of previous rounds, attending clinician sign-offs, and SOAP note extractions.
                  </p>
                </div>
                <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                  {analytics.rounds_history.length} Encounters Catalogued
                </span>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {analytics.rounds_history.map((round) => {
                  const isExpanded = expandedNoteId === round.round_id;
                  return (
                    <div
                      key={round.round_id}
                      style={{
                        background: "#fafbfc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "16px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "13px", fontWeight: "800", color: "#0284c7" }}>
                              {round.date}
                            </span>
                            <span style={{ background: "#e0e7ff", color: "#3730a3", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>
                              Cycle {round.cycle}
                            </span>
                            <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>
                              ✓ {round.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>
                            <strong>Attending:</strong> {round.clinician}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedNoteId(isExpanded ? null : round.round_id)}
                          style={{
                            padding: "5px 12px",
                            background: "#f1f5f9",
                            color: "#0284c7",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? "▲ Hide Clinical Note" : "▼ View Clinical Note"}
                        </button>
                      </div>

                      <p style={{ fontSize: "13px", color: "#334155", margin: "10px 0 0", lineHeight: "1.4" }}>
                        {round.summary}
                      </p>

                      {isExpanded && (
                        <div style={{ marginTop: "12px", padding: "14px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "6px", textTransform: "uppercase" }}>
                            Documented Note Snippet (SOAP Format):
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              fontSize: "12px",
                              lineHeight: "1.5",
                              whiteSpace: "pre-wrap",
                              color: "#1e293b",
                              fontFamily: "monospace",
                            }}
                          >
                            {round.note_snippet}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── AI Clinical Trajectory Synthesis ──────────────────────── */}
            <section
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
                border: "1px solid #bae6fd",
                borderRadius: "16px",
                padding: "24px",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <SparklesIcon size={20} color="#0369a1" />
                <h3 style={{ fontSize: "18px", margin: 0, color: "#0369a1", fontWeight: "800" }}>
                  AI Longitudinal Clinical Trajectory Synthesis
                </h3>
              </div>
              <p style={{ fontSize: "14px", color: "#1e293b", lineHeight: "1.6", margin: 0 }}>
                {analytics.clinical_synthesis}
              </p>
            </section>

            {/* ── Action Toolbar: Transition to Assessment Station ──────── */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                padding: "16px 20px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "14px",
              }}
            >
              <div>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>
                  Ready to assess today's round for {patient.name}?
                </span>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  Loads patient demographics and baseline counts directly into the Doctor Assessment Station.
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  href={`/?patientId=${patient.id}`}
                  style={{
                    padding: "10px 18px",
                    background: "#0284c7",
                    color: "#ffffff",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: "700",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
                  }}
                >
                  <FileTextIcon size={16} color="#ffffff" />
                  <span>Assess Round for #{patient.id}</span>
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
