import { addDays, getTodayDate, getWeekStart } from './dateUtils.js'

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A study log may carry multiple topics (topics[]) while older logs only have a
// single `topic` string. These helpers read both shapes safely.
export function getLogTopics(log) {
  if (Array.isArray(log?.topics) && log.topics.length) return log.topics
  return log?.topic ? [log.topic] : []
}

export function getLogTopicsLabel(log) {
  const topics = getLogTopics(log)
  return topics.length ? topics.join(', ') : '—'
}

export function formatStudyMinutes(minutes, { compact = false } = {}) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0))
  if (safe < 60) return compact ? `${safe}m` : `${safe} min`
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (compact) return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
  if (mins === 0) return `${hours} hr${hours === 1 ? '' : 's'}`
  return `${hours} hr${hours === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`
}

// Total study minutes per day for the last `days` days (oldest → newest),
// ready for a bar chart. Each entry: { date, minutes }.
export function getDailyStudyMinutes(logs, days = 7) {
  const today = getTodayDate()
  const buckets = []
  const index = new Map()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i)
    index.set(date, buckets.length)
    buckets.push({ date, minutes: 0 })
  }
  logs.forEach((log) => {
    if (index.has(log.date)) buckets[index.get(log.date)].minutes += Number(log.timeSpent) || 0
  })
  return buckets
}

// Total study minutes for the calendar week containing `referenceDate`.
// Weeks always run Monday → Sunday, regardless of today's weekday.
export function getWeeklyStudyMinutes(logs, referenceDate = getTodayDate()) {
  return getWeeklyStudyBySubject(logs, referenceDate).map(({ date, total }) => ({ date, minutes: total }))
}

export function getWeeklyStudyBySubject(logs, referenceDate = getTodayDate(), subjects = []) {
  const monday = getWeekStart(referenceDate)
  const emptySubjects = () => Object.fromEntries(subjects.map((subject) => [subject, 0]))
  const buckets = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(monday, index),
    label: WEEKDAY_LABELS[index],
    bySubject: emptySubjects(),
    total: 0,
  }))
  const indexByDate = new Map(buckets.map((bucket, index) => [bucket.date, index]))

  logs.forEach((log) => {
    const index = indexByDate.get(log.date)
    const minutes = Number(log.timeSpent) || 0
    if (index === undefined || minutes <= 0) return

    const subject = typeof log.subject === 'string' && log.subject.trim() ? log.subject.trim() : 'Other'
    const bucket = buckets[index]
    bucket.bySubject[subject] = (bucket.bySubject[subject] || 0) + minutes
    bucket.total += minutes
  })
  return buckets
}

// Streak milestones — earned as the streak grows.
export const STREAK_ACHIEVEMENTS = [
  { threshold: 3, label: 'Getting Started' },
  { threshold: 7, label: 'Consistent Learner' },
  { threshold: 14, label: 'Focus Master' },
  { threshold: 30, label: 'Topper Mode' },
]

export function getStreakAchievement(streak) {
  const earned = STREAK_ACHIEVEMENTS.filter((item) => streak >= item.threshold)
  const current = earned[earned.length - 1] || null
  const next = STREAK_ACHIEVEMENTS.find((item) => streak < item.threshold) || null
  return { current, next }
}
