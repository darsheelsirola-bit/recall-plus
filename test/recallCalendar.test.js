import test from 'node:test'
import assert from 'node:assert/strict'
import { getPostStudyGap, getRecallDifficulty, groupRecallItems, spreadRecallTimes } from '../src/utils/recallCalendar.js'
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
