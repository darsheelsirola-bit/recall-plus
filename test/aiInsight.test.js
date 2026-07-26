import test from 'node:test'
import assert from 'node:assert/strict'
import { motivationalQuotes } from '../src/data/motivationalQuotes.js'
import { buildAiInsights, getQuoteOfDay } from '../src/utils/aiInsight.js'
import { deleteData, STORAGE_KEYS } from '../src/utils/storage.js'

test('quote of the day does not repeat until the full pool is used', () => {
  deleteData(STORAGE_KEYS.insightQuoteState)
  const seen = new Set()

  for (let day = 1; day <= motivationalQuotes.length; day += 1) {
    const date = `2026-01-${String(day).padStart(2, '0')}`
    const quote = getQuoteOfDay(date)
    assert.ok(quote?.id)
    assert.equal(seen.has(quote.id), false)
    seen.add(quote.id)
  }

  assert.equal(seen.size, motivationalQuotes.length)
})

test('quote of the day stays stable within the same date', () => {
  deleteData(STORAGE_KEYS.insightQuoteState)
  const first = getQuoteOfDay('2026-02-10')
  const second = getQuoteOfDay('2026-02-10')
  assert.equal(first.id, second.id)
})

test('buildAiInsights returns tips and techniques', () => {
  const insight = buildAiInsights([], [], [])
  assert.ok(insight.quote?.text)
  assert.ok(insight.tips.length >= 1)
  assert.ok(insight.techniques.length >= 1)
  assert.ok(insight.snapshot.length >= 4)
})
