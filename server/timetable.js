import {
  normalizeTimetableProfile,
  validateGeneratedTimetable,
} from '../shared/timetableValidation.js'
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

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const TIMETABLE_OUTPUT_TOKENS = 3_000

function periodHint(period) {
  if (period === 'morning') return '06:00-11:00'
  if (period === 'afternoon') return '12:00-16:00'
  if (period === 'night') return '21:00-23:00'
  return '17:00-21:00'
}

function daysText(days = []) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map((day) => labels[day]).join(', ') || 'none'
}

export function buildTimetablePrompt(profile, subjects) {
  const subjectNames = subjects.map((subject) => subject.name)
  return `Create a weekly CBSE Class 11 study timetable.
Active subjects: ${subjectNames.join(', ')}
User routine:
- Wake: ${profile.wakeTime}
- Sleep: ${profile.sleepTime}
- School: ${daysText(profile.school.days)} ${profile.school.startTime}-${profile.school.endTime}
- Tuition: ${daysText(profile.tuition.days)} ${profile.tuition.startTime}-${profile.tuition.endTime}
- Sports enabled: ${profile.sports?.enabled ? 'yes' : 'no'}
- Sports sessions: ${profile.sports?.enabled ? (profile.sports.sessions || []).map((session) => `${daysText(session.days)} ${session.startTime}-${session.endTime}`).join(' | ') || 'none' : 'none'}
- Most active period: ${profile.mostActivePeriod} (prefer around ${periodHint(profile.mostActivePeriod)})
- Free-time notes: ${profile.freeTimeDescription || 'not provided'}
- Preferred session length: ${profile.preferredSessionMinutes || 60} minutes
- Target sessions per week: ${profile.weeklySessions || 7}

Rules:
- Return ONLY valid JSON object with two keys: "blocks" and "summary"
- "blocks" must contain 6 to 10 study blocks
- Each block must include: weekday (0=Mon...6=Sun), startTime (HH:MM 24h), durationMinutes (30-180), subject (one exact value from Active subjects), label
- Label format should be "<Subject> recall" (example: "Physics recall")
- Keep blocks within wake/sleep times
- Do not overlap school, tuition, or sports sessions
- Never place any block during 08:00-09:00 or 14:00-15:00 on any day
- Multiple study blocks per day are allowed when needed, but blocks on the same day must not overlap
- Balance only the learner's Active subjects and prefer the user's most active period
- Duration should usually be 45-90 minutes

JSON format:
{"blocks":[{"weekday":0,"startTime":"17:00","durationMinutes":60,"subject":"Physics","label":"Physics recall"}],"summary":"A short explanation of why this plan is optimal."}`
}

async function generateOnce({ key, model, profile, subjects, curriculumVersionId, deadlineAt }) {
  const response = await fetchGroq(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_completion_tokens: TIMETABLE_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an academic planning assistant. Reply with strict valid JSON only.',
        },
        {
          role: 'user',
          content: buildTimetablePrompt(profile, subjects),
        },
      ],
    }),
  }, { deadlineAt })

  if (!response.ok) throw providerHttpError(response)

  const payload = await readProviderJson(response)
  const text = payload?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) return null
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  const blocks = Array.isArray(parsed?.blocks)
    ? parsed.blocks.map((block) => ({
      weekday: block?.weekday,
      startTime: block?.startTime,
      durationMinutes: block?.durationMinutes,
      subject: block?.subject,
      label: typeof block?.label === 'string' ? block.label.trim() : block?.label,
      ...(block?.techniqueId == null ? {} : { techniqueId: block.techniqueId }),
    }))
    : null
  if (!Array.isArray(blocks) || blocks.length < 6 || blocks.length > 10) return null
  if (!validateGeneratedTimetable(blocks, profile, subjects.map((subject) => subject.name))) return null
  const subjectIdsByName = new Map(subjects.map((subject) => [subject.name, subject.curriculumSubjectId]))
  return {
    blocks: blocks.map((block) => ({
      ...block,
      curriculumVersionId,
      curriculumSubjectId: subjectIdsByName.get(block.subject),
    })),
    summary: typeof parsed?.summary === 'string' && parsed.summary.trim().length <= 1_000
      ? parsed.summary.trim()
      : 'Generated study timetable based on your routine.',
  }
}

function modelCandidates() {
  const envModel = String(process.env.GROQ_MODEL || '').trim()
  const ordered = envModel ? [envModel, ...DEFAULT_GROQ_MODELS] : DEFAULT_GROQ_MODELS
  return [...new Set(ordered)]
}

export async function requestTimetable(profile, subjects = [], curriculumVersionId = '') {
  const safeProfile = normalizeTimetableProfile(profile)
  if (!safeProfile) {
    throw new AppError('Please provide a complete daily routine before generating an optimal timetable.', {
      code: ERROR_CODES.INVALID_REQUEST,
      statusCode: 400,
    })
  }
  if (!Array.isArray(subjects) || subjects.length < 5 || subjects.length > 6) {
    throw new AppError('Choose 5 or 6 active subjects before generating a timetable.', {
      code: ERROR_CODES.ACADEMIC_PROFILE_REQUIRED,
      statusCode: 409,
    })
  }
  if (typeof curriculumVersionId !== 'string' || !curriculumVersionId.trim()) {
    throw new AppError('Your curriculum version could not be verified.', {
      code: ERROR_CODES.CURRICULUM_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }
  const key = process.env.GROQ_TIMETABLE_API_KEY
  if (!key) {
    throw new AppError('Timetable generation is temporarily unavailable.', {
      code: ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }
  const models = modelCandidates()
  const deadlineAt = Date.now() + PROVIDER_TOTAL_DEADLINE_MS
  let lastError

  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS && Date.now() < deadlineAt; attempt += 1) {
    const model = models[attempt % models.length]
    try {
      const generated = await generateOnce({ key, model, profile: safeProfile, subjects, curriculumVersionId, deadlineAt })
      if (generated) return generated
      lastError = providerResponseInvalid()
    } catch (error) {
      lastError = error
      if ([400, 401, 403, 422].includes(error?.upstreamStatus)) throw error
    }
    if (attempt + 1 < MAX_PROVIDER_ATTEMPTS && lastError?.upstreamStatus !== 404) {
      await waitBeforeProviderRetry(lastError, attempt + 1, deadlineAt)
    }
  }

  throw lastError || providerResponseInvalid()
}
