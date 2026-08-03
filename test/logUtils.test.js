import test from 'node:test'
import assert from 'node:assert/strict'
import { getDailyStudyMinutes, getLogTopics, getLogTopicsLabel, getStreakAchievement, getWeeklyStudyBySubject, getWeeklyStudyMinutes } from '../src/utils/logUtils.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'

test('getLogTopics reads topics[] and falls back to legacy topic', () => {
  assert.deepEqual(getLogTopics({ topics: ['A', 'B'] }), ['A', 'B'])
  assert.deepEqual(getLogTopics({ topic: 'C' }), ['C'])
  assert.deepEqual(getLogTopics({}), [])
  assert.equal(getLogTopicsLabel({ topics: ['A', 'B'] }), 'A, B')
  assert.equal(getLogTopicsLabel({}), '—')
})

test('getDailyStudyMinutes buckets minutes into the last N days', () => {
  const today = getTodayDate()
  const logs = [
    { date: today, timeSpent: 30 },
    { date: today, timeSpent: 20 },
    { date: addDays(today, -2), timeSpent: 45 },
    { date: addDays(today, -10), timeSpent: 100 }, // outside the 7-day window
  ]
  const data = getDailyStudyMinutes(logs, 7)
  assert.equal(data.length, 7)
  assert.equal(data[6].date, today)
  assert.equal(data[6].minutes, 50) // today's two sessions
  assert.equal(data[4].minutes, 45) // two days ago
  assert.equal(data.reduce((sum, day) => sum + day.minutes, 0), 95) // -10 day excluded
})

test('getWeeklyStudyMinutes always runs Monday through Sunday', () => {
  const data = getWeeklyStudyMinutes([
    { date: '2026-06-22', timeSpent: 30 },
    { date: '2026-06-28', timeSpent: 45 },
    { date: '2026-06-29', timeSpent: 90 },
  ], '2026-06-24')

  assert.equal(data.length, 7)
  assert.equal(data[0].date, '2026-06-22')
  assert.equal(data[0].minutes, 30)
  assert.equal(data[6].date, '2026-06-28')
  assert.equal(data[6].minutes, 45)
  assert.equal(data.reduce((sum, day) => sum + day.minutes, 0), 75)
})

test('getWeeklyStudyBySubject aggregates stacked subject totals', () => {
  const data = getWeeklyStudyBySubject([
    { date: '2026-06-22', subject: 'Physics', timeSpent: 30 },
    { date: '2026-06-22', subject: 'Chemistry', timeSpent: 45 },
    { date: '2026-06-22', subject: 'Physics', timeSpent: 20 },
    { date: '2026-06-28', subject: 'Maths', timeSpent: 90 },
    { date: '2026-06-24', subject: 'Computer Science', timeSpent: 25 },
    { date: '2026-06-29', subject: 'Physics', timeSpent: 100 },
  ], '2026-06-24', ['Physics', 'Chemistry', 'Maths'])

  assert.deepEqual(data.map((day) => day.label), ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  assert.deepEqual(data[0].bySubject, { Physics: 50, Chemistry: 45, Maths: 0 })
  assert.equal(data[0].total, 95)
  assert.equal(data[2].bySubject['Computer Science'], 25)
  assert.equal(data[2].total, 25)
  assert.equal(data[6].bySubject.Maths, 90)
  assert.equal(data.reduce((sum, day) => sum + day.total, 0), 210)
})

test('getStreakAchievement returns current and next milestone', () => {
  assert.equal(getStreakAchievement(0).current, null)
  assert.equal(getStreakAchievement(0).next.threshold, 3)
  assert.equal(getStreakAchievement(5).current.label, 'Getting Started')
  assert.equal(getStreakAchievement(5).next.label, 'Consistent Learner')
  assert.equal(getStreakAchievement(30).current.label, 'Topper Mode')
  assert.equal(getStreakAchievement(30).next, null)
})
