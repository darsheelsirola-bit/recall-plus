import { isDueToday, isOverdue } from './dateUtils.js'

// How long to revise a topic, from how long it was originally studied (logs)
// scaled by the last small-quiz score: a weaker score means a longer revise.
export function getReviseMinutes(studyMinutes, percentage) {
  const base = studyMinutes && studyMinutes > 0 ? studyMinutes : 25
  let factor
  if (percentage == null) factor = 0.6
  else if (percentage < 50) factor = 1.0
  else if (percentage < 80) factor = 0.6
  else factor = 0.35
  const rounded = Math.round((base * factor) / 5) * 5
  return Math.min(Math.max(rounded, 5), 60)
}

// Minutes from the most recent matching study log for a topic (logs are newest-first).
export function getTopicStudyMinutes(logs, subject, chapter, topic) {
  const match = logs.find((log) => log.subject === subject && log.chapter === chapter && log.topic === topic)
  return match ? Number(match.timeSpent) || 0 : 0
}

// Topics due now (today or overdue), each annotated with a revise duration.
// Sorted overdue-first, then weakest score first.
export function buildRecallQueue(reviews, logs) {
  return reviews
    .filter((review) => !review.completed && (isDueToday(review.nextReviewDate) || isOverdue(review.nextReviewDate)))
    .map((review) => ({
      ...review,
      overdue: isOverdue(review.nextReviewDate),
      reviseMinutes: getReviseMinutes(getTopicStudyMinutes(logs, review.subject, review.chapter, review.topic), review.lastQuizScore),
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return (a.lastQuizScore ?? 100) - (b.lastQuizScore ?? 100)
    })
}

// Topics the student hasn't logged or scheduled yet — suggested when nothing is due.
// Round-robins across subjects so the suggestions stay varied.
export function suggestNewTopics(allTopics, reviews, logs, limit = 6) {
  const seen = new Set([...reviews, ...logs].map((item) => `${item.subject}|${item.chapter}|${item.topic}`))
  const fresh = allTopics.filter((item) => !seen.has(`${item.subject}|${item.chapter}|${item.topic}`))

  const bySubject = new Map()
  fresh.forEach((item) => {
    if (!bySubject.has(item.subject)) bySubject.set(item.subject, [])
    bySubject.get(item.subject).push(item)
  })

  const subjects = [...bySubject.keys()]
  const out = []
  let i = 0
  while (out.length < limit && subjects.some((subject) => bySubject.get(subject).length)) {
    const queue = bySubject.get(subjects[i % subjects.length])
    if (queue.length) out.push(queue.shift())
    i += 1
  }
  return out
}
