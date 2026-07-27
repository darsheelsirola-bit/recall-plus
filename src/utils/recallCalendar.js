import { addDays, getTodayDate, isDueToday, isOverdue } from './dateUtils.js'
import { createId } from './quizUtils.js'

export const CALENDAR_SUBJECTS = ['Physics', 'Chemistry', 'Maths']
const RECALL_TIME_SLOTS = ['07:30', '09:00', '10:30', '12:00', '14:00', '15:30', '17:00', '18:30', '20:00']

export function getSuggestedRecallTime(subject = '', topic = '', dueDate = '') {
  const seed = `${subject}|${topic}|${dueDate}`
  const hash = [...seed].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
  return RECALL_TIME_SLOTS[hash % RECALL_TIME_SLOTS.length]
}

export function spreadRecallTimes(items) {
  const usedByDate = new Map()
  return items.map((item) => {
    const used = usedByDate.get(item.nextReviewDate) || new Set()
    let dueTime = item.dueTime || getSuggestedRecallTime(item.subject, item.topic, item.nextReviewDate)
    if (used.has(dueTime)) {
      const start = RECALL_TIME_SLOTS.indexOf(getSuggestedRecallTime(item.subject, item.topic, item.nextReviewDate))
      dueTime = RECALL_TIME_SLOTS.find((slot, index) => index >= Math.max(start, 0) && !used.has(slot)) || RECALL_TIME_SLOTS.find((slot) => !used.has(slot)) || dueTime
    }
    used.add(dueTime)
    usedByDate.set(item.nextReviewDate, used)
    return { ...item, dueTime }
  })
}

function confidenceToBand(confidence = 'Medium') {
  const value = String(confidence || '').toLowerCase()
  if (value === 'high') return 'high'
  if (value === 'low') return 'low'
  return 'medium'
}

export function getPostStudyGap(percentage, confidence = 'Medium') {
  const safePercent = Math.min(100, Math.max(0, Number(percentage) || 0))
  const confidenceBand = confidenceToBand(confidence)

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
  if (safePercent < 50 && confidenceBand === 'high') gap -= 2
  if (safePercent >= 90 && confidenceBand === 'low') gap += 1

  return Math.min(20, Math.max(5, gap))
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

export function createRecallItem({ subject, chapter, topic, confidence = 'Medium', score = null, totalQuestions = 5, percentage = null, dueDate, dueTime = null, durationMinutes = 30, source = 'manual', sourceLogId = null, quizResultId = null, existing = null }) {
  const now = new Date().toISOString()
  const correct = score == null ? null : Number(score)
  const scorePercent = percentage ?? (correct == null ? null : (correct / Math.max(1, Number(totalQuestions) || 5)) * 100)
  const nextReviewDate = dueDate || addDays(getTodayDate(), scorePercent == null ? 1 : getPostStudyGap(scorePercent, confidence))
  return normalizeRecallItem({
    id: existing?.id || createId(), subject, chapter, topic, confidence,
    source, sourceLogId, quizResultId, dueTime: dueTime || getSuggestedRecallTime(subject, topic, nextReviewDate), durationMinutes, nextReviewDate,
    lastStudiedDate: getTodayDate(), lastQuizCorrect: correct,
    lastQuizScore: percentage ?? (correct == null ? existing?.lastQuizScore ?? null : correct * 20),
    difficulty: correct == null ? existing?.difficulty || 'Not assessed' : getRecallDifficulty(correct, totalQuestions),
    reviewCount: existing?.reviewCount || 0, status: 'scheduled', completed: false,
    completedAt: null, createdAt: existing?.createdAt || now, updatedAt: now,
  })
}

export function upsertPostStudyRecalls(reviews, log, quizResult) {
  const topics = Array.isArray(log.topics) && log.topics.length ? log.topics : [log.topic].filter(Boolean)
  const next = reviews.map(normalizeRecallItem)
  topics.forEach((topic) => {
    const index = next.findIndex((item) => item.subject === log.subject && item.chapter === log.chapter && item.topic === topic && !item.completed)
    const existing = index >= 0 ? next[index] : null
    const item = createRecallItem({
      subject: log.subject, chapter: log.chapter, topic, confidence: log.confidence,
      score: quizResult.score, totalQuestions: quizResult.totalQuestions, percentage: quizResult.percentage, source: 'post-study-quiz',
      sourceLogId: log.id, quizResultId: quizResult.id, existing,
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
