import assert from 'node:assert/strict'
import test from 'node:test'
import { handleAccountDeletion } from '../server/apiHandlers.js'
import { ERROR_CODES } from '../server/errors.js'

function mockResponse() {
  const headers = new Map()
  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value) },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function jsonRequest(payload) {
  const raw = JSON.stringify(payload)
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(raw)),
    },
    body: payload,
  }
}

test('account deletion rejects missing confirmation phrase', async () => {
  const response = mockResponse()
  await handleAccountDeletion(
    jsonRequest({ confirmation: 'please delete' }),
    response,
    {
      authenticatedUser: async () => ({ id: 'user-1', accessToken: 'token' }),
      getSupabaseAdminClient: () => ({
        auth: {
          admin: {
            signOut: async () => ({ error: null }),
            deleteUser: async () => ({ error: null }),
          },
        },
      }),
    },
  )
  assert.equal(response.statusCode, 400)
  assert.equal(response.body.code, ERROR_CODES.ACCOUNT_DELETE_CONFIRMATION_REQUIRED)
})

test('account deletion deletes only the verified user id', async () => {
  const deleted = []
  const revoked = []
  const response = mockResponse()
  await handleAccountDeletion(
    jsonRequest({ confirmation: 'DELETE MY ACCOUNT' }),
    response,
    {
      authenticatedUser: async () => ({ id: 'user-42', accessToken: 'token' }),
      getSupabaseAdminClient: () => ({
        auth: {
          admin: {
            signOut: async (accessToken, scope) => {
              revoked.push([accessToken, scope])
              return { error: null }
            },
            deleteUser: async (id) => {
              deleted.push(id)
              return { error: null }
            },
          },
        },
      }),
    },
  )
  assert.equal(response.statusCode, 200)
  assert.deepEqual(revoked, [['token', 'global']])
  assert.deepEqual(deleted, ['user-42'])
  assert.equal(response.body.deleted, true)
})

test('account deletion stops before deleting the user when session revocation fails', async () => {
  let deleteCalls = 0
  const response = mockResponse()
  await handleAccountDeletion(
    jsonRequest({ confirmation: 'DELETE MY ACCOUNT' }),
    response,
    {
      authenticatedUser: async () => ({ id: 'user-42', accessToken: 'token' }),
      getSupabaseAdminClient: () => ({
        auth: {
          admin: {
            signOut: async () => ({ error: new Error('temporary auth failure') }),
            deleteUser: async () => {
              deleteCalls += 1
              return { error: null }
            },
          },
        },
      }),
    },
  )

  assert.equal(response.statusCode, 503)
  assert.equal(response.body.code, ERROR_CODES.ACCOUNT_DELETE_FAILED)
  assert.equal(deleteCalls, 0)
})
