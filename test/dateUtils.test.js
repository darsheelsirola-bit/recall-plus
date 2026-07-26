import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, formatDate, getStudyStreak, getTodayDate, getWeekStart, isDueToday, isOverdue, toDateOnly } from '../src/utils/dateUtils.js'

test('toDateOnly / getTodayDate produce ISO date strings', () => {
  assert.match(getTodayDate(), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(toDateOnly('2026-06-22T15:30:00'), '2026-06-22')
})

test('addDays moves forward and backward across month boundaries', () => {
  assert.equal(addDays('2026-06-22', 1), '2026-06-23')
  assert.equal(addDays('2026-06-30', 1), '2026-07-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('getWeekStart returns Monday for weekdays and Sunday', () => {
  assert.equal(getWeekStart('2026-06-24'), '2026-06-22')
  assert.equal(getWeekStart('2026-06-28'), '2026-06-22')
  assert.equal(getWeekStart('2026-06-29'), '2026-06-29')
})

test('isDueToday and isOverdue compare against today', () => {
  const today = getTodayDate()
  assert.equal(isDueToday(today), true)
  assert.equal(isDueToday(addDays(today, 1)), false)
  assert.equal(isOverdue(addDays(today, -1)), true)
  assert.equal(isOverdue(today), false)
  assert.equal(isOverdue(addDays(today, 1)), false)
  assert.equal(isOverdue(''), false)
})

test('formatDate returns a placeholder for empty input', () => {
  assert.equal(formatDate(''), '—')
  assert.equal(typeof formatDate('2026-06-22'), 'string')
})

test('getStudyStreak counts consecutive days ending today', () => {
  const today = getTodayDate()
  const logs = [{ date: today }, { date: addDays(today, -1) }, { date: addDays(today, -2) }]
  assert.equal(getStudyStreak(logs), 3)
})

test('getStudyStreak still counts a streak that ended yesterday', () => {
  const today = getTodayDate()
  const logs = [{ date: addDays(today, -1) }, { date: addDays(today, -2) }]
  assert.equal(getStudyStreak(logs), 2)
})

test('getStudyStreak breaks on a gap and handles no logs', () => {
  const today = getTodayDate()
  assert.equal(getStudyStreak([]), 0)
  // today present, then a gap (skips yesterday) — only today counts
  const logs = [{ date: today }, { date: addDays(today, -2) }]
  assert.equal(getStudyStreak(logs), 1)
})
