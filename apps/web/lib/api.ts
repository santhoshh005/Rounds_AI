import { autocorrectOncologyTranscript } from "./oncology-autocorrect"
import { type AiAnalyticsInsight, generateLocalClinicalAnalyticsInsight } from "./clinical-utils"
import type { BackendExtractResponse } from "./round-analysis"

/** Response of POST /api/v1/rounds/extract (backend/models/round.py ExtractRoundResponse). */
export type ExtractRoundResponse = BackendExtractResponse & {
  round_id?: string | null
  draft_note: string
  ctcae_version: string
  fallback_used?: boolean
  fallback_message?: string | null
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && (window as any).__ENV?.NEXT_PUBLIC_API_URL) ||
  "https://rounds-ai-backend.onrender.com"

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || ""

const REQUEST_TIMEOUT_MS = 15000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_URL.replace(/\/$/, "")}${path}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  generateAiAnalytics: async (payload: {
    patient_id: string
    patient_name?: string
    diagnosis?: string
    regimen?: string
    cycle?: string
    baseline_anc?: number
    rounds?: Array<any>
    force_refresh?: boolean
  }): Promise<AiAnalyticsInsight> => {
    try {
      return await request<AiAnalyticsInsight>("/api/v1/analytics/ai-insights", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    } catch {
      // Deterministic rule-based fallback when backend offline or error
      return generateLocalClinicalAnalyticsInsight(
        {
          id: payload.patient_id,
          name: payload.patient_name || `Patient #${payload.patient_id}`,
          regimen: payload.regimen || "Chemotherapy",
          cycle: payload.cycle || "Cycle 1",
          baselineAnc: payload.baseline_anc || 2000,
          diagnosis: payload.diagnosis || "Oncology Inpatient",
        },
        payload.rounds || [],
      )
    }
  },
  labOcr: (image: { name: string; mime_type: string; data: string }) =>
    request<{
      labs: { name: string; value: number; unit?: string | null; confidence?: string }[]
      notes?: string | null
      engine: string
    }>("/api/v1/vision/lab-ocr", { method: "POST", body: JSON.stringify(image) }),
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
