import { createClient } from '@supabase/supabase-js'
import { AppError, ERROR_CODES } from './errors.js'

let authClient
let adminClient

export const MAX_BEARER_TOKEN_LENGTH = 8 * 1024

const SUPABASE_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

function authRequiredError() {
  return new AppError('Please sign in before using AI generation.', {
    code: ERROR_CODES.AUTH_REQUIRED,
    statusCode: 401,
  })
}

/**
 * Read exactly one Authorization header without falling back to a selected
 * array element. Node and Express retain duplicate wire headers in
 * `rawHeaders`; Vercel-style requests may instead expose an array value.
 */
function readSingleAuthorizationHeader(request) {
  const rawHeaders = request?.rawHeaders
  if (Array.isArray(rawHeaders)) {
    let authorizationCount = 0
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (String(rawHeaders[index]).toLowerCase() === 'authorization') authorizationCount += 1
    }
    if (authorizationCount > 1) return null
  }

  const headers = request?.headers
  if (headers && typeof headers === 'object') {
    if (typeof headers.get === 'function') {
      const value = headers.get('authorization')
      return typeof value === 'string' ? value : null
    }

    const authorizationEntries = Object.entries(headers).filter(
      ([name]) => name.toLowerCase() === 'authorization',
    )
    if (authorizationEntries.length !== 1) return null
    const value = authorizationEntries[0][1]
    return typeof value === 'string' ? value : null
  }

  // Express always provides `headers`, but retain this narrow fallback for
  // compatible request adapters that only implement `get(name)`.
  const value = typeof request?.get === 'function' ? request.get('authorization') : null
  return typeof value === 'string' ? value : null
}

/**
 * Reject obviously invalid bearer values before they reach Supabase Auth.
 * This is only an inexpensive syntax and size check: every accepted-shaped
 * token is still verified remotely by Supabase below.
 */
export function readBearerAccessToken(request) {
  const authorization = readSingleAuthorizationHeader(request)
  if (typeof authorization !== 'string') throw authRequiredError()

  // RFC 6750 permits one or more ASCII spaces between the scheme and token.
  const match = authorization.match(/^Bearer +([^\s]+)$/i)
  const accessToken = match?.[1]
  if (
    !accessToken
    || accessToken.length > MAX_BEARER_TOKEN_LENGTH
    || !SUPABASE_ACCESS_TOKEN_PATTERN.test(accessToken)
  ) throw authRequiredError()

  return accessToken
}

function supabaseUrl() {
  // VITE_SUPABASE_URL is intentionally allowed as a fallback because the
  // project URL is public configuration, not a secret.
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

function supabaseAnonKey() {
  // The publishable/anon key is public by design. Secret/service-role keys
  // must never use a VITE_ prefix or this fallback path.
  return process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || ''
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }
}

function configurationError(missing) {
  return new AppError('Generation limits are temporarily unavailable.', {
    code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
    statusCode: 503,
    details: { retryable: true },
    cause: new Error(`Missing server configuration: ${missing.join(', ')}`),
  })
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseAnonKey() && serviceRoleKey())
}

export function getSupabaseAuthClient() {
  const url = supabaseUrl()
  const anonKey = supabaseAnonKey()
  const missing = [
    !url && 'SUPABASE_URL',
    !anonKey && 'SUPABASE_ANON_KEY',
  ].filter(Boolean)
  if (missing.length) throw configurationError(missing)

  if (!authClient) authClient = createClient(url, anonKey, clientOptions())
  return authClient
}

export function getSupabaseAdminClient() {
  const url = supabaseUrl()
  const key = serviceRoleKey()
  const missing = [
    !url && 'SUPABASE_URL',
    !key && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length) throw configurationError(missing)

  if (!adminClient) adminClient = createClient(url, key, clientOptions())
  return adminClient
}

/**
 * Create a short-lived database client scoped to the caller's verified access
 * token. All reads made through this client are subject to the caller's RLS
 * policies; the service-role credential is deliberately not involved.
 */
export function getUserScopedSupabaseClient(accessToken) {
  const url = supabaseUrl()
  const anonKey = supabaseAnonKey()
  const missing = [
    !url && 'SUPABASE_URL',
    !anonKey && 'SUPABASE_ANON_KEY',
  ].filter(Boolean)
  if (missing.length) throw configurationError(missing)
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new AppError('Please sign in before using AI generation.', {
      code: ERROR_CODES.AUTH_REQUIRED,
      statusCode: 401,
    })
  }

  return createClient(url, anonKey, {
    ...clientOptions(),
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

/**
 * Verify the access token with Supabase Auth on every protected request.
 * Never accept a user id from headers, request bodies, or user_metadata.
 *
 * @param {import('node:http').IncomingMessage | any} request
 * @returns {Promise<{id: string}>}
 */
export async function verifySupabaseUser(request, { getAuthClient = getSupabaseAuthClient } = {}) {
  const accessToken = readBearerAccessToken(request)

  let result
  try {
    result = await getAuthClient().auth.getUser(accessToken)
  } catch (error) {
    throw new AppError('Could not verify your session. Please try again.', {
      code: ERROR_CODES.AUTH_UNAVAILABLE,
      statusCode: 503,
      cause: error,
      details: { retryable: true },
    })
  }

  if (result.error || !result.data?.user?.id) {
    const authStatus = Number(result.error?.status)
    const unavailable = authStatus >= 500 || authStatus === 429
    throw new AppError(
      unavailable
        ? 'Could not verify your session. Please try again.'
        : 'Your session has expired. Please sign in again.',
      {
        code: unavailable ? ERROR_CODES.AUTH_UNAVAILABLE : ERROR_CODES.AUTH_REQUIRED,
        statusCode: unavailable ? 503 : 401,
        cause: result.error,
        details: unavailable ? { retryable: true } : null,
      },
    )
  }

  return { id: result.data.user.id, accessToken }
}
