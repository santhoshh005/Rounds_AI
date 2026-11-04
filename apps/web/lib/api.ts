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

// Longer than the backend's 12 s AI stage budget plus network time, so a slow model
// falls back on the server instead of the browser marking the server unreachable.
const REQUEST_TIMEOUT_MS = 20000

// ── Backend reachability ────────────────────────────────────────────────
// After a network failure, timeout or 5xx, calls fail fast for a short while so the
// on-device fallback answers at once instead of every action waiting 15 s. A health
// check runs in the background (long timeout, so it also wakes a sleeping Render
// instance) and reopens the circuit as soon as the server answers.
export type BackendStatus = "unknown" | "online" | "unreachable"
const RETRY_AFTER_MS = 30000
const HEALTH_TIMEOUT_MS = 60000

let backendStatus: BackendStatus = "unknown"
let downUntil = 0
let probing = false
const statusListeners = new Set<(status: BackendStatus) => void>()

export class BackendUnavailableError extends Error {
  constructor() {
    super("RoundsAI backend unreachable")
  }
}

function setBackendStatus(next: BackendStatus) {
  if (next === backendStatus) return
  backendStatus = next
  statusListeners.forEach((fn) => fn(next))
}

export function getBackendStatus(): BackendStatus {
  return backendStatus
}

export function subscribeBackendStatus(fn: (status: BackendStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

/** False while the device is offline or the backend failed in the last 30 s. */
export function backendReachable(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false
  return Date.now() >= downUntil
}

/** Records the outcome of any backend call (also used by raw fetches such as Whisper). */
export function noteBackendResult(reachable: boolean) {
  if (reachable) {
    downUntil = 0
    setBackendStatus("online")
    return
  }
  downUntil = Date.now() + RETRY_AFTER_MS
  setBackendStatus("unreachable")
  void probeBackend()
}

/** Pings /health; on success the circuit reopens. Safe to call often — one probe at a time. */
export async function probeBackend(): Promise<boolean> {
  if (probing || typeof window === "undefined") return backendStatus === "online"
  probing = true
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    if (res.ok) {
      noteBackendResult(true)
      return true
    }
  } catch {}
  finally {
    probing = false
  }
  downUntil = Date.now() + RETRY_AFTER_MS
  setBackendStatus("unreachable")
  setTimeout(() => {
    if (backendStatus === "unreachable") void probeBackend()
  }, RETRY_AFTER_MS)
  return false
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!backendReachable()) throw new BackendUnavailableError()
  const url = `${API_URL.replace(/\/$/, "")}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
        ...init?.headers,
      },
    })
  } catch (err) {
    noteBackendResult(false)
    throw err
  }
  // 4xx means the server answered; 5xx (Render 502/503 while waking) counts as down.
  noteBackendResult(response.status < 500)
  if (!response.ok) {
    throw new Error(`RoundsAI API request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

// ── Client-side AI result cache ─────────────────────────────────────────
// Identical requests reuse the previous answer so navigating between pages, or
// re-running an unchanged round, never spends extra Gemini quota.
type CacheEntry<T> = { expires: number; value: T }
const AI_TTL_MS = 6 * 60 * 60 * 1000
const FALLBACK_TTL_MS = 10 * 60 * 1000
const OFFLINE_TTL_MS = 2 * 60 * 1000
const EXTRACT_TTL_MS = 30 * 60 * 1000
const INSIGHT_STORE = "rounds-ai-insight-cache"

const insightCache = new Map<string, CacheEntry<AiAnalyticsInsight>>()
const extractCache = new Map<string, CacheEntry<ExtractRoundResponse>>()
const inFlight = new Map<string, Promise<unknown>>()

function loadInsightStore() {
  if (typeof window === "undefined" || insightCache.size) return
  try {
    const raw = window.sessionStorage.getItem(INSIGHT_STORE)
    if (!raw) return
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, CacheEntry<AiAnalyticsInsight>>)) {
      if (v.expires > Date.now()) insightCache.set(k, v)
    }
  } catch {}
}

function saveInsightStore() {
  if (typeof window === "undefined") return
  try {
    const live = [...insightCache.entries()].filter(([, v]) => v.expires > Date.now()).slice(-50)
    window.sessionStorage.setItem(INSIGHT_STORE, JSON.stringify(Object.fromEntries(live)))
  } catch {}
}

function fresh<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  if (hit) cache.delete(key)
  return undefined
}

/** Runs `fn` once per key at a time; concurrent callers share the same promise. */
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key) as Promise<T> | undefined
  if (pending) return pending
  const p = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/** Drops cached AI results, e.g. on sign-out so another user never sees them. */
export function clearAiCaches() {
  insightCache.clear()
  extractCache.clear()
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(INSIGHT_STORE)
    } catch {}
  }
}

