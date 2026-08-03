import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findBalancedRecallSchedule,
  findRecallTime,
  getPostStudyGap,
  getRecallDifficulty,
  getRecallDuration,
  groupRecallItems,
  spreadRecallTimes,
  upsertPostStudyRecalls,
} from '../src/utils/recallCalendar.js'
import { addDays, getTodayDate } from '../src/utils/dateUtils.js'

test('post-study gaps follow 5-10 days for low and 15-20 days for high', () => {
  assert.equal(getPostStudyGap(20, 'Low'), 5)
  assert.equal(getPostStudyGap(45, 'High'), 5) // overconfident weak recall -> sooner
  assert.equal(getPostStudyGap(45, 'Medium'), 7)
  assert.equal(getPostStudyGap(70, 'High'), 10)
  assert.equal(getPostStudyGap(82, 'Low'), 15)
  assert.equal(getPostStudyGap(92, 'Medium'), 18)
  assert.equal(getPostStudyGap(92, 'Low'), 19) // underconfident strong recall -> slightly later
  assert.equal(getPostStudyGap(98, 'High'), 20)
})

test('remarks influence recall only within bounded evidence-based gaps', () => {
  assert.equal(getPostStudyGap(75, 'Medium', 'I was confused and made mistakes.'), 8)
  assert.equal(getPostStudyGap(90, 'Medium', 'Clear and understood with no mistakes.'), 19)
  assert.equal(getPostStudyGap(20, 'High', 'Very difficult and unclear.'), 5)
  assert.equal(getPostStudyGap(100, 'Low', 'Clear and easy.'), 20)
})

test('recall duration increases for weak marks, overconfidence, and difficult remarks', () => {
  assert.equal(getRecallDuration(35, 'High', 'Confused and made mistakes.'), 55)
  assert.equal(getRecallDuration(92, 'Medium', 'Clear and understood.'), 20)
  assert.equal(getRecallDuration(null, 'Medium', ''), 30)
})

test('recall difficulty summarizes the quiz result', () => {
  assert.equal(getRecallDifficulty(2), 'Hard')
  assert.equal(getRecallDifficulty(3), 'Moderate')
  assert.equal(getRecallDifficulty(5), 'Easy')
})

test('calendar groups scheduled and completed items', () => {
  const today = getTodayDate()
  const groups = groupRecallItems([
    { id: 'a', nextReviewDate: today, topic: 'Today' },
    { id: 'b', nextReviewDate: addDays(today, -1), topic: 'Late' },
    { id: 'c', nextReviewDate: addDays(today, 2), topic: 'Soon' },
    { id: 'd', nextReviewDate: today, topic: 'Done', completed: true },
  ])
  assert.equal(groups.today[0].topic, 'Today')
  assert.equal(groups.overdue[0].topic, 'Late')
  assert.equal(groups.upcoming[0].topic, 'Soon')
  assert.equal(groups.completed[0].topic, 'Done')
})

test('same-day recalls are spread across different times', () => {
  const items = spreadRecallTimes([
    { id: 'a', subject: 'Physics', topic: 'Motion', nextReviewDate: '2026-06-24', dueTime: '17:00' },
    { id: 'b', subject: 'Chemistry', topic: 'Mole Concept', nextReviewDate: '2026-06-24', dueTime: '17:00' },
    { id: 'c', subject: 'Maths', topic: 'Sets', nextReviewDate: '2026-06-24', dueTime: '17:00' },
  ])
  assert.equal(new Set(items.map((item) => item.dueTime)).size, 3)
})

test('recall slots avoid full-duration overlap with revisions and timetable blocks', () => {
  const date = '2026-06-24'
  const scheduledItems = [
    { id: 'physics', nextReviewDate: date, dueTime: '17:00', durationMinutes: 60 },
    { id: 'maths', nextReviewDate: date, dueTime: '18:00', durationMinutes: 45 },
  ]
  const timetable = [
    { weekday: 2, startTime: '15:30', durationMinutes: 90 },
  ]
  const dueTime = findRecallTime({
    date,
    subject: 'Chemistry',
    topic: 'Equilibrium',
    durationMinutes: 45,
    scheduledItems,
    timetable,
  })
  const [hours, minutes] = dueTime.split(':').map(Number)
  const start = (hours * 60) + minutes
  assert.equal(start + 45 <= 15 * 60 + 30 || start >= 19 * 60, true)
})

test('a fully occupied preferred day moves by at most one day when the next day is free', () => {
  const preferredDate = addDays(getTodayDate(), 5)
  const scheduledItems = Array.from({ length: 28 }, (_, index) => {
    const totalMinutes = (7 * 60) + (index * 30)
    return {
      id: `busy-${index}`,
      nextReviewDate: preferredDate,
      dueTime: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`,
      durationMinutes: 30,
    }
  })
  const schedule = findBalancedRecallSchedule({
    preferredDate,
    subject: 'Maths',
    topic: 'Sets',
    durationMinutes: 30,
    scheduledItems,
  })
  assert.equal(schedule.nextReviewDate, addDays(preferredDate, -1))
})

test('post-study recalls retain remarks and schedule multiple topics without clashes', () => {
  const log = {
    id: 'log-1',
    subject: 'Physics',
    curriculumVersionId: 'cbse-2026-27-xi-v1',
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    chapter: 'Motion',
    topics: ['Velocity', 'Acceleration'],
    confidence: 'High',
    notes: 'I was confused and made several mistakes.',
  }
  const quizResult = {
    id: 'quiz-1',
    score: 4,
    totalQuestions: 10,
    percentage: 40,
  }
  const recalls = upsertPostStudyRecalls([], log, quizResult)
  assert.equal(recalls.length, 2)
  assert.equal(recalls.every((item) => item.remarks === log.notes), true)
  assert.equal(recalls.every((item) => item.curriculumVersionId === log.curriculumVersionId), true)
  assert.equal(recalls.every((item) => item.curriculumSubjectId === log.curriculumSubjectId), true)
  assert.equal(recalls.every((item) => item.durationMinutes === 55), true)
  assert.equal(new Set(recalls.map((item) => `${item.nextReviewDate}|${item.dueTime}`)).size, 2)
})
