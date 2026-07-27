import syllabus from '../data/syllabus.json' with { type: 'json' }
import studySources from '../data/studySources.json' with { type: 'json' }
import { getLogTopics } from './logUtils.js'
import { resultTimestamp } from './resultUtils.js'

const DEFAULT_THRESHOLD = 50
const MAX_WEAK_TOPICS = 5
const MAX_CHAPTERS = 3

function topicKey(subject, chapter, topic) {
  return `${subject}|${chapter}|${topic}`
}

function chapterKey(subject, chapter) {
  return `${subject}|${chapter}`
}

function expandResultTopics(result) {
  if (Array.isArray(result.topics) && result.topics.length) {
    return result.topics.map((topic) => ({
      subject: result.subject,
      chapter: result.chapter,
      topic: String(topic).trim(),
      percentage: result.percentage,
      date: result.date || '',
      completedAt: result.completedAt || '',
      type: result.type,
      resultId: result.id,
      questionReview: result.questionReview || [],
    }))
  }

  const topicText = String(result.topic || '').trim()
  if (!topicText) return []

  const parts = topicText.includes(',') ? topicText.split(',').map((part) => part.trim()).filter(Boolean) : [topicText]
  return parts.map((topic) => ({
    subject: result.subject,
    chapter: result.chapter,
    topic,
    percentage: result.percentage,
    date: result.date || '',
    completedAt: result.completedAt || '',
    type: result.type,
    resultId: result.id,
    questionReview: result.questionReview || [],
  }))
}

export function normalizeTopicResults(results = []) {
  return results.flatMap(expandResultTopics)
}

function updateScore(map, entry, field) {
  const key = topicKey(entry.subject, entry.chapter, entry.topic)
  const current = map.get(key) || {
    subject: entry.subject,
    chapter: entry.chapter,
    topic: entry.topic,
    recallScore: null,
    practiceScore: null,
    reviewScore: null,
    lastAttemptDate: '',
    lastRecallDate: '',
    lastPracticeDate: '',
    missedQuestionCount: 0,
    latestPracticeResultId: null,
  }

  const score = Number(entry.percentage)
  if (!Number.isFinite(score)) return

  if (field === 'recall') {
    if (current.lastRecallDate === '' || resultTimestamp(entry) > (current.lastRecallTimestamp || 0)) {
      current.recallScore = score
      current.lastRecallDate = entry.date
      current.lastRecallTimestamp = resultTimestamp(entry)
    }
  } else if (field === 'practice') {
    if (current.lastPracticeDate === '' || resultTimestamp(entry) > (current.lastPracticeTimestamp || 0)) {
      current.practiceScore = score
      current.lastPracticeDate = entry.date
      current.lastPracticeTimestamp = resultTimestamp(entry)
      current.latestPracticeResultId = entry.resultId
      const questionReview = Array.isArray(entry.questionReview) ? entry.questionReview : []
      current.missedQuestionCount = questionReview.filter((item) => !item.correct).length
    }
  }

  if (resultTimestamp(entry) > (current.lastAttemptTimestamp || 0)) {
    current.lastAttemptDate = entry.date
    current.lastAttemptTimestamp = resultTimestamp(entry)
  }
  map.set(key, current)
}

export function findWeakTopics(results = [], reviews = [], { threshold = DEFAULT_THRESHOLD, limit = MAX_WEAK_TOPICS } = {}) {
  const map = new Map()

  normalizeTopicResults(results).forEach((entry) => {
    if (entry.type === 'diagnostic' || entry.type === 'post-study') updateScore(map, entry, 'recall')
    else if (entry.type === 'practice') updateScore(map, entry, 'practice')
  })

  reviews.forEach((review) => {
    const key = topicKey(review.subject, review.chapter, review.topic)
    const current = map.get(key) || {
      subject: review.subject,
      chapter: review.chapter,
      topic: review.topic,
      recallScore: null,
      practiceScore: null,
      reviewScore: null,
      lastAttemptDate: '',
      lastRecallDate: '',
      lastPracticeDate: '',
      missedQuestionCount: 0,
      latestPracticeResultId: null,
    }
    if (review.lastQuizScore != null) {
      current.reviewScore = Number(review.lastQuizScore)
      const date = review.lastStudiedDate || review.updatedAt?.slice(0, 10) || ''
      if (date >= current.lastAttemptDate) current.lastAttemptDate = date
    }
    map.set(key, current)
  })

  const topics = [...map.values()].map((item) => {
    const scores = [item.recallScore, item.practiceScore, item.reviewScore].filter((value) => value != null)
    const weakestScore = scores.length ? Math.min(...scores) : null
    return { ...item, weakestScore }
  }).filter((item) => item.weakestScore != null && item.weakestScore < threshold)

  topics.sort((a, b) => {
    if (a.weakestScore !== b.weakestScore) return a.weakestScore - b.weakestScore
    return (b.lastAttemptDate || '').localeCompare(a.lastAttemptDate || '')
  })

  return topics.slice(0, limit)
}