/** Deterministic rule-based insight used when the backend is unreachable. */
function localInsight(payload: {
  patient_id: string
  patient_name?: string
  diagnosis?: string
  regimen?: string
  cycle?: string
  baseline_anc?: number
  rounds?: Array<any>
}): AiAnalyticsInsight {
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

// ── Bedside sync outbox ─────────────────────────────────────────────────
type BedsideSyncBody = {
  patient_id: string
  transcript: string
  patient_name?: string
  bed?: string
  time_str?: string
  word_count?: number
  timestamp?: number
}
const OUTBOX_STORE = "rounds-bedside-outbox"

function readOutbox(): Record<string, BedsideSyncBody> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(window.localStorage.getItem(OUTBOX_STORE) || "{}")
  } catch {
    return {}
  }
}

function writeOutbox(outbox: Record<string, BedsideSyncBody>) {
  if (typeof window === "undefined") return
  try {
    if (Object.keys(outbox).length) window.localStorage.setItem(OUTBOX_STORE, JSON.stringify(outbox))
    else window.localStorage.removeItem(OUTBOX_STORE)
  } catch {}
}

function dropFromOutbox(patientId: string) {
  const outbox = readOutbox()
  if (!(patientId in outbox)) return
  delete outbox[patientId]
  writeOutbox(outbox)
}

/** Number of bedside drafts waiting to be relayed. */
export function pendingBedsideDrafts(): number {
  return Object.keys(readOutbox()).length
}

/** Sends queued bedside drafts; returns how many went out. */
export async function flushBedsideOutbox(): Promise<number> {
  let sent = 0
  for (const body of Object.values(readOutbox())) {
    if (!backendReachable()) break
    try {
      await roundsApi.bedsideSync(body)
      dropFromOutbox(body.patient_id)
      sent++
    } catch {
      break
    }
  }
  return sent
}

export const roundsApi = {
  extract: (body: {
    transcript: string
    images: { name: string; mime_type: string; data: string }[]
    patient_id: string
  }): Promise<ExtractRoundResponse> => {
    const key = `extract::${body.patient_id}::${body.transcript}::${body.images.map((i) => i.name + i.data.length).join("|")}`
    const cached = fresh(extractCache, key)
    if (cached) return Promise.resolve(cached)
    return once(key, async () => {
      const res = await request<ExtractRoundResponse>("/api/v1/rounds/extract", {
        method: "POST",
        body: JSON.stringify(body),
      })
      // A rules-only answer (AI busy or out of quota) is kept briefly so Gemini is tried again soon.
      const ttl = res.fallback_used ? OFFLINE_TTL_MS : EXTRACT_TTL_MS
      extractCache.set(key, { expires: Date.now() + ttl, value: res })
      return res
    })
  },
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
    loadInsightStore()
    const { force_refresh, ...inputs } = payload
    const key = `insight::${JSON.stringify(inputs)}`
    if (!force_refresh) {
      const cached = fresh(insightCache, key)
      if (cached) return cached
    }
    return once(`${key}::${force_refresh ? "force" : ""}`, async () => {
      let insight: AiAnalyticsInsight
      let ttl: number
      try {
        insight = await request<AiAnalyticsInsight>("/api/v1/analytics/ai-insights", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        ttl = /deterministic|fallback/i.test(insight.engine) && !/gemini/i.test(insight.engine) ? FALLBACK_TTL_MS : AI_TTL_MS
      } catch {
        insight = localInsight(payload)
        ttl = OFFLINE_TTL_MS
      }
      insightCache.set(key, { expires: Date.now() + ttl, value: insight })
      saveInsightStore()
      return insight
    })
  },
  labOcr: (image: { name: string; mime_type: string; data: string }) =>
    request<{
      labs: { name: string; value: number; unit?: string | null; confidence?: string }[]
      notes?: string | null
      engine: string
    }>("/api/v1/vision/lab-ocr", { method: "POST", body: JSON.stringify(image) }),
  /** Relays a bedside draft to stations subscribed to this patient's SSE stream (no AI, not stored). */
  bedsideSync: (body: BedsideSyncBody) =>
    request<{ status: string; listeners: number }>("/api/v1/rounds/bedside-sync", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /**
   * Sends a bedside draft to other stations. If the backend is unreachable the latest
   * draft per patient waits in this browser and is sent when the server is back.
   */
  sendBedsideDraft: async (body: BedsideSyncBody): Promise<"sent" | "queued"> => {
    try {
      await roundsApi.bedsideSync(body)
      dropFromOutbox(body.patient_id)
      return "sent"
    } catch {
      const outbox = readOutbox()
      outbox[body.patient_id] = body
      writeOutbox(outbox)
      return "queued"
    }
  },
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
