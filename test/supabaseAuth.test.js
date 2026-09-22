import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_BEARER_TOKEN_LENGTH,
  verifySupabaseUser,
} from '../server/supabase.js'

const VALID_SHAPED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature'

function requestWithAuthorization(authorization) {
  return { headers: { authorization } }
}

function authenticationError(error) {
  return (
    error.code === 'AUTH_REQUIRED'
    && error.statusCode === 401
    && error.message === 'Please sign in before using AI generation.'
  )
}

test('malformed and oversized bearer tokens are rejected before Supabase Auth', async () => {
  let getUserCalls = 0
  const getAuthClient = () => ({
    auth: {
      getUser: async () => {
        getUserCalls += 1
        return { data: { user: { id: 'unexpected-user' } }, error: null }
      },
    },
  })
  const malformedTokens = [
    undefined,
    'Token token',
    'Bearer not-a-jwt',
    `Bearer\t${VALID_SHAPED_TOKEN}`,
    `Bearer \t${VALID_SHAPED_TOKEN}`,
    'Bearer a.b.c extra',
    `Bearer ${'a'.repeat(MAX_BEARER_TOKEN_LENGTH + 1)}.b.c`,
  ]

  for (const authorization of malformedTokens) {
    await assert.rejects(
      verifySupabaseUser(requestWithAuthorization(authorization), { getAuthClient }),
      authenticationError,
    )
  }
  assert.equal(getUserCalls, 0)
})

test('duplicate and array-valued Authorization headers are rejected before Supabase Auth', async () => {
  let getUserCalls = 0
  const getAuthClient = () => ({
    auth: {
      getUser: async () => {
        getUserCalls += 1
        return { data: { user: { id: 'unexpected-user' } }, error: null }
      },
    },
  })
  const tokenHeader = `Bearer ${VALID_SHAPED_TOKEN}`
  const requests = [
    { headers: { authorization: [tokenHeader, tokenHeader] } },
    { headers: { authorization: tokenHeader, Authorization: tokenHeader } },
    {
      headers: { authorization: tokenHeader },
      rawHeaders: ['Authorization', tokenHeader, 'Authorization', tokenHeader],
    },
  ]

  for (const request of requests) {
    await assert.rejects(verifySupabaseUser(request, { getAuthClient }), authenticationError)
  }
  assert.equal(getUserCalls, 0)
})

test('a valid-shaped bearer token remains remotely verified by Supabase Auth', async () => {
  const receivedTokens = []
  const result = await verifySupabaseUser(
    requestWithAuthorization(`Bearer  ${VALID_SHAPED_TOKEN}`),
    {
      getAuthClient: () => ({
        auth: {
          getUser: async (accessToken) => {
            receivedTokens.push(accessToken)
            return { data: { user: { id: 'verified-user' } }, error: null }
          },
        },
      }),
    },
  )

  assert.deepEqual(receivedTokens, [VALID_SHAPED_TOKEN])
  assert.deepEqual(result, { id: 'verified-user', accessToken: VALID_SHAPED_TOKEN })
})

test('a Supabase-invalid valid-shaped token keeps the existing sanitized 401 handling', async () => {
  await assert.rejects(
    verifySupabaseUser(requestWithAuthorization(`Bearer ${VALID_SHAPED_TOKEN}`), {
      getAuthClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { status: 401, message: 'token contents stay private' },
          }),
        },
      }),
    }),
    (error) => (
      error.code === 'AUTH_REQUIRED'
      && error.statusCode === 401
      && error.message === 'Your session has expired. Please sign in again.'
    ),
  )
})

test('Supabase network and availability failures remain sanitized retryable 503 responses', async () => {
  const privateNetworkError = new Error('private upstream connection detail')
  const unavailableResults = [
    async () => { throw privateNetworkError },
    async () => ({ data: { user: null }, error: { status: 429, message: 'private throttle detail' } }),
    async () => ({ data: { user: null }, error: { status: 503, message: 'private outage detail' } }),
  ]

  for (const getUser of unavailableResults) {
    await assert.rejects(
      verifySupabaseUser(requestWithAuthorization(`Bearer ${VALID_SHAPED_TOKEN}`), {
        getAuthClient: () => ({ auth: { getUser } }),
      }),
      (error) => (
        error.code === 'AUTH_UNAVAILABLE'
        && error.statusCode === 503
        && error.message === 'Could not verify your session. Please try again.'
        && error.details?.retryable === true
        && !error.message.includes('private')
      ),
    )
  }
})
