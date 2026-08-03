import { addDays, getTodayDate, isDueToday, isOverdue } from './dateUtils.js'
import { createId } from './quizUtils.js'

const RECALL_TIME_SLOTS = Array.from({ length: 28 }, (_, index) => {
  const totalMinutes = (7 * 60) + (index * 30)
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
})

function minutesFromTime(value = '00:00') {
  const [hours, minutes] = String(value).split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return (hours * 60) + minutes
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function weekdayFromDate(date) {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7
}

function durationFor(item, fallback = 30) {
  return Math.min(180, Math.max(10, Number(item?.durationMinutes) || fallback))
}

function scheduledWindowsForDate(items, date, excludedId = null) {
  return items
    .filter((item) => (
      item?.id !== excludedId
      && !item?.completed
      && item?.nextReviewDate === date
    ))
    .map((item) => {
      const start = minutesFromTime(item.dueTime)
      return start == null ? null : [start, start + durationFor(item)]
    })
    .filter(Boolean)
}

function timetableWindowsForDate(timetable, date) {
  const weekday = weekdayFromDate(date)
  return timetable
    .filter((block) => Number(block?.weekday) === weekday)
    .map((block) => {
      const start = minutesFromTime(block.startTime)
      return start == null ? null : [start, start + durationFor(block, 60)]
    })
    .filter(Boolean)
}

function orderedRecallSlots(subject, topic, date, preferredTime = null) {
  const preferred = preferredTime || getSuggestedRecallTime(subject, topic, date)
  const preferredMinutes = minutesFromTime(preferred) ?? (17 * 60)
  const candidates = minutesFromTime(preferredTime) == null
    ? [...RECALL_TIME_SLOTS]
    : [preferredTime, ...RECALL_TIME_SLOTS.filter((slot) => slot !== preferredTime)]
  return candidates.sort((a, b) => (
    Math.abs((minutesFromTime(a) ?? 0) - preferredMinutes)
    - Math.abs((minutesFromTime(b) ?? 0) - preferredMinutes)
  ))
}

export function findRecallTime({
  date,
  subject = '',
  topic = '',
  durationMinutes = 30,
  scheduledItems = [],
  timetable = [],
  excludedId = null,
  preferredTime = null,
}) {
  const duration = durationFor({ durationMinutes })
  const blocked = [
    ...scheduledWindowsForDate(scheduledItems, date, excludedId),
    ...timetableWindowsForDate(timetable, date),
  ]
  return orderedRecallSlots(subject, topic, date, preferredTime).find((slot) => {
    const start = minutesFromTime(slot)
    return start != null && !blocked.some(([blockedStart, blockedEnd]) => (
      overlaps(start, start + duration, blockedStart, blockedEnd)
    ))
  }) || null
}

export function findBalancedRecallSchedule({
  preferredDate,
  subject = '',
  topic = '',
  durationMinutes = 30,
  scheduledItems = [],
  timetable = [],
  excludedId = null,
  today = getTodayDate(),
}) {
  const earliestDate = addDays(today, 1)
  const offsets = [0, -1, 1, -2, 2, -3, 3, 4, 5, 6, 7]
  for (const offset of offsets) {
    const date = addDays(preferredDate, offset)
    if (date < earliestDate) continue
    const dueTime = findRecallTime({
      date,
      subject,
      topic,
      durationMinutes,
      scheduledItems,
      timetable,
      excludedId,
    })
    if (dueTime) return { nextReviewDate: date, dueTime }
  }
  return null
}

export function getSuggestedRecallTime(subject = '', topic = '', dueDate = '') {
  const seed = `${subject}|${topic}|${dueDate}`
  const hash = [...seed].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
  return RECALL_TIME_SLOTS[hash % RECALL_TIME_SLOTS.length]
}

export function spreadRecallTimes(items, timetable = []) {
  const scheduled = []
  return items.map((item) => {
    const dueTime = findRecallTime({
      date: item.nextReviewDate,
      subject: item.subject,
      topic: item.topic,
      durationMinutes: item.durationMinutes,
      scheduledItems: scheduled,
      timetable,
      excludedId: item.id,
      preferredTime: item.dueTime,
    }) || item.dueTime || getSuggestedRecallTime(item.subject, item.topic, item.nextReviewDate)
    const repaired = { ...item, dueTime }
    scheduled.push(repaired)
    return repaired
  })
}

function confidenceToBand(confidence = 'Medium') {
  const value = String(confidence || '').toLowerCase()
  if (value === 'high') return 'high'
  if (value === 'low') return 'low'
  return 'medium'
}

function remarksBand(remarks = '') {
  const value = String(remarks || '').toLowerCase()
  const explicitlyNoMistakes = value.includes('no mistakes') || value.includes('no errors')
  const weak = (!explicitlyNoMistakes
    && /\b(confused|confusing|difficult|forgot|forget|weak|mistake|mistakes|error|errors|unclear|stuck|struggle|struggling|not clear)\b/.test(value))
    || value.includes('did not understand')
    || value.includes("didn't understand")
  if (weak) return 'weak'
  const strong = /\b(clear|understood|easy|confident|comfortable|mastered)\b/.test(value)
    || value.includes('no mistakes')
  return strong ? 'strong' : 'neutral'
}

export function getPostStudyGap(percentage, confidence = 'Medium', remarks = '') {
  const safePercent = Math.min(100, Math.max(0, Number(percentage) || 0))
  const confidenceBand = confidenceToBand(confidence)
  const noteBand = remarksBand(remarks)

  // Spaced-repetition anchors (5-10 weak retrieval, 15-20 strong retrieval).
  let gap
  if (safePercent < 40) gap = 5
  else if (safePercent < 65) gap = 7
  else if (safePercent < 80) gap = 10
  else if (safePercent < 90) gap = 15
  else if (safePercent < 96) gap = 18
  else gap = 20

  // Active-recall calibration:
  // - Overconfident misses (high confidence, weak recall) should be reviewed sooner.
  // - Underconfident wins (low confidence, strong recall) can be reviewed a bit later.
  if (safePercent < 65 && confidenceBand === 'high') gap -= 2
  if (safePercent >= 85 && confidenceBand === 'low') gap += 1
  if (noteBand === 'weak') gap -= safePercent < 80 ? 2 : 1
  if (noteBand === 'strong' && safePercent >= 80) gap += 1

  return Math.min(20, Math.max(5, gap))
}

export function getRecallDuration(percentage, confidence = 'Medium', remarks = '') {
  const safePercent = percentage == null ? null : Math.min(100, Math.max(0, Number(percentage) || 0))
  const confidenceBand = confidenceToBand(confidence)
  const noteBand = remarksBand(remarks)
  let duration = safePercent == null ? 30 : safePercent < 50 ? 45 : safePercent < 80 ? 35 : 25
  if (noteBand === 'weak') duration += 5
  if (safePercent != null && safePercent < 65 && confidenceBand === 'high') duration += 5
  if (safePercent != null && safePercent >= 85 && noteBand === 'strong') duration -= 5
  return Math.min(60, Math.max(20, Math.round(duration / 5) * 5))
}

export function getRecallDifficulty(score, totalQuestions = 5) {
  const total = Math.max(1, Number(totalQuestions) || 5)
  const percentage = (Math.max(0, Number(score) || 0) / total) * 100
  if (percentage <= 40) return 'Hard'
  if (percentage <= 60) return 'Moderate'
  return 'Easy'
}

export function normalizeRecallItem(item) {
  return {
    ...item,
    status: item.status || (item.completed ? 'completed' : 'scheduled'),
    completed: item.status === 'completed' || Boolean(item.completed),
    dueTime: item.dueTime || '17:00',
    durationMinutes: Math.min(180, Math.max(10, Number(item.durationMinutes) || 30)),
    difficulty: item.difficulty || (item.lastQuizScore == null ? 'Not assessed' : getRecallDifficulty(item.lastQuizScore, 100)),
    createdAt: item.createdAt || `${item.lastStudiedDate || getTodayDate()}T12:00:00.000Z`,
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
  }
}

export function createRecallItem({ subject, curriculumVersionId = null, curriculumSubjectId = null, chapter, topic, confidence = 'Medium', remarks = '', score = null, totalQuestions = 5, percentage = null, dueDate, dueTime = null, durationMinutes = null, source = 'manual', sourceLogId = null, quizResultId = null, existing = null, scheduledItems = [], timetable = [] }) {
  const now = new Date().toISOString()
  const correct = score == null ? null : Number(score)
  const scorePercent = percentage ?? (correct == null ? null : (correct / Math.max(1, Number(totalQuestions) || 5)) * 100)
  const preferredDate = dueDate || addDays(getTodayDate(), scorePercent == null ? 5 : getPostStudyGap(scorePercent, confidence, remarks))
  const recallDuration = durationMinutes == null
    ? getRecallDuration(scorePercent, confidence, remarks)
    : durationFor({ durationMinutes })
  const balanced = dueTime
    ? { nextReviewDate: preferredDate, dueTime }
    : findBalancedRecallSchedule({
      preferredDate,
      subject,
      topic,
      durationMinutes: recallDuration,
      scheduledItems,
      timetable,
      excludedId: existing?.id,
    })
  const nextReviewDate = balanced?.nextReviewDate || preferredDate
  return normalizeRecallItem({
    id: existing?.id || createId(), subject, curriculumVersionId: curriculumVersionId || existing?.curriculumVersionId || null, curriculumSubjectId: curriculumSubjectId || existing?.curriculumSubjectId || null, chapter, topic, confidence, remarks: String(remarks || '').trim(),
    source, sourceLogId, quizResultId, dueTime: balanced?.dueTime || dueTime || getSuggestedRecallTime(subject, topic, nextReviewDate), durationMinutes: recallDuration, nextReviewDate,
    lastStudiedDate: getTodayDate(), lastQuizCorrect: correct,
    lastQuizScore: percentage ?? (correct == null ? existing?.lastQuizScore ?? null : correct * 20),
    difficulty: correct == null ? existing?.difficulty || 'Not assessed' : getRecallDifficulty(correct, totalQuestions),
    reviewCount: existing?.reviewCount || 0, status: 'scheduled', completed: false,
    completedAt: null, createdAt: existing?.createdAt || now, updatedAt: now,
  })
}

export function upsertPostStudyRecalls(reviews, log, quizResult, timetable = []) {
  const topics = Array.isArray(log.topics) && log.topics.length ? log.topics : [log.topic].filter(Boolean)
  const next = reviews.map(normalizeRecallItem)
  topics.forEach((topic) => {
    const index = next.findIndex((item) => item.subject === log.subject && item.chapter === log.chapter && item.topic === topic && !item.completed)
    const existing = index >= 0 ? next[index] : null
    const item = createRecallItem({
      subject: log.subject, chapter: log.chapter, topic, confidence: log.confidence, remarks: log.notes,
      curriculumVersionId: log.curriculumVersionId || quizResult.curriculumVersionId || null,
      curriculumSubjectId: log.curriculumSubjectId || null,
      score: quizResult.score, totalQuestions: quizResult.totalQuestions, percentage: quizResult.percentage, source: 'post-study-quiz',
      sourceLogId: log.id, quizResultId: quizResult.id, existing,
      scheduledItems: next.filter((scheduled) => scheduled.id !== existing?.id),
      timetable,
    })
    if (index >= 0) next[index] = item
    else next.unshift(item)
  })
  return next
}

export function groupRecallItems(items, today = getTodayDate()) {
  const groups = { today: [], overdue: [], upcoming: [], completed: [] }
  items.map(normalizeRecallItem).forEach((item) => {
    if (item.completed || item.status === 'completed') groups.completed.push(item)
    else if (isOverdue(item.nextReviewDate)) groups.overdue.push(item)
    else if (isDueToday(item.nextReviewDate) || item.nextReviewDate === today) groups.today.push(item)
    else groups.upcoming.push(item)
  })
  const sortByDue = (a, b) => `${a.nextReviewDate}${a.dueTime}`.localeCompare(`${b.nextReviewDate}${b.dueTime}`)
  groups.today.sort(sortByDue)
  groups.overdue.sort(sortByDue)
  groups.upcoming.sort(sortByDue)
  groups.completed.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
  return groups
}

export function countOverdueRecalls(items, today = getTodayDate(), selectedDate = null) {
  return items.filter((item) => (
    !item.completed
    && item.nextReviewDate < today
    && (!selectedDate || item.nextReviewDate === selectedDate)
  )).length
}