export function groupWeakTopicsByChapter(weakTopics = []) {
  const chapters = new Map()
  weakTopics.forEach((topic) => {
    const key = chapterKey(topic.subject, topic.chapter)
    if (!chapters.has(key)) {
      chapters.set(key, { subject: topic.subject, chapter: topic.chapter, weakTopics: [] })
    }
    chapters.get(key).weakTopics.push(topic)
  })
  return [...chapters.values()].slice(0, MAX_CHAPTERS)
}

export function getStudySource(subject, chapter) {
  return studySources.find((item) => item.subject === subject && item.chapter === chapter) || null
}

export function getSyllabusChapter(subject, chapter) {
  const subjectData = syllabus.find((item) => item.subject === subject)
  return subjectData?.chapters.find((item) => item.name === chapter) || null
}

function collectMissedQuestions(results, subject, chapter) {
  const missed = []
  results
    .filter((result) => result.type === 'practice' && result.subject === subject && result.chapter === chapter)
    .sort((a, b) => `${b.date || ''}${b.id || ''}`.localeCompare(`${a.date || ''}${a.id || ''}`))
    .forEach((result) => {
      const questionReview = Array.isArray(result.questionReview) ? result.questionReview : []
      questionReview.filter((item) => !item.correct).forEach((item) => {
        if (missed.length >= 5) return
        missed.push({
          question: item.question,
          chosen: item.chosen,
          answer: item.answer,
          explanation: item.explanation,
          difficulty: item.difficulty,
        })
      })
    })
  return missed.slice(0, 5)
}

export function buildChapterContext({ subject, chapter, weakTopics = [] }, { results = [], logs = [], reviews = [], statuses = {} } = {}) {
  const syllabusChapter = getSyllabusChapter(subject, chapter)
  const syllabusTopics = syllabusChapter?.topics || []
  const chapterLogs = logs.filter((log) => log.subject === subject && log.chapter === chapter)
  const studiedTopics = new Set()
  const confidenceByTopic = new Map()

  chapterLogs.forEach((log) => {
    getLogTopics(log).forEach((topic) => {
      studiedTopics.add(topic)
      if (!confidenceByTopic.has(topic)) confidenceByTopic.set(topic, log.confidence)
    })
  })

  const unstudiedTopics = syllabusTopics.filter((topic) => !studiedTopics.has(topic))
  const studyMinutes = chapterLogs.reduce((sum, log) => sum + Number(log.timeSpent || 0), 0)
  const recentNotes = chapterLogs
    .filter((log) => log.notes?.trim())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 2)
    .map((log) => ({ date: log.date, notes: log.notes.trim(), confidence: log.confidence }))

  const chapterWeakTopics = weakTopics
    .filter((item) => item.subject === subject && item.chapter === chapter)
    .map((item) => ({
      topic: item.topic,
      recallScore: item.recallScore,
      practiceScore: item.practiceScore,
      reviewScore: item.reviewScore,
      weakestScore: item.weakestScore,
      status: statuses[topicKey(subject, chapter, item.topic)] || null,
      confidence: confidenceByTopic.get(item.topic) || null,
    }))

  return {
    subject,
    chapter,
    syllabusTopics,
    studiedTopics: [...studiedTopics],
    unstudiedTopics,
    weakTopics: chapterWeakTopics,
    studyMinutes,
    recentNotes,
    missedQuestions: collectMissedQuestions(results, subject, chapter),
    studySources: getStudySource(subject, chapter),
    dueReviews: reviews.filter((item) => !item.completed && item.subject === subject && item.chapter === chapter).length,
  }
}

