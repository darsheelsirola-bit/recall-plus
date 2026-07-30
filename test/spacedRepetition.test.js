import test from 'node:test'
import assert from 'node:assert/strict'
import { getNextReviewDate } from '../src/utils/spacedRepetition.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'

// REVIEW_GAPS = [3, 6, 10, 15, 20], indexed by review count.
const due = (gap) => addDays(getTodayDate(), gap)

test('first review without marks stays close but not next-day close', () => {
  assert.equal(getNextReviewDate(0, null), due(3))
})

test('a low score resets to a bounded three-day gap', () => {
  assert.equal(getNextReviewDate(3, 30), due(3))
})

test('review count advances along the gap schedule', () => {
  assert.equal(getNextReviewDate(1, null), due(6))
  assert.equal(getNextReviewDate(2, null), due(10))
})

test('a strong score earns a longer evidence-calibrated gap', () => {
  assert.equal(getNextReviewDate(2, 90), due(17))
})

test('gap index is clamped at the end of the schedule', () => {
  assert.equal(getNextReviewDate(10, null), due(20))
  assert.equal(getNextReviewDate(4, 95), due(19))
})

test('a mid score (50-79%) advances without a boost', () => {
  assert.equal(getNextReviewDate(1, 65), due(8))
})
