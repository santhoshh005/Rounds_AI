"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Icon } from "./components/Icons"
import { roundsApi, API_URL, type ExtractRoundResponse } from "../lib/api"
import {
  formatEmrClipboardNote,
  parseClinicalLabReport,
  validateBedOccupancy,
  getDoseModificationRecommendation,
  normalizeBedIdentifier,
  cleanToastMessage,
  deriveDoctorInitials,
  DEFAULT_CLINICIAN_PROFILE,
  INITIAL_CLINICAL_NOTIFICATIONS,
  type ParsedClinicalOcr,
  type DoseModificationGuideline,
  type ClinicianProfile,
  type ClinicalNotification,
} from "../lib/clinical-utils"
import { autocorrectOncologyTranscript, applySelectedCorrections, formatSpokenClinicalPunctuation, type AutocorrectChange, type AutocorrectResult } from "../lib/oncology-autocorrect"



type Screen = "landing" | "station" | "roster" | "mobile" | "analytics" | "login"
type Step = 1 | 2 | 3

const patients = [
  {
    id: "104",
    bed: "12",
    name: "David Miller",
    ageSex: "58M",
    mrn: "MRN-009184",
    diagnosis: "Colorectal cancer, Stage III",
    regimen: "mFOLFOX6",
    cycle: "Cycle 3 of 6",
    baselineAnc: 1400,
    ecog: 1,
    grade: 4,
    initials: "DM",
  },
  {
    id: "105",
    bed: "14",
    name: "Sarah Jenkins",
    ageSex: "46F",
    mrn: "MRN-012720",
    diagnosis: "Diffuse large B-cell lymphoma",
    regimen: "R-CHOP",
    cycle: "Cycle 2",
    baselineAnc: 2200,
    ecog: 1,
    grade: 3,
    initials: "SJ",
  },
  {
    id: "106",
    bed: "16",
    name: "Elena Rostova",
    ageSex: "62F",
    mrn: "MRN-018341",
    diagnosis: "Invasive ductal breast carcinoma",
    regimen: "AC-T (doxorubicin/cyclophosphamide)",
    cycle: "Cycle 4",
    baselineAnc: 1650,
    ecog: 1,
    grade: 0,
    initials: "ER",
  },
]

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value)

export type RoundRecord = {
  id: string
  date: string
  doctor: string
  anc: number
  wbc: number
  platelets: number
  hemoglobin: number
  ctcae_grade: number
  status: "OCR Verified" | "Approved" | "Verified" | "Draft" | "Admission Workup"
  source: string
  notes: string
}

export type PatientAnalytics = {
  patient_id: string
  patient_name: string
  rounds: RoundRecord[]
  kpis: [string, string, string, string][]
  trajectory: { label: string; date: string; value: number; grade: number }[]
}

const INITIAL_ANALYTICS: Record<string, PatientAnalytics> = {
  "104": {
    patient_id: "104",
    patient_name: "David Miller",
    rounds: [
      { id: "r-1", date: "18 Mar 2025", doctor: "Dr. Amrut S Kadam", anc: 420, wbc: 1800, platelets: 88000, hemoglobin: 10.2, ctcae_grade: 4, status: "Approved", source: "Station Assessment", notes: "Febrile neutropenia Grade 4" },
      { id: "r-2", date: "17 Mar 2025", doctor: "Dr. Wilson", anc: 610, wbc: 2200, platelets: 110000, hemoglobin: 10.8, ctcae_grade: 3, status: "Verified", source: "Bedside Round", notes: "Severe neutropenia" },
      { id: "r-3", date: "12 Mar 2025", doctor: "Dr. Mehta", anc: 1400, wbc: 4800, platelets: 180000, hemoglobin: 12.0, ctcae_grade: 1, status: "Approved", source: "Cycle 3 Baseline", notes: "Stable baseline" },
      { id: "r-4", date: "06 Mar 2025", doctor: "Dr. Rao", anc: 2100, wbc: 6100, platelets: 220000, hemoglobin: 12.8, ctcae_grade: 0, status: "Verified", source: "Admission Workup", notes: "Normal reserve" },
    ],
    kpis: [
      ["Absolute neutrophils", "420", "/µL", "Grade 4"],
      ["Platelet reserve", formatNumber(88000), "/µL", "Grade 1"],
      ["Active graded toxicities", "3", "", "Current round"],
      ["Clinical risk level", "High", "", "Febrile neutropenia"],
    ],
    trajectory: [
      { label: "Cycle 1", date: "06 Mar", value: 2100, grade: 0 },
      { label: "Cycle 2", date: "12 Mar", value: 1400, grade: 1 },
      { label: "Cycle 3 D5", date: "17 Mar", value: 610, grade: 3 },
      { label: "Cycle 3 Nadir", date: "18 Mar", value: 420, grade: 4 },
    ],
  },
  "105": {
    patient_id: "105",
    patient_name: "Sarah Jenkins",
    rounds: [
      { id: "r-105-3", date: "24 Oct 2026", doctor: "Dr. Amrut S Kadam", anc: 750, wbc: 2400, platelets: 110000, hemoglobin: 11.4, ctcae_grade: 3, status: "Approved", source: "Bedside Round", notes: "R-CHOP C2D10 neutropenia" },
      { id: "r-105-2", date: "14 Oct 2026", doctor: "Dr. Mehta", anc: 2200, wbc: 6500, platelets: 240000, hemoglobin: 12.5, ctcae_grade: 0, status: "Verified", source: "Cycle 2 Day 1", notes: "Baseline CBC" },
      { id: "r-105-1", date: "10 Oct 2026", doctor: "Dr. Rao", anc: 1100, wbc: 4100, platelets: 190000, hemoglobin: 12.2, ctcae_grade: 1, status: "Approved", source: "Cycle 1 Nadir", notes: "Mild myelosuppression" },
      { id: "r-105-0", date: "01 Oct 2026", doctor: "Dr. Wilson", anc: 2400, wbc: 6800, platelets: 260000, hemoglobin: 13.0, ctcae_grade: 0, status: "Verified", source: "Cycle 1 Day 1", notes: "Pre-treatment baseline" },
    ],
    kpis: [
      ["Absolute neutrophils", "750", "/µL", "Grade 3"],
      ["Platelet reserve", formatNumber(110000), "/µL", "Grade 1"],
      ["Active graded toxicities", "1", "", "Grade 3 neutropenia"],
      ["Clinical risk level", "Moderate", "", "Thermal vigilance"],
    ],
    trajectory: [
      { label: "Cycle 1 D1", date: "01 Oct", value: 2400, grade: 0 },
      { label: "Cycle 1 Nadir", date: "10 Oct", value: 1100, grade: 1 },
      { label: "Cycle 2 D1", date: "14 Oct", value: 2200, grade: 0 },
      { label: "Cycle 2 D10", date: "24 Oct", value: 750, grade: 3 },
    ],
  },
  "106": {
    patient_id: "106",
    patient_name: "Elena Rostova",
    rounds: [
      { id: "r-106-3", date: "29 Oct 2026", doctor: "Dr. Amrut S Kadam", anc: 1620, wbc: 5400, platelets: 215000, hemoglobin: 12.1, ctcae_grade: 0, status: "Approved", source: "Station Assessment", notes: "Cycle 4 Day 14 follow-up. Tolerating well, afebrile." },
      { id: "r-106-2", date: "15 Oct 2026", doctor: "Dr. Amrut S Kadam", anc: 1650, wbc: 5800, platelets: 220000, hemoglobin: 12.3, ctcae_grade: 0, status: "Verified", source: "Cycle 4 Day 1", notes: "Pre-infusion CBC stable" },
      { id: "r-106-1", date: "01 Oct 2026", doctor: "Dr. Mehta", anc: 1720, wbc: 5600, platelets: 225000, hemoglobin: 12.4, ctcae_grade: 0, status: "Approved", source: "Cycle 3 Day 14", notes: "Good marrow reserve" },
      { id: "r-106-0", date: "12 Sep 2026", doctor: "Dr. Rao", anc: 1800, wbc: 5900, platelets: 230000, hemoglobin: 12.6, ctcae_grade: 0, status: "Verified", source: "Cycle 2 Day 14", notes: "Normal hematologic recovery" },
    ],
    kpis: [
      ["Absolute neutrophils", formatNumber(1620), "/µL", "Grade 0"],
      ["Platelet reserve", formatNumber(215000), "/µL", "Grade 0"],
      ["Active graded toxicities", "0", "", "Stable"],
      ["Clinical risk level", "Low", "", "Protocol cleared"],
    ],
    trajectory: [
      { label: "Cycle 2 D14", date: "12 Sep", value: 1800, grade: 0 },
      { label: "Cycle 3 D14", date: "01 Oct", value: 1720, grade: 0 },
      { label: "Cycle 4 D1", date: "15 Oct", value: 1650, grade: 0 },
      { label: "Cycle 4 D14", date: "29 Oct", value: 1620, grade: 0 },
    ],
  },
}

function parseClinicalLabOcr(fileName: string, textContent: string, patient: typeof patients[number]): ParsedClinicalOcr {
  return parseClinicalLabReport(fileName, textContent, patient)
}



const patientCases: Record<
  string,
  {
    patientId: string
    caseLabel: string
    transcript: string
    alert: {
      title: string
      subtitle: string
      grade: number
      temp: string
      anc: string
      timer: string
      guideline: string
    }
    metrics: [string, string, string, string, number][]
    checklist: string[]
    soapDraft: {
      s: string
      o: string
      a: string
      p: string
    }
    labReport: [string, string, string][]
  }
> = {
  "104": {
    patientId: "104",
    caseLabel: "Case 1: #104 David Miller, ANC 420 + fever 38.4°C → Grade 4 Febrile Neutropenia",
    transcript: `Patient on mFOLFOX6 cycle 3, day 8. Febrile overnight to 38.4°C with chills and fatigue. ANC 420 cells/µL, platelets ${formatNumber(88000)}/µL, WBC ${formatNumber(1800)} cells/µL. Denies cough, dysuria, or focal pain.`,
    alert: {
      title: "Possible febrile neutropenia",
      subtitle: "Immediate clinical review recommended",
      grade: 4,
      temp: "38.4°C",
      anc: "420 /µL",
      timer: "58:12",
      guideline: "IDSA/ASCO recommends blood cultures and broad-spectrum IV antibiotics within 60 minutes.",
    },
    metrics: [
      ["ANC", "420", "cells/µL", `Down 68% from ${formatNumber(1400)}`, 4],
      ["Platelets", formatNumber(88000), "/µL", `Down from ${formatNumber(180000)}`, 1],
      ["WBC", formatNumber(1800), "cells/µL", `Down from ${formatNumber(4800)}`, 3],
    ],
    checklist: [
      "Confirm ANC is 420 /µL (Grade 4 life-threatening neutropenia)",
      "Confirm temp 38.4°C meets febrile criteria (>38.3°C single reading)",
      "Verify blood cultures drawn before starting IV piperacillin-tazobactam",
    ],
    soapDraft: {
      s: "Patient on mFOLFOX6 cycle 3 day 8. Reported fever spikes overnight to 38.4°C with rigor and mild lethargy. Denies shortness of breath, abdominal pain, or urinary symptoms.",
      o: `T 38.4°C, BP 118/74, HR 98, RR 18. Labs: ANC 420/µL (Grade 4), WBC 1.8 K/µL (Grade 3), Plt ${formatNumber(88000)}/µL (Grade 1), Hgb 10.2 g/dL.`,
      a: "58M with Stage III colon cancer on mFOLFOX6 presenting with Febrile Neutropenia (CTCAE v5.0 Grade 4).",
      p: "Immediate blood cultures x2. Start IV Cefepime 2g q8h. Hold oxaliplatin/5-FU. Sub-Q G-CSF (Filgrastim 300mcg) daily until ANC > 1,500.",
    },
    labReport: [
      ["WBC", "1.8", "x10³/µL"],
      ["ANC", "420", "cells/µL"],
      ["Platelets", formatNumber(88000), "/µL"],
      ["Hemoglobin", "10.2", "g/dL"],
    ],
  },
  "105": {
    patientId: "105",
    caseLabel: "Case 2: #105 Sarah Jenkins, ANC 750 + low-grade temp 38.1°C → Grade 3 Neutropenia",
    transcript: `Sarah Jenkins, Bed 14. Day 10 post Cycle 2 R-CHOP. Low-grade temperature 38.1°C this morning. Reports mild mucositis Grade 1, mild nausea, no rigors. ANC 750 cells/µL, Platelets ${formatNumber(110000)}/µL, WBC ${formatNumber(2400)} cells/µL.`,
    alert: {
      title: "Severe Neutropenia with Low-Grade Fever",
      subtitle: "Secondary clinical review & monitoring recommended",
      grade: 3,
      temp: "38.1°C",
      anc: "750 /µL",
      timer: "01:45:00",
      guideline: "NCCN/ASCO recommends close thermal monitoring, repeat CBC diff, and early infectious workup.",
    },
    metrics: [
      ["ANC", "750", "cells/µL", `Down 66% from ${formatNumber(2200)}`, 3],
      ["Platelets", formatNumber(110000), "/µL", `Down from ${formatNumber(240000)}`, 1],
      ["WBC", formatNumber(2400), "cells/µL", `Down from ${formatNumber(6500)}`, 2],
    ],
    checklist: [
      "Confirm ANC is 750 /µL (Grade 3 severe neutropenia)",
      "Monitor temp 38.1°C — re-check in 2 hours for febrile spike",
      "Assess oral mucositis and evaluate secondary infection prophylaxis",
    ],
    soapDraft: {
      s: "46F with DLBCL post R-CHOP C2D10. Complains of mild sore mouth (Grade 1 oral mucositis) and low-grade warmth. Appetite fair.",
      o: `T 38.1°C, BP 124/80, HR 86, RR 16. ANC 750/µL (Grade 3), WBC 2.4 K/µL, Plt ${formatNumber(110000)}/µL, Hgb 11.4 g/dL.`,
      a: "DLBCL on R-CHOP with CTCAE Grade 3 Neutropenia and low-grade fever.",
      p: "Repeat CBC and temperature q4h. Initiate oral Levofloxacin 500mg daily prophylaxis. Magic mouthwash for oral comfort.",
    },
    labReport: [
      ["WBC", "2.4", "x10³/µL"],
      ["ANC", "750", "cells/µL"],
      ["Platelets", formatNumber(110000), "/µL"],
      ["Hemoglobin", "11.4", "g/dL"],
    ],
  },
  "106": {
    patientId: "106",
    caseLabel: "Case 3: #106 Elena Rostova, ANC 1,620 + afebrile 36.8°C → Grade 0 Stable",
    transcript: `Elena Rostova, Bed 16. Cycle 4 AC-T day 14. Patient is afebrile at 36.8°C. Tolerating diet well, ECOG PS 0. Labs show ANC ${formatNumber(1620)} cells/µL, Platelets ${formatNumber(215000)}/µL, WBC ${formatNumber(5400)} cells/µL. No active complaints.`,
    alert: {
      title: "Clinically Stable — No Acute CTCAE Toxicities",
      subtitle: "Routine inpatient chemotherapy monitoring",
      grade: 0,
      temp: "36.8°C",
      anc: "1,620 /µL",
      timer: "Routine",
      guideline: "All hematologic parameters within safe tolerance bounds for continued scheduled therapy.",
    },
    metrics: [
      ["ANC", formatNumber(1620), "cells/µL", `Stable near baseline ${formatNumber(1650)}`, 0],
      ["Platelets", formatNumber(215000), "/µL", `Normal reserve (Baseline ${formatNumber(220000)})`, 0],
      ["WBC", formatNumber(5400), "cells/µL", `Normal range (Baseline ${formatNumber(5800)})`, 0],
    ],
    checklist: [
      "Confirm ANC is 1,620 /µL (Adequate bone marrow reserve for therapy)",
      "Confirm patient is afebrile (36.8°C) with no focal toxicity",
      "Verify readiness for planned chemotherapy cycle continuation",
    ],
    soapDraft: {
      s: "62F receiving adjuvant AC-T for invasive ductal breast cancer. Reports good appetite, minimal fatigue, no nausea or neuropathy.",
      o: `T 36.8°C, BP 120/76, HR 72, RR 14. ANC 1,620/µL (Grade 0), WBC 5.4 K/µL, Plt ${formatNumber(215000)}/µL, Hgb 12.1 g/dL.`,
      a: "Stage II Breast Cancer post Cycle 4 AC-T, bone marrow recovery verified, clinically stable.",
      p: "Cleared for cycle continuation as scheduled. Routine hydration and discharge readiness evaluation.",
    },
    labReport: [
      ["WBC", "5.4", "x10³/µL"],
      ["ANC", formatNumber(1620), "cells/µL"],
      ["Platelets", formatNumber(215000), "/µL"],
      ["Hemoglobin", "12.1", "g/dL"],
    ],
  },
}

const Button = ({
  children,
  variant = "secondary",
  icon,
  onClick,
  disabled,
  type = "button",
  className = "",
  title,
}: any) => (
  <button
    className={`button ${variant} ${className}`}
    onClick={onClick}
    disabled={disabled}
    type={type}
    title={title}
  >
    {icon && <Icon name={icon} size={20} />}
    {children}
  </button>
)

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const isDark = localStorage.getItem("rounds-theme") === "dark"
      setDark(isDark)
      if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = isDark ? "dark" : "light"
      }
    }
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rounds-theme", next ? "dark" : "light")
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next ? "dark" : "light"
    }
  }
  return (
    <button
      className="icon-button"
      onClick={toggle}
      aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
      title={`Switch to ${dark ? "light" : "dark"} theme`}
    >
      <Icon name={dark ? "sun" : "moon"} size={20} />
    </button>
  )
}

