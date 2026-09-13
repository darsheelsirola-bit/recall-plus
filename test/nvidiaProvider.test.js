import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatCompletion, generateStructured } from '../server/ai/client.js'
import { AI_FEATURES, DEFAULT_NVIDIA_MODEL } from '../server/ai/config.js'

function providerResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function withProvider(mockFetch, operation) {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  process.env.NVIDIA_API_KEY = 'unit-test-key'
  globalThis.fetch = mockFetch
  try {
    return await operation()
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
}

function minimalRequest() {
  return {
    feature: AI_FEATURES.INSIGHT,
    model: DEFAULT_NVIDIA_MODEL,
    messages: [{ role: 'user', content: 'Return JSON.' }],
  }
}

for (const [status, label, category] of [
  [401, 'authentication', 'nvidia_authentication_error'],
  [429, 'rate limit', 'nvidia_rate_limit'],
  [500, 'service failure', 'nvidia_unavailable'],
]) {
  test(`NVIDIA ${label} response is sanitized and categorized by status`, async () => {
    await withProvider(
      async () => new Response(JSON.stringify({ error: { message: 'secret provider detail' } }), { status }),
      async () => assert.rejects(
        createChatCompletion(minimalRequest()),
        (error) => (
          error.code === 'AI_PROVIDER_UNAVAILABLE'
          && error.upstreamStatus === status
          && error.providerCategory === category
          && !error.message.includes('secret provider detail')
        ),
      ),
    )
  })
}

test('NVIDIA network failure becomes a safe retryable provider error', async () => {
  await withProvider(
    async () => { throw new TypeError('network canary') },
    async () => assert.rejects(
      createChatCompletion(minimalRequest()),
      (error) => (
        error.code === 'AI_PROVIDER_UNAVAILABLE'
        && error.providerCategory === 'nvidia_unavailable'
        && error.details?.retryable === true
      ),
    ),
  )
})

test('empty, malformed, and truncated NVIDIA structured output fail closed', async () => {
  await withProvider(async () => providerResponse(''), async () => {
    assert.equal(await generateStructured(minimalRequest()), null)
  })
  await withProvider(async () => providerResponse('{"chapters":'), async () => {
    assert.equal(await generateStructured(minimalRequest()), null)
  })
  await withProvider(async () => new Response('{not-json', { status: 200 }), async () => {
    await assert.rejects(
      generateStructured(minimalRequest()),
      (error) => (
        error.code === 'AI_PROVIDER_RESPONSE_INVALID'
        && error.providerCategory === 'structured_output_failure'
      ),
    )
  })
})

test('NVIDIA requests clamp all generation features to 4096 tokens and omit reasoning_budget', async () => {
  const calls = []
  await withProvider(async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return providerResponse('{}')
  }, async () => {
    for (const feature of [
      AI_FEATURES.QUIZ,
      AI_FEATURES.RECALL,
      AI_FEATURES.INSIGHT,
      AI_FEATURES.TIMETABLE,
      AI_FEATURES.VERIFIER,
    ]) {
      await createChatCompletion({
        feature,
        model: DEFAULT_NVIDIA_MODEL,
        messages: [{ role: 'user', content: 'Return JSON.' }],
        maxTokens: 99_999,
      })
    }
  })

  assert.deepEqual(calls.map((body) => body.max_tokens), Array(5).fill(4096))
  assert.deepEqual(calls.map((body) => body.reasoning_effort), ['medium', 'medium', 'medium', 'medium', 'high'])
  assert.equal(calls.every((body) => body.reasoning_budget === undefined), true)
})
