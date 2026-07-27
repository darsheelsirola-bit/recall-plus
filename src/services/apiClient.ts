import { supabase } from '../lib/supabase'
import type { GenerationFeature } from '../types/generation'
import { createSingleFlight, generationSingleFlightKey } from '../utils/requestUtils'

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

export interface AuthenticatedIdentity {
  userId: string
  accessToken: string
}

const REQUEST_ID_TTL_MS = 30 * 60 * 1000
const MAX_RETRYABLE_REQUEST_IDS = 32
const retryableGenerationIds = new Map<string, { requestId: string, createdAt: number }>()
const runActiveGeneration = createSingleFlight()

function requestMapKey(feature: GenerationFeature, payloadKey: string, userId: string): string {
  return `${userId}\u0000${feature}\u0000${payloadKey}`
}

function pruneRequestIds(now = Date.now()): void {
  for (const [key, entry] of retryableGenerationIds) {
    if (now - entry.createdAt > REQUEST_ID_TTL_MS) retryableGenerationIds.delete(key)
  }
  while (retryableGenerationIds.size >= MAX_RETRYABLE_REQUEST_IDS) {
    const oldest = retryableGenerationIds.keys().next().value
    if (typeof oldest !== 'string') break
    retryableGenerationIds.delete(oldest)
  }
}

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
export function getGenerationRequestId(
  feature: GenerationFeature,
  payloadKey: string,
  userId: string,
): string {
  const now = Date.now()
  pruneRequestIds(now)
  const key = requestMapKey(feature, payloadKey, userId)
  const existing = retryableGenerationIds.get(key)
  if (existing) return existing.requestId

  const requestId = createRequestId()
  retryableGenerationIds.set(key, { requestId, createdAt: now })
  return requestId
}

export function clearGenerationRequestId(
  feature: GenerationFeature,
  payloadKey: string,
  userId: string,
  requestId: string,
): void {
  const key = requestMapKey(feature, payloadKey, userId)
  if (retryableGenerationIds.get(key)?.requestId === requestId) {
    retryableGenerationIds.delete(key)
  }
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new ApiRequestError('Could not verify your session. Please sign in again.', 401, { code: 'AUTH_REQUIRED' })

  const accessToken = data.session?.access_token
  const userId = data.session?.user?.id
  if (!accessToken || !userId) throw new ApiRequestError('Please sign in to continue.', 401, { code: 'AUTH_REQUIRED' })
  return { accessToken, userId }
}

export async function assertCurrentIdentity(identity: AuthenticatedIdentity): Promise<void> {
  const current = await getAuthenticatedIdentity()
  if (current.userId !== identity.userId) {
    throw new ApiRequestError('Your signed-in account changed. Please try again.', 409, {
      code: 'AUTH_SESSION_CHANGED',
    })
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  identity?: AuthenticatedIdentity,
): Promise<Response> {
  const authenticated = identity ?? await getAuthenticatedIdentity()

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${authenticated.accessToken}`)

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
  payloadKey: string,
  operation: (identity: AuthenticatedIdentity) => Promise<T>,
): Promise<T> {
  return getAuthenticatedIdentity().then((identity) => {
    const flightKey = generationSingleFlightKey(feature, `${identity.userId}\u0000${payloadKey}`)
    return runActiveGeneration(flightKey, () => operation(identity)) as Promise<T>
  })
}
