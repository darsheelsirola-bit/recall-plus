import test from 'node:test'
import assert from 'node:assert/strict'
import { requestQuiz } from '../server/quizGeneration.js'

function providerResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }))
}

function question(number, overrides = {}) {
  return {
    id: `generated-${number}`,
    difficulty: 'medium',
    questionType: 'theory',
    question: `Which theme is central to selected passage ${number}?`,
    options: ['Companionship', 'Commerce', 'Conflict', 'Isolation'],
    answer: 'Companionship',
    explanation: 'The selected passage develops companionship.',
    sourceReference: 'test-topic',
    calculation: null,
    ...overrides,
  }
}

function audit(ids, decisions = {}) {
  return providerResponse({
    verifications: ids.map((id) => ({
      id,
      inScope: decisions[id]?.inScope ?? true,
      answer: decisions[id]?.answer ?? 'Companionship',
    })),
  })
}

async function withGroqMock(mock, run) {
  const savedKey = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  globalThis.fetch = mock
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
    if (savedKey === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = savedKey
  }
}

const request = {
  subject: 'English Core',
  chapter: 'The Portrait of a Lady, Silk Road',
  topic: 'Character, theme, travel narrative',
  count: 10,
  level: 'medium',
}

test('English recovery retains eight twice-audited questions and requests only two replacements', async () => {
  const bodies = []
  const initial = Array.from({ length: 10 }, (_, index) => question(index + 1))
  initial[8] = question(9, { question: 'What is 2 + 2?' })
  const replacements = [question(11), question(12)]
  await withGroqMock(async (_url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    switch (bodies.length) {
      case 1: return providerResponse({ questions: initial })
      case 2:
      case 3:
        return audit(Array.from({ length: 10 }, (_, index) => `q${index + 1}`), {
          q9: { inScope: false, answer: '' },
          // An ambiguous but in-scope result rejects only this question; it
          // does not invalidate the other nine audit entries.
          q10: { inScope: true, answer: '' },
        })
      case 4: return providerResponse({ questions: replacements })
      case 5:
      case 6: return audit(['q11', 'q12'])
      default: return new Response('{}', { status: 500 })
    }
  }, async () => {
    const result = await requestQuiz(request)
    assert.equal(result.length, 10)
    assert.equal(new Set(result.map(({ id }) => id)).size, 10)
    assert.equal(result.some(({ question: text }) => text === 'What is 2 + 2?'), false)
    assert.equal(result.every(({ difficulty, verification }) => difficulty === 'medium' && verification), true)
  })

  assert.equal(bodies.length, 6)
  assert.match(bodies[0].messages[1].content, /Generate exactly 10/)
  assert.match(bodies[3].messages[1].content, /Generate exactly 2/)
  assert.ok(bodies[3].messages[1].content.includes(initial[0].question))
  assert.ok(!bodies[3].messages[1].content.includes(initial[0].explanation))
  assert.equal(bodies[0].model, 'openai/gpt-oss-120b')
  assert.equal(bodies[1].model, 'openai/gpt-oss-20b')
  assert.equal(bodies[2].model, 'openai/gpt-oss-120b')

  const auditedIds = bodies
    .filter((body) => body.messages[0].content.includes('scope and answer-key auditor'))
    .flatMap((body) => JSON.parse(body.messages[1].content.match(/Questions:\n([^\n]+)\n\nJSON format:/)[1]).map(({ id }) => id))
  for (const id of [...Array.from({ length: 8 }, (_, index) => `q${index + 1}`), 'q11', 'q12']) {
    assert.equal(auditedIds.filter((auditedId) => auditedId === id).length, 2)
  }
})

test('a duplicate replacement is rejected and cannot displace a unique verified question', async () => {
  const bodies = []
  const initial = Array.from({ length: 5 }, (_, index) => question(index + 1))
  await withGroqMock(async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    switch (bodies.length) {
      case 1: return providerResponse({ questions: initial })
      case 2:
      case 3: return audit(['q1', 'q2', 'q3', 'q4', 'q5'], { q5: { answer: '' } })
      case 4: return providerResponse({ questions: [question(6, { question: initial[0].question })] })
      case 5:
      case 6: return audit(['q6'])
      case 7: return providerResponse({ questions: [question(7)] })
      case 8:
      case 9: return audit(['q7'])
      default: return new Response('{}', { status: 500 })
    }
  }, async () => {
    const result = await requestQuiz({ ...request, count: 5 })
    assert.equal(result.length, 5)
    assert.equal(new Set(result.map(({ question: text }) => text.toLowerCase())).size, 5)
    assert.ok(result.some(({ id }) => id === 'q7'))
    assert.ok(!result.some(({ id }) => id === 'q6'))
  })
  assert.equal(bodies.length, 9)
  assert.deepEqual(
    [bodies[0], bodies[3], bodies[6]].map((body) => body.messages[1].content.match(/Generate exactly (\d+)/)[1]),
    ['5', '1', '1'],
  )
})

test('structured-output failures fall back on the same generator or auditor model without regenerating', async () => {
  const bodies = []
  const questions = Array.from({ length: 5 }, (_, index) => question(index + 1))
  await withGroqMock(async (_url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    if (bodies.length === 1 || bodies.length === 3) {
      return new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 })
    }
    if (bodies.length === 2) return providerResponse({ questions })
    return audit(['q1', 'q2', 'q3', 'q4', 'q5'])
  }, async () => {
    const result = await requestQuiz({ ...request, count: 5 })
    assert.equal(result.length, 5)
  })

  assert.equal(bodies.length, 5)
  assert.equal(bodies[0].model, bodies[1].model)
  assert.equal(bodies[0].response_format.type, 'json_schema')
  assert.equal(bodies[1].response_format.type, 'json_object')
  assert.equal(bodies[2].model, bodies[3].model)
  assert.equal(bodies[2].response_format.type, 'json_schema')
  assert.equal(bodies[3].response_format.type, 'json_object')
  assert.equal(bodies.filter((body) => body.messages[0].content.includes('You generate accurate')).length, 2)
})

test('repeated auditor rate limits fail boundedly without regenerating or returning a partial quiz', async () => {
  let calls = 0
  let generationCalls = 0
  const questions = Array.from({ length: 5 }, (_, index) => question(index + 1))
  await withGroqMock(async (_url, init) => {
    calls += 1
    const body = JSON.parse(init.body)
    if (body.messages[0].content.includes('You generate accurate')) {
      generationCalls += 1
      return providerResponse({ questions })
    }
    return new Response('{}', { status: 429, headers: { 'retry-after': '0' } })
  }, async () => {
    await assert.rejects(requestQuiz({ ...request, count: 5 }), (error) => error.statusCode === 503)
  })
  assert.equal(calls, 3)
  assert.equal(generationCalls, 1)
})

test('English authentication failures are terminal and do not enter recovery rounds', async () => {
  let calls = 0
  await withGroqMock(async () => {
    calls += 1
    return new Response('{}', { status: 401 })
  }, async () => {
    await assert.rejects(requestQuiz({ ...request, count: 5 }), (error) => error.statusCode === 503)
  })
  assert.equal(calls, 1)
})
