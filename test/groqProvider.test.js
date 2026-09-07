import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatCompletion } from '../server/ai/client.js'
import { modelCandidates } from '../server/ai/config.js'

test('Groq routes each task and its verification to the dedicated key without NVIDIA fallback', async () => {
  const names = ['GROQ_QUIZ_API_KEY', 'GROQ_RECALL_API_KEY', 'GROQ_INSIGHTS_API_KEY', 'GROQ_TIMETABLE_API_KEY', 'NVIDIA_API_KEY']
  const saved = names.map((name) => process.env[name])
  const originalFetch = globalThis.fetch
  const calls = []
  names.forEach((name, index) => { process.env[name] = `test-credential-${index}` })
  globalThis.fetch = async (url, init) => {
    calls.push({ url, key: init.headers.Authorization, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }
  try {
    for (const [index, feature] of ['quiz', 'recall', 'insight', 'timetable'].entries()) {
      await createChatCompletion({ feature, model: modelCandidates(feature)[0], messages: [] })
      assert.equal(calls.at(-1).key, `Bearer test-credential-${index}`)
      assert.equal(calls.at(-1).url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(calls.at(-1).body.reasoning_budget, undefined)
    }
    await createChatCompletion({ feature: 'verifier', credentialFeature: 'recall', model: modelCandidates('recall')[0], messages: [] })
    assert.equal(calls.at(-1).key, 'Bearer test-credential-1')
    delete process.env.GROQ_RECALL_API_KEY
    await assert.rejects(createChatCompletion({ feature: 'recall', messages: [] }), { code: 'AI_PROVIDER_UNAVAILABLE' })
    assert.equal(calls.length, 5)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  }
})
