import { buildBasedOnLine, buildFallbackChapterInsight, buildFallbackInsights } from '../src/utils/weakTopics.js'
import { fetchGroq } from './upstreamFetch.js'

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const MAX_ATTEMPTS = 3
const MAX_CHAPTERS = 3
const RATE_LIMIT_WAIT_MS = 7000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
        ? match.studyFrom.sections.filter((item) => typeof item === 'string' && item.trim()).slice(0, 4)
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

async function generateOnce({ key, model, chapterContexts }) {
  const response = await fetchGroq(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
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
  })

  if (!response.ok) {
    const details = await response.json().catch(() => ({}))
    const error = new Error(details?.error?.message || 'Groq could not generate insights. Please try again.')
    error.statusCode = response.status
    throw error
  }

  const payload = await response.json()
  const parsed = parseGroqContent(payload)
  return parsed ? normalizeInsightsPayload(parsed, chapterContexts) : null
}

export function validateInsightsRequest(body) {
  if (!body || typeof body !== 'object') return false
  if (!Array.isArray(body.chapterContexts) || !body.chapterContexts.length) return false
  if (body.chapterContexts.length > MAX_CHAPTERS) return false
  return body.chapterContexts.every((ctx) => (
    isString(ctx.subject, 80)
    && isString(ctx.chapter, 200)
    && Array.isArray(ctx.syllabusTopics)
    && Array.isArray(ctx.weakTopics)
  ))
}

export async function requestInsights(chapterContexts) {
  const key = process.env.GROQ_QUIZ_API_KEY
  if (!key) {
    const error = new Error('AI insights are not configured. Add GROQ_QUIZ_API_KEY to your .env file.')
    error.statusCode = 503
    throw error
  }

  const safeContexts = chapterContexts.slice(0, MAX_CHAPTERS)
  const models = modelCandidates()
  let lastError

  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const insights = await generateOnce({ key, model, chapterContexts: safeContexts })
        if (insights) return insights
      } catch (error) {
        if (error.statusCode === 401 || error.statusCode === 403) throw error
        if (error.statusCode === 429) {
          lastError = error
          await sleep(RATE_LIMIT_WAIT_MS)
          continue
        }
        lastError = error
      }
    }
  }

  if (lastError?.statusCode === 429) {
    return { ...buildFallbackInsights(safeContexts), source: 'local-rate-limit' }
  }

  return { ...buildFallbackInsights(safeContexts), source: lastError ? 'local-groq-error' : 'local-validation' }
}
