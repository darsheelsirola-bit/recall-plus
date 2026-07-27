import { AppError, ERROR_CODES } from './errors.js'
import { getRequestHeader } from './http.js'

export const MAX_REQUEST_BODY_BYTES = 64 * 1024
export const MAX_REQUEST_DEPTH = 8
export const MAX_REQUEST_NODES = 2_000
export const MAX_OBJECT_KEYS = 64

function invalidPayload(message = 'The request body is invalid.') {
  return new AppError(message, {
    code: ERROR_CODES.INVALID_REQUEST,
    statusCode: 400,
  })
}

function payloadTooLarge() {
  return new AppError('The request body is too large.', {
    code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    statusCode: 413,
  })
}

function payloadTooComplex() {
  return new AppError('The request body is too complex.', {
    code: ERROR_CODES.PAYLOAD_TOO_COMPLEX,
    statusCode: 400,
  })
}

function utf8Length(value) {
  return Buffer.byteLength(value, 'utf8')
}

function jsonStringLength(value) {
  return utf8Length(JSON.stringify(value))
}

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Iteratively bound an already-parsed JSON value. This deliberately avoids
 * JSON.stringify so deeply nested or circular values cannot overflow the
 * stack before validation.
 */
export function assertJsonValueWithinLimits(value, {
  maxBytes = MAX_REQUEST_BODY_BYTES,
  maxDepth = MAX_REQUEST_DEPTH,
  maxNodes = MAX_REQUEST_NODES,
  maxObjectKeys = MAX_OBJECT_KEYS,
} = {}) {
  const seen = new WeakSet()
  const stack = [{ value, depth: 0 }]
  let bytes = 0
  let nodes = 0

  while (stack.length) {
    const current = stack.pop()
    const item = current.value
    nodes += 1
    if (nodes > maxNodes || current.depth > maxDepth) throw payloadTooComplex()

    if (item === null) {
      bytes += 4
    } else if (typeof item === 'string') {
      bytes += jsonStringLength(item)
    } else if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw invalidPayload()
      bytes += String(item).length
    } else if (typeof item === 'boolean') {
      bytes += item ? 4 : 5
    } else if (typeof item === 'object') {
      if (!Array.isArray(item) && !isPlainObject(item)) throw invalidPayload()
      if (seen.has(item)) throw payloadTooComplex()
      seen.add(item)

      const keys = Object.keys(item)
      if (!Array.isArray(item) && keys.length > maxObjectKeys) throw payloadTooComplex()
      bytes += 2 + Math.max(0, keys.length - 1)
      for (const key of keys) {
        bytes += jsonStringLength(key) + 1
        stack.push({ value: item[key], depth: current.depth + 1 })
      }
    } else {
      throw invalidPayload()
    }

    if (bytes > maxBytes) throw payloadTooLarge()
  }

  return bytes
}

function parseRawJson(raw) {
  if (utf8Length(raw) > MAX_REQUEST_BODY_BYTES) throw payloadTooLarge()
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new AppError('The request body contains malformed JSON.', {
      code: ERROR_CODES.INVALID_JSON,
      statusCode: 400,
      cause: error,
    })
  }
}

/**
 * Read the body format used by both Express and Vercel's Node runtime.
 * Content-Length is an early rejection only; the iterative walk remains the
 * authority because clients can omit or lie about that header.
 */
export function readBoundedJsonBody(request) {
  const contentLengthHeader = getRequestHeader(request, 'content-length')
  const contentLength = contentLengthHeader == null || contentLengthHeader === ''
    ? null
    : Number(contentLengthHeader)
  if (
    contentLength !== null
    && (!Number.isFinite(contentLength) || contentLength < 0)
  ) {
    throw invalidPayload('The Content-Length header is invalid.')
  }
  if (contentLength !== null && contentLength > MAX_REQUEST_BODY_BYTES) {
    throw payloadTooLarge()
  }

  const contentType = String(getRequestHeader(request, 'content-type') || '').toLowerCase()
  if (contentType && !contentType.startsWith('application/json')) {
    throw new AppError('This endpoint accepts application/json only.', {
      code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      statusCode: 415,
    })
  }

  let body
  try {
    body = request.body
  } catch (error) {
    throw new AppError('The request body contains malformed JSON.', {
      code: ERROR_CODES.INVALID_JSON,
      statusCode: 400,
      cause: error,
    })
  }
  if (Buffer.isBuffer(body)) body = parseRawJson(body.toString('utf8'))
  else if (typeof body === 'string') body = parseRawJson(body)
  else if (contentLength === null) {
    // Vercel's Node runtime exposes an already-parsed body. Without the raw
    // byte count, whitespace padding could bypass this endpoint's 64 KiB cap.
    throw new AppError('Content-Length is required for this request.', {
      code: ERROR_CODES.LENGTH_REQUIRED,
      statusCode: 411,
    })
  }

  assertJsonValueWithinLimits(body)
  if (!isPlainObject(body)) throw invalidPayload('The request body must be a JSON object.')
  return body
}

export function hasOnlyKeys(value, allowedKeys) {
  return isPlainObject(value)
    && Object.keys(value).every((key) => allowedKeys.includes(key))
}

export function normalizedRequiredText(value, maxLength) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= maxLength ? normalized : null
}

export function normalizedOptionalText(value, maxLength, fallback = '') {
  if (value == null || value === '') return fallback
  return normalizedRequiredText(value, maxLength)
}