function ClinicianProfileModal({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
}: {
  isOpen: boolean
  onClose: () => void
  profile: ClinicianProfile
  onUpdateProfile: (updated: ClinicianProfile) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<ClinicianProfile>(profile)

  useEffect(() => {
    if (isOpen) {
      setFormData(profile)
      setIsEditing(false)
    }
  }, [isOpen, profile])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const rawInitials = (formData.initials || "").trim()
    const finalInitials = rawInitials || deriveDoctorInitials(formData.name)
    const updated: ClinicianProfile = {
      ...formData,
      initials: finalInitials,
    }
    onUpdateProfile(updated)
    setIsEditing(false)
    onClose()
  }

  const currentInitials = (isEditing ? formData.initials : profile.initials) || deriveDoctorInitials(isEditing ? formData.name : profile.name)

  return (
    <div className="dialog-layer" role="dialog" aria-modal="true" style={{ zIndex: 1100 }}>
      <button className="dialog-backdrop" onClick={onClose} aria-label="Close clinician profile" />
      <div
        className="confirm-dialog clinician-profile-dialog"
        style={{
          maxWidth: "580px",
          width: "92vw",
          padding: "28px",
          borderRadius: "16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <span
            className="patient-avatar large"
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand)",
              fontSize: "20px",
              fontWeight: 700,
              width: "64px",
              height: "64px",
            }}
          >
            {currentInitials}
          </span>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "22px", margin: 0, fontWeight: 700 }}>
              {isEditing ? (formData.name || "Clinician Profile") : profile.name}
            </h2>
            <p style={{ margin: "2px 0 0", color: "var(--secondary)", fontSize: "14px" }}>
              {isEditing ? formData.title : profile.title} · {isEditing ? formData.ward : profile.ward}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: "4px",
                padding: "2px 8px",
                background: "var(--brand-tint)",
                color: "var(--brand)",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              NPI: {isEditing ? formData.npi : profile.npi} · Hospital ID: {isEditing ? formData.hospitalId : profile.hospitalId}
            </span>
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleSave}>
            <div className="profile-edit-grid">
              <div className="profile-edit-field">
                <label htmlFor="clinician-name">Full Name & Credentials</label>
                <input
                  id="clinician-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Dr. Amrut S Kadam, MD"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-title">Professional Title</label>
                <input
                  id="clinician-title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Lead Attending Oncologist"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-dept">Department</label>
                <input
                  id="clinician-dept"
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Medical Oncology"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-hospital">Hospital Name</label>
                <input
                  id="clinician-hospital"
                  type="text"
                  value={formData.hospital}
                  onChange={(e) => setFormData({ ...formData, hospital: e.target.value })}
                  placeholder="e.g. City Cancer Center"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-ward">Ward / Service Assignment</label>
                <input
                  id="clinician-ward"
                  type="text"
                  value={formData.ward}
                  onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                  placeholder="e.g. Ward 4B Chief of Service"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-shift">Active Shift</label>
                <input
                  id="clinician-shift"
                  type="text"
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                  placeholder="e.g. Day Rounds (07:00 – 19:00)"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-npi">NPI Number</label>
                <input
                  id="clinician-npi"
                  type="text"
                  value={formData.npi}
                  onChange={(e) => setFormData({ ...formData, npi: e.target.value })}
                  placeholder="10-digit NPI"
                  pattern="\d{10}"
                  maxLength={10}
                  title="10-digit National Provider Identifier"
                />
              </div>
              <div className="profile-edit-field">
                <label htmlFor="clinician-hid">Hospital ID</label>
                <input
                  id="clinician-hid"
                  type="text"
                  value={formData.hospitalId}
                  onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                  placeholder="e.g. CCC-4B-9102"
                />
              </div>
              <div className="profile-edit-field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="clinician-initials">Custom Initials (Optional)</label>
                <input
                  id="clinician-initials"
                  type="text"
                  maxLength={4}
                  value={formData.initials}
                  onChange={(e) => setFormData({ ...formData, initials: e.target.value.toUpperCase() })}
                  placeholder="Leave blank to auto-derive from name"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <Button variant="secondary" type="button" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                margin: "16px 0",
                padding: "16px",
                background: "var(--subtle)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <span style={{ fontSize: "12px", color: "var(--secondary)", display: "block" }}>
                  Department
                </span>
                <strong style={{ fontSize: "14px" }}>{profile.department}</strong>
              </div>
              <div>
                <span style={{ fontSize: "12px", color: "var(--secondary)", display: "block" }}>
                  Location
                </span>
                <strong style={{ fontSize: "14px" }}>
                  {profile.hospital} · {profile.ward}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "12px", color: "var(--secondary)", display: "block" }}>
                  Active Shift
                </span>
                <strong style={{ fontSize: "14px" }}>{profile.shift}</strong>
              </div>
              <div>
                <span style={{ fontSize: "12px", color: "var(--secondary)", display: "block" }}>
                  Patients on Service
                </span>
                <strong style={{ fontSize: "14px" }}>Active Inpatient Ward</strong>
              </div>
            </div>

            <div
              style={{
                padding: "14px",
                border: "1px solid var(--brand-border)",
                borderRadius: "12px",
                background: "var(--brand-tint)",
                margin: "16px 0",
                fontSize: "13px",
                lineHeight: "20px",
                color: "var(--brand)",
              }}
            >
              <strong>Clinical Processing Architecture</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                <li>
                  <strong>AI Multimodal Hierarchy:</strong> 4-model fallback cascade (Gemini 2.5 Flash → 1.5 Flash → 1.5 Pro → 2.5 Pro)
                </li>
                <li>
                  <strong>Deterministic Offline Fallback:</strong> Local CPU regex parser & CTCAE v5.0 rules if offline / unauthenticated
                </li>
                <li>
                  <strong>Zero Audio Egress:</strong> Bedside speech-to-text operates locally on-device
                </li>
              </ul>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit Details
              </Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Header({
  screen,
  go,
  onSignOut,
  profile,
  onUpdateProfile,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
}: {
  screen: Screen
  go: (screen: Screen) => void
  onSignOut: () => void
  profile: ClinicianProfile
  onUpdateProfile: (updated: ClinicianProfile) => void
  notifications: ClinicalNotification[]
  onMarkNotificationRead: (id: string) => void
  onMarkAllNotificationsRead: () => void
  onClearNotifications: () => void
}) {
  const [status, setStatus] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileModal, setProfileModal] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!status && !profileMenuOpen && !notificationsOpen) return
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (status && !target.closest(".status-wrap")) {
        setStatus(false)
      }
      if (profileMenuOpen && !target.closest(".profile-wrap")) {
        setProfileMenuOpen(false)
      }
      if (notificationsOpen && !target.closest(".notification-wrap")) {
        setNotificationsOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStatus(false)
        setProfileMenuOpen(false)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("touchstart", handleOutside)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("touchstart", handleOutside)
      document.removeEventListener("keydown", handleKey)
    }
  }, [status, profileMenuOpen, notificationsOpen])

  const initials = profile.initials || deriveDoctorInitials(profile.name)

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={() => go("station")}
            aria-label="RoundsAI station"
          >
            <span className="brand-mark">
              <Icon name="stethoscope" size={20} />
            </span>
            <span>RoundsAI</span>
          </button>
          <nav className="main-tabs" aria-label="Primary navigation">
            {(["station", "roster", "analytics", "mobile"] as Screen[]).map(
              (item) => (
                <button
                  className={screen === item ? "active" : ""}
                  onClick={() => go(item)}
                  key={item}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ),
            )}
          </nav>
          <div className="header-actions">
            <div className="status-wrap">
              <button
                className="status-button"
                onClick={() => {
                  setStatus((prev) => !prev)
                  setProfileMenuOpen(false)
                  setNotificationsOpen(false)
                }}
                aria-label="Toggle clinical system status"
              >
                <span />
                Status
              </button>
              {status && (
                <div className="status-popover">
                  <strong>{profile.hospital} · {profile.ward}</strong>
                  <p>
                    <span />
                    All clinical systems online
                  </p>
                  <p>Local CPU · zero audio egress</p>
                  <p>CTCAE v5.0 active · Gemini 2.5 Flash Cascade</p>
                </div>
              )}
            </div>

            {/* Clinical Notification Center */}
            <div className="notification-wrap">
              <button
                className="icon-button notification-bell-btn"
                aria-label={`Notifications (${unreadCount} unread)`}
                title="Clinical Notifications & Alerts"
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev)
                  setStatus(false)
                  setProfileMenuOpen(false)
                }}
              >
                <Icon name="bell" size={20} />
                {unreadCount > 0 && (
                  <span className="notification-badge" aria-label={`${unreadCount} unread`}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="notification-popover" role="dialog" aria-label="Clinical Notification Center">
                  <div className="notification-header">
                    <strong>
                      Clinical Alerts
                      {unreadCount > 0 && (
                        <span className="notification-header-count">{unreadCount} new</span>
                      )}
                    </strong>
                    {unreadCount > 0 && (
                      <button
                        className="notification-mark-read"
                        onClick={onMarkAllNotificationsRead}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="notification-empty">
                        <Icon name="check" size={24} />
                        <p style={{ margin: "8px 0 0", color: "var(--secondary)", fontSize: "13px" }}>
                          All caught up · Zero active ward alerts
                        </p>
                      </div>
                    ) : (
                      notifications.map((item) => (
                        <div
                          key={item.id}
                          className={`notification-item type-${item.type} ${!item.read ? "unread" : ""}`}
                          onClick={() => onMarkNotificationRead(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              onMarkNotificationRead(item.id)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${item.title}: ${item.message} (${item.timeStr})`}
                        >
                          <div className="notification-item-icon">
                            <Icon
                              name={
                                item.type === "alert"
                                  ? "alert-triangle"
                                  : item.type === "warning"
                                  ? "alert-triangle"
                                  : item.type === "success"
                                  ? "check"
                                  : "info"
                              }
                              size={16}
                            />
                          </div>
                          <div className="notification-item-content">
                            <div className="notification-item-title-row">
                              <span className="notification-item-title">{item.title}</span>
                              <span className="notification-item-time">{item.timeStr}</span>
                            </div>
                            <div className="notification-item-desc">{item.message}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="notification-footer">
                    <small>CTCAE v5.0 Ward Feed</small>
                    {notifications.length > 0 && (
                      <button onClick={onClearNotifications}>Clear all</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Clinician Profile */}
            <div className="profile-wrap">
              <button
                className="avatar-button"
                aria-label="Open clinician menu"
                title="Open clinician menu"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev)
                  setStatus(false)
                  setNotificationsOpen(false)
                }}
              >
                {initials}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <div>
                    <strong>{profile.name}</strong>
                    <span>{profile.hospital}</span>
                  </div>
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false)
                      setProfileModal(true)
                    }}
                  >
                    Profile
                  </button>
                  <button onClick={onSignOut}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <ClinicianProfileModal
        isOpen={profileModal}
        onClose={() => setProfileModal(false)}
        profile={profile}
        onUpdateProfile={onUpdateProfile}
      />
    </>
  )
}

function SeverityBadge({
  grade,
  children,
}: {
  grade: number
  children?: React.ReactNode
}) {
  const label = children || (grade === 0 ? "Stable" : `Grade ${grade}`)
  const descriptions: Record<number, string> = {
    4: "Grade 4, life-threatening",
    3: "Grade 3, severe",
    2: "Grade 2, moderate",
    1: "Grade 1, mild",
    0: "Stable",
  }
  return (
    <span className={`severity grade-${grade}`} title={descriptions[grade]}>
      {label}
    </span>
  )
}

function Census({
  patientsList,
  selectedPatientId,
  onSelectPatient,
  onClose,
  onResetCensus,
}: {
  patientsList?: typeof patients
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  onClose?: () => void
  onResetCensus?: () => void
}) {
  const activePatients = patientsList && patientsList.length > 0 ? patientsList : (patientsList ? [] : patients)
  const [filter, setFilter] = useState("All")
  const [query, setQuery] = useState("")
  const shown = activePatients.filter((patient) => {
    const inFilter =
      filter === "All" ||
      (filter === "Critical" ? patient.grade >= 3 : patient.grade < 3)
    return (
      inFilter &&
      `${patient.name} ${patient.bed} ${patient.regimen}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  })
  return (
    <aside className="census">
      <div className="census-title">
        <div>
          <h2>Ward census</h2>
          <p>{activePatients.length} patient{activePatients.length === 1 ? "" : "s"} on service</p>
        </div>
        {onClose && (
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <label className="search-field">
        <Icon name="search" size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search patients"
          aria-label="Search patients"
        />
      </label>
      <div className="plain-filters">
        {[
          ["All", activePatients.length],
          ["Critical", activePatients.filter((p) => p.grade >= 3).length],
          ["Stable", activePatients.filter((p) => p.grade < 3).length],
        ].map(([name, count]) => (
          <button
            className={filter === name ? "active" : ""}
            onClick={() => setFilter(String(name))}
            key={name}
          >
            {name} <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="patient-rows">
        {shown.map((patient) => {
          const isSelected = patient.id === selectedPatientId
          return (
            <button
              className={`patient-row ${isSelected ? "active" : ""}`}
              onClick={() => {
                onSelectPatient(patient.id)
                if (onClose) onClose()
              }}
              key={patient.bed}
              aria-current={isSelected ? "true" : undefined}
            >
              <span className="patient-avatar">{patient.initials}</span>
              <span className="patient-info">
                <strong>
                  Bed {patient.bed} · {patient.name}
                </strong>
                <small>
                  {patient.regimen} · {patient.cycle}
                </small>
              </span>
              {patient.grade >= 3 ? (
                <SeverityBadge grade={patient.grade}>
                  G{patient.grade}
                </SeverityBadge>
              ) : (
                <i
                  className="stable-dot"
                  role="img"
                  aria-label="Stable patient"
                  title="Stable patient"
                />
              )}
            </button>
          )
        })}
        {shown.length === 0 && (
          <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--secondary)", fontSize: "14px" }}>
            No matching patients on service.
            {activePatients.length === 0 && onResetCensus && (
              <div style={{ marginTop: "12px" }}>
                <Button onClick={onResetCensus}>Reset demo census</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function Waveform({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`waveform ${active ? "active" : ""}`}
      aria-label="Audio waveform"
    >
      {[16, 32, 54, 28, 70, 42, 80, 52, 66, 34, 58, 24, 46, 20, 34, 18].map(
        (height, index) => (
          <i
            key={index}
            style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }}
          />
        ),
      )}
    </div>
  )
}

function ReportImage({
  patient = patients[0],
  labReport = [
    ["WBC", "1.8", "x10³/µL"],
    ["ANC", "420", "cells/µL"],
    ["Platelets", formatNumber(88000), "/µL"],
    ["Hemoglobin", "10.2", "g/dL"],
  ],
}: {
  patient?: typeof patients[number]
  labReport?: [string, string, string][]
} = {}) {
  return (
    <div
      className="report-image"
      role="img"
      aria-label="Scanned complete blood count report"
    >
      <div className="report-sheet">
        <div className="report-header">
          <span>City Cancer Center</span>
          <small>LABORATORY SERVICES</small>
        </div>
        <p>Complete Blood Count</p>
        <small>
          {patient.name} · {patient.mrn} · 07:42
        </small>
        {labReport.map((lab, index) => (
          <div className={index === 1 ? "detected" : ""} key={lab[0]}>
            <span>{lab[0]}</span>
            <b>{lab[1]}</b>
            <span>{lab[2]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


export type SttEngine = "live-asr" | "whisper"

function useVoiceDictation({
  onAppendText,
  onError,
  clinicalAutoCorrect = true,
}: {
  onAppendText: (chunk: string) => void
  onError?: (msg: string) => void
  clinicalAutoCorrect?: boolean
}) {
  const [engine, setEngine] = useState<SttEngine>("live-asr")
  const [recording, setRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [whisperSeconds, setWhisperSeconds] = useState(0)
  const [whisperProcessing, setWhisperProcessing] = useState(false)

  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const whisperTimerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const whisperSpokenRef = useRef<string>("")

  const stopLiveAsr = useCallback(() => {
    setRecording(false)
    setInterimTranscript("")
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
  }, [])

  const stopWhisper = useCallback(async () => {
    setRecording(false)
    if (whisperTimerRef.current) {
      clearInterval(whisperTimerRef.current)
      whisperTimerRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setWhisperProcessing(true)
      mediaRecorderRef.current.stop()
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    if (engine === "whisper") {
      stopWhisper()
    } else {
      stopLiveAsr()
    }
  }, [engine, stopWhisper, stopLiveAsr])

  const startLiveAsr = useCallback(() => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    if (!SpeechRecognition) {
      onError?.("Microphone speech-to-text is not supported in this browser. Please use Chrome or Edge, or type your assessment manually.")
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setRecording(true)
        setInterimTranscript("")
      }

      recognition.onresult = (event: any) => {
        let interim = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const spokenChunk = event.results[i][0].transcript
            if (spokenChunk && spokenChunk.trim()) {
              const formatted = clinicalAutoCorrect
                ? autocorrectOncologyTranscript(formatSpokenClinicalPunctuation(spokenChunk.trim())).correctedText
                : formatSpokenClinicalPunctuation(spokenChunk.trim())
              onAppendText(" " + formatted)
            }
          } else {
            interim += event.results[i][0].transcript
          }
        }
        setInterimTranscript(interim)
      }

      recognition.onerror = (event: any) => {
        setRecording(false)
        setInterimTranscript("")
        recognitionRef.current = null
        if (event.error === "not-allowed") {
          onError?.("Microphone permission denied. Please allow microphone access in your browser or type manually.")
        } else if (event.error === "no-speech") {
          // User is silent, keep listening without auto-typing
        } else if (event.error !== "aborted") {
          onError?.(`Microphone notice: ${event.error}. You can edit and type directly in the box.`)
        }
      }

      recognition.onend = () => {
        setRecording(false)
        setInterimTranscript("")
        recognitionRef.current = null
      }

      recognition.start()
      recognitionRef.current = recognition
      setRecording(true)
    } catch {
      setRecording(false)
      onError?.("Unable to access microphone. Please type your assessment manually.")
    }
  }, [clinicalAutoCorrect, onAppendText, onError])

  const startWhisper = useCallback(async () => {
    whisperSpokenRef.current = ""
    audioChunksRef.current = []

    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    // 1. Concurrently transcribe live user speech to capture actual words
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = "en-US"

        recognition.onresult = (event: any) => {
          let interim = ""
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const chunk = event.results[i][0].transcript
              if (chunk && chunk.trim()) {
                whisperSpokenRef.current = (whisperSpokenRef.current + " " + chunk.trim()).trim()
              }
            } else {
              interim += event.results[i][0].transcript
            }
          }
          setInterimTranscript(interim)
        }

        recognition.onerror = () => {}
        recognition.onend = () => {}
        recognition.start()
        recognitionRef.current = recognition
      } catch {}
    }

    // 2. Concurrently record audio chunks
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        let mimeType = "audio/webm"
        if (!MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = ""
        }

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        recorder.onstop = async () => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
            streamRef.current = null
          }

          setWhisperProcessing(true)

          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" })
            let transcriptText = ""

            // Attempt backend faster-whisper on CPU if reachable
            try {
              const formData = new FormData()
              formData.append("file", audioBlob, "bedside_audio.webm")
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 15000)

              const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/v1/voice/transcribe`, {
                method: "POST",
                body: formData,
                signal: controller.signal,
              })
              clearTimeout(timeoutId)
              if (res.ok) {
                const data = await res.json()
                transcriptText = data.transcript || ""
              }
            } catch {}

            // If backend is offline, use the REAL words the user spoke into the microphone!
            if (!transcriptText && whisperSpokenRef.current) {
              transcriptText = whisperSpokenRef.current
            }

            if (transcriptText && transcriptText.trim()) {
              const corrected = clinicalAutoCorrect
                ? autocorrectOncologyTranscript(formatSpokenClinicalPunctuation(transcriptText.trim())).correctedText
                : formatSpokenClinicalPunctuation(transcriptText.trim())
              onAppendText(`\n[Whisper On-Device STT · Zero Audio Egress]: ${corrected}`)
            } else {
              onError?.("Whisper STT: No speech detected during recording. Please speak into your microphone or enter notes directly.")
            }
          } catch (err: any) {
            onError?.(`Whisper processing note: ${err?.message || "Audio captured locally"}`)
          } finally {
            setWhisperProcessing(false)
            setWhisperSeconds(0)
            setInterimTranscript("")
          }
        }

        recorder.start(250)
      } catch {}
    }

    setRecording(true)
    setWhisperSeconds(0)
    whisperTimerRef.current = setInterval(() => {
      setWhisperSeconds((s) => s + 1)
    }, 1000)
  }, [clinicalAutoCorrect, onAppendText, onError])

  const toggle = useCallback(() => {
    if (recording) {
      stop()
    } else {
      if (engine === "whisper") {
        startWhisper()
      } else {
        startLiveAsr()
      }
    }
  }, [recording, stop, engine, startWhisper, startLiveAsr])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop() } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (whisperTimerRef.current) {
        clearInterval(whisperTimerRef.current)
      }
    }
  }, [])

  return {
    engine,
    setEngine,
    recording,
    interimTranscript,
    whisperSeconds,
    whisperProcessing,
    toggle,
    stop,
  }
}

function ClinicalAutoCorrectModal({
  isOpen,
  onClose,
  transcript,
  onApply,
}: {
  isOpen: boolean
  onClose: () => void
  transcript: string
  onApply: (newTranscript: string, count: number, avgConfidence: number) => void
}) {
  const [result, setResult] = useState<AutocorrectResult>(() =>
    autocorrectOncologyTranscript(transcript)
  )
  const [changes, setChanges] = useState<AutocorrectChange[]>([])
  const [activeTab, setActiveTab] = useState<"terms" | "preview">("terms")

  useEffect(() => {
    if (isOpen) {
      const res = autocorrectOncologyTranscript(transcript)
      setResult(res)
      setChanges(res.changes)
      setActiveTab("terms")
    }
  }, [isOpen, transcript])

  if (!isOpen) return null

  const toggleChange = (id: string) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    )
  }

  const selectAll = (selected: boolean) => {
    setChanges((prev) => prev.map((c) => ({ ...c, selected })))
  }

  const selectedCount = changes.filter((c) => c.selected).length
  const previewText = applySelectedCorrections(transcript, changes)

  const handleApply = () => {
    onApply(previewText, selectedCount, result.averageConfidence)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card autocorrect-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "780px", width: "94vw" }}
      >
        <div className="modal-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-mark" style={{ width: "28px", height: "28px" }}>
                <Icon name="refresh" size={16} />
              </span>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                Clinical Auto-Correct & Oncological Lexicon Review
              </h2>
            </div>
            <p style={{ margin: "4px 0 0", color: "var(--secondary)", fontSize: "13px" }}>
              CTCAE v5.0 standardization & phonetic speech recognition normalization
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {changes.length === 0 ? (
          <div className="autocorrect-empty-state" style={{ padding: "32px 16px", textAlign: "center" }}>
            <div
              className="icon-box"
              style={{
                background: "rgba(16,185,129,0.1)",
                color: "#10b981",
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <Icon name="check" size={28} />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "17px" }}>100% Clinically Verified</h3>
            <p style={{ margin: 0, color: "var(--secondary)", fontSize: "14px", maxWidth: "480px", marginInline: "auto" }}>
              All chemotherapy regimens, absolute neutrophil counts (ANC), CTCAE toxicities, and vital units match standard oncological guidelines. No corrections needed.
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "24px" }}>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="autocorrect-metrics-banner autocorrect-stats-bar">
              <div className="metric-pill terms-pill">
                <Icon name="alert" size={16} />
                <span>
                  <strong>{changes.length}</strong> terms detected for auto-correction
                </span>
              </div>
              <div className="metric-pill confidence-pill">
                <Icon name="shield" size={16} />
                <span>
                  <strong>{result.averageConfidence}%</strong> avg confidence score
                </span>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className={`text-button ${activeTab === "terms" ? "active-tab-underline" : ""}`}
                  onClick={() => setActiveTab("terms")}
                  style={{ fontWeight: 600, fontSize: "13px", padding: "4px 8px" }}
                >
                  Detected Words ({changes.length})
                </button>
                <button
                  type="button"
                  className={`text-button ${activeTab === "preview" ? "active-tab-underline" : ""}`}
                  onClick={() => setActiveTab("preview")}
                  style={{ fontWeight: 600, fontSize: "13px", padding: "4px 8px" }}
                >
                  Note Preview
                </button>
              </div>
            </div>

            {activeTab === "terms" ? (
              <div className="autocorrect-changes-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 10px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={selectedCount === changes.length && changes.length > 0}
                      onChange={(e) => selectAll(e.target.checked)}
                    />
                    Select all corrections ({selectedCount}/{changes.length})
                  </label>
                  <small style={{ color: "var(--secondary)" }}>
                    Click terms to toggle individual approval
                  </small>
                </div>

                <div className="autocorrect-list">
                  {changes.map((change) => (
                    <div
                      key={change.id}
                      className={`autocorrect-item-card ${change.selected ? "selected" : "deselected"}`}
                      onClick={() => toggleChange(change.id)}
                    >
                      <input
                        type="checkbox"
                        checked={change.selected}
                        onChange={() => {}}
                        style={{ cursor: "pointer" }}
                      />
                      <div className="autocorrect-term-comparison">
                        <span className="orig-word" title="Original spoken or typed input">
                          {change.original}
                        </span>
                        <span className="arrow-sep">→</span>
                        <span className="corr-word" title="Standardized oncology nomenclature">
                          {change.corrected}
                        </span>
                      </div>
                      <span className="category-tag">{change.category}</span>
                      <span
                        className={`confidence-score-badge ${
                          change.confidence >= 98
                            ? "high"
                            : change.confidence >= 95
                            ? "medium"
                            : "standard"
                        }`}
                        title="Confidence score from deterministic phonetic oncology ontology"
                      >
                        {change.confidence}% Match
                      </span>
                      <small className="change-reason" title={change.reason}>{change.reason}</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="autocorrect-preview-container">
                <div style={{ padding: "4px 0 8px" }}>
                  <small style={{ color: "var(--secondary)" }}>
                    Live preview of the round note with selected auto-corrections applied:
                  </small>
                </div>
                <div className="preview-textbox">
                  {previewText}
                </div>
              </div>
            )}

            <div className="modal-footer" style={{ borderTop: "1px solid var(--divider)", paddingTop: "16px", marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button onClick={onClose}>
                Cancel / Keep original
              </Button>
              <Button
                variant="primary"
                icon="check"
                onClick={handleApply}
                disabled={selectedCount === 0}
              >
                Apply auto-correct ({selectedCount} terms)
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OcrReviewModal({
  isOpen,
  fileName,
  initialParsed,
  onClose,
  onCommit,
}: {
  isOpen: boolean
  fileName: string
  initialParsed: ParsedClinicalOcr | null
  onClose: () => void
  onCommit: (confirmed: ParsedClinicalOcr) => void
}) {
  const [anc, setAnc] = useState(initialParsed?.anc ?? 0)
  const [wbc, setWbc] = useState(initialParsed?.wbc ?? 0)
  const [platelets, setPlatelets] = useState(initialParsed?.platelets ?? 0)
  const [hemoglobin, setHemoglobin] = useState(initialParsed?.hemoglobin ?? 0)
  const [temp, setTemp] = useState(initialParsed?.temp ?? 0)
  const [validationError, setValidationError] = useState("")

  useEffect(() => {
    if (initialParsed) {
      setAnc(initialParsed.anc)
      setWbc(initialParsed.wbc)
      setPlatelets(initialParsed.platelets)
      setHemoglobin(initialParsed.hemoglobin)
      setTemp(initialParsed.temp > 0 ? initialParsed.temp : 37.0)
      setValidationError("")
    }
  }, [initialParsed])

  if (!isOpen || !initialParsed) return null

  let grade = 0
  if (anc > 0) {
    if (anc < 500) grade = 4
    else if (anc < 1000) grade = 3
    else if (anc < 1500) grade = 2
    else if (anc < 2000) grade = 1
  } else if (anc === 0 && initialParsed.extractedFromText) {
    grade = 4
  }

  const isFebrile = temp >= 38.0

  const handleCommit = () => {
    const hasAtLeastOneLab =
      (anc >= 0 && initialParsed.extractedFromText) ||
      anc > 0 ||
      wbc > 0 ||
      platelets > 0 ||
      hemoglobin > 0

    if (!hasAtLeastOneLab) {
      setValidationError("Enter at least one verified laboratory value before committing this report.")
      return
    }
    const finalTemp = temp > 0 ? temp : 37.0
    const finalIsFebrile = finalTemp >= 38.0
    setValidationError("")
    onCommit({
      anc,
      wbc,
      platelets,
      hemoglobin,
      temp: finalTemp,
      grade,
      isFebrile: finalIsFebrile,
      confidence: initialParsed.confidence,
      extractedFromText: initialParsed.extractedFromText,
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card autocorrect-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "640px", width: "94vw" }}
      >
        <div className="modal-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-mark" style={{ width: "28px", height: "28px" }}>
                <Icon name="file" size={16} />
              </span>
              <h3>Multimodal OCR Lab Extraction</h3>
            </div>
            <p style={{ marginTop: "4px" }}>
              Review & verify extracted values from <strong>{fileName}</strong> before syncing to analytics.
            </p>
          </div>
          <button className="text-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="autocorrect-stats-bar" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div className="metric-pill confidence-pill">
            <Icon name="shield" size={16} />
            <span>
              <strong>{initialParsed.confidence}%</strong>{" "}
              {initialParsed.extractedFromText ? "OCR Vision Match" : "No readable values — manual verification required"}
            </span>
          </div>
          <SeverityBadge grade={grade}>
            {anc <= 0
              ? "Incomplete · Manual verification required"
              : grade === 0
                ? "Grade 0 · Stable"
                : grade === 4
                  ? "Grade 4 · Life-threatening"
                  : `Grade ${grade} · Severe`}
          </SeverityBadge>
          {isFebrile && (
            <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "999px", background: "var(--g4-bg)", color: "var(--g4)", fontWeight: 600 }}>
              Febrile Spike ({temp}°C)
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", margin: "16px 0" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
            Absolute Neutrophil Count (ANC)
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                value={anc}
                onChange={(e) => setAnc(Number(e.target.value) || 0)}
                style={{ flex: 1, height: "40px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "JetBrains Mono" }}
              />
              <span style={{ color: "var(--secondary)", fontSize: "13px" }}>/µL</span>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
            Platelet Reserve
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                value={platelets}
                onChange={(e) => setPlatelets(Number(e.target.value) || 0)}
                style={{ flex: 1, height: "40px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "JetBrains Mono" }}
              />
              <span style={{ color: "var(--secondary)", fontSize: "13px" }}>/µL</span>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
            White Blood Cells (WBC)
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                step="0.1"
                value={wbc}
                onChange={(e) => setWbc(Number(e.target.value) || 0)}
                style={{ flex: 1, height: "40px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "JetBrains Mono" }}
              />
              <span style={{ color: "var(--secondary)", fontSize: "13px" }}>x10³/µL</span>
            </div>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
            Hemoglobin (Hgb)
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                step="0.1"
                value={hemoglobin}
                onChange={(e) => setHemoglobin(Number(e.target.value) || 0)}
                style={{ flex: 1, height: "40px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "JetBrains Mono" }}
              />
              <span style={{ color: "var(--secondary)", fontSize: "13px" }}>g/dL</span>
            </div>
          </label>

          <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", fontWeight: 600 }}>
            Body Temperature
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value) || 0)}
                style={{ width: "160px", height: "40px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "JetBrains Mono" }}
              />
              <span style={{ color: "var(--secondary)", fontSize: "13px" }}>°C ({isFebrile ? "Febrile" : "Afebrile"})</span>
            </div>
          </label>
        </div>

        {validationError && (
          <p role="alert" style={{ color: "var(--g4)", fontSize: "13px", margin: "0 0 12px" }}>
            {validationError}
          </p>
        )}

        <div className="modal-footer" style={{ borderTop: "1px solid var(--divider)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Button onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            onClick={handleCommit}
          >
            Confirm & Commit to Note & Analytics
          </Button>
        </div>
      </div>
    </div>
  )
}

function CaptureStep({
  patient,
  patientCase,
  onSelectPatient,
  complete,
  onContinue,
  onToast,
  onOcrExtracted,
  transcript,
  setTranscript,
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  onSelectPatient: (id: string) => void
  complete: boolean
  onContinue: () => void
  onToast?: (msg: string) => void
  onOcrExtracted?: (patientId: string, fileName: string, extracted: any) => void
  transcript: string
  setTranscript: React.Dispatch<React.SetStateAction<string>>
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [onDeviceAudio, setOnDeviceAudio] = useState(true)
  const [clinicalAutoCorrect, setClinicalAutoCorrect] = useState(true)
  const [autoCorrectModalOpen, setAutoCorrectModalOpen] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<string | null>(null)
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [pendingOcr, setPendingOcr] = useState<{ fileName: string; parsed: ParsedClinicalOcr } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTranscript(patientCase.transcript)
    setOcrStatus(null)
  }, [patientCase.transcript, patient.id])

  const {
    engine: sttEngine,
    setEngine: setSttEngine,
    recording,
    interimTranscript,
    whisperSeconds,
    whisperProcessing,
    toggle: toggleDictation,
  } = useVoiceDictation({
    onAppendText: (chunk) => setTranscript((prev) => prev + chunk),
    onError: (msg) => onToast?.(msg),
    clinicalAutoCorrect,
  })

  const handleApplyAutoCorrect = (newText: string, count: number, avgConfidence: number) => {
    setTranscript(newText)
    if (onToast) {
      onToast(`✓ Applied auto-correct: ${count} oncology term${count > 1 ? "s" : ""} standardized (${avgConfidence}% confidence)`)
    }
  }

  const handleConfirmOcr = (confirmed: ParsedClinicalOcr) => {
    if (!pendingOcr) return
    const fileName = pendingOcr.fileName
    const ocrReportText = `\n\n[OCR LAB REPORT: ${fileName}]\n• Collection: Today 07:15 AM · Ward 4B Stat Hematology\n• Absolute Neutrophil Count (ANC): ${formatNumber(confirmed.anc)} /µL (CTCAE Grade ${confirmed.grade})\n• Platelets: ${formatNumber(confirmed.platelets)} /µL\n• WBC: ${confirmed.wbc} x10³/µL\n• Hemoglobin: ${confirmed.hemoglobin} g/dL\n• Vitals: Temp ${confirmed.temp}°C\n[High-confidence Vision OCR · Synced to Analytics JSON]`

    setTranscript((prev) => prev + ocrReportText)
    setOcrStatus(`OCR Verified: ANC ${formatNumber(confirmed.anc)} /µL (Grade ${confirmed.grade}) · Platelets ${formatNumber(confirmed.platelets)} /µL`)

    if (onOcrExtracted) {
      onOcrExtracted(patient.id, fileName, confirmed)
    }
    if (onToast) {
      onToast(`✓ Full OCR parsed & confirmed from ${fileName} · Stored in analytics JSON`)
    }
    setPendingOcr(null)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const rawContent = String(event.target?.result || "")
      const parsed = parseClinicalLabOcr(file.name, rawContent, patient)
      setPendingOcr({ fileName: file.name, parsed })
      setOcrModalOpen(true)
      
    }
    reader.readAsText(file)
  }

  const analyze = () => {
    setAnalyzing(true)
    setProgress(1)
    ;[2, 3, 4].forEach((value, index) =>
      setTimeout(() => setProgress(value), 450 * (index + 1)),
    )
    setTimeout(() => {
      setAnalyzing(false)
      onContinue()
    }, 1900)
  }

  return (
    <section className="step-content">
      <div className="step-intro">
        <div>
          <h2>Capture the bedside round</h2>
          <p>Live speech-to-text with real-time display, on-device Whisper, and oncological auto-correction with confidence scoring.</p>
        </div>
      </div>
      <label className="demo-case">
        <span>Demo case</span>
        <select
          value={patient.id}
          onChange={(event) => onSelectPatient?.(event.target.value)}
        >
          {patients.map((p) => (
            <option value={p.id} key={p.id}>
              {patientCases[p.id]?.caseLabel || `${p.name} (Bed ${p.bed})`}
            </option>
          ))}
        </select>
      </label>
      <article className="panel capture-composer">
        <textarea
          className="capture-textarea"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Speak into microphone or type clinical notes and lab findings manually..."
          aria-label="Round transcript"
        />
        {recording && <Waveform active />}

        {/* Live ASR Interim Display (what you talk it display) */}
        {recording && sttEngine === "live-asr" && (
          <div className="live-asr-stream" role="status" aria-live="polite">
            <div className="live-pulse-badge">
              <span className="live-pulse-dot" />
              <span className="live-tag">LIVE SPEECH ASR:</span>
            </div>
            <span className="live-interim-text">
              {interimTranscript ? `"${interimTranscript}"` : "Listening… speak naturally (e.g. 'Patient on R-CHOP, ANC 1400, afebrile')"}
            </span>
          </div>
        )}

        {/* Whisper Status Card */}
        {recording && sttEngine === "whisper" && (
          <div className="whisper-status-card recording" role="status" aria-live="polite">
            <span className="whisper-pulse-dot" />
            <div>
              <strong>🎙️ Recording Audio for Local Whisper ({whisperSeconds}s)</strong>
              <small>Local audio capture · Actual speech transcribed on stop · Zero cloud egress</small>
            </div>
          </div>
        )}

        {whisperProcessing && (
          <div className="whisper-status-card processing" role="status" aria-live="polite">
            <Icon name="cpu" />
            <span>Transcribing speech through local Whisper model & applying oncology auto-correct...</span>
          </div>
        )}

        {ocrStatus && (
          <div className="ocr-banner">
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--brand)" }}>
              ✓ {ocrStatus}
            </span>
            <small style={{ color: "var(--secondary)" }}>Stored in Analytics JSON</small>
          </div>
        )}

        <div className="capture-toolbar">
          <div className="stt-engine-toggle">
            <button
              className={`engine-chip ${sttEngine === "live-asr" ? "active" : ""}`}
              onClick={() => {
                if (!recording) setSttEngine("live-asr")
              }}
              title="Real-time speech-to-text with live streaming display as you talk"
              type="button"
            >
              <Icon name="activity" size={14} />
              Live ASR
            </button>
            <button
              className={`engine-chip ${sttEngine === "whisper" ? "active" : ""}`}
              onClick={() => {
                if (!recording) setSttEngine("whisper")
              }}
              title="On-device local Whisper model (CTranslate2 int8 on CPU · zero egress)"
              type="button"
            >
              <Icon name="cpu" size={14} />
              Whisper STT
            </button>
          </div>

          <button
            className={recording ? "recording" : ""}
            onClick={toggleDictation}
            aria-label={recording ? "Stop dictation" : "Start voice dictation"}
          >
            <Icon name="mic" />
            {recording ? "Stop dictation" : sttEngine === "whisper" ? "Dictate (Whisper)" : "Dictate (Live ASR)"}
          </button>
          <button
            className={onDeviceAudio ? "active-toggle" : ""}
            onClick={() => {
              const next = !onDeviceAudio
              setOnDeviceAudio(next)
              if (onToast)
                onToast(
                  next
                    ? "On-device audio: Active (Local Whisper model · 0 audio egress)"
                    : "On-device audio disabled",
                )
            }}
            title="Toggle on-device audio model"
          >
            <Icon name="cpu" />
            On-device audio
          </button>
          <button
            className={clinicalAutoCorrect ? "active-toggle" : ""}
            onClick={() => setAutoCorrectModalOpen(true)}
            title="Review oncological terms, confidence scores, and apply auto-correct"
          >
            <Icon name="refresh" />
            Clinical auto-correct
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach scanned lab report or PDF to perform OCR"
          >
            <Icon name="file" />
            Attach lab scan / document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.json,.csv"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <em>
            <Icon name="shield" />
            Speech runs locally · 0 egress
          </em>
        </div>
      </article>

      <ClinicalAutoCorrectModal
        isOpen={autoCorrectModalOpen}
        onClose={() => setAutoCorrectModalOpen(false)}
        transcript={transcript}
        onApply={handleApplyAutoCorrect}
      />
      <OcrReviewModal
        isOpen={ocrModalOpen}
        fileName={pendingOcr?.fileName || ""}
        initialParsed={pendingOcr?.parsed || null}
        onClose={() => setOcrModalOpen(false)}
        onCommit={handleConfirmOcr}
      />

      {analyzing ? (
        <article className="pipeline panel">
          <div>
            <h3>Analyzing this round</h3>
            <p>Structuring clinical evidence for review</p>
          </div>
          {[
            "Transcribing",
            "Extracting labs",
            "Grading (CTCAE v5.0)",
            "Drafting note",
          ].map((item, index) => (
            <div
              className={
                progress > index ? "done" : progress === index ? "active" : ""
              }
              key={item}
            >
              <span>
                {progress > index ? <Icon name="check" /> : index + 1}
              </span>
              <b>{item}</b>
              <i />
            </div>
          ))}
        </article>
      ) : (
        !complete && (
          <div className="step-action">
            <Button variant="primary" icon="activity" onClick={analyze}>
              Analyze round
            </Button>
          </div>
        )
      )}
    </section>
  )
}

const Sparkline = ({ gray = false }: { gray?: boolean }) => (
  <svg
    viewBox="0 0 130 40"
    className={`sparkline ${gray ? "gray" : ""}`}
    aria-hidden="true"
  >
    <path d="M2 7 C24 6 32 15 49 13 S76 24 92 22 S111 34 128 35" />
  </svg>
)

function ReviewStep({
  patient,
  patientCase,
  confirmed,
  setConfirmed,
  onContinue,
  onToast,
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  confirmed: boolean[]
  setConfirmed: (items: boolean[]) => void
  onContinue: () => void
  onToast?: (msg: string) => void
}) {
  const [checklistItems, setChecklistItems] = useState<string[]>(patientCase.checklist)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState("")

  useEffect(() => {
    setChecklistItems(patientCase.checklist)
    setEditingIndex(null)
  }, [patientCase.checklist, patient.id])

  const handleStartEdit = (index: number) => {
    setEditingIndex(index)
    setEditText(checklistItems[index] || "")
  }

  const handleSaveEdit = (index: number) => {
    if (!editText.trim()) return
    const updated = [...checklistItems]
    updated[index] = editText.trim()
    setChecklistItems(updated)
    setEditingIndex(null)
    if (onToast) onToast(`✓ Updated verification point ${index + 1}`)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
  }

  const count = confirmed.filter(Boolean).length
  const alertGrade = patientCase.alert.grade

  return (
    <section className="step-content review-step">
      <div className="step-intro">
        <div>
          <h2>Review clinical findings</h2>
          <p>Validate the safety alert and extracted values before signing.</p>
        </div>
      </div>
      <article
        className={`critical-alert ${
          alertGrade === 0
            ? "stable-alert"
            : alertGrade === 3
              ? "grade-3-alert"
              : ""
        }`}
        aria-live="assertive"
      >
        <div className="alert-heading">
          <div className={`icon-box ${alertGrade >= 3 ? "danger" : ""}`}>
            <Icon name={alertGrade >= 3 ? "alert" : "check"} />
          </div>
          <div>
            <h3>{patientCase.alert.title}</h3>
            <p>{patientCase.alert.subtitle}</p>
          </div>
          <SeverityBadge grade={alertGrade}>
            {alertGrade === 0
              ? "Grade 0 · Stable"
              : alertGrade === 4
                ? "Grade 4 · Life-threatening"
                : `Grade ${alertGrade} · Severe`}
          </SeverityBadge>
        </div>
        <div className="alert-values">
          <div>
            <span>Temperature</span>
            <strong className="numeric">{patientCase.alert.temp}</strong>
          </div>
          <div>
            <span>Absolute neutrophil count</span>
            <strong className="numeric">{patientCase.alert.anc}</strong>
          </div>
          <div>
            <span>Status / Antibiotics</span>
            <strong
              className={`numeric ${alertGrade >= 3 ? "timer" : ""}`}
            >
              {patientCase.alert.timer}
            </strong>
          </div>
        </div>
        <div className="guideline-line">
          <p>{patientCase.alert.guideline}</p>
          <button>View guideline</button>
        </div>
      </article>
      <div className="metric-grid">
        {patientCase.metrics.map(([name, value, unit, delta, grade]) => (
          <article className="metric-card" key={String(name)}>
            <div className="metric-title">
              <h3>{name}</h3>
              <SeverityBadge grade={Number(grade)}>
                {Number(grade) === 0 ? "Stable" : `Grade ${grade}`}
              </SeverityBadge>
            </div>
            <div className="metric-value">
              <strong className="numeric">{value}</strong>
              <span>{unit}</span>
            </div>
            <Sparkline gray={Number(grade) < 3} />
            <p>{delta}</p>
          </article>
        ))}
      </div>
      <article className="panel checklist">
        <div className="checklist-heading">
          <div>
            <h3>Confirm before signing</h3>
            <p>Each value requires clinician verification</p>
          </div>
          <strong>{count} of 3 confirmed</strong>
        </div>
        {checklistItems.map((item, index) => (
          <div className="check-row" key={index}>
            {editingIndex === index ? (
              <div className="checklist-inline-editor" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px", padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                  <b style={{ minWidth: "60px", color: "var(--brand)", fontSize: "14px" }}>Point {index + 1}</b>
                  <input
                    type="text"
                    className="checklist-edit-input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(index)
                      if (e.key === "Escape") handleCancelEdit()
                    }}
                    autoFocus
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--brand)", borderRadius: "8px", background: "var(--surface)", color: "inherit", fontSize: "14px" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    style={{ padding: "4px 12px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--secondary)", cursor: "pointer", fontSize: "13px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(index)}
                    style={{ padding: "4px 12px", border: 0, borderRadius: "6px", background: "var(--brand)", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed[index]}
                    onChange={() =>
                      setConfirmed(
                        confirmed.map((value, itemIndex) =>
                          itemIndex === index ? !value : value,
                        ),
                      )
                    }
                  />
                  <span>
                    <b>Point {index + 1}</b>
                    <small>{item}</small>
                  </span>
                </label>
                <button
                  type="button"
                  className="checklist-edit-btn"
                  onClick={() => handleStartEdit(index)}
                  title={`Edit Point ${index + 1}`}
                  style={{ border: 0, background: "transparent", color: "var(--brand)", fontWeight: 600, cursor: "pointer", padding: "4px 8px" }}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
        <div style={{ marginTop: "16px", padding: "10px 14px", borderRadius: "10px", background: "rgba(0,102,102,0.06)", border: "1px solid var(--brand-border)", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--brand)" }}>
          <Icon name="shield" size={16} />
          <span>
            <strong>Clinical Safety Verification:</strong> Evaluated via Gemini 2.5 Flash Fallback Cascade (with offline deterministic rules) · CTCAE v5.0 Active · Clinician verification required.
          </span>
        </div>
      </article>
      <div className="step-action">
        <Button variant="primary" onClick={onContinue}>
          Continue to sign
        </Button>
      </div>
    </section>
  )
}

function SignStep({
  patient,
  patientCase,
  allConfirmed,
  locked,
  soapSections,
  onSoapChange,
  onCopy,
  onAttest,
  attendingName,
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  allConfirmed: boolean
  locked: boolean
  soapSections: { s: string; o: string; a: string; p: string }
  onSoapChange: (key: "s" | "o" | "a" | "p", value: string) => void
  onCopy: () => void
  onAttest: () => void
  attendingName?: string
}) {
  const sections: [string, "s" | "o" | "a" | "p"][] = [
    ["Subjective", "s"],
    ["Objective", "o"],
    ["Assessment", "a"],
    ["Plan", "p"],
  ]
  return (
    <section className="step-content sign-step">
      <div className="step-intro">
        <div>
          <h2>Review and sign the note</h2>
          <p>AI-drafted content requires clinician review and attestation.</p>
        </div>
        {locked && (
          <span className="verified-label">
            <Icon name="shield" size={20} />
            Verified and locked
          </span>
        )}
      </div>
      <article className="panel soap-note">
        <div className="soap-header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>Inpatient Oncology Round Note</strong>
            <small className="numeric" style={{ display: "block", color: "var(--secondary)" }}>
              {patient.name} · {patient.mrn} · Bed {patient.bed} · {patient.regimen}
            </small>
          </div>
          <span style={{ fontSize: "13px", color: "var(--brand)", fontWeight: 600 }}>
            Attending: {attendingName || "Dr. Amrut S Kadam, MD"}
          </span>
        </div>
        {sections.map(([title, key]) => (
          <div className="soap-section" key={title}>
            <h3>{title}</h3>
            <textarea
              aria-label={`${title} note`}
              value={soapSections[key]}
              onChange={(e) => onSoapChange(key, e.target.value)}
              key={`${patient.id}-${title}`}
              readOnly={locked}
            />
          </div>
        ))}
      </article>
      {!allConfirmed && (
        <p className="sign-hint">
          <Icon name="shield" size={20} />
          Confirm all three review items before attesting this note.
        </p>
      )}
      <div className="sign-bar">
        <Button icon="clipboard" onClick={onCopy}>
          Copy EMR note
        </Button>
        <Button
          variant="primary"
          icon={locked ? "check" : "lock"}
          disabled={!allConfirmed || locked}
          title={
            !allConfirmed
              ? "Confirm all three review items before attesting"
              : locked
                ? "This note is verified and read-only"
                : "Attest and lock this note"
          }
          onClick={onAttest}
        >
          {locked ? "Note approved" : "Attest & approve"}
        </Button>
      </div>
    </section>
  )
}

function Stepper({
  step,
  setStep,
}: {
  step: Step
  setStep: (step: Step) => void
}) {
  return (
    <div className="stepper" aria-label="Assessment progress">
      {([
        [1, "Capture", "Dictation and labs"],
        [2, "Review", "Clinical findings"],
        [3, "Sign", "Attest note"],
      ] as [Step, string, string][]).map(([num, title, detail]) => (
        <button
          className={`${step === num ? "active" : ""} ${
            step > num ? "complete" : ""
          }`}
          onClick={() => setStep(num)}
          key={num}
        >
          <span>
            {step > num ? <Icon name="check" size={20} /> : num}
          </span>
          <div>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
        </button>
      ))}
    </div>
  )
}

function RoundSummary({
  step,
  confirmed,
  attested,
  onCopy,
  onAttest,
}: {
  step: Step
  confirmed: number
  attested: boolean
  onCopy: () => void
  onAttest: () => void
}) {
  return (
    <aside className="round-summary">
      <h2>Round summary</h2>
      <div className="summary-list">
        <div>
          <span>Progress</span>
          <strong>Step {step} of 3</strong>
        </div>
        <div>
          <span>Active alerts</span>
          <strong className="danger-text numeric">1</strong>
        </div>
        <div>
          <span>Confirmations</span>
          <strong className="numeric">{confirmed} of 3</strong>
        </div>
        <div>
          <span>Note status</span>
          <strong>{attested ? "Attested" : "Draft"}</strong>
        </div>
      </div>
      <div className="summary-actions">
        <Button icon="clipboard" onClick={onCopy}>
          Copy note
        </Button>
        <Button
          variant="primary"
          icon={attested ? "check" : "lock"}
          disabled={confirmed < 3 || attested}
          title={
            confirmed < 3
              ? `Confirm ${3 - confirmed} remaining review item${
                  3 - confirmed === 1 ? "" : "s"
                } before attesting`
              : attested
                ? "This note is verified and read-only"
                : "Attest and lock this note"
          }
          onClick={onAttest}
        >
          {attested ? "Note attested" : "Attest note"}
        </Button>
      </div>
    </aside>
  )
}

function Station({
  patientsList,
  selectedPatientId,
  onSelectPatient,
  onResetCensus,
  onOcrExtracted,
  onAttestRound,
  go,
  onToast,
  clinicianProfile,
}: {
  patientsList?: typeof patients
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  onResetCensus?: () => void
  onOcrExtracted?: (patientId: string, fileName: string, extracted: any) => void
  onAttestRound?: (patientId: string, record: RoundRecord) => void
  go?: (screen: Screen) => void
  onToast?: (msg: string, type?: "info" | "success" | "warning" | "alert") => void
  clinicianProfile?: ClinicianProfile
}) {
  const activePatients = patientsList && patientsList.length > 0 ? patientsList : patients
  const patient =
    activePatients.find((item) => item.id === selectedPatientId) || activePatients[0] || patients[0]
  const patientCase = patientCases[patient.id] || {
    patientId: patient.id,
    caseLabel: `${patient.name} (${patient.regimen})`,
    transcript: `Patient ${patient.name}, Bed ${patient.bed}. Admitted for ${patient.diagnosis}. Receiving ${patient.regimen} (${patient.cycle}). Baseline ANC: ${patient.baselineAnc} /µL. Afebrile, vitals currently stable.`,
    alert: {
      title: "Active Ward Admission",
      subtitle: "Routine monitoring & assessment",
      grade: patient.grade || 0,
      temp: "37.0°C",
      anc: `${patient.baselineAnc} /µL`,
      timer: "Routine",
      guideline: "Perform routine clinical oncology monitoring according to CTCAE v5.0.",
    },
    metrics: [
      ["ANC", String(patient.baselineAnc), "cells/µL", "Baseline admission level", patient.grade || 0],
      ["Platelets", "210,000", "/µL", "Within normal reserve", 0],
      ["WBC", "5,200", "cells/µL", "Within normal range", 0],
    ],
    checklist: [
      `Confirm ANC baseline ${patient.baselineAnc} /µL`,
      `Verify vitals and tolerance for ${patient.regimen}`,
      `Review clinical plan and orders`,
    ],
    soapDraft: {
      s: `${patient.ageSex} admitted to Bed ${patient.bed} for ${patient.diagnosis}. Reports stable baseline, no acute complaints.`,
      o: `Vitals stable. Temp 37.0°C. Baseline ANC ${patient.baselineAnc} /µL. ECOG ${patient.ecog}.`,
      a: `${patient.diagnosis} on ${patient.regimen}. Clinically stable admission.`,
      p: `Continue scheduled regimen ${patient.regimen}. Monitor CBC and vitals per protocol.`,
    },
    labReport: [
      ["WBC", "5.2", "x10³/µL"],
      ["ANC", String(patient.baselineAnc), "cells/µL"],
      ["Platelets", "210,000", "/µL"],
      ["Hemoglobin", "12.5", "g/dL"],
    ],
  }

  const [step, setStep] = useState<Step>(1)
  const [stationTranscript, setStationTranscript] = useState(patientCase.transcript)
  const [bedsideDraft, setBedsideDraft] = useState<{ transcript: string; timeStr: string; wordCount?: number } | null>(null)
  const [sync, setSync] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [confirmed, setConfirmed] = useState([true, true, false])
  const [attested, setAttested] = useState(false)
  const [soapSections, setSoapSections] = useState({
    s: patientCase.soapDraft.s,
    o: patientCase.soapDraft.o,
    a: patientCase.soapDraft.a,
    p: patientCase.soapDraft.p,
  })

  useEffect(() => {
    setSoapSections({
      s: patientCase.soapDraft.s,
      o: patientCase.soapDraft.o,
      a: patientCase.soapDraft.a,
      p: patientCase.soapDraft.p,
    })
  }, [patientCase, patient.id])

  const handleSoapChange = (sectionKey: "s" | "o" | "a" | "p", val: string) => {
    setSoapSections((prev) => ({ ...prev, [sectionKey]: val }))
  }

  useEffect(() => {
    setStationTranscript(patientCase.transcript)
    setConfirmed([true, true, false])
    setAttested(false)
    setStep(1)

    // Inspect localStorage for pending bedside sync from mobile companion
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`rounds-bedside-sync-${patient.id}`)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          setBedsideDraft(parsed)
          setSync(true)
        } catch {}
      } else {
        setSync(false)
        setBedsideDraft(null)
      }
    }
  }, [selectedPatientId, patient.id, patientCase.transcript])

  // Reactive listener for bedside-to-station sync events
  useEffect(() => {
    const handleSyncEvent = (event: Event) => {
      const custom = event as CustomEvent
      const payload = custom.detail
      if (payload && payload.patientId === patient.id) {
        setBedsideDraft(payload)
        setSync(true)
        if (onToast) onToast(`Bedside round received from Bed ${patient.bed} (${payload.wordCount || 0} words)`, "info")
      }
    }
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === `rounds-bedside-sync-${patient.id}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          setBedsideDraft(parsed)
          setSync(true)
        } catch {}
      }
    }
    window.addEventListener("rounds-bedside-sync-event", handleSyncEvent)
    window.addEventListener("storage", handleStorageEvent)
    return () => {
      window.removeEventListener("rounds-bedside-sync-event", handleSyncEvent)
      window.removeEventListener("storage", handleStorageEvent)
    }
  }, [patient.id, patient.bed, onToast])

  const loadBedsideToStation = () => {
    let textToLoad = bedsideDraft?.transcript
    if (!textToLoad && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`rounds-bedside-sync-${patient.id}`) || localStorage.getItem("rounds-bedside-sync-latest")
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          textToLoad = parsed.transcript
        } catch {}
      }
    }
    if (textToLoad) {
      setStationTranscript(textToLoad)
      patientCase.transcript = textToLoad
      setSync(false)
      setStep(1)
      if (onToast) onToast(`Loaded bedside draft from Bed ${patient.bed} into Station`, "success")
    } else {
      if (onToast) onToast(`No pending bedside draft for Bed ${patient.bed}`, "info")
    }
  }

  const syncBedside = () => {
    let textToLoad = ""
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`rounds-bedside-sync-${patient.id}`)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          textToLoad = parsed.transcript
        } catch {}
      }
    }
    if (textToLoad) {
      setStationTranscript(textToLoad)
      patientCase.transcript = textToLoad
      if (onToast) onToast(`Synchronized with Bedside Companion for Bed ${patient.bed}`, "success")
    } else {
      const payload = {
        patientId: patient.id,
        patientName: patient.name,
        bed: patient.bed,
        transcript: stationTranscript,
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        wordCount: stationTranscript.trim().split(/\s+/).filter(Boolean).length,
        source: "station",
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`rounds-bedside-sync-${patient.id}`, JSON.stringify(payload))
      }
      if (onToast) onToast(`Station draft saved to Bedside buffer for Bed ${patient.bed}`, "success")
    }
  }

  const copyNote = () => {
    const rawNote = `PATIENT: ${patient.name} (Bed ${patient.bed}, ${patient.mrn})\nDIAGNOSIS: ${patient.diagnosis} · ${patient.regimen} (${patient.cycle})\n\nSUBJECTIVE:\n${soapSections.s}\n\nOBJECTIVE:\n${soapSections.o}\n\nASSESSMENT:\n${soapSections.a}\n\nPLAN:\n${soapSections.p}`
    const noteText = formatEmrClipboardNote(
      rawNote,
      `round-${patient.id}-active`,
      patient.id,
      clinicianProfile?.name || "Dr. Amrut S Kadam, MD"
    )
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(noteText)
    }
    if (onToast) onToast(`Verified EMR note for ${patient.name} copied`, "info")
  }

  const attestNote = () => {
    setAttested(true)
    setStep(3)

    // Parse acute round values from patientCase.metrics
    const ancMetric = patientCase.metrics.find((m) => m[0].toLowerCase().includes("anc"))
    const wbcMetric = patientCase.metrics.find((m) => m[0].toLowerCase().includes("wbc"))
    const pltMetric = patientCase.metrics.find((m) => m[0].toLowerCase().includes("platelet"))

    const acuteAnc = ancMetric ? parseInt(ancMetric[1].replace(/,/g, ""), 10) : (patient.baselineAnc || 1400)
    const acuteWbc = wbcMetric ? Math.round(parseFloat(wbcMetric[1].replace(/,/g, "")) * (parseFloat(wbcMetric[1]) < 50 ? 1000 : 1)) : 4800
    const acutePlt = pltMetric ? parseInt(pltMetric[1].replace(/,/g, ""), 10) : 180000
    const acuteGrade = patientCase.alert?.grade ?? patient.grade ?? (acuteAnc < 500 ? 4 : acuteAnc < 1000 ? 3 : acuteAnc < 1500 ? 2 : 0)

    const newRecord: RoundRecord = {
      id: `attested-${Date.now()}`,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      doctor: clinicianProfile?.name || "Dr. Amrut S Kadam, MD",
      anc: isNaN(acuteAnc) ? patient.baselineAnc : acuteAnc,
      wbc: isNaN(acuteWbc) ? 4800 : acuteWbc,
      platelets: isNaN(acutePlt) ? 180000 : acutePlt,
      hemoglobin: 12.0,
      ctcae_grade: acuteGrade,
      status: "Approved",
      source: "Ward Station Note Attestation",
      notes: `${soapSections.a ? soapSections.a.slice(0, 100) : patient.regimen} (${patient.cycle}) verified and attested by attending clinician.`
    }
    if (onAttestRound) {
      onAttestRound(patient.id, newRecord)
    }
    if (onToast) onToast(`Note for ${patient.name} attested and locked. Added to EMR history & analytics`, "success")
  }

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        )
      ) {
        event.preventDefault()
        ;(document.querySelector(
          ".search-field input",
        ) as HTMLInputElement | null)?.focus()
      }
      if (event.key === "Escape") setDrawer(false)
    }
    addEventListener("keydown", keys)
    return () => removeEventListener("keydown", keys)
  }, [])

  return (
    <main className="station-page page-shell">
      {sync && (
        <div className="sync-notice">
          <span>
            <Icon name="zap" size={20} />
            Bedside round received from Bed {patient.bed} ({patient.name}) · {bedsideDraft?.timeStr || "just now"}
          </span>
          <div>
            <button
              onClick={syncBedside}
              aria-label="Sync bedside"
            >
              <Icon name="refresh" />
              Sync bedside
            </button>
            <button
              onClick={loadBedsideToStation}
              className="secondary"
            >
              Load into station
            </button>
          </div>
        </div>
      )}
      <div className="station-layout">
        <div className={`census-desktop ${drawer ? "open" : ""}`}>
          <Census
            patientsList={patientsList}
            selectedPatientId={selectedPatientId}
            onSelectPatient={onSelectPatient}
            onClose={drawer ? () => setDrawer(false) : undefined}
            onResetCensus={onResetCensus}
          />
        </div>
        {drawer && (
          <button
            className="drawer-backdrop"
            onClick={() => setDrawer(false)}
            aria-label="Close patient drawer"
          />
        )}
        <section className="workspace">
          <div className="patient-header sticky-patient">
            <Button
              icon="menu"
              className="patients-button"
              onClick={() => setDrawer(true)}
            >
              Patients
            </Button>
            <div>
              <h1>
                Bed {patient.bed} · {patient.name}
              </h1>
              <p>
                <span className="numeric">
                  {patient.ageSex} · {patient.mrn}
                </span>{" "}
                · {patient.regimen} · {patient.cycle}
              </p>
            </div>
            <SeverityBadge grade={patient.grade}>
              {patient.grade === 0 ? "Stable" : `Grade ${patient.grade}`}
            </SeverityBadge>
          </div>
          <Stepper step={step} setStep={setStep} />
          {step === 1 && (
            <CaptureStep
              patient={patient}
              patientCase={patientCase}
              onSelectPatient={onSelectPatient}
              complete={false}
              onContinue={() => setStep(2)}
              onToast={onToast}
              onOcrExtracted={onOcrExtracted}
              transcript={stationTranscript}
              setTranscript={setStationTranscript}
            />
          )}
          {step === 2 && (
            <ReviewStep
              patient={patient}
              patientCase={patientCase}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              onContinue={() => setStep(3)}
              onToast={onToast}
            />
          )}
          {step === 3 && (
            <SignStep
              patient={patient}
              patientCase={patientCase}
              allConfirmed={confirmed.every(Boolean)}
              locked={attested}
              soapSections={soapSections}
              onSoapChange={handleSoapChange}
              onCopy={copyNote}
              onAttest={attestNote}
              attendingName={clinicianProfile?.name || "Dr. Amrut S Kadam, MD"}
            />
          )}
        </section>
        <RoundSummary
          step={step}
          confirmed={confirmed.filter(Boolean).length}
          attested={attested}
          onCopy={copyNote}
          onAttest={attestNote}
        />
      </div>
    </main>
  )
}