export function buildChapterContexts(weakTopics, data = {}) {
  return groupWeakTopicsByChapter(weakTopics).map((group) => buildChapterContext(group, { ...data, weakTopics }))
}

export function weakTopicsFingerprint(chapterContexts = []) {
  const payload = chapterContexts.map((ctx) => ({
    subject: ctx.subject,
    chapter: ctx.chapter,
    weak: ctx.weakTopics.map((item) => [item.topic, item.weakestScore, item.recallScore, item.practiceScore]),
    missed: ctx.missedQuestions.length,
    minutes: ctx.studyMinutes,
  }))
  return JSON.stringify(payload)
}

export function buildBasedOnLine(ctx) {
  const parts = []
  const weakest = ctx.weakTopics?.[0]
  if (weakest?.recallScore != null) parts.push(`${weakest.recallScore}% recall`)
  if (weakest?.practiceScore != null) parts.push(`${weakest.practiceScore}% practice`)
  if (ctx.missedQuestions?.length) parts.push(`${ctx.missedQuestions.length} missed question${ctx.missedQuestions.length === 1 ? '' : 's'}`)
  parts.push(`${ctx.studyMinutes || 0} min studied in this chapter`)
  return parts.join(' · ')
}

function defaultStudyFrom(ctx) {
  const sources = ctx.studySources
  if (!sources) {
    return {
      primary: `NCERT Class 11 ${ctx.subject} — ${ctx.chapter}`,
      sections: ['Read the chapter', 'Solve back-of-chapter exercises'],
      secondary: '',
    }
  }
  return {
    primary: `${sources.ncert.book} — Ch ${sources.ncert.chapterNumber}: ${sources.ncert.chapterTitle}`,
    sections: sources.ncert.keySections?.slice(0, 3) || ['Read the chapter', 'Solve exercises'],
    secondary: `${sources.secondary.book} — Ch ${sources.secondary.chapterNumber}: ${sources.secondary.chapterTitle}`,
  }
}

function defaultPrioritizedTopics(ctx) {
  const topics = []
  const seen = new Set()

  ;[...(ctx.weakTopics || [])]
    .sort((a, b) => (a.weakestScore ?? 100) - (b.weakestScore ?? 100))
    .forEach((item) => {
      if (seen.has(item.topic)) return
      seen.add(item.topic)
      topics.push({
        topic: item.topic,
        reason: `Weakest score: ${item.weakestScore}%`,
      })
    })

  ;(ctx.unstudiedTopics || []).forEach((topic) => {
    if (seen.has(topic) || topics.length >= 4) return
    seen.add(topic)
    topics.push({ topic, reason: 'Not studied yet — build the base first' })
  })

  if (!topics.length && ctx.syllabusTopics?.length) {
    topics.push({ topic: ctx.syllabusTopics[0], reason: 'Start with the first syllabus topic' })
  }

  return topics.slice(0, 4).map((item, index) => ({ ...item, order: index + 1 }))
}

export function buildFallbackChapterInsight(ctx) {
  const prioritizedTopics = defaultPrioritizedTopics(ctx)
  const studyFrom = defaultStudyFrom(ctx)
  const focusTopic = prioritizedTopics[0]?.topic || ctx.chapter
  const missed = ctx.missedQuestions?.[0]

  let insight = `Your scores in ${ctx.chapter} are below 50%.`
  if (missed?.explanation) insight += ` A recent mistake pattern: ${missed.explanation}`
  else if (!ctx.studyMinutes) insight += ' You have not logged study time for this chapter yet.'
  else insight += ' Review the weak topics below before moving ahead.'

  return {
    subject: ctx.subject,
    chapter: ctx.chapter,
    insight,
    basedOn: buildBasedOnLine(ctx),
    prioritizedTopics,
    studyFrom,
    action: `Open ${studyFrom.primary} and study ${focusTopic} for 30 minutes, then take a recall check.`,
    focusArea: ctx.missedQuestions?.length ? 'problem-solving' : 'conceptual understanding',
  }
}

export function buildFallbackInsights(chapterContexts = []) {
  const chapters = chapterContexts.map(buildFallbackChapterInsight)
  return {
    headline: chapters.length === 1
      ? `Strengthen ${chapters[0].chapter}`
      : 'Turn your weak chapters into strengths this week',
    summary: 'Based on your recall checks, practice tests, and study logs.',
    chapters,
    source: 'local',
  }
}
