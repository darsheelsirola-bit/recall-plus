import test from 'node:test'
import assert from 'node:assert/strict'
import { getNextReviewDate } from '../src/utils/spacedRepetition.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'

// REVIEW_GAPS = [1, 3, 7, 14, 30], indexed by review count.
const due = (gap) => addDays(getTodayDate(), gap)

test('first review (count 0, no score) schedules 1 day out', () => {
  assert.equal(getNextReviewDate(0, null), due(1))
})

test('a low score (<50%) always resets to a 1-day gap', () => {
  assert.equal(getNextReviewDate(3, 30), due(1))
})

test('review count advances along the gap schedule', () => {
  assert.equal(getNextReviewDate(1, null), due(3))
  assert.equal(getNextReviewDate(2, null), due(7))
})

test('a strong score (>=80%) boosts to the next gap', () => {
  assert.equal(getNextReviewDate(2, 90), due(14)) // index 2 -> boosted to 3
})

test('gap index is clamped at the end of the schedule', () => {
  assert.equal(getNextReviewDate(10, null), due(30))
  assert.equal(getNextReviewDate(4, 95), due(30)) // boost cannot exceed the last gap
})

test('a mid score (50-79%) advances without a boost', () => {
  assert.equal(getNextReviewDate(1, 65), due(3))
})
