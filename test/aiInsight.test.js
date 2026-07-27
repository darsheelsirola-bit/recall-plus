import test from 'node:test'
import assert from 'node:assert/strict'
import { motivationalQuotes } from '../src/data/motivationalQuotes.js'
import { buildAiInsights, getQuoteOfDay } from '../src/utils/aiInsight.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'
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

test('AI insight streaks stay on consecutive local dates east of UTC', () => {
  const previousTimezone = process.env.TZ
  try {
    process.env.TZ = 'Pacific/Auckland'
    const today = getTodayDate()
    const yesterday = addDays(today, -1)
    const insight = buildAiInsights([
      { date: today, timeSpent: 30 },
      { date: yesterday, timeSpent: 30 },
    ], [], [])
    assert.equal(
      insight.snapshot.find((item) => item.label === 'Study streak')?.value,
      '2 days',
    )
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})
