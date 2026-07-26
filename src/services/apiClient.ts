import { supabase } from '../lib/supabase'
import type { GenerationFeature } from '../types/generation'

interface ApiErrorPayload {
  error?: string
  code?: string
  remaining?: number
  used?: number
  limit?: number
  resetAt?: string
  localDate?: string
  inProgress?: boolean
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly remaining?: number
  readonly used?: number
  readonly limit?: number
  readonly resetAt?: string
  readonly localDate?: string
  readonly inProgress?: boolean

  constructor(message: string, status: number, payload: ApiErrorPayload = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = payload.code || 'API_REQUEST_FAILED'
    this.remaining = payload.remaining
    this.used = payload.used
    this.limit = payload.limit
    this.resetAt = payload.resetAt
    this.localDate = payload.localDate
    this.inProgress = payload.inProgress
  }
}

const activeGenerationRequests = new Map<GenerationFeature, Promise<unknown>>()
const retryableGenerationIds = new Map<GenerationFeature, { payloadKey: string, requestId: string }>()

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Reuses an idempotency key when the browser did not receive a definitive
 * response. A changed payload always receives a fresh key.
 */
export function getGenerationRequestId(feature: GenerationFeature, payloadKey: string): string {
  const existing = retryableGenerationIds.get(feature)
  if (existing?.payloadKey === payloadKey) return existing.requestId

  const requestId = createRequestId()
  retryableGenerationIds.set(feature, { payloadKey, requestId })
  return requestId
}

export function clearGenerationRequestId(feature: GenerationFeature, requestId: string): void {
  if (retryableGenerationIds.get(feature)?.requestId === requestId) {
    retryableGenerationIds.delete(feature)
  }
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new ApiRequestError('Could not verify your session. Please sign in again.', 401, { code: 'AUTH_REQUIRED' })

  const accessToken = data.session?.access_token
  if (!accessToken) throw new ApiRequestError('Please sign in to continue.', 401, { code: 'AUTH_REQUIRED' })

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  return fetch(input, { ...init, headers })
}

export async function readApiError(response: Response, fallback: string): Promise<ApiRequestError> {
  const payload = await response.json().catch(() => ({})) as ApiErrorPayload
  return new ApiRequestError(payload.error || fallback, response.status, payload)
}

/**
 * Deduplicates accidental same-tab requests synchronously. Supabase remains the
 * authoritative cross-tab/cross-device lock.
 */
export function runGenerationSingleFlight<T>(
  feature: GenerationFeature,
  operation: () => Promise<T>,
): Promise<T> {
  const active = activeGenerationRequests.get(feature)
  if (active) return active as Promise<T>

  const request = operation().finally(() => {
    if (activeGenerationRequests.get(feature) === request) {
      activeGenerationRequests.delete(feature)
    }
  })
  activeGenerationRequests.set(feature, request)
  return request
}
