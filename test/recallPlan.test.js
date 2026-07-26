import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRecallQueue, getReviseMinutes, getTopicStudyMinutes, suggestNewTopics } from '../src/utils/recallPlan.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'

test('getReviseMinutes scales revise time by score, rounding to 5 and clamping 5–60', () => {
  assert.equal(getReviseMinutes(40, 90), 15) // strong score → 0.35x
  assert.equal(getReviseMinutes(40, 60), 25) // mid score → 0.6x
  assert.equal(getReviseMinutes(40, 30), 40) // weak score → 1.0x
  assert.equal(getReviseMinutes(0, null), 15) // no log → base 25, no score → 0.6x
  assert.equal(getReviseMinutes(200, 30), 60) // clamped to max
  assert.equal(getReviseMinutes(3, 90), 5) // clamped to min
})

test('getTopicStudyMinutes returns the most recent matching log, else 0', () => {
  const logs = [
    { subject: 'Physics', chapter: 'C', topic: 'X', timeSpent: 30 },
    { subject: 'Physics', chapter: 'C', topic: 'X', timeSpent: 50 },
  ]
  assert.equal(getTopicStudyMinutes(logs, 'Physics', 'C', 'X'), 30)
  assert.equal(getTopicStudyMinutes(logs, 'Physics', 'C', 'Y'), 0)
})

test('buildRecallQueue keeps due/overdue, drops upcoming/completed, sorts overdue first', () => {
  const today = getTodayDate()
  const reviews = [
    { id: 'a', subject: 'Physics', chapter: 'C', topic: 'T1', nextReviewDate: today, completed: false, lastQuizScore: 90 },
    { id: 'b', subject: 'Physics', chapter: 'C', topic: 'T2', nextReviewDate: addDays(today, -1), completed: false, lastQuizScore: 40 },
    { id: 'c', subject: 'Physics', chapter: 'C', topic: 'T3', nextReviewDate: addDays(today, 1), completed: false },
    { id: 'd', subject: 'Physics', chapter: 'C', topic: 'T4', nextReviewDate: addDays(today, -1), completed: true },
  ]
  const logs = [{ subject: 'Physics', chapter: 'C', topic: 'T1', timeSpent: 40 }]
  const queue = buildRecallQueue(reviews, logs)

  assert.equal(queue.length, 2)
  assert.equal(queue[0].id, 'b') // overdue first
  assert.equal(queue[0].overdue, true)
  assert.equal(queue[1].id, 'a')
  assert.equal(queue[0].reviseMinutes, 25) // no log, score 40 → base 25 * 1.0
  assert.equal(queue[1].reviseMinutes, 15) // log 40, score 90 → 40 * 0.35
})

test('suggestNewTopics excludes touched topics and round-robins across subjects', () => {
  const allTopics = [
    { subject: 'Maths', chapter: 'Sets', topic: 'A' },
    { subject: 'Maths', chapter: 'Sets', topic: 'B' },
    { subject: 'Physics', chapter: 'X', topic: 'C' },
    { subject: 'Physics', chapter: 'X', topic: 'D' },
  ]
  const reviews = [{ subject: 'Maths', chapter: 'Sets', topic: 'A' }]
  const logs = [{ subject: 'Physics', chapter: 'X', topic: 'C' }]

  const out = suggestNewTopics(allTopics, reviews, logs, 6)
  assert.equal(out.length, 2)
  assert.equal(out.some((t) => t.topic === 'A'), false)
  assert.equal(out.some((t) => t.topic === 'C'), false)
  assert.equal(out.some((t) => t.topic === 'B'), true)
  assert.equal(out.some((t) => t.topic === 'D'), true)

  assert.equal(suggestNewTopics(allTopics, [], [], 1).length, 1) // respects limit
})
