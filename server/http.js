import { AppError, ERROR_CODES, toAppError } from './errors.js'

/**
 * @param {import('node:http').ServerResponse | any} response
 */
export function setPrivateNoStore(response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Vary', 'Authorization')
}

export function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '))
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

/**
 * Header access shared by Express and Vercel's Node request objects.
 *
 * @param {import('node:http').IncomingMessage | any} request
 * @param {string} name
 */
export function getRequestHeader(request, name) {
  const value = typeof request.get === 'function'
    ? request.get(name)
    : request.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/**
 * @param {import('node:http').ServerResponse | any} response
 * @param {unknown} error
 */
export function sendError(response, error) {
  const appError = toAppError(error)
  setPrivateNoStore(response)

  const payload = {
    error: appError.message,
    code: appError.code,
  }
  if (appError.details) Object.assign(payload, appError.details)

  return response.status(appError.statusCode).json(payload)
}

/**
 * @param {import('node:http').ServerResponse | any} response
 * @param {string[]} methods
 */
export function sendMethodNotAllowed(response, methods) {
  response.setHeader('Allow', methods.join(', '))
  return sendError(response, new AppError('Method not allowed', {
    code: ERROR_CODES.METHOD_NOT_ALLOWED,
    statusCode: 405,
  }))
}

/**
 * Shared by Express's /api fallback and Vercel's catch-all function so unknown
 * API routes never fall through to the SPA or return a platform HTML page.
 */
export function sendApiNotFound(response) {
  return sendError(response, new AppError('API route not found.', {
    code: ERROR_CODES.NOT_FOUND,
    statusCode: 404,
  }))
}
