import { createClient } from '@supabase/supabase-js'
import { AppError, ERROR_CODES } from './errors.js'
import { getRequestHeader } from './http.js'

let authClient
let adminClient

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
 * Verify the access token with Supabase Auth on every protected request.
 * Never accept a user id from headers, request bodies, or user_metadata.
 *
 * @param {import('node:http').IncomingMessage | any} request
 * @returns {Promise<{id: string}>}
 */
export async function verifySupabaseUser(request) {
  const authorization = String(getRequestHeader(request, 'authorization') || '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    throw new AppError('Please sign in before using AI generation.', {
      code: ERROR_CODES.AUTH_REQUIRED,
      statusCode: 401,
    })
  }

  let result
  try {
    result = await getSupabaseAuthClient().auth.getUser(match[1])
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

  return { id: result.data.user.id }
}
