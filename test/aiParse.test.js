import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStructuredContent } from '../server/ai/parse.js'

test('structured NVIDIA content parses raw JSON', () => {
  assert.deepEqual(parseStructuredContent({
    choices: [{ message: { content: '{"ok":true}' } }],
  }), { ok: true })
})

test('structured NVIDIA content strips a JSON markdown fence', () => {
  assert.deepEqual(parseStructuredContent({
    choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
  }), { ok: true })
})

test('malformed NVIDIA JSON is rejected without throwing', () => {
  assert.equal(parseStructuredContent({
    choices: [{ message: { content: '```json\n{not json}\n```' } }],
  }), null)
})
