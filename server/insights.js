import { buildBasedOnLine, buildFallbackChapterInsight, buildFallbackInsights } from '../src/utils/weakTopics.js'
import { AppError, ERROR_CODES } from './errors.js'
import {
  fetchGroq,
  MAX_PROVIDER_ATTEMPTS,
  PROVIDER_TOTAL_DEADLINE_MS,
  providerHttpError,
  providerResponseInvalid,
  readProviderJson,
  waitBeforeProviderRetry,
} from './upstreamFetch.js'
import {
  hasOnlyKeys,
  normalizedOptionalText,
  normalizedRequiredText,
} from './requestValidation.js'

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const MAX_CHAPTERS = 3
const INSIGHTS_OUTPUT_TOKENS = 3_500

function modelCandidates() {
  const envModel = String(process.env.GROQ_MODEL || '').trim()
  const ordered = envModel ? [envModel, ...DEFAULT_GROQ_MODELS] : DEFAULT_GROQ_MODELS
  return [...new Set(ordered)]
}

function parseGroqContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) return null
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function isString(value, max = 1200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

function normalizeStringArray(value, maxItems, maxLength, { required = false } = {}) {
  if (value == null && !required) return []
  if (!Array.isArray(value) || value.length > maxItems || (required && !value.length)) return null
  const normalized = value.map((item) => normalizedRequiredText(item, maxLength))
  if (normalized.some((item) => !item)) return null
  return [...new Set(normalized)]
}

function normalizeScore(value) {
  if (value == null) return null
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined
}

function normalizeWeakTopic(item) {
  if (!hasOnlyKeys(item, [
    'topic',
    'recallScore',
    'practiceScore',
    'reviewScore',
    'weakestScore',
    'status',
    'confidence',
  ])) return null
  const topic = normalizedRequiredText(item.topic, 200)
  const scores = {
    recallScore: normalizeScore(item.recallScore),
    practiceScore: normalizeScore(item.practiceScore),
    reviewScore: normalizeScore(item.reviewScore),
    weakestScore: normalizeScore(item.weakestScore),
  }
  if (!topic || Object.values(scores).includes(undefined)) return null
  const status = normalizedOptionalText(item.status, 80, null)
  const confidence = normalizedOptionalText(item.confidence, 40, null)
  if ((item.status != null && status == null) || (item.confidence != null && confidence == null)) return null
  return { topic, ...scores, status, confidence }
}

function normalizeRecentNote(item) {
  if (!hasOnlyKeys(item, ['date', 'notes', 'confidence'])) return null
  const date = normalizedRequiredText(item.date, 32)
  const notes = normalizedRequiredText(item.notes, 1_000)
  const confidence = normalizedOptionalText(item.confidence, 40, '')
  if (!date || !notes || confidence == null) return null
  return { date, notes, confidence }
}

function normalizeMissedQuestion(item) {
  if (!hasOnlyKeys(item, [
    'question',
    'chosen',
    'answer',
    'explanation',
    'difficulty',
  ])) return null
  const question = normalizedRequiredText(item.question, 1_200)
  const chosen = normalizedOptionalText(item.chosen, 500, '')
  const answer = normalizedRequiredText(item.answer, 500)
  const explanation = normalizedOptionalText(item.explanation, 1_500, '')
  const difficulty = normalizedOptionalText(item.difficulty, 20, '')
  if (!question || chosen == null || !answer || explanation == null || difficulty == null) return null
  return { question, chosen, answer, explanation, difficulty }
}

function normalizeBookSource(value, { sections = false } = {}) {
  const allowed = sections
    ? ['book', 'chapterNumber', 'chapterTitle', 'keySections']
    : ['book', 'chapterNumber', 'chapterTitle']
  if (!hasOnlyKeys(value, allowed)) return null
  const book = normalizedRequiredText(value.book, 300)
  const chapterTitle = normalizedRequiredText(value.chapterTitle, 300)
  const chapterNumber = value.chapterNumber
  if (!book || !chapterTitle || !Number.isInteger(chapterNumber) || chapterNumber < 0 || chapterNumber > 100) {
    return null
  }
  const result = { book, chapterNumber, chapterTitle }
  if (sections) {
    const keySections = normalizeStringArray(value.keySections, 12, 300)
    if (!keySections) return null
    result.keySections = keySections
  }
  return result
}

function normalizeStudySources(value) {
  if (value == null) return null
  if (!hasOnlyKeys(value, ['subject', 'chapter', 'ncert', 'secondary'])) return null
  const subject = normalizedRequiredText(value.subject, 80)
  const chapter = normalizedRequiredText(value.chapter, 200)
  const ncert = normalizeBookSource(value.ncert, { sections: true })
  const secondary = normalizeBookSource(value.secondary)
  return subject && chapter && ncert && secondary
    ? { subject, chapter, ncert, secondary }
    : null
}

function normalizeChapterContext(ctx) {
  if (!hasOnlyKeys(ctx, [
    'subject',
    'chapter',
    'syllabusTopics',
    'studiedTopics',
    'unstudiedTopics',
    'weakTopics',
    'studyMinutes',
    'recentNotes',
    'missedQuestions',
    'studySources',
    'dueReviews',
  ])) return null

  const subject = normalizedRequiredText(ctx.subject, 80)
  const chapter = normalizedRequiredText(ctx.chapter, 200)
  const syllabusTopics = normalizeStringArray(ctx.syllabusTopics, 40, 200, { required: true })
  const studiedTopics = normalizeStringArray(ctx.studiedTopics, 40, 200)
  const unstudiedTopics = normalizeStringArray(ctx.unstudiedTopics, 40, 200)
  if (!subject || !chapter || !syllabusTopics || !studiedTopics || !unstudiedTopics) return null

  if (!Array.isArray(ctx.weakTopics) || ctx.weakTopics.length > 12) return null
  const weakTopics = ctx.weakTopics.map(normalizeWeakTopic)
  if (weakTopics.some((item) => !item)) return null

  const recentNotesInput = ctx.recentNotes ?? []
  if (!Array.isArray(recentNotesInput) || recentNotesInput.length > 2) return null
  const recentNotes = recentNotesInput.map(normalizeRecentNote)
  if (recentNotes.some((item) => !item)) return null

  const missedInput = ctx.missedQuestions ?? []
  if (!Array.isArray(missedInput) || missedInput.length > 5) return null
  const missedQuestions = missedInput.map(normalizeMissedQuestion)
  if (missedQuestions.some((item) => !item)) return null

  const studyMinutes = ctx.studyMinutes ?? 0
  const dueReviews = ctx.dueReviews ?? 0
  if (!Number.isFinite(studyMinutes) || studyMinutes < 0 || studyMinutes > 100_000) return null
  if (!Number.isInteger(dueReviews) || dueReviews < 0 || dueReviews > 10_000) return null
  const studySources = normalizeStudySources(ctx.studySources)
  if (ctx.studySources != null && !studySources) return null

  return {
    subject,
    chapter,
    syllabusTopics,
    studiedTopics,
    unstudiedTopics,
    weakTopics,
    studyMinutes,
    recentNotes,
    missedQuestions,
    studySources,
    dueReviews,
  }
}

function resolveTopicName(ctx, value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (ctx.syllabusTopics.includes(text)) return text
  const lower = text.toLowerCase()
  const exact = ctx.syllabusTopics.find((topic) => topic.toLowerCase() === lower)
  if (exact) return exact
  const weak = ctx.weakTopics.find((item) => item.topic.toLowerCase() === lower)
  return weak?.topic || ctx.syllabusTopics.find((topic) => topic.toLowerCase().includes(lower) || lower.includes(topic.toLowerCase())) || null
}

function normalizeFocusArea(value) {
  const allowed = ['problem-solving', 'definitions', 'formulas', 'conceptual understanding']
  const text = String(value || '').trim().toLowerCase()
  return allowed.find((item) => item === text) || 'conceptual understanding'
}

export function normalizeInsightsPayload(parsed, chapterContexts) {
  const byKey = new Map((parsed?.chapters || []).map((chapter) => [`${chapter.subject}|${chapter.chapter}`, chapter]))

  const chapters = chapterContexts.map((ctx) => {
    const match = byKey.get(`${ctx.subject}|${ctx.chapter}`)
    const fallback = buildFallbackChapterInsight(ctx)
    if (!match) return fallback

    const prioritized = []
    const seen = new Set()
    ;(match.prioritizedTopics || []).forEach((item) => {
      const topic = resolveTopicName(ctx, item.topic)
      if (!topic || seen.has(topic)) return
      seen.add(topic)
      prioritized.push({
        topic,
        reason: isString(item.reason, 400) ? item.reason : `Priority topic in ${ctx.chapter}`,
      })
    })

    if (!prioritized.length) prioritized.push(...fallback.prioritizedTopics.map(({ topic, reason }) => ({ topic, reason })))

    const studyFrom = {
      primary: isString(match.studyFrom?.primary, 400) ? match.studyFrom.primary : fallback.studyFrom.primary,
      sections: Array.isArray(match.studyFrom?.sections) && match.studyFrom.sections.length
        ? match.studyFrom.sections
          .filter((item) => typeof item === 'string' && item.trim() && item.length <= 300)
          .slice(0, 4)
          .map((item) => item.trim())
        : fallback.studyFrom.sections,
      secondary: isString(match.studyFrom?.secondary, 400) ? match.studyFrom.secondary : fallback.studyFrom.secondary,
    }

    return {
      subject: ctx.subject,
      chapter: ctx.chapter,
      insight: isString(match.insight, 2000) ? match.insight : fallback.insight,
      basedOn: isString(match.basedOn, 500) ? match.basedOn : buildBasedOnLine(ctx),
      prioritizedTopics: prioritized.slice(0, 4).map((item, index) => ({ ...item, order: index + 1 })),
      studyFrom,
      action: isString(match.action, 800) ? match.action : fallback.action,
      focusArea: normalizeFocusArea(match.focusArea),
    }
  })

  return {
    headline: isString(parsed?.headline, 300) ? parsed.headline : buildFallbackInsights(chapterContexts).headline,
    summary: isString(parsed?.summary, 2000) ? parsed.summary : 'Personalised study guidance from your quiz scores and study logs.',
    chapters,
    source: 'groq',
  }
}

export function buildInsightsPrompt(chapterContexts) {
  const compact = chapterContexts.map((ctx) => ({
    subject: ctx.subject,
    chapter: ctx.chapter,
    syllabusTopics: ctx.syllabusTopics,
    studiedTopics: ctx.studiedTopics,
    unstudiedTopics: ctx.unstudiedTopics,
    weakTopics: ctx.weakTopics,
    studyMinutes: ctx.studyMinutes,
    recentNotes: ctx.recentNotes,
    missedQuestions: ctx.missedQuestions,
    studySources: ctx.studySources,
    dueReviews: ctx.dueReviews,
  }))

  return `You are a Class 11 PCM study coach for an Indian student preparing from NCERT.

Analyze the weak chapters below using ONLY the real student data provided. Do not invent scores, books, or topics.

Student data per chapter (JSON):
${JSON.stringify(compact)}

Rules:
- Return ONLY valid JSON with keys: headline, summary, chapters
- chapters array must have one entry per input chapter (exact subject + chapter strings)
- insight: 2-3 sentences explaining the gap using their actual scores, missed questions, or study logs
- basedOn: one short line citing real numbers from the data
- prioritizedTopics: use exact topic strings from syllabusTopics only; order weakest first
- studyFrom.primary and studyFrom.secondary must use ONLY books from studySources
- studyFrom.sections: 2-4 concrete reading/practice steps (plain text, no special symbols)
- action: one concrete next step for today
- focusArea: one of "problem-solving", "definitions", "formulas", "conceptual understanding"

JSON format:
{"headline":"string","summary":"string","chapters":[{"subject":"Physics","chapter":"Motion in a Straight Line","insight":"...","basedOn":"...","prioritizedTopics":[{"topic":"Kinematic Equations","order":1,"reason":"..."}],"studyFrom":{"primary":"NCERT Physics Class 11 Part 1 — Ch 3","sections":["Read §3.4","Solve Ex 3.5 Q1-5"],"secondary":"HC Verma Vol 1 — Ch 3"},"action":"...","focusArea":"formulas"}]}`
}

async function generateOnce({ key, model, chapterContexts, deadlineAt }) {
  const response = await fetchGroq(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_completion_tokens: INSIGHTS_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You give grounded Class 11 PCM study advice. Reply with valid JSON only. Never invent student data or book titles.',
        },
        {
          role: 'user',
          content: buildInsightsPrompt(chapterContexts),
        },
      ],
    }),
  }, { deadlineAt })

  if (!response.ok) throw providerHttpError(response)

  const payload = await readProviderJson(response)
  const parsed = parseGroqContent(payload)
  return parsed ? normalizeInsightsPayload(parsed, chapterContexts) : null
}