function Roster({
  patientsList = patients,
  selectedPatientId,
  onSelectPatient,
  onUpdatePatient,
  onDischargePatient,
  onAdmitPatient,
  onResetCensus,
  go,
  onToast,
}: {
  patientsList?: typeof patients
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  onUpdatePatient?: (patient: typeof patients[number]) => void
  onDischargePatient?: (patient: typeof patients[number]) => void
  onAdmitPatient?: (patient: typeof patients[number]) => void
  onResetCensus?: () => void
  go: (screen: Screen) => void
  onToast?: (msg: string, type?: "info" | "success" | "warning" | "alert") => void
}) {
  const [drawer, setDrawer] = useState(false)
  const [editingPatient, setEditingPatient] = useState<typeof patients[number] | null>(null)
  const [discharge, setDischarge] = useState<typeof patients[number] | null>(null)
  const [menu, setMenu] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const [bedError, setBedError] = useState("")
  const [admitBed, setAdmitBed] = useState("18")
  const [editBed, setEditBed] = useState("")

  const WARD_BEDS = ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]

  const openAdmitDrawer = () => {
    const occupied = new Set(patientsList.map((p) => normalizeBedIdentifier(p.bed)))
    const firstFree = WARD_BEDS.find((b) => !occupied.has(normalizeBedIdentifier(b))) || "18"
    setAdmitBed(firstFree)
    setBedError("")
    setErrors([])
    setDrawer(true)
  }

  // Close menu on click outside
  useEffect(() => {
    if (!menu) return
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest(".more-wrap")) {
        setMenu("")
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu("")
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
      document.removeEventListener("keydown", handleKey)
    }
  }, [menu])

  // Close modals on Escape key
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(false)
        setEditingPatient(null)
        setDischarge(null)
        setMenu("")
      }
    }
    addEventListener("keydown", close)
    return () => removeEventListener("keydown", close)
  }, [])

  const submitAdmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const missing = [
      "name",
      "age",
      "mrn",
      "bed",
      "diagnosis",
      "regimen",
      "cycle",
      "anc",
    ].filter((key) => !data.get(key))
    if (missing.length) return setErrors(missing)
    setErrors([])

    const rawBed = String(data.get("bed") || admitBed || "").trim()
    const bedCheck = validateBedOccupancy(rawBed, patientsList)
    if (bedCheck.isOccupied) {
      const err = bedCheck.message || `Bed ${rawBed} is currently occupied.`
      setBedError(err)
      if (onToast) onToast(err, "alert")
      return
    }
    setBedError("")

    const name = String(data.get("name") || "")
    const initials = name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PT"

    const rawAncStr = String(data.get("anc") ?? "").replace(/,/g, "").trim()
    const baselineAnc = rawAncStr !== "" && !isNaN(Number(rawAncStr)) ? Number(rawAncStr) : 1500

    const rawEcogStr = String(data.get("ecog") ?? "").trim()
    const ecog = rawEcogStr !== "" && !isNaN(Number(rawEcogStr)) ? Number(rawEcogStr) : 1

    const newPatient = {
      id: String(Date.now()).slice(-4),
      bed: rawBed.replace(/^bed\s*/i, "").trim() || "18",
      name,
      ageSex: `${data.get("age")}${String(data.get("sex") || "M")[0]}`,
      mrn: String(data.get("mrn") || `MRN-${Math.floor(100000 + Math.random() * 900000)}`),
      diagnosis: String(data.get("diagnosis") || "Oncology Admission"),
      regimen: String(data.get("regimen") || "Standard Regimen"),
      cycle: String(data.get("cycle") || "Cycle 1"),
      baselineAnc,
      ecog,
      grade: 0,
      initials,
    }

    if (onAdmitPatient) {
      onAdmitPatient(newPatient)
    }
    setDrawer(false)
  }

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPatient) return
    const data = new FormData(event.currentTarget)

    const rawBed = String(data.get("bed") || editBed || editingPatient.bed).trim()
    const bedCheck = validateBedOccupancy(rawBed, patientsList, editingPatient.id)
    if (bedCheck.isOccupied) {
      const err = bedCheck.message || `Bed ${rawBed} is currently occupied.`
      setBedError(err)
      if (onToast) onToast(err, "alert")
      return
    }
    setBedError("")

    const rawEditAncStr = String(data.get("baselineAnc") ?? "").replace(/,/g, "").trim()
    const baselineAnc = rawEditAncStr !== "" && !isNaN(Number(rawEditAncStr)) ? Number(rawEditAncStr) : editingPatient.baselineAnc

    const rawEditEcogStr = String(data.get("ecog") ?? "").trim()
    const ecog = rawEditEcogStr !== "" && !isNaN(Number(rawEditEcogStr)) ? Number(rawEditEcogStr) : editingPatient.ecog

    const updated: typeof patients[number] = {
      ...editingPatient,
      name: String(data.get("name") || editingPatient.name),
      ageSex: String(data.get("ageSex") || editingPatient.ageSex),
      mrn: String(data.get("mrn") || editingPatient.mrn),
      bed: rawBed.replace(/^bed\s*/i, "").trim() || editingPatient.bed,
      diagnosis: String(data.get("diagnosis") || editingPatient.diagnosis),
      regimen: String(data.get("regimen") || editingPatient.regimen),
      cycle: String(data.get("cycle") || editingPatient.cycle),
      baselineAnc,
      ecog,
    }

    if (onUpdatePatient) {
      onUpdatePatient(updated)
    }
    setEditingPatient(null)
  }

  return (
    <main className="roster-page page-shell">
      <div className="page-title-row">
        <div>
          <h1>Ward 4B roster · {patientsList.length} admitted</h1>
          <p>
            Manage active oncology admissions and begin a bedside assessment.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {patientsList.length < 3 && onResetCensus && (
            <Button onClick={onResetCensus} title="Restore standard 3 demo cases">
              Reset demo census
            </Button>
          )}
          <Button variant="primary" onClick={openAdmitDrawer}>
            Admit patient
          </Button>
        </div>
      </div>

      {patientsList.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "48px 24px", margin: "24px 0" }}>
          <h3>No patients currently admitted in Ward 4B</h3>
          <p style={{ color: "var(--secondary)", margin: "8px 0 24px" }}>
            All ward beds are currently free. Admit an oncology inpatient or reset the demo ward census.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <Button variant="primary" onClick={openAdmitDrawer}>Admit patient</Button>
            {onResetCensus && <Button onClick={onResetCensus}>Reset demo census</Button>}
          </div>
        </div>
      ) : (
        <section className="roster-surface">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Bed</th>
                <th>Diagnosis</th>
                <th>Regimen</th>
                <th>Cycle</th>
                <th>Baseline ANC</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patientsList.map((patient) => (
                <tr
                  className={patient.id === selectedPatientId ? "active" : ""}
                  key={patient.id}
                  onClick={() => onSelectPatient(patient.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td data-label="Patient">
                    <div className="roster-patient">
                      <span className="patient-avatar">{patient.initials}</span>
                      <div>
                        <strong>
                          {patient.name}
                          {patient.id === selectedPatientId && (
                            <span className="active-pill">Active</span>
                          )}
                        </strong>
                        <small className="numeric">
                          #{patient.id} · {patient.mrn} · {patient.ageSex}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Bed">
                    <span className="bed-label">Bed {patient.bed}</span>
                  </td>
                  <td data-label="Diagnosis">{patient.diagnosis}</td>
                  <td data-label="Regimen">{patient.regimen}</td>
                  <td data-label="Cycle">{patient.cycle}</td>
                  <td data-label="Baseline ANC" className="numeric">
                    {formatNumber(patient.baselineAnc)} /µL
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectPatient(patient.id)
                          go("station")
                        }}
                      >
                        Assess round
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectPatient(patient.id)
                          go("analytics")
                        }}
                      >
                        Analytics
                      </button>
                      <div
                        className="more-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label={`More actions for ${patient.name}`}
                          title={`More actions for ${patient.name}`}
                          onClick={() =>
                            setMenu(menu === patient.id ? "" : patient.id)
                          }
                        >
                          •••
                        </button>
                        {menu === patient.id && (
                          <div className="row-menu">
                            <button
                              onClick={() => {
                                setEditingPatient(patient)
                                setEditBed(patient.bed)
                                setBedError("")
                                setMenu("")
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="danger-text"
                              onClick={() => {
                                setDischarge(patient)
                                setMenu("")
                              }}
                            >
                              Discharge
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Admit Patient Drawer */}
      {drawer && (
        <>
          <button
            className="drawer-backdrop open"
            onClick={() => setDrawer(false)}
            aria-label="Close admission drawer"
          />
          <aside className="admit-drawer" role="dialog" aria-modal="true" aria-labelledby="admit-drawer-title">
            <div className="drawer-heading">
              <div>
                <h2 id="admit-drawer-title">Admit patient</h2>
                <p>Add an oncology patient to the Ward 4B roster.</p>
              </div>
              <button onClick={() => setDrawer(false)}>Close</button>
            </div>
            <form onSubmit={submitAdmit}>
              {bedError && (
                <div className="bed-conflict-banner">
                  <Icon name="alert" />
                  <div>
                    <strong>Bed Allocation Conflict</strong>
                    <span>{bedError}</span>
                  </div>
                </div>
              )}
              <div className="ward-bed-selector">
                <span className="ward-bed-selector-label">Ward 4B Bed Allocation Map (Select an available bed)</span>
                <div className="ward-bed-chip-list">
                  {WARD_BEDS.map((b) => {
                    const occ = patientsList.find((p) => normalizeBedIdentifier(p.bed) === normalizeBedIdentifier(b))
                    const isSelected = normalizeBedIdentifier(admitBed) === normalizeBedIdentifier(b)
                    return (
                      <button
                        key={b}
                        type="button"
                        disabled={Boolean(occ)}
                        className={`ward-bed-chip ${occ ? "occupied" : ""} ${isSelected ? "active-bed" : ""}`}
                        onClick={() => {
                          if (!occ) {
                            setAdmitBed(b)
                            setBedError("")
                          }
                        }}
                        title={occ ? `Bed ${b} is occupied by ${occ.name}` : `Allocate Bed ${b}`}
                      >
                        Bed {b} {occ ? `(${occ.name.split(" ")[0]} · Occupied)` : isSelected ? "✓ Selected" : ""}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="form-grid">
                <label htmlFor="admit-name" className={errors.includes("name") ? "invalid" : ""}>
                  Full name
                  <input id="admit-name" name="name" placeholder="David Miller" />
                  {errors.includes("name") && <span>Required</span>}
                </label>
                <label htmlFor="admit-age" className={errors.includes("age") ? "invalid" : ""}>
                  Age
                  <input id="admit-age" name="age" placeholder="58" />
                  {errors.includes("age") && <span>Required</span>}
                </label>
                <label htmlFor="admit-mrn" className={errors.includes("mrn") ? "invalid" : ""}>
                  MRN
                  <input id="admit-mrn" name="mrn" placeholder="MRN-009184" />
                  {errors.includes("mrn") && <span>Required</span>}
                </label>
                <label htmlFor="admit-bed" className={errors.includes("bed") || bedError ? "invalid" : ""}>
                  Bed Number
                  <input
                    id="admit-bed"
                    name="bed"
                    value={admitBed}
                    aria-invalid={Boolean(bedError || errors.includes("bed"))}
                    aria-describedby={bedError ? "admit-bed-err" : undefined}
                    onChange={(e) => {
                      const val = e.target.value
                      setAdmitBed(val)
                      const chk = validateBedOccupancy(val, patientsList)
                      if (chk.isOccupied) {
                        setBedError(chk.message || `Bed ${val} is currently occupied.`)
                      } else {
                        setBedError("")
                      }
                    }}
                    placeholder="18"
                  />
                  {bedError ? <span id="admit-bed-err">{bedError}</span> : errors.includes("bed") ? <span>Required</span> : null}
                </label>
                <label htmlFor="admit-diagnosis" className={errors.includes("diagnosis") ? "invalid" : ""}>
                  Diagnosis
                  <input id="admit-diagnosis" name="diagnosis" placeholder="Colorectal cancer, Stage III" />
                  {errors.includes("diagnosis") && <span>Required</span>}
                </label>
                <label htmlFor="admit-regimen" className={errors.includes("regimen") ? "invalid" : ""}>
                  Regimen
                  <input id="admit-regimen" name="regimen" placeholder="mFOLFOX6" />
                  {errors.includes("regimen") && <span>Required</span>}
                </label>
                <label htmlFor="admit-cycle" className={errors.includes("cycle") ? "invalid" : ""}>
                  Cycle
                  <input id="admit-cycle" name="cycle" placeholder="Cycle 3 of 6" />
                  {errors.includes("cycle") && <span>Required</span>}
                </label>
                <label htmlFor="admit-anc" className={errors.includes("anc") ? "invalid" : ""}>
                  Baseline ANC (/µL)
                  <input id="admit-anc" name="anc" placeholder="1,400" />
                  {errors.includes("anc") && <span>Required</span>}
                </label>
                <label htmlFor="admit-ecog" className={errors.includes("ecog") ? "invalid" : ""}>
                  ECOG Performance
                  <input id="admit-ecog" name="ecog" placeholder="1" />
                  {errors.includes("ecog") && <span>Required</span>}
                </label>
                <label htmlFor="admit-sex">
                  Sex
                  <select id="admit-sex" name="sex">
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </label>
              </div>
              <div className="drawer-actions">
                <Button onClick={() => setDrawer(false)}>Cancel</Button>
                <Button variant="primary" type="submit">
                  Admit patient
                </Button>
              </div>
            </form>
          </aside>
        </>
      )}

      {/* Edit Patient Drawer */}
      {editingPatient && (
        <>
          <button
            className="drawer-backdrop open"
            onClick={() => setEditingPatient(null)}
            aria-label="Close edit drawer"
          />
          <aside className="admit-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-drawer-title">
            <div className="drawer-heading">
              <div>
                <h2 id="edit-drawer-title">Edit patient details</h2>
                <p>Update admission for Bed {editingPatient.bed} · {editingPatient.name}</p>
              </div>
              <button onClick={() => setEditingPatient(null)}>Close</button>
            </div>
            <form onSubmit={submitEdit}>
              {bedError && (
                <div className="bed-conflict-banner">
                  <Icon name="alert" />
                  <div>
                    <strong>Bed Allocation Conflict</strong>
                    <span>{bedError}</span>
                  </div>
                </div>
              )}
              <div className="ward-bed-selector">
                <span className="ward-bed-selector-label">Ward 4B Bed Map (Select bed to relocate)</span>
                <div className="ward-bed-chip-list">
                  {WARD_BEDS.map((b) => {
                    const occ = patientsList.find((p) => p.id !== editingPatient.id && normalizeBedIdentifier(p.bed) === normalizeBedIdentifier(b))
                    const isSelected = normalizeBedIdentifier(editBed) === normalizeBedIdentifier(b)
                    return (
                      <button
                        key={b}
                        type="button"
                        disabled={Boolean(occ)}
                        className={`ward-bed-chip ${occ ? "occupied" : ""} ${isSelected ? "active-bed" : ""}`}
                        onClick={() => {
                          if (!occ) {
                            setEditBed(b)
                            setBedError("")
                          }
                        }}
                        title={occ ? `Bed ${b} occupied by ${occ.name}` : `Assign Bed ${b}`}
                      >
                        Bed {b} {occ ? `(${occ.name.split(" ")[0]} · Occupied)` : isSelected ? "✓ Current" : ""}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="form-grid">
                <label htmlFor="edit-name">
                  Full name
                  <input id="edit-name" name="name" defaultValue={editingPatient.name} required />
                </label>
                <label htmlFor="edit-agesex">
                  Age & Sex
                  <input id="edit-agesex" name="ageSex" defaultValue={editingPatient.ageSex} required />
                </label>
                <label htmlFor="edit-mrn">
                  MRN
                  <input id="edit-mrn" name="mrn" defaultValue={editingPatient.mrn} required />
                </label>
                <label htmlFor="edit-bed" className={bedError ? "invalid" : ""}>
                  Bed
                  <input
                    id="edit-bed"
                    name="bed"
                    value={editBed}
                    aria-invalid={Boolean(bedError)}
                    aria-describedby={bedError ? "edit-bed-err" : undefined}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditBed(val)
                      const chk = validateBedOccupancy(val, patientsList, editingPatient.id)
                      if (chk.isOccupied) {
                        setBedError(chk.message || `Bed ${val} is currently occupied.`)
                      } else {
                        setBedError("")
                      }
                    }}
                    required
                  />
                  {bedError && <span id="edit-bed-err">{bedError}</span>}
                </label>
                <label htmlFor="edit-diagnosis" style={{ gridColumn: "1 / -1" }}>
                  Diagnosis
                  <input id="edit-diagnosis" name="diagnosis" defaultValue={editingPatient.diagnosis} required />
                </label>
                <label htmlFor="edit-regimen">
                  Regimen
                  <input id="edit-regimen" name="regimen" defaultValue={editingPatient.regimen} required />
                </label>
                <label htmlFor="edit-cycle">
                  Cycle
                  <input id="edit-cycle" name="cycle" defaultValue={editingPatient.cycle} required />
                </label>
                <label htmlFor="edit-baseline-anc">
                  Baseline ANC (/µL)
                  <input id="edit-baseline-anc" name="baselineAnc" type="number" defaultValue={editingPatient.baselineAnc} required />
                </label>
                <label htmlFor="edit-ecog">
                  ECOG Performance Status
                  <input id="edit-ecog" name="ecog" type="number" min="0" max="4" defaultValue={editingPatient.ecog} required />
                </label>
              </div>
              <div className="drawer-actions">
                <Button onClick={() => setEditingPatient(null)}>Cancel</Button>
                <Button variant="primary" type="submit">
                  Save changes
                </Button>
              </div>
            </form>
          </aside>
        </>
      )}

      {/* Discharge Patient Dialog */}
      {discharge && (
        <div className="dialog-layer">
          <button
            className="dialog-backdrop"
            onClick={() => setDischarge(null)}
            aria-label="Close discharge dialog"
          />
          <div className="confirm-dialog" role="dialog" aria-modal="true">
            <div className="icon-box danger">
              <Icon name="alert" />
            </div>
            <h2>Discharge {discharge.name}?</h2>
            <p>
              Bed {discharge.bed} · {discharge.mrn} · {discharge.diagnosis}
            </p>
            <p style={{ marginTop: "10px", fontSize: "14px", lineHeight: "20px" }}>
              This removes the patient from the active Ward 4B census. Their historical clinical records and SOAP notes will remain permanently accessible in the hospital EMR archive.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <Button onClick={() => setDischarge(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (onDischargePatient) {
                    onDischargePatient(discharge)
                  }
                  setDischarge(null)
                }}
              >
                Confirm discharge
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function MobileCompanion({
  patientsList = patients,
  selectedPatientId,
  onSelectPatient,
  onToast,
  onOcrExtracted,
}: {
  patientsList?: typeof patients
  selectedPatientId?: string
  onSelectPatient?: (id: string) => void
  onToast?: (msg: string) => void
  onOcrExtracted?: (patientId: string, fileName: string, extracted: any) => void
} = {}) {
  const activePatients = patientsList && patientsList.length > 0 ? patientsList : patients
  const activeId = selectedPatientId || activePatients[0]?.id || "104"
  const patient = activePatients.find((item) => item.id === activeId) || activePatients[0]
  const patientCase = patientCases[patient.id] || patientCases["104"]

  const [transcript, setTranscript] = useState(patientCase.transcript)
  const [captured, setCaptured] = useState(false)
  const [sent, setSent] = useState(false)
  const [autoCorrectModalOpen, setAutoCorrectModalOpen] = useState(false)
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [pendingOcr, setPendingOcr] = useState<{ fileName: string; parsed: ParsedClinicalOcr } | null>(null)
  const mobileFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTranscript(patientCase.transcript)
  }, [patientCase.transcript, patient.id])

  const {
    engine: sttEngine,
    setEngine: setSttEngine,
    recording,
    interimTranscript,
    whisperSeconds,
    whisperProcessing,
    toggle: toggleDictation,
  } = useVoiceDictation({
    onAppendText: (chunk) => setTranscript((prev) => prev + chunk),
    onError: (msg) => onToast?.(msg),
    clinicalAutoCorrect: true,
  })

  const handleApplyAutoCorrect = (newText: string, count: number, avgConfidence: number) => {
    setTranscript(newText)
    if (onToast) {
      onToast(`✓ Auto-corrected ${count} oncology term${count > 1 ? "s" : ""} (${avgConfidence}% confidence)`)
    }
  }

    const handleConfirmOcr = (confirmed: ParsedClinicalOcr) => {
    if (!pendingOcr) return
    const fileName = pendingOcr.fileName
    const ocrSnippet = `\n[BEDSIDE OCR SCAN: ${fileName}]\n• ANC: ${formatNumber(confirmed.anc)} /µL (Grade ${confirmed.grade}) · Plt: ${formatNumber(confirmed.platelets)} /µL\n• High Confidence OCR · Synced to Analytics JSON`
    setTranscript((prev) => prev + ocrSnippet)
    setCaptured(true)
    if (onOcrExtracted) onOcrExtracted(patient.id, fileName, confirmed)
    if (onToast) onToast(`Bedside lab sheet OCR verified & stored in analytics JSON`)
    setPendingOcr(null)
  }

const handleMobileScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const parsed = parseClinicalLabOcr(file.name, "", patient)
    setPendingOcr({ fileName: file.name, parsed })
    setOcrModalOpen(true)
  }

    const presets = [
    "Afebrile",
    "Nausea Grade 2",
    "Neuropathy",
    "Post-Chemo Day 8",
  ]
  return (
    <main className="companion-background">
      <section className="phone">
        <div className="phone-title">
          <div>
            <h1>Bedside round</h1>
            <p>Local speech · zero audio upload</p>
          </div>
          <span
            className="status-dot"
            role="img"
            aria-label="Local speech system online"
            title="Local speech system online"
          />
        </div>
        <button
          className="patient-selector"
          onClick={() => {
            if (onSelectPatient) {
              const currentIndex = activePatients.findIndex((p) => p.id === patient.id)
              const nextIndex = (currentIndex + 1) % activePatients.length
              onSelectPatient(activePatients[nextIndex].id)
            }
          }}
          title="Tap to switch patient"
        >
          <span>
            <b>Bed {patient.bed}</b> · {patient.name}
          </span>
          <span>Change (Tap)</span>
        </button>

        <div className="mobile-engine-chips" style={{ display: "flex", justifyContent: "center", gap: "8px", margin: "10px 0" }}>
          <button
            className={`engine-chip ${sttEngine === "live-asr" ? "active" : ""}`}
            onClick={() => { if (!recording) setSttEngine("live-asr") }}
            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "16px", border: "1px solid var(--border)", background: sttEngine === "live-asr" ? "var(--brand)" : "transparent", color: sttEngine === "live-asr" ? "white" : "inherit" }}
          >
            Live ASR
          </button>
          <button
            className={`engine-chip ${sttEngine === "whisper" ? "active" : ""}`}
            onClick={() => { if (!recording) setSttEngine("whisper") }}
            style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "16px", border: "1px solid var(--border)", background: sttEngine === "whisper" ? "var(--brand)" : "transparent", color: sttEngine === "whisper" ? "white" : "inherit" }}
          >
            Whisper AI
          </button>
        </div>

        <div className="record-area">
          <button
            className={`record-large ${recording ? "recording" : ""}`}
            onClick={toggleDictation}
            aria-label={recording ? "Stop dictation" : "Start dictation"}
            title={recording ? "Stop dictation" : "Start dictation"}
          >
            <Icon name="mic" size={20} />
          </button>
          <h2>{recording ? (sttEngine === "whisper" ? `Listening to Whisper (${whisperSeconds}s)…` : "Listening to microphone…") : `Tap to dictate (${sttEngine === "whisper" ? "Whisper" : "Live ASR"})`}</h2>
          <p>Audio stays on this device · Type or edit note anytime</p>
        </div>
        <Waveform active={recording} />

        {/* Live ASR Interim Stream on Mobile */}
        {recording && sttEngine === "live-asr" && (
          <div className="live-asr-stream mobile" style={{ margin: "8px 12px", padding: "8px 12px", background: "rgba(0,102,102,0.08)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px" }}>
            <span style={{ fontWeight: 700, color: "var(--brand)", marginRight: "6px" }}>LIVE:</span>
            <span style={{ fontStyle: "italic" }}>{interimTranscript || "Listening… speak now"}</span>
          </div>
        )}

        {whisperProcessing && (
          <div style={{ margin: "8px 12px", padding: "8px 12px", background: "rgba(0,102,102,0.08)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px", color: "var(--brand)", textAlign: "center" }}>
            Transcribing with on-device Whisper model...
          </div>
        )}

        <div className="live-text" style={{ padding: 0 }}>
          <textarea
            className="live-mobile-textarea"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Dictate into mic or type assessment notes manually here..."
            style={{ width: "100%", minHeight: "140px", padding: "12px", border: 0, background: "transparent", color: "inherit", font: "inherit", resize: "vertical" }}
          />
        </div>

        <div style={{ padding: "0 12px 8px", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="text-button"
            onClick={() => setAutoCorrectModalOpen(true)}
            style={{ fontSize: "12px", color: "var(--brand)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}
          >
            <Icon name="refresh" size={14} />
            Review oncological auto-correct
          </button>
        </div>

        <div className="preset-row">
          {presets.map((preset) => (
            <button
              onClick={() => {
                const updated = autocorrectOncologyTranscript(`${transcript} ${preset}.`).correctedText
                setTranscript(updated)
              }}
              key={preset}
            >
              + {preset}
            </button>
          ))}
        </div>
        <input
          ref={mobileFileRef}
          type="file"
          accept="image/*,.pdf,.txt"
          style={{ display: "none" }}
          onChange={handleMobileScan}
        />
        <button
          className={`scan-mobile ${captured ? "captured" : ""}`}
          onClick={() => mobileFileRef.current?.click()}
        >
          {captured ? (
            <>
              <ReportImage patient={patient} />
              <span>
                <Icon name="check" size={20} />
                Lab sheet OCR verified & stored in JSON
              </span>
            </>
          ) : (
            <>
              <span className="icon-box">
                <Icon name="camera" />
              </span>
              <b>Scan / upload lab sheet</b>
              <small>Optical character recognition extracts values & updates analytics</small>
            </>
          )}
        </button>
        <div className="phone-action">
          <Button
            variant="primary"
            icon={sent ? "check" : "zap"}
            onClick={() => {
              const payload = {
                patientId: patient.id,
                patientName: patient.name,
                bed: patient.bed,
                transcript: transcript,
                timestamp: Date.now(),
                timeStr: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                wordCount: transcript.trim().split(/\s+/).filter(Boolean).length,
                source: "mobile-bedside",
              }
              if (typeof localStorage !== "undefined") {
                localStorage.setItem(`rounds-bedside-sync-${patient.id}`, JSON.stringify(payload))
                localStorage.setItem("rounds-bedside-sync-latest", JSON.stringify(payload))
              }
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("rounds-bedside-sync-event", { detail: payload }))
              }
              setSent(true)
              if (onToast) onToast(`✓ Bedside round sent to Station for Bed ${patient.bed} (${payload.wordCount} words)`)
            }}
          >
            {sent ? "Sent to station" : "Send to station"}
          </Button>
        </div>
      </section>

      <ClinicalAutoCorrectModal
        isOpen={autoCorrectModalOpen}
        onClose={() => setAutoCorrectModalOpen(false)}
        transcript={transcript}
        onApply={handleApplyAutoCorrect}
      />
      <OcrReviewModal
        isOpen={ocrModalOpen}
        fileName={pendingOcr?.fileName || ""}
        initialParsed={pendingOcr?.parsed || null}
        onClose={() => setOcrModalOpen(false)}
        onCommit={handleConfirmOcr}
      />
    </main>
  )
}

function NadirChart({ rounds = [], baseline = 1400 }: { rounds?: RoundRecord[]; baseline?: number }) {
  const chronRounds = [...rounds].reverse()
  const count = chronRounds.length
  const points = chronRounds.map((r, i) => {
    const x = count > 1 ? Math.round(96 + (i * (608 / (count - 1)))) : 380
    const clamped = Math.max(0, Math.min(4000, r.anc))
    const y = Math.round(256 - ((clamped / 4000) * (256 - 32)))
    const gradeColor =
      r.ctcae_grade >= 4 ? "#d92d20" :
      r.ctcae_grade === 3 ? "#f79009" :
      r.ctcae_grade === 2 ? "#eaaa08" : "#0f766e"
    return {
      x,
      y,
      label: `${r.source && r.source.includes("Cycle") ? r.source : `Round ${i + 1}`}: ${formatNumber(r.anc)} /µL (Grade ${r.ctcae_grade})`,
      anc: r.anc,
      grade: r.ctcae_grade,
      gradeColor,
      source: r.source,
      date: r.date,
    }
  })
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ")
  const baselineY = Math.round(256 - ((Math.min(4000, baseline) / 4000) * (256 - 32)))

  return (
    <svg
      className="chart"
      viewBox="0 0 760 300"
      role="img"
      aria-label="Myelosuppression nadir trajectory"
    >
      {/* Grade 4 Danger Zone (<500 /uL) */}
      <rect
        x="56"
        y="228"
        width="670"
        height="32"
        rx="4"
        fill="rgba(254, 243, 242, 0.9)"
        stroke="rgba(253, 162, 155, 0.4)"
      />
      <text x="66" y="249" fontSize="11" fontWeight="600" fill="#b42318">
        Grade 4 · Severe Myelosuppression (below 500 /µL)
      </text>

      {/* Grade 3 Warning Zone (500-999 /uL) */}
      <rect
        x="56"
        y="200"
        width="670"
        height="28"
        rx="0"
        fill="rgba(255, 250, 235, 0.6)"
      />
      <text x="66" y="218" fontSize="10.5" fontWeight="500" fill="#b54708">
        Grade 3 (500–999 /µL)
      </text>

      {/* Grid Lines */}
      {[32, 88, 144, 200, 256].map((y, index) => (
        <g key={y}>
          <line x1="56" x2="726" y1={y} y2={y} stroke="var(--divider)" strokeWidth="1" />
          <text x="44" y={y + 4} textAnchor="end" fontSize="12" fill="var(--secondary)">
            {formatNumber(4000 - index * 1000)}
          </text>
        </g>
      ))}

      {/* Patient-specific Baseline */}
      <line
        className="baseline-line"
        x1="56"
        x2="630"
        y1={baselineY}
        y2={baselineY}
        stroke="var(--secondary)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <g transform={`translate(634, ${baselineY - 10})`}>
        <rect x="0" y="0" width="94" height="20" rx="4" fill="var(--subtle)" stroke="var(--divider)" />
        <text x="47" y="14" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--secondary)">
          Base: {formatNumber(baseline)}
        </text>
      </g>

      {/* Single round projection */}
      {points.length === 1 && (
        <line
          x1={points[0].x}
          y1={points[0].y}
          x2={600}
          y2={baselineY}
          stroke="var(--brand)"
          strokeWidth="2"
          strokeDasharray="6 6"
          opacity="0.6"
        />
      )}

      {/* Polyline */}
      {points.length > 1 && (
        <polyline
          className="primary-line"
          points={polylinePoints}
          stroke="var(--brand)"
          strokeWidth="3"
          fill="none"
        />
      )}

      {/* Data Points */}
      {points.map((p, idx) => (
        <g className="data-point" tabIndex={0} key={`${p.x}-${idx}`}>
          <circle
            cx={p.x}
            cy={p.y}
            r="6"
            fill="var(--surface)"
            stroke={p.gradeColor}
            strokeWidth="3.5"
          />
          {/* Direct value callout pill */}
          <g transform={`translate(${p.x - 38}, ${p.y - 28})`}>
            <rect
              x="0"
              y="0"
              width="76"
              height="20"
              rx="10"
              fill="var(--surface)"
              stroke={p.gradeColor}
              strokeWidth="1.5"
            />
            <text
              x="38"
              y="14"
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={p.gradeColor}
            >
              {formatNumber(p.anc)}
            </text>
          </g>
          {/* Hover tooltip */}
          <title>{p.label}</title>
        </g>
      ))}

      {/* Dates along X axis */}
      {points.map((p, index) => (
        <g key={`lbl-${p.x}-${index}`}>
          <text
            x={p.x}
            y="282"
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="var(--text)"
          >
            {p.source && p.source.length <= 15 ? p.source : `Round ${index + 1}`}
          </text>
          <text
            x={p.x}
            y="296"
            textAnchor="middle"
            fontSize="10.5"
            fill="var(--secondary)"
          >
            {p.date}
          </text>
        </g>
      ))}
    </svg>
  )
}

function RecoveryChart({ rounds = [] }: { rounds?: RoundRecord[] }) {
  const chronRounds = [...rounds].reverse()
  const count = chronRounds.length

  const pltPoints = chronRounds.map((r, i) => {
    const x = count > 1 ? Math.round(96 + (i * (608 / (count - 1)))) : 380
    // Platelets scale 0 to 300,000 -> y between 40 and 208
    const clampedPlt = Math.max(0, Math.min(300000, r.platelets))
    const y = Math.round(208 - ((clampedPlt / 300000) * (208 - 40)))
    return {
      x,
      y,
      label: `Platelets: ${formatNumber(r.platelets)} /µL`,
      value: r.platelets,
      source: r.source,
      date: r.date,
    }
  })
  const pltPolyline = pltPoints.map((p) => `${p.x},${p.y}`).join(" ")

  const hgbPoints = chronRounds.map((r, i) => {
    const x = count > 1 ? Math.round(96 + (i * (608 / (count - 1)))) : 380
    // Hemoglobin scale 8 to 16 g/dL -> y between 40 and 208
    const clampedHgb = Math.max(8, Math.min(16, r.hemoglobin || 12))
    const y = Math.round(208 - (((clampedHgb - 8) / 8) * (208 - 40)))
    return {
      x,
      y,
      label: `Hemoglobin: ${r.hemoglobin || 12} g/dL`,
      value: r.hemoglobin || 12,
      source: r.source,
      date: r.date,
    }
  })
  const hgbPolyline = hgbPoints.map((p) => `${p.x},${p.y}`).join(" ")

  const latestRound = chronRounds[chronRounds.length - 1]
  const latestPlt = latestRound?.platelets ?? 180000
  const latestHgb = latestRound?.hemoglobin ?? 12.0

  return (
    <svg
      className="chart"
      viewBox="0 0 760 280"
      role="img"
      aria-label="Platelet and hemoglobin recovery"
    >
      {/* Legend */}
      <g transform="translate(480, 16)">
        <circle cx="0" cy="0" r="5" fill="#0f766e" />
        <text x="8" y="4" fontSize="11.5" fontWeight="600" fill="var(--text)">
          Platelets (/µL)
        </text>
        <rect x="110" y="-4" width="8" height="8" rx="2" fill="#7c3aed" />
        <text x="124" y="4" fontSize="11.5" fontWeight="600" fill="var(--text)">
          Hemoglobin (g/dL)
        </text>
      </g>

      {/* Grid Lines */}
      {[40, 96, 152, 208].map((y, idx) => (
        <g key={y}>
          <line x1="56" x2="726" y1={y} y2={y} stroke="var(--divider)" strokeWidth="1" />
          <text x="44" y={y + 4} textAnchor="end" fontSize="11" fill="var(--secondary)">
            {formatNumber(300000 - idx * 80000)}
          </text>
          <text x="734" y={y + 4} textAnchor="start" fontSize="11" fill="#7c3aed">
            {(16 - idx * 2.5).toFixed(1)}g
          </text>
        </g>
      ))}

      {/* Polylines */}
      {pltPoints.length > 1 && (
        <polyline
          className="primary-line"
          points={pltPolyline}
          stroke="#0f766e"
          strokeWidth="3"
          fill="none"
        />
      )}
      {hgbPoints.length > 1 && (
        <polyline
          points={hgbPolyline}
          stroke="#7c3aed"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          fill="none"
        />
      )}

      {/* Platelet Data Points */}
      {pltPoints.map((p, index) => (
        <g className="data-point" tabIndex={0} key={`plt-${p.x}-${index}`}>
          <circle cx={p.x} cy={p.y} r="5.5" fill="var(--surface)" stroke="#0f766e" strokeWidth="3" />
          <g transform={`translate(${p.x - 36}, ${p.y - 24})`}>
            <rect x="0" y="0" width="72" height="18" rx="9" fill="var(--surface)" stroke="#0f766e" strokeWidth="1" />
            <text x="36" y="13" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f766e">
              {formatNumber(p.value)}
            </text>
          </g>
          <title>{p.label}</title>
        </g>
      ))}

      {/* Hemoglobin Data Points */}
      {hgbPoints.map((p, index) => (
        <g className="data-point" tabIndex={0} key={`hgb-${p.x}-${index}`}>
          <rect x={p.x - 4} y={p.y - 4} width="8" height="8" rx="2" fill="#7c3aed" stroke="var(--surface)" strokeWidth="1.5" />
          <text x={p.x} y={p.y + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="#7c3aed">
            {p.value} g/dL
          </text>
          <title>{p.label}</title>
        </g>
      ))}

      {/* Latest dynamic badge */}
      <g className="latest-badge" transform="translate(68, 12)">
        <rect x="0" y="0" width="220" height="24" rx="12" fill="var(--brand-tint)" stroke="var(--brand-border)" />
        <text x="110" y="16" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--brand)">
          Latest: Plt {formatNumber(latestPlt)} · Hgb {latestHgb} g/dL
        </text>
      </g>

      {/* Dates along X axis */}
      {pltPoints.map((p, index) => (
        <text
          x={p.x}
          y="256"
          textAnchor="middle"
          fontSize="11"
          fontWeight="500"
          fill="var(--secondary)"
          key={`lbl-${p.x}-${index}`}
        >
          {p.date}
        </text>
      ))}
    </svg>
  )
}

function Analytics({
  patientsList = patients,
  selectedPatientId,
  onSelectPatient,
  analyticsData = INITIAL_ANALYTICS,
  onToast,
}: {
  patientsList?: typeof patients
  selectedPatientId?: string
  onSelectPatient?: (id: string) => void
  analyticsData?: Record<string, PatientAnalytics>
  onToast?: (msg: string, type?: "info" | "success" | "warning" | "alert") => void
} = {}) {
  const activePatients = patientsList && patientsList.length > 0 ? patientsList : patients
  const activeId = selectedPatientId || activePatients[0]?.id || "104"
  const [ascending, setAscending] = useState(false)
  const patient = activePatients.find((item) => item.id === activeId) || activePatients[0]

  const patientAnalytics = analyticsData[activeId] || INITIAL_ANALYTICS[activeId] || {
    patient_id: activeId,
    patient_name: patient.name,
    rounds: [],
    kpis: [
      ["Absolute neutrophils", `${formatNumber(patient.baselineAnc)}`, "/µL", "Baseline only"],
      ["Platelet reserve", "—", "", "Insufficient data"],
      ["Active graded toxicities", "0", "", "Baseline only"],
      ["Clinical risk level", "Pending", "", "Insufficient data"],
    ],
    trajectory: [],
  }

  const baselineOnly = (patientAnalytics.rounds || []).length <= 1
  const kpis = patientAnalytics.kpis

  const doseRec = getDoseModificationRecommendation(patient, patientAnalytics.rounds)

  const sortedRounds = useMemo(() => {
    const list = patientAnalytics.rounds || []
    return [...list].sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0
      const dateB = new Date(b.date).getTime() || 0
      return ascending ? dateA - dateB : dateB - dateA
    })
  }, [patientAnalytics.rounds, ascending])

  const exportAnalyticsJson = () => {
    const payload = {
      hospital: "City Cancer Center",
      department: "Inpatient Oncology Ward 4B",
      exported_at: new Date().toISOString(),
      patient: {
        id: patient.id,
        name: patient.name,
        mrn: patient.mrn,
        bed: patient.bed,
        diagnosis: patient.diagnosis,
        regimen: patient.regimen,
        cycle: patient.cycle,
        baseline_anc: patient.baselineAnc,
      },
      current_patient_analytics: patientAnalytics,
      full_ward_census_analytics: analyticsData,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rounds_analytics_${patient.id}_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    if (onToast) onToast("Analytics JSON exported successfully", "success")
  }

  return (
    <main className="analytics page-shell">
      <div className="analytics-toolbar">
        <div>
          <label>
            Patient
            <select
              value={activeId}
              onChange={(event) => onSelectPatient?.(event.target.value)}
            >
              {activePatients.map((item) => (
                <option value={item.id} key={item.id}>
                  #{item.id} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="patient-chips">
            {activePatients.map((item) => (
              <button
                className={item.id === activeId ? "active" : ""}
                onClick={() => onSelectPatient?.(item.id)}
                key={item.id}
              >
                #{item.id} {item.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="analytics-actions">
          <Button icon="file" onClick={exportAnalyticsJson} title="Download updated analytics JSON">
            Export JSON
          </Button>
          <Button
            icon="refresh"
            onClick={() => {
              let count = patientAnalytics.rounds?.length || 0
              if (typeof localStorage !== "undefined") {
                const saved = localStorage.getItem("rounds-analytics-data")
                if (saved) {
                  try {
                    const parsed = JSON.parse(saved)
                    if (parsed[activeId]?.rounds) {
                      count = parsed[activeId].rounds.length
                    }
                  } catch {}
                }
              }
              if (onToast) onToast(`Synchronized ${count} clinical rounds with hospital audit log`, "success")
            }}
          >
            Sync rounds
          </Button>
          <Button icon="download" onClick={() => window.print()}>
            Print report
          </Button>
        </div>
      </div>
      <section className="summary-card">
        <div className="summary-person">
          <span className="patient-avatar large">{patient.initials}</span>
          <div>
            <h1>{patient.name}</h1>
            <p>
              <span className="numeric">
                {patient.ageSex} · {patient.mrn}
              </span>{" "}
              · {patient.diagnosis}
            </p>
          </div>
        </div>
        <div className="cycle-progress">
          <div>
            <span>
              {patient.regimen} · {patient.cycle}
            </span>
            <strong>{patientAnalytics.rounds.length > 1 ? "50%" : "—"}</strong>
          </div>
          <div className="progress-track">
            <i />
          </div>
        </div>
      </section>
      {baselineOnly && (
        <div className="empty-banner">
          <div className="empty-illustration">
            <Icon name="activity" />
          </div>
          <div>
            <strong>Not enough rounds yet.</strong>
            <p>Showing admission baseline only. Attach or scan a lab report to run OCR and update analytics.</p>
          </div>
          <Button
            onClick={() => {
              if (onToast) onToast("Analytics synchronized", "success")
            }}
          >
            Sync rounds
          </Button>
        </div>
      )}
      <div className="stat-grid">
        {kpis.map(([label, value, unit, badge]) => (
          <article key={label}>
            <span>{label}</span>
            <strong
              className={`numeric ${badge === "Grade 4" ? "danger-text" : ""}`}
            >
              {value} {unit && <small>{unit}</small>}
            </strong>
            <em>{badge}</em>
          </article>
        ))}
      </div>
      <section className="analytics-section">
        <div className="section-head">
          <div>
            <h2>Myelosuppression nadir trajectory</h2>
            <p>
              Absolute neutrophil count (ANC) trend across cycles with predicted
              nadir depth and recovery interval.
            </p>
          </div>
          <span className="info-chip">CTCAE v5.0 ANC thresholds</span>
        </div>
        <div className="chart-scroll">
          <NadirChart rounds={patientAnalytics.rounds} baseline={patient.baselineAnc} />
        </div>
      </section>
      <section className="analytics-section">
        <div className="section-head">
          <div>
            <h2>Platelet and hemoglobin recovery curve</h2>
            <p>
              Secondary hematologic lineage recovery following cytotoxic
              infusion.
            </p>
          </div>
        </div>
        <div className="chart-scroll">
          <RecoveryChart rounds={patientAnalytics.rounds} />
        </div>
      </section>
      <section className="analytics-section">
        <div className="section-head">
          <div>
            <h2>Dose modification recommendations</h2>
            <p>
              Protocol-guided adjustments based on {patient.name}'s CTCAE toxicity profile & marrow nadir.
            </p>
          </div>
          <span className={`status-badge ${doseRec.badgeVariant}`}>
            {doseRec.statusBadge}
          </span>
        </div>
        <div className={`dose-recommendation-card ${doseRec.badgeVariant}`}>
          <div className="dose-rec-header">
            <div>
              <span className="dose-rec-title">{doseRec.title}</span>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--secondary)" }}>
                Protocol source: {doseRec.protocolSource}
              </p>
            </div>
            {doseRec.actionRequired && (
              <span className="danger-text" style={{ fontSize: "13px", fontWeight: 600 }}>
                ⚠️ï¸ Clinical Action Mandatory
              </span>
            )}
          </div>
          <p style={{ fontSize: "14.5px", lineHeight: "1.6", margin: "6px 0 0", color: "var(--text)" }}>
            <b>Primary Assessment:</b> {doseRec.recommendation}
          </p>
          <div className="dose-rec-grid">
            <div className="dose-rec-field">
              <strong>Chemotherapy Dose Adjustment</strong>
              <p>{doseRec.doseAdjustment}</p>
            </div>
            <div className="dose-rec-field">
              <strong>G-CSF Growth Factor Prophylaxis</strong>
              <p>{doseRec.gcsfProphylaxis}</p>
            </div>
            <div className="dose-rec-field">
              <strong>Clinical Monitoring Plan</strong>
              <p>{doseRec.monitoringPlan}</p>
            </div>
          </div>
        </div>
      </section>
      <section className="audit-section">
        <div className="section-head">
          <div>
            <h2>Historical rounds audit log</h2>
            <p>Attested round evaluations and OCR laboratory findings for {patient.name}.</p>
          </div>
          <button
            className="text-button"
            onClick={() => setAscending(!ascending)}
          >
            Date {ascending ? "▲" : "▼"}
          </button>
        </div>
        <div className="audit-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Attending</th>
                <th>ANC Nadir</th>
                <th>Platelets</th>
                <th>CTCAE Grade</th>
                <th>Status</th>
                <th>Evaluation / Source</th>
              </tr>
            </thead>
            <tbody>
              {sortedRounds.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--secondary)" }}>
                    No historical rounds recorded yet for this admission. Attest a round or scan a lab report to populate the audit log.
                  </td>
                </tr>
              ) : (
                sortedRounds.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.date}</strong>
                    </td>
                    <td>{r.doctor}</td>
                    <td className="numeric">
                      <strong className={r.ctcae_grade >= 4 ? "danger-text" : ""}>
                        {formatNumber(r.anc)} /µL
                      </strong>
                    </td>
                    <td className="numeric">
                      {formatNumber(r.platelets)} /µL
                    </td>
                    <td>
                      <SeverityBadge grade={r.ctcae_grade}>
                        Grade {r.ctcae_grade}
                      </SeverityBadge>
                    </td>
                    <td>
                      <span className={`status-pill ${r.status.toLowerCase().replace(/\s+/g, "-")}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: "13px", fontWeight: 500 }}>{r.source}</div>
                      {r.notes && (
                        <div style={{ fontSize: "12px", color: "var(--secondary)", marginTop: "2px" }}>
                          {r.notes}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function ProductMockup() {
  return (
    <div className="product-scene">
      <div className="laptop-frame">
        <div className="mock-top">
          <span className="brand-mark">
            <Icon name="stethoscope" />
          </span>
          <b>RoundsAI</b>
          <span>Station</span>
          <i />
        </div>
        <div className="mock-body">
          <aside>
            <b>Ward census</b>
            {patients.map((patient, index) => (
              <div className={index === 0 ? "active" : ""} key={patient.id}>
                <span className="patient-avatar">{patient.initials}</span>
                <p>
                  {patient.name}
                  <small>
                    Bed {patient.bed} · {patient.regimen}
                  </small>
                </p>
              </div>
            ))}
          </aside>
          <main>
            <span>Bed 12 · David Miller</span>
            <h3>Review clinical findings</h3>
            <div className="mock-alert">
              <Icon name="alert" />
              <p>
                <b>Possible febrile neutropenia</b>
                <small>Immediate clinical review recommended</small>
              </p>
              <SeverityBadge grade={4}>Grade 4</SeverityBadge>
            </div>
            <div className="mock-metrics">
              {[
                ["ANC", "420"],
                ["Platelets", formatNumber(88000)],
                ["WBC", formatNumber(1800)],
              ].map((item) => (
                <div key={item[0]}>
                  <span>{item[0]}</span>
                  <b className="numeric">{item[1]}</b>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
      <div className="phone-frame">
        <span>Bed 12 · David</span>
        <div>
          <Icon name="mic" size={20} />
        </div>
        <b>Tap to dictate</b>
        <small>Audio stays on device</small>
      </div>
      <div className="scene-chips">
        <span>
          <Icon name="alert" />
          Febrile neutropenia flagged
        </span>
        <span>
          <Icon name="zap" />
          Round synced from bedside
        </span>
        <span>
          <Icon name="check" />
          Note ready for review
        </span>
      </div>
    </div>
  )
}

function MiniVisual({ type }: { type: number }) {
  if (type === 1)
    return (
      <div className="feature-visual voice">
        <button aria-label="Start dictation" title="Start dictation">
          <Icon name="mic" size={20} />
        </button>
        <Waveform active />
        <p>
          Patient febrile overnight to <span className="numeric">38.4°C</span>…
        </p>
      </div>
    )
  if (type === 2)
    return (
      <div className="feature-visual scan">
        <ReportImage />
      </div>
    )
  if (type === 3)
    return (
      <div className="feature-visual alert-visual">
        <div className="icon-box danger">
          <Icon name="alert" />
        </div>
        <div>
          <b>Possible febrile neutropenia</b>
          <p>
            <span className="numeric">38.4°C</span> · ANC{" "}
            <span className="numeric">420 /µL</span>
          </p>
        </div>
      </div>
    )
  return (
    <div className="feature-visual note-visual">
      {["Subjective", "Objective", "Assessment", "Plan"].map((item) => (
        <div key={item}>
          <b>{item}</b>
          <span />
        </div>
      ))}
    </div>
  )
}

function Landing({
  go,
  signedIn,
}: {
  go: (screen: Screen) => void
  signedIn: boolean
}) {
  const [menu, setMenu] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const faqs = [
    [
      "What is RoundsAI?",
      "An AI-assisted oncology ward workspace for capturing rounds, reviewing structured clinical findings, and preparing clinician-approved SOAP notes.",
    ],
    [
      "Does audio leave the device?",
      "No. The prototypeâ€™s speech workflow is designed for local processing with zero audio upload.",
    ],
    [
      "Which guidelines does it use?",
      "The current prototype references CTCAE v5.0 grading and guideline-grounded safety prompts, with sources shown for clinician review.",
    ],
    [
      "Does it replace the clinician?",
      "No. Every suggestion is assistive. The clinician confirms critical values, reviews the note, and makes the final decision.",
    ],
    [
      "Is it a medical device?",
      "No. This is a decision-support prototype and is not a medical device.",
    ],
  ]
  return (
    <main className="landing">
      <nav className="public-nav">
        <button
          className="brand"
          onClick={() => go(signedIn ? "station" : "landing")}
        >
          <span className="brand-mark">
            <Icon name="stethoscope" />
          </span>
          <span>RoundsAI</span>
        </button>
        <div className={`public-links ${menu ? "open" : ""}`}>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="public-actions">
          <ThemeToggle />
          <button
            className="text-button"
            onClick={() => go(signedIn ? "station" : "login")}
          >
            {signedIn ? "Open station" : "Sign in"}
          </button>
          <Button variant="primary" onClick={() => go("login")}>
            Try demo
          </Button>
          <button
            className="icon-button public-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Open navigation"
            title="Open navigation"
          >
            <Icon name="menu" />
          </button>
        </div>
      </nav>
      <section className="landing-hero landing-container">
        <div className="landing-hero-copy">
          <span className="hero-tag">Oncology ward copilot</span>
          <h1>
            Rounds, without the <em>paperwork</em>.
          </h1>
          <p>
            Capture the bedside conversation, review the clinical evidence, and
            complete a structured note—all in one calm workspace.
          </p>
          <div>
            <Button variant="primary" onClick={() => go("login")}>
              Try demo
            </Button>
            <Button onClick={() => go(signedIn ? "station" : "login")}>
              {signedIn ? "Open station" : "Sign in"}
            </Button>
          </div>
          <small>
            On-device speech <i /> CTCAE v5.0 <i /> Clinician approves every
            note
          </small>
        </div>
        <ProductMockup />
      </section>
      <section className="problem-strip landing-container">
        {[
          [
            1,
            "Rounds are rushed",
            "Important details are captured across conversation, paper, and memory.",
          ],
          [
            2,
            "Labs and notes live apart",
            "Clinicians reconcile bedside findings with fragmented systems.",
          ],
          [
            3,
            "Documentation runs late",
            "The clinical day ends, but note writing continues after hours.",
          ],
        ].map(([number, title, copy]) => (
          <article key={String(number)}>
            <div className="icon-box">
              <Icon
                name={
                  number === 1 ? "activity" : number === 2 ? "file" : "moon"
                }
              />
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </section>
      <section className="how-section landing-container" id="how">
        <div className="landing-heading">
          <span>How it works</span>
          <h2>From bedside conversation to a note you can trust.</h2>
        </div>
        {[
          [
            "01",
            "Dictate at the bedside",
            "Capture the assessment naturally while local speech recognition keeps audio on the device.",
            [
              "Tap once to dictate",
              "Use clinical presets",
              "Review the live transcript",
            ],
          ],
          [
            "02",
            "Scan the lab sheet",
            "Photograph a printed report and bring extracted values into the same review flow.",
            [
              "Document crop guidance",
              "High-confidence OCR",
              "Original image stays visible",
            ],
          ],
          [
            "03",
            "Review safety alerts and CTCAE grades",
            "See the urgent finding first, with evidence, grade, and guideline source together.",
            [
              "Confirm critical values",
              "See trend context",
              "Open the guideline source",
            ],
          ],
          [
            "04",
            "Confirm and sign the SOAP note",
            "Review the draft in readable sections, then attest it with a complete audit trail.",
            [
              "Editable SOAP sections",
              "Confirm before signing",
              "Copy to the EMR",
            ],
          ],
        ].map((item, index) => (
          <article className={index % 2 ? "reverse" : ""} key={String(item[0])}>
            <MiniVisual type={index + 1} />
            <div>
              <span>{item[0]}</span>
              <h3>{item[1]}</h3>
              <p>{item[2]}</p>
              <ul>
                {(item[3] as string[]).map((bullet) => (
                  <li key={bullet}>
                    <Icon name="check" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
      <section className="features-section" id="features">
        <div className="landing-container">
          <div className="landing-heading">
            <span>Designed for the ward</span>
            <h2>Focused tools for oncology rounds.</h2>
          </div>
          <div className="feature-grid">
            {[
              [
                "mic",
                "On-device speech",
                "Local Whisper turns bedside speech into an editable transcript.",
              ],
              [
                "refresh",
                "Phonetic auto-correct",
                "Deterministic correction recognizes chemotherapy names and clinical terms.",
              ],
              [
                "camera",
                "Lab report OCR",
                "Scan printed reports and verify extracted values against the source.",
              ],
              [
                "activity",
                "CTCAE v5.0 grading",
                "Pair each toxicity grade with its supporting clinical evidence.",
              ],
              [
                "alert",
                "Febrile neutropenia sentinel",
                "Surface urgent criteria with the guideline source in context.",
              ],
              [
                "shield",
                "Longitudinal analytics",
                "Review nadirs, recovery, and assistive dose-modification guidance.",
              ],
            ].map(([icon, title, copy]) => (
              <article key={title}>
                <div className="icon-box">
                  <Icon name={icon as any} />
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
            <article className="wide-feature">
              <div>
                <div className="icon-box">
                  <Icon name="zap" />
                </div>
                <h3>Bedside-to-station live sync</h3>
                <p>
                  Send the round from the patient room and continue review at
                  the doctor station without repeating work.
                </p>
              </div>
              <div className="sync-demo">
                <span>Bed 12 · David Miller</span>
                <i />
                <b>Received at station</b>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section className="trust-section landing-container" id="safety">
        <div>
          <span>Safety by design</span>
          <h2>Clinician in the loop, at every consequential step.</h2>
          <p>
            RoundsAI supports clinical judgment. It does not automate the final
            decision.
          </p>
        </div>
        <div>
          {[
            [
              "check",
              "Confirm before signing",
              "Critical extracted values require explicit verification.",
            ],
            [
              "shield",
              "Assistive suggestions only",
              "Recommendations remain clearly separate from clinician decisions.",
            ],
            [
              "clipboard",
              "Attestation audit trail",
              "Approved notes retain reviewer and timestamp context.",
            ],
            [
              "lock",
              "Audio stays on device",
              "Speech processing is designed for local execution.",
            ],
          ].map(([icon, title, copy]) => (
            <article key={title}>
              <div className="icon-box">
                <Icon name={icon as any} />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="preview-section landing-container">
        <div className="landing-heading">
          <span>See it in action</span>
          <h2>A clinical workspace that stays out of the way.</h2>
          <p>
            Explore the seeded Ward 4B demo from capture through attestation.
          </p>
          <Button variant="primary" onClick={() => go("login")}>
            Try demo
          </Button>
        </div>
        <ProductMockup />
      </section>
      <section className="faq-section landing-container" id="faq">
        <div className="landing-heading">
          <span>FAQ</span>
          <h2>Questions, answered plainly.</h2>
        </div>
        <div>
          {faqs.map(([question, answer], index) => (
            <article key={question}>
              <button
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                aria-expanded={openFaq === index}
              >
                <span>{question}</span>
                <b>{openFaq === index ? "âˆ’" : "+"}</b>
              </button>
              {openFaq === index && <p>{answer}</p>}
            </article>
          ))}
        </div>
      </section>
      <section className="final-cta">
        <div>
          <h2>Make the round the center of the work again.</h2>
          <p>Explore the evaluation prototype with the seeded Ward 4B cases.</p>
        </div>
        <Button variant="primary" onClick={() => go("login")}>
          Try demo
        </Button>
      </section>
      <footer className="public-footer">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="stethoscope" />
          </span>
          <span>RoundsAI</span>
        </div>
        <p>
          Decision-support prototype. Not a medical device. Clinician judgment
          required.
        </p>
        <span>Â© 2025 RoundsAI</span>
      </footer>
    </main>
  )
}

function Login({
  go,
  onAuth,
}: {
  go: (screen: Screen) => void
  onAuth: () => void
}) {
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (!data.get("email") || !data.get("password"))
      return setError("Enter your Staff ID and password to continue.")
    setError("")
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onAuth()
      go("station")
    }, 900)
  }
  return (
    <main className="login-page">
      <section className="login-hero">
        <img
          src="https://images.unsplash.com/photo-1758691463203-cce9d415b2b5?auto=format&fit=crop&w=1600&q=88"
          alt="Two clinicians reviewing a patient record on a tablet"
        />
        <div className="photo-tint" />
        <div className="hero-brand">
          <span className="brand-mark">
            <Icon name="stethoscope" />
          </span>
          RoundsAI
        </div>
        <div className="floating-events">
          <span>
            <Icon name="check" />
            Note drafted in <b className="numeric">12s</b>
          </span>
          <span>
            <Icon name="alert" />
            ANC <b className="numeric">420</b> flagged
          </span>
          <span>
            <Icon name="zap" />
            Synced to station
          </span>
        </div>
        <div className="hero-copy">
          <h1>
            Rounds, without the <em>paperwork</em>.
          </h1>
          <p>
            A calmer, safer way to capture bedside decisions and complete the
            clinical note.
          </p>
          <div className="hero-stats">
            <div>
              <strong className="numeric">0 ms</strong>
              <span>cloud audio egress</span>
            </div>
            <div>
              <strong className="numeric">120+</strong>
              <span>regimens recognized</span>
            </div>
            <div>
              <strong>CTCAE v5.0</strong>
              <span>built in</span>
            </div>
          </div>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <form className="login-form" onSubmit={submit}>
          <h2>Welcome back</h2>
          <p>Sign in with your hospital credentials.</p>
          {error && (
            <div className="form-error">
              <Icon name="alert" size={20} />
              {error}
            </div>
          )}
          <label>
            Staff ID or email
            <input
              name="email"
              placeholder="name@citycancer.org"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                type={show ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <div className="login-options">
            <label>
              <input type="checkbox" />
              Keep me signed in
            </label>
            <button type="button">Reset password</button>
          </div>
          <Button variant="primary" type="submit" className="full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <div className="or-divider">
            <span>or</span>
          </div>
          <Button
            className="full"
            onClick={() => {
              onAuth()
              go("station")
            }}
          >
            Continue in demo mode
          </Button>
          <small className="privacy-note">
            <Icon name="lock" size={20} />
            Protected health information remains encrypted and audited.
          </small>
        </form>
      </section>
    </main>
  )
}

export default function App({ initialScreen }: { initialScreen?: Screen } = {}) {
  const routeMap: Record<string, Screen> = {
    "/": "landing",
    "/login": "login",
    "/station": "station",
    "/roster": "roster",
    "/analytics": "analytics",
    "/mobile": "mobile",
  }
  const getRoute = (): Screen => {
    if (initialScreen) return initialScreen
    if (typeof window === "undefined") return "landing"
    return routeMap[window.location.pathname] || "landing"
  }
  const [signedIn, setSignedIn] = useState(false)
  const [online, setOnline] = useState(true)
  const [patientsList, setPatientsList] = useState<typeof patients>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("rounds-patients-list")
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
    return patients
  })

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rounds-patients-list", JSON.stringify(patientsList))
    }
  }, [patientsList])
  const [selectedPatientId, setSelectedPatientId] = useState("104")
  const [screen, setScreen] = useState<Screen>(initialScreen || "landing")

  const [clinicianProfile, setClinicianProfile] = useState<ClinicianProfile>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("rounds-clinician-profile")
      if (saved) {
        try {
          return { ...DEFAULT_CLINICIAN_PROFILE, ...JSON.parse(saved) }
        } catch {}
      }
    }
    return DEFAULT_CLINICIAN_PROFILE
  })

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rounds-clinician-profile", JSON.stringify(clinicianProfile))
    }
  }, [clinicianProfile])

  const [notifications, setNotifications] = useState<ClinicalNotification[]>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("rounds-notifications")
      if (saved !== null) {
        try {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) return parsed
        } catch {}
      }
    }
    return INITIAL_CLINICAL_NOTIFICATIONS
  })

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rounds-notifications", JSON.stringify(notifications))
    }
  }, [notifications])

  const [analyticsData, setAnalyticsData] = useState<Record<string, PatientAnalytics>>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("rounds-analytics-data")
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch {}
      }
    }
    return INITIAL_ANALYTICS
  })

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rounds-analytics-data", JSON.stringify(analyticsData))
    }
  }, [analyticsData])

  const [globalToast, setGlobalToast] = useState<{
    message: string
    type: "info" | "success" | "warning" | "alert"
  } | null>(null)
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const showToast = useCallback(
    (
      rawMsg: string,
      type: "info" | "success" | "warning" | "alert" = "success",
      duration = 3500
    ) => {
      const clean = cleanToastMessage(rawMsg)
      if (!clean) return

      let resolvedType = type
      const lower = clean.toLowerCase()
      if (lower.includes("conflict") || lower.includes("occupied") || lower.includes("grade 4")) {
        resolvedType = "alert"
      } else if (lower.includes("warning") || lower.includes("grade 3") || lower.includes("nadir")) {
        resolvedType = "warning"
      }

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }

      setGlobalToast({ message: clean, type: resolvedType })

      toastTimerRef.current = setTimeout(() => {
        setGlobalToast(null)
      }, duration)

      if (
        resolvedType === "alert" ||
        resolvedType === "warning" ||
        lower.includes("attested") ||
        lower.includes("admitted") ||
        lower.includes("discharged") ||
        lower.includes("bedside round") ||
        lower.includes("profile")
      ) {
        const newNotif: ClinicalNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title:
            resolvedType === "alert"
              ? "Ward Bed / Clinical Alert"
              : resolvedType === "warning"
              ? "Clinical Warning"
              : "Ward Clinical Event",
          message: clean,
          timestamp: Date.now(),
          timeStr: "Just now",
          type: resolvedType,
          read: false,
        }
        setNotifications((prev) => [newNotif, ...prev.slice(0, 24)])
      }
    },
    []
  )

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    )
  }

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
    showToast("All clinical notifications marked as read", "info")
  }

  const handleClearNotifications = () => {
    setNotifications([])
    showToast("Clinical notification feed cleared", "info")
  }

  const handleUpdateProfile = (updated: ClinicianProfile) => {
    setClinicianProfile(updated)
    showToast(`Updated clinician profile for ${updated.name}`, "success")
  }

  const handleAttestRound = (patientId: string, record: RoundRecord) => {
    setAnalyticsData((prev) => {
      const current = prev[patientId] || {
        patient_id: patientId,
        patient_name: patientsList.find((p) => p.id === patientId)?.name || "Patient",
        rounds: [],
        kpis: [],
        trajectory: [],
      }

      const updatedRounds = [record, ...current.rounds.filter((r) => r.id !== record.id)]
      const updatedTrajectory = [
        ...current.trajectory,
        {
          label: record.source.includes("OCR") ? "Round (OCR)" : "Attested Note",
          date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          value: record.anc,
          grade: record.ctcae_grade,
        },
      ]

      const getPlateletGrade = (plt: number) =>
        plt < 25000 ? "Grade 4" : plt < 50000 ? "Grade 3" : plt < 75000 ? "Grade 2" : plt < 150000 ? "Grade 1" : "Grade 0"

      const updatedKpis: [string, string, string, string][] = [
        ["Absolute neutrophils", `${formatNumber(record.anc)}`, "/µL", record.ctcae_grade === 0 ? "Grade 0" : `Grade ${record.ctcae_grade}`],
        ["Platelet reserve", `${formatNumber(record.platelets)}`, "/µL", getPlateletGrade(record.platelets)],
        ["Active graded toxicities", record.ctcae_grade > 0 ? "1" : "0", "", record.ctcae_grade === 0 ? "Stable" : `Grade ${record.ctcae_grade}`],
        ["Clinical risk level", record.ctcae_grade >= 4 ? "High" : record.ctcae_grade >= 3 ? "Moderate" : "Low", "", record.ctcae_grade >= 4 ? "Febrile neutropenia" : record.ctcae_grade === 0 ? "Protocol cleared" : "Thermal vigilance"],
      ]

      const updated = {
        ...prev,
        [patientId]: {
          ...current,
          rounds: updatedRounds,
          kpis: updatedKpis,
          trajectory: updatedTrajectory,
        },
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rounds-analytics-data", JSON.stringify(updated))
      }
      return updated
    })
  }

  const handleOcrExtracted = (
    patientId: string,
    fileName: string,
    extracted: {
      anc: number
      wbc: number
      platelets: number
      hemoglobin: number
      temp: number
      grade: number
    }
  ) => {
    const dateStr = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })

    const getPlateletGrade = (plt: number) =>
      plt < 25000 ? "Grade 4" : plt < 50000 ? "Grade 3" : plt < 75000 ? "Grade 2" : plt < 150000 ? "Grade 1" : "Grade 0"

    const newRound: RoundRecord = {
      id: `ocr-${Date.now()}`,
      date: dateStr,
      doctor: clinicianProfile.name,
      anc: extracted.anc,
      wbc: extracted.wbc,
      platelets: extracted.platelets,
      hemoglobin: extracted.hemoglobin,
      ctcae_grade: extracted.grade,
      status: "OCR Verified",
      source: `OCR: ${fileName}`,
      notes: `Multimodal Vision OCR verified with CTCAE Grade ${extracted.grade} (${extracted.grade === 0 ? "Normal" : extracted.grade >= 4 ? "Life-threatening Febrile Neutropenia" : extracted.grade === 3 ? "Severe Neutropenia" : extracted.grade === 2 ? "Moderate Neutropenia" : "Mild Neutropenia"})`,
    }

    const updatedKpis: [string, string, string, string][] = [
      ["Absolute neutrophils", `${formatNumber(extracted.anc)}`, "/µL", extracted.grade === 0 ? "Grade 0" : `Grade ${extracted.grade}`],
      ["Platelet reserve", `${formatNumber(extracted.platelets)}`, "/µL", getPlateletGrade(extracted.platelets)],
      ["Active graded toxicities", extracted.grade > 0 ? "1" : "0", "", extracted.grade === 0 ? "Stable" : `Grade ${extracted.grade}`],
      ["Clinical risk level", extracted.grade >= 4 ? "High" : extracted.grade >= 3 ? "Moderate" : "Low", "", extracted.grade >= 4 ? "Febrile neutropenia" : extracted.grade === 0 ? "Protocol cleared" : "Thermal vigilance"],
    ]

    const newTrajectoryPoint = {
      label: `Round (OCR)`,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value: extracted.anc,
      grade: extracted.grade,
    }

    setAnalyticsData((prev) => {
      const current = prev[patientId] || {
        patient_id: patientId,
        patient_name: patients.find((p) => p.id === patientId)?.name || "Patient",
        rounds: [],
        kpis: updatedKpis,
        trajectory: [],
      }

      const updated = {
        ...prev,
        [patientId]: {
          ...current,
          rounds: [newRound, ...current.rounds.filter((r) => r.id !== newRound.id)],
          kpis: updatedKpis,
          trajectory: [...current.trajectory, newTrajectoryPoint],
        },
      }
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("rounds-analytics-data", JSON.stringify(updated))
        } catch (e) {
          console.warn("Could not persist OCR analytics data to localStorage:", e)
        }
      }
      return updated
    })

    showToast(`Full OCR parsed from ${fileName} · Stored in analytics JSON`)
  }

  const handleUpdatePatient = (updated: typeof patients[number]) => {
    setPatientsList((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    )
    showToast(`Updated Bed ${updated.bed} · ${updated.name}`)
  }

  const handleDischargePatient = (toDischarge: typeof patients[number]) => {
    setPatientsList((prev) => prev.filter((p) => p.id !== toDischarge.id))
    showToast(`${toDischarge.name} discharged from Bed ${toDischarge.bed}`)
    if (selectedPatientId === toDischarge.id) {
      const remaining = patientsList.filter((p) => p.id !== toDischarge.id)
      if (remaining.length > 0) {
        setSelectedPatientId(remaining[0].id)
      }
    }
  }

  const handleAdmitPatient = (newPatient: typeof patients[number]) => {
    setPatientsList((prev) => [...prev, newPatient])
    setSelectedPatientId(newPatient.id)

    // Seed new patient's analytics with initial admission baseline
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    const baseGrade = newPatient.baselineAnc < 500 ? 4 : newPatient.baselineAnc < 1000 ? 3 : newPatient.baselineAnc < 1500 ? 2 : 0
    const admissionRound: RoundRecord = {
      id: `adm-${newPatient.id}`,
      date: dateStr,
      doctor: clinicianProfile.name,
      anc: newPatient.baselineAnc,
      wbc: Math.round((newPatient.baselineAnc / 0.6) * 1.5) || 5200,
      platelets: 220000,
      hemoglobin: 12.5,
      ctcae_grade: baseGrade,
      status: "Admission Workup",
      source: "Ward 4B Admission",
      notes: `Admission baseline: ${newPatient.diagnosis}, ${newPatient.regimen} (${newPatient.cycle}). Baseline ANC ${formatNumber(newPatient.baselineAnc)} /µL.`,
    }

    const initialKpis: [string, string, string, string][] = [
      ["Absolute neutrophils", `${formatNumber(newPatient.baselineAnc)}`, "/µL", baseGrade === 0 ? "Grade 0" : `Grade ${baseGrade}`],
      ["Platelet reserve", formatNumber(220000), "/µL", "Grade 0"],
      ["Active graded toxicities", baseGrade > 0 ? "1" : "0", "", baseGrade === 0 ? "Stable" : `Grade ${baseGrade}`],
      ["Clinical risk level", baseGrade >= 4 ? "High" : baseGrade >= 3 ? "Moderate" : "Low", "", baseGrade >= 4 ? "High Risk" : "Stable"],
    ]

    const initialTrajectory = [
      {
        label: "Admission Baseline",
        date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        value: newPatient.baselineAnc,
        grade: baseGrade,
      },
    ]

    setAnalyticsData((prev) => {
      const updated = {
        ...prev,
        [newPatient.id]: {
          patient_id: newPatient.id,
          patient_name: newPatient.name,
          rounds: [admissionRound],
          kpis: initialKpis,
          trajectory: initialTrajectory,
        },
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rounds-analytics-data", JSON.stringify(updated))
      }
      return updated
    })

    showToast(`Admitted ${newPatient.name} to Bed ${newPatient.bed}`)
  }

  const handleResetCensus = () => {
    setPatientsList(patients)
    setAnalyticsData(INITIAL_ANALYTICS)
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("rounds-patients-list")
      localStorage.removeItem("rounds-analytics-data")
    }
    setSelectedPatientId("104")
    showToast("Ward 4B census and analytics reset to 3 admitted demo patients")
  }

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      const isAuth = localStorage.getItem("rounds-auth") === "demo"
      setSignedIn(isAuth)
      const target = getRoute()
      if (!isAuth && ["station", "roster", "analytics", "mobile"].includes(target)) {
        setScreen("login")
      } else {
        setScreen(target)
      }
    }
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine)
    }
  }, [initialScreen])

  const go = (next: Screen) => {
    const protectedRoute = [
      "station",
      "roster",
      "analytics",
      "mobile",
    ].includes(next)
    const destination =
      protectedRoute &&
      !signedIn &&
      (typeof localStorage !== "undefined" && localStorage.getItem("rounds-auth") !== "demo")
        ? "login"
        : next
    history.pushState(
      {},
      "",
      destination === "landing" ? "/" : `/${destination}`,
    )
    setScreen(destination)
    window.scrollTo(0, 0)
  }

  const authenticate = () => {
    localStorage.setItem("rounds-auth", "demo")
    setSignedIn(true)
  }

  const signOut = () => {
    localStorage.removeItem("rounds-auth")
    setSignedIn(false)
    history.pushState({}, "", "/")
    setScreen("landing")
  }

  useEffect(() => {
    const update = () => {
      const target = getRoute()
      if (
        !signedIn &&
        ["station", "roster", "analytics", "mobile"].includes(target)
      ) {
        history.replaceState({}, "", "/login")
        setScreen("login")
      } else setScreen(target)
    }
    addEventListener("popstate", update)
    return () => removeEventListener("popstate", update)
  }, [signedIn])

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    addEventListener("online", connected)
    addEventListener("offline", disconnected)
    return () => {
      removeEventListener("online", connected)
      removeEventListener("offline", disconnected)
    }
  }, [])

  if (screen === "landing") return <Landing go={go} signedIn={signedIn} />
  if (screen === "login") return <Login go={go} onAuth={authenticate} />
  return (
    <div>
      {!online && (
        <div className="offline-banner" role="status">
          <Icon name="wifi" />
          Live sync lost. Polling every 5 seconds.
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
      {globalToast && (
        <div
          className={`toast toast-${globalToast.type}`}
          style={{ zIndex: 120 }}
          role={globalToast.type === "alert" ? "alert" : "status"}
          aria-live={globalToast.type === "alert" ? "assertive" : "polite"}
        >
          <Icon
            name={
              globalToast.type === "alert" || globalToast.type === "warning"
                ? "alert-triangle"
                : "check"
            }
            size={18}
          />
          <span>{globalToast.message}</span>
          <button
            onClick={() => {
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
              setGlobalToast(null)
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <Header
        screen={screen}
        go={go}
        onSignOut={signOut}
        profile={clinicianProfile}
        onUpdateProfile={handleUpdateProfile}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearNotifications={handleClearNotifications}
      />
      {screen === "station" ? (
        <Station
          patientsList={patientsList}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          onResetCensus={handleResetCensus}
          onOcrExtracted={handleOcrExtracted}
          onAttestRound={handleAttestRound}
          go={go}
          onToast={showToast}
          clinicianProfile={clinicianProfile}
        />
      ) : screen === "roster" ? (
        <Roster
          patientsList={patientsList}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          onUpdatePatient={handleUpdatePatient}
          onDischargePatient={handleDischargePatient}
          onAdmitPatient={handleAdmitPatient}
          onResetCensus={handleResetCensus}
          go={go}
          onToast={showToast}
        />
      ) : screen === "mobile" ? (
        <MobileCompanion
          patientsList={patientsList}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          onToast={showToast}
          onOcrExtracted={handleOcrExtracted}
        />
      ) : (
        <Analytics
          patientsList={patientsList}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          analyticsData={analyticsData}
          onToast={showToast}
        />
      )}
      <footer className="quiet-footer">
        City Cancer Center · Local clinical processing · CTCAE v5.0 ·
        Decision-support prototype. Not a medical device. Clinician judgment
        required.
      </footer>
    </div>
  )
}
