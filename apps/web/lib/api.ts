import { autocorrectOncologyTranscript } from "./oncology-autocorrect"

export type ExtractRoundResponse = {
  round_id: string
  patient_id?: string
  extraction: {
    patient_id?: string
    chemo_cycle?: string
    regimen?: string
    vital_signs?: {
      temperature?: number
      bp_systolic?: number
      bp_diastolic?: number
    }
    symptoms?: { name: string; severity?: string; negated?: boolean }[]
    labs: { name: string; value: number; unit?: string; ctcae_grade?: number }[]
  }
  lab_trends: {
    lab_name: string
    current_value: number
    baseline_value?: number
    delta_percentage?: number
    direction: "down" | "up" | "stable"
    severity: "normal" | "mild" | "severe"
  }[]
  review_flags: {
    rule_id: string
    severity: "high" | "medium" | "low"
    title: string
    message: string
    guideline?: string
  }[]
  confirm_before_signing: {
    id: string
    item_type: "lab_validation" | "ocr_confidence" | "conflict"
    label: string
    value: number | string
    unit?: string
    reason: string
    confirmed: boolean
  }[]
  draft_note: string
  ctcae_version: string
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && (window as any).__ENV?.NEXT_PUBLIC_API_URL) ||
  "https://rounds-ai-backend.onrender.com"

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || ""

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL.replace(/\/$/, "")}${path}`
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`RoundsAI API request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const roundsApi = {
  extract: (body: {
    transcript: string
    images: { name: string; mime_type: string; data: string }[]
    patient_id: string
  }) =>
    request<ExtractRoundResponse>("/api/v1/rounds/extract", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  autocorrect: async (text: string) => {
    try {
      return await request<{
        original_text: string
        corrected_text: string
        changes: { original: string; replacement: string }[]
        engine: string
      }>("/api/v1/clinical/autocorrect", {
        method: "POST",
        body: JSON.stringify({ text, use_gemini: true }),
      })
    } catch {
      // Deterministic rule-based fallback when offline or backend unavailable
      const local = autocorrectOncologyTranscript(text)
      return {
        original_text: text,
        corrected_text: local.correctedText,
        changes: local.changes.map((c) => ({ original: c.original, replacement: c.corrected })),
        engine: "rule_based_oncology (offline deterministic CPU)",
      }
    }
  },
  approve: (roundId: string, body: { note_id?: string; approved_by: string }) =>
    request<{ status: "approved"; round_id: string; approved_at: string }>(
      `/api/v1/rounds/${roundId}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  patients: () => request<unknown[]>("/api/v1/patients?status=admitted"),
  analytics: <T>(patientId: string) =>
    request<T>(`/api/v1/analytics/${encodeURIComponent(patientId)}`),
  latest: () => request<ExtractRoundResponse>("/api/v1/rounds/latest"),
  stream: (
    patientId: string,
    onRoundUpdate: (event: MessageEvent<string>) => void,
    onDisconnected: () => void,
  ) => {
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return () => {}
    }
    const source = new EventSource(
      `${API_URL.replace(/\/$/, "")}/api/v1/rounds/stream?patient_id=${encodeURIComponent(patientId)}`,
    )
    source.addEventListener("round_update", onRoundUpdate as EventListener)
    source.onerror = onDisconnected
    return () => source.close()
  },
}