export function normalizeInsightsRequest(body) {
  if (!hasOnlyKeys(body, ['chapterContexts', 'requestId'])) return null
  if (!Array.isArray(body.chapterContexts) || !body.chapterContexts.length) return null
  if (body.chapterContexts.length > MAX_CHAPTERS) return null
  const chapterContexts = body.chapterContexts.map(normalizeChapterContext)
  return chapterContexts.some((ctx) => !ctx) ? null : { chapterContexts }
}

export function validateInsightsRequest(body) {
  return normalizeInsightsRequest(body) !== null
}

export async function requestInsights(chapterContexts) {
  const key = process.env.GROQ_INSIGHTS_API_KEY
  if (!key) {
    throw new AppError('AI insights are temporarily unavailable.', {
      code: ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }

  const safeContexts = chapterContexts.slice(0, MAX_CHAPTERS)
  const models = modelCandidates()
  const deadlineAt = Date.now() + PROVIDER_TOTAL_DEADLINE_MS
  let lastError

  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS && Date.now() < deadlineAt; attempt += 1) {
    const model = models[attempt % models.length]
    try {
      const insights = await generateOnce({
        key,
        model,
        chapterContexts: safeContexts,
        deadlineAt,
      })
      if (insights) return insights
      lastError = providerResponseInvalid()
    } catch (error) {
      lastError = error
      if ([400, 401, 403, 422].includes(error?.upstreamStatus)) throw error
    }
    if (attempt + 1 < MAX_PROVIDER_ATTEMPTS && lastError?.upstreamStatus !== 404) {
      await waitBeforeProviderRetry(lastError, attempt + 1, deadlineAt)
    }
  }

  if (lastError?.upstreamStatus === 429) {
    return { ...buildFallbackInsights(safeContexts), source: 'local-rate-limit' }
  }

  return { ...buildFallbackInsights(safeContexts), source: lastError ? 'local-groq-error' : 'local-validation' }
}
