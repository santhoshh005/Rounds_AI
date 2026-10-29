"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { Icon } from "./components/Icons"
import { roundsApi, type ExtractRoundResponse } from "../lib/api"
import { formatEmrClipboardNote } from "../lib/clinical-utils"



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

function Header({
  screen,
  go,
  onSignOut,
}: {
  screen: Screen
  go: (screen: Screen) => void
  onSignOut: () => void
}) {
  const [status, setStatus] = useState(false)
  const [profile, setProfile] = useState(false)
  return (
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
              onClick={() => setStatus(!status)}
            >
              <span />
              Status
            </button>
            {status && (
              <div className="status-popover">
                <strong>City Cancer Center · Ward 4B</strong>
                <p>
                  <span />
                  All clinical systems online
                </p>
                <p>Local CPU · zero audio egress</p>
                <p>CTCAE v5.0 active · Demo mode</p>
              </div>
            )}
          </div>
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label="Notifications"
            title="Notifications"
          >
            <Icon name="bell" size={20} />
          </button>
          <div className="profile-wrap">
            <button
              className="avatar-button"
              aria-label="Open clinician menu"
              title="Open clinician menu"
              onClick={() => setProfile(!profile)}
            >
              DA
            </button>
            {profile && (
              <div className="profile-menu">
                <div>
                  <strong>Dr. Attending, MD</strong>
                  <span>City Cancer Center</span>
                </div>
                <button>Profile</button>
                <div className="profile-theme">
                  <span>Theme</span>
                  <ThemeToggle />
                </div>
                <button onClick={onSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
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
  selectedPatientId,
  onSelectPatient,
  onClose,
}: {
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  onClose?: () => void
}) {
  const [filter, setFilter] = useState("All")
  const [query, setQuery] = useState("")
  const shown = patients.filter((patient) => {
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
          <p>3 patients on service</p>
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
        />
      </label>
      <div className="plain-filters">
        {[
          ["All", 3],
          ["Critical", 2],
          ["Stable", 1],
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

function CaptureStep({
  patient,
  patientCase,
  onSelectPatient,
  complete,
  onContinue,
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  onSelectPatient: (id: string) => void
  complete: boolean
  onContinue: () => void
}) {
  const [recording, setRecording] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [transcript, setTranscript] = useState(patientCase.transcript)

  useEffect(() => {
    setTranscript(patientCase.transcript)
  }, [patientCase.transcript])

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
          <p>Dictate your assessment or scan a printed lab report.</p>
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
              {patientCases[p.id].caseLabel}
            </option>
          ))}
        </select>
      </label>
      <article className="panel capture-composer">
        <textarea
          className="capture-textarea"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          aria-label="Round transcript"
        />
        {recording && <Waveform active />}
        <div className="capture-toolbar">
          <button onClick={() => setRecording(!recording)}>
            <Icon name="mic" />
            {recording ? "Stop dictation" : "Dictate"}
          </button>
          <span>
            <Icon name="cpu" />
            On-device audio
          </span>
          <span>
            <Icon name="refresh" />
            Clinical auto-correct
          </span>
          <button>
            <Icon name="file" />
            Attach lab scan / document
          </button>
          <em>
            <Icon name="shield" />
            Speech runs locally · 0 egress
          </em>
        </div>
      </article>
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
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  confirmed: boolean[]
  setConfirmed: (items: boolean[]) => void
  onContinue: () => void
}) {
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
        {patientCase.checklist.map((item, index) => (
          <div className="check-row" key={item}>
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
            <button>Edit</button>
          </div>
        ))}
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
  onCopy,
  onAttest,
}: {
  patient: typeof patients[number]
  patientCase: typeof patientCases[string]
  allConfirmed: boolean
  locked: boolean
  onCopy: () => void
  onAttest: () => void
}) {
  const sections = [
    ["Subjective", patientCase.soapDraft.s],
    ["Objective", patientCase.soapDraft.o],
    ["Assessment", patientCase.soapDraft.a],
    ["Plan", patientCase.soapDraft.p],
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
          <span style={{ fontSize: "13px", color: "var(--brand)", fontWeight: 600 }}>Attending: Dr. Amrut S Kadam, MD</span>
        </div>
        {sections.map(([title, text]) => (
          <div className="soap-section" key={title}>
            <h3>{title}</h3>
            <textarea
              aria-label={`${title} note`}
              defaultValue={text}
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
  selectedPatientId,
  onSelectPatient,
  go,
}: {
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  go?: (screen: Screen) => void
}) {
  const patient =
    patients.find((item) => item.id === selectedPatientId) || patients[0]
  const patientCase = patientCases[patient.id] || patientCases["104"]

  const [step, setStep] = useState<Step>(1)
  const [sync, setSync] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [confirmed, setConfirmed] = useState([true, true, false])
  const [attested, setAttested] = useState(false)
  const [toast, setToast] = useState("")

  useEffect(() => {
    setConfirmed([true, true, false])
    setAttested(false)
  }, [selectedPatientId])

  const copyNote = () => {
    const rawNote = `PATIENT: ${patient.name} (Bed ${patient.bed}, ${patient.mrn})\nDIAGNOSIS: ${patient.diagnosis} · ${patient.regimen} (${patient.cycle})\n\nSUBJECTIVE:\n${patientCase.soapDraft.s}\n\nOBJECTIVE:\n${patientCase.soapDraft.o}\n\nASSESSMENT:\n${patientCase.soapDraft.a}\n\nPLAN:\n${patientCase.soapDraft.p}`
    const noteText = formatEmrClipboardNote(
      rawNote,
      `round-${patient.id}-active`,
      patient.id,
      "Dr. Amrut S Kadam, MD"
    )
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(noteText)
    }
    setToast(`Verified EMR note for ${patient.name} copied`)
    setTimeout(() => setToast(""), 2800)
  }

  const attestNote = () => {
    setAttested(true)
    setStep(3)
    setToast(`Note for ${patient.name} attested and locked`)
    setTimeout(() => setToast(""), 2800)
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
      {toast && (
        <div className="toast">
          <Icon name="check" />
          {toast}
          <button onClick={() => setToast("")}>Dismiss</button>
        </div>
      )}
      {sync && (
        <div className="sync-notice">
          <span>
            <Icon name="zap" size={20} />
            Bedside round received from Bed {patient.bed} ({patient.name}) · just now
          </span>
          <div>
            <button
              onClick={() => {
                setToast(`Bedside data refreshed for ${patient.name}`)
                setTimeout(() => setToast(""), 2800)
              }}
              aria-label="Sync bedside"
            >
              <Icon name="refresh" />
              Sync bedside
            </button>
            <button
              onClick={() => {
                setSync(false)
                setStep(1)
              }}
            >
              Load into station
            </button>
          </div>
        </div>
      )}
      <div className="station-layout">
        <div className={`census-desktop ${drawer ? "open" : ""}`}>
          <Census
            selectedPatientId={selectedPatientId}
            onSelectPatient={onSelectPatient}
            onClose={drawer ? () => setDrawer(false) : undefined}
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
            />
          )}
          {step === 2 && (
            <ReviewStep
              patient={patient}
              patientCase={patientCase}
              confirmed={confirmed}
              setConfirmed={setConfirmed}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <SignStep
              patient={patient}
              patientCase={patientCase}
              allConfirmed={confirmed.every(Boolean)}
              locked={attested}
              onCopy={copyNote}
              onAttest={attestNote}
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
  selectedPatientId,
  onSelectPatient,
  go,
}: {
  selectedPatientId: string
  onSelectPatient: (id: string) => void
  go: (screen: Screen) => void
}) {
  const [drawer, setDrawer] = useState(false)
  const [discharge, setDischarge] = useState<typeof patients[number] | null>(
    null,
  )
  const [menu, setMenu] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
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
    setDrawer(false)
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(false)
        setDischarge(null)
        setMenu("")
      }
    }
    addEventListener("keydown", close)
    return () => removeEventListener("keydown", close)
  }, [])
  return (
    <main className="roster-page page-shell">
      <div className="page-title-row">
        <div>
          <h1>Ward 4B roster · 3 admitted</h1>
          <p>
            Manage active oncology admissions and begin a bedside assessment.
          </p>
        </div>
        <Button variant="primary" onClick={() => setDrawer(true)}>
          Admit patient
        </Button>
      </div>
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
            {patients.map((patient) => (
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
      {drawer && (
        <>
          <button
            className="drawer-backdrop open"
            onClick={() => setDrawer(false)}
            aria-label="Close admission drawer"
          />
          <aside className="admit-drawer">
            <div className="drawer-heading">
              <div>
                <h2>Admit patient</h2>
                <p>Add a patient to the Ward 4B roster.</p>
              </div>
              <button onClick={() => setDrawer(false)}>Close</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-grid">
                {[
                  ["name", "Full name", "David Miller"],
                  ["age", "Age", "58"],
                  ["mrn", "MRN", "MRN-009184"],
                  ["bed", "Bed", "12"],
                  ["diagnosis", "Diagnosis", "Colorectal cancer, Stage III"],
                  ["regimen", "Regimen", "mFOLFOX6"],
                  ["cycle", "Cycle", "Cycle 3 of 6"],
                  ["anc", "Baseline ANC", formatNumber(1400)],
                  ["ecog", "ECOG", "1"],
                ].map(([name, label, placeholder]) => (
                  <label
                    className={errors.includes(name) ? "invalid" : ""}
                    key={name}
                  >
                    {label}
                    <input name={name} placeholder={placeholder} />
                    {errors.includes(name) && <span>Required</span>}
                  </label>
                ))}
                <label>
                  Sex
                  <select name="sex">
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
              This removes the patient from the active Ward 4B roster. Their
              historical record remains available.
            </p>
            <div>
              <Button onClick={() => setDischarge(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => setDischarge(null)}>
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
  selectedPatientId,
  onSelectPatient,
}: {
  selectedPatientId?: string
  onSelectPatient?: (id: string) => void
} = {}) {
  const activeId = selectedPatientId || "104"
  const patient = patients.find((item) => item.id === activeId) || patients[0]
  const patientCase = patientCases[patient.id] || patientCases["104"]

  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState(patientCase.transcript)
  const [captured, setCaptured] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    setTranscript(patientCase.transcript)
  }, [patientCase.transcript])

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
              const currentIndex = patients.findIndex((p) => p.id === patient.id)
              const nextIndex = (currentIndex + 1) % patients.length
              onSelectPatient(patients[nextIndex].id)
            }
          }}
          title="Tap to switch patient"
        >
          <span>
            <b>Bed {patient.bed}</b> · {patient.name}
          </span>
          <span>Change (Tap)</span>
        </button>
        <div className="record-area">
          <button
            className={`record-large ${recording ? "recording" : ""}`}
            onClick={() => setRecording(!recording)}
            aria-label={recording ? "Stop dictation" : "Start dictation"}
            title={recording ? "Stop dictation" : "Start dictation"}
          >
            <Icon name="mic" size={20} />
          </button>
          <h2>{recording ? "Listening…" : "Tap to dictate"}</h2>
          <p>Audio stays on this device</p>
        </div>
        <Waveform active={recording} />
        <div className="live-text">
          <p>
            {transcript}
            {recording && <i className="caret" />}
          </p>
        </div>
        <div className="preset-row">
          {presets.map((preset) => (
            <button
              onClick={() => setTranscript((text) => `${text} ${preset}.`)}
              key={preset}
            >
              + {preset}
            </button>
          ))}
        </div>
        <button
          className={`scan-mobile ${captured ? "captured" : ""}`}
          onClick={() => setCaptured(true)}
        >
          {captured ? (
            <>
              <ReportImage />
              <span>
                <Icon name="check" size={20} />
                Lab sheet ready to review
              </span>
            </>
          ) : (
            <>
              <span className="icon-box">
                <Icon name="camera" />
              </span>
              <b>Scan lab sheet</b>
              <small>Align the page within the camera frame</small>
            </>
          )}
        </button>
        <div className="phone-action">
          <Button
            variant="primary"
            icon={sent ? "check" : "zap"}
            onClick={() => setSent(true)}
          >
            {sent ? "Sent to station" : "Send to station"}
          </Button>
        </div>
      </section>
    </main>
  )
}

function NadirChart({ baseline = 1400 }: { baseline?: number }) {
  return (
    <svg
      className="chart"
      viewBox="0 0 760 290"
      role="img"
      aria-label="Myelosuppression nadir trajectory"
    >
      <rect
        x="56"
        y="228"
        width="670"
        height="34"
        rx="4"
        className="danger-band"
      />
      <text x="66" y="250" className="band-label">
        Grade 4 · below 500
      </text>
      {[32, 88, 144, 200, 256].map((y, index) => (
        <g key={y}>
          <line x1="56" x2="726" y1={y} y2={y} />
          <text x="44" y={y + 5} textAnchor="end">
            {formatNumber(4000 - index * 1000)}
          </text>
        </g>
      ))}
      <line className="baseline-line" x1="76" x2="704" y1="178" y2="178" />
      <polyline className="primary-line" points="96,150 300,190 504,235" />
      <line className="predicted-line" x1="504" y1="235" x2="704" y2="215" />
      {[
        [96, 150, `Cycle 1 · ${formatNumber(1900)} /µL`],
        [300, 190, `Cycle 2 · ${formatNumber(1200)} /µL`],
        [504, 235, "Cycle 3 · 420 /µL"],
      ].map(([x, y, label]) => (
        <g className="data-point" tabIndex={0} key={String(label)}>
          <circle cx={Number(x)} cy={Number(y)} r="6" />
          <title>{label}</title>
          <g className="hover-tip">
            <rect
              x={Number(x) - 55}
              y={Number(y) - 52}
              width="110"
              height="34"
              rx="7"
            />
            <text x={Number(x)} y={Number(y) - 30} textAnchor="middle">
              {label}
            </text>
          </g>
        </g>
      ))}
      <circle className="predicted-point" cx="704" cy="215" r="7" />
      <g className="latest-badge">
        <rect x="516" y="218" width="74" height="28" rx="14" />
        <text x="553" y="237" textAnchor="middle">
          420 /µL
        </text>
      </g>
      {["Cycle 1", "Cycle 2", "Cycle 3", "Predicted Cycle 4"].map(
        (label, index) => (
          <text
            x={[96, 300, 504, 704][index]}
            y="286"
            textAnchor="middle"
            key={label}
          >
            {label}
          </text>
        ),
      )}
      <title>Baseline ANC {formatNumber(baseline)} per microliter</title>
    </svg>
  )
}

function RecoveryChart() {
  return (
    <svg
      className="chart"
      viewBox="0 0 760 270"
      role="img"
      aria-label="Platelet and hemoglobin recovery"
    >
      {[34, 92, 150, 208].map((y) => (
        <line x1="56" x2="726" y1={y} y2={y} key={y} />
      ))}
      <polyline
        className="primary-line"
        points="96,72 300,190 504,154 704,92"
      />
      <polyline
        className="baseline-line recovery-baseline"
        points="96,106 300,148 504,136 704,118"
      />
      {[
        [96, 72],
        [300, 190],
        [504, 154],
        [704, 92],
      ].map(([x, y], index) => (
        <g className="data-point" tabIndex={0} key={x}>
          <circle cx={x} cy={y} r="6" />
          <title>Cycle {index + 1} platelet measurement</title>
        </g>
      ))}
      <g className="latest-badge">
        <rect x="620" y="66" width="84" height="28" rx="14" />
        <text x="662" y="85" textAnchor="middle">
          {formatNumber(88000)} /µL
        </text>
      </g>
      <text x="44" y="39" textAnchor="end">
        High
      </text>
      <text x="44" y="213" textAnchor="end">
        Low
      </text>
      {["Cycle 1", "Cycle 2", "Cycle 3", "Cycle 4"].map((label, index) => (
        <text
          x={[96, 300, 504, 704][index]}
          y="258"
          textAnchor="middle"
          key={label}
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

function Analytics({
  selectedPatientId,
  onSelectPatient,
}: {
  selectedPatientId?: string
  onSelectPatient?: (id: string) => void
} = {}) {
  const activeId = selectedPatientId || "104"
  const [ascending, setAscending] = useState(false)
  const [toast, setToast] = useState("")
  const patient = patients.find((item) => item.id === activeId) || patients[0]
  const baselineOnly = activeId !== "104"
  const kpis: Record<string, [string, string, string, string][]> = {
    "104": [
      ["Absolute neutrophils", "420", "/µL", "Grade 4"],
      ["Platelet reserve", formatNumber(88000), "/µL", "Grade 1"],
      ["Active graded toxicities", "3", "", "Current round"],
      ["Clinical risk level", "High", "", "Febrile neutropenia"],
    ],
    "105": [
      ["Absolute neutrophils", formatNumber(2200), "/µL", "Baseline only"],
      ["Platelet reserve", "—", "", "Insufficient data"],
      ["Active graded toxicities", "0", "", "Baseline only"],
      ["Clinical risk level", "Pending", "", "Insufficient data"],
    ],
    "106": [
      ["Absolute neutrophils", formatNumber(1650), "/µL", "Baseline only"],
      ["Platelet reserve", "—", "", "Insufficient data"],
      ["Active graded toxicities", "0", "", "Baseline only"],
      ["Clinical risk level", "Pending", "", "Insufficient data"],
    ],
  }
  const rows = useMemo(
    () =>
      [
        ["18 Mar 2025", "Dr. Mehta", "420 /µL", 4, "Approved"],
        ["17 Mar 2025", "Dr. Wilson", "610 /µL", 3, "Verified"],
        [
          "12 Mar 2025",
          "Dr. Mehta",
          `${formatNumber(1400)} /µL`,
          1,
          "Approved",
        ],
        ["06 Mar 2025", "Dr. Rao", `${formatNumber(2100)} /µL`, 0, "Verified"],
      ].sort((a, b) =>
        ascending
          ? String(a[0]).localeCompare(String(b[0]))
          : String(b[0]).localeCompare(String(a[0])),
      ),
    [ascending],
  )
  return (
    <main className="analytics page-shell">
      {toast && (
        <div className="toast">
          <Icon name="check" />
          {toast}
        </div>
      )}
      <div className="analytics-toolbar">
        <div>
          <label>
            Patient
            <select
              value={activeId}
              onChange={(event) => onSelectPatient?.(event.target.value)}
            >
              {patients.map((item) => (
                <option value={item.id} key={item.id}>
                  #{item.id} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="patient-chips">
            {patients.map((item) => (
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
          <Button
            icon="refresh"
            onClick={() => {
              setToast("Rounds synchronized")
              setTimeout(() => setToast(""), 2400)
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
            <strong>{activeId === "104" ? "50%" : "—"}</strong>
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
            <p>Showing admission baseline only.</p>
          </div>
          <Button
            onClick={() => {
              setToast("Rounds synchronized")
              setTimeout(() => setToast(""), 2400)
            }}
          >
            Sync rounds
          </Button>
        </div>
      )}
      <div className="stat-grid">
        {((kpis[activeId] || kpis["104"]) as [string, string, string, string][]).map(([label, value, unit, badge]) => (
          <article key={label}>
            <span>{label}</span>
            <strong
              className={`numeric ${badge === "Grade 4" ? "danger-text" : ""}`}
            >
              {value} <small>{unit}</small>
            </strong>
            <em>{badge}</em>
          </article>
        ))}
      </div>
      <div className="chart-grid">
        <section
          className={`analytics-section ${baselineOnly ? "chart-muted" : ""}`}
        >
          <div className="section-heading">
            <div>
              <h2>Myelosuppression nadir trajectory</h2>
              <p>Measured ANC by cycle with next-cycle prediction</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-real" />
                Measured
              </span>
              <span>
                <i className="legend-base" />
                Baseline
              </span>
              <span>
                <i className="legend-predicted" />
                Predicted
              </span>
            </div>
          </div>
          <div className="chart-scroll">
            <NadirChart baseline={patient.baselineAnc} />
          </div>
        </section>
        <section
          className={`analytics-section ${baselineOnly ? "chart-muted" : ""}`}
        >
          <div className="section-heading">
            <div>
              <h2>Platelet and hemoglobin recovery</h2>
              <p>Measured recovery between treatment cycles</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-real" />
                Platelets
              </span>
              <span>
                <i className="legend-base" />
                Hemoglobin
              </span>
            </div>
          </div>
          <div className="chart-scroll">
            <RecoveryChart />
          </div>
        </section>
      </div>
      <article className="advisor">
        <div className="icon-box">
          <Icon name="shield" />
        </div>
        <div>
          <h2>
            {baselineOnly
              ? "Dose advice will appear after more rounds"
              : "Consider a 20% dose reduction for Cycle 4"}
          </h2>
          <p>
            {baselineOnly
              ? "Longitudinal recommendations require treatment response and nadir measurements."
              : "NCCN Colorectal v2.2024 recommends reducing oxaliplatin and 5-FU after Grade 4 febrile neutropenia."}
          </p>
          <span>Assistive recommendation · Clinician decision required</span>
        </div>
        <button>Review guideline</button>
      </article>
      <section className="audit-section">
        <div className="section-heading">
          <div>
            <h2>Historical ward rounds</h2>
            <p>Attestation and CTCAE grading audit</p>
          </div>
          <Button icon="download" onClick={() => window.print()}>
            Export
          </Button>
        </div>
        <div className="audit-table">
          <table>
            <thead>
              <tr>
                <th>
                  <button onClick={() => setAscending(!ascending)}>
                    Date ↕
                  </button>
                </th>
                <th>Attending</th>
                <th>ANC at round</th>
                <th>Maximum grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[0])}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                  <td className="numeric">{row[2]}</td>
                  <td>
                    <SeverityBadge grade={Number(row[3])}>
                      {Number(row[3]) === 0 ? "Stable" : `Grade ${row[3]}`}
                    </SeverityBadge>
                  </td>
                  <td>
                    <span className="approved">
                      <Icon name="check" size={20} />
                      {row[4]}
                    </span>
                  </td>
                </tr>
              ))}
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
      "No. The prototype’s speech workflow is designed for local processing with zero audio upload.",
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
                <b>{openFaq === index ? "−" : "+"}</b>
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
        <span>© 2025 RoundsAI</span>
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
  const [selectedPatientId, setSelectedPatientId] = useState("104")
  const [screen, setScreen] = useState<Screen>(initialScreen || "landing")

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
      <Header screen={screen} go={go} onSignOut={signOut} />
      {screen === "station" ? (
        <Station
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          go={go}
        />
      ) : screen === "roster" ? (
        <Roster
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          go={go}
        />
      ) : screen === "mobile" ? (
        <MobileCompanion
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
        />
      ) : (
        <Analytics
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
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
