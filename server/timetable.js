import { validateGeneratedTimetable, validateTimetableProfile } from '../shared/timetableValidation.js'
import { fetchGroq } from './upstreamFetch.js'

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const MAX_ATTEMPTS = 3

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

export function buildTimetablePrompt(profile) {
  return `Create a weekly Class 11 PCM study timetable.
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
- Each block must include: weekday (0=Mon...6=Sun), startTime (HH:MM 24h), durationMinutes (30-180), subject (Physics/Chemistry/Maths), label
- Label format should be "<Subject> recall" (example: "Physics recall")
- Keep blocks within wake/sleep times
- Do not overlap school, tuition, or sports sessions
- Never place any block during 08:00-09:00 or 14:00-15:00 on any day
- Multiple study blocks per day are allowed when needed, but blocks on the same day must not overlap
- Prefer Physics, Chemistry, Maths balance and user's most active period
- Duration should usually be 45-90 minutes

JSON format:
{"blocks":[{"weekday":0,"startTime":"17:00","durationMinutes":60,"subject":"Physics","label":"Physics recall"}],"summary":"A short explanation of why this plan is optimal."}`
}

async function generateOnce({ key, model, profile }) {
  const response = await fetchGroq(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an academic planning assistant. Reply with strict valid JSON only.',
        },
        {
          role: 'user',
          content: buildTimetablePrompt(profile),
        },
      ],
    }),
  })

  if (!response.ok) {
    const details = await response.json().catch(() => ({}))
    const error = new Error(details?.error?.message || 'Groq could not generate the timetable. Please try again.')
    error.statusCode = response.status
    throw error
  }

  const payload = await response.json()
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
  const blocks = parsed?.blocks
  if (!Array.isArray(blocks) || blocks.length < 6 || blocks.length > 10) return null
  if (!validateGeneratedTimetable(blocks, profile)) return null
  return {
    blocks,
    summary: typeof parsed?.summary === 'string' ? parsed.summary : 'Generated study timetable based on your routine.',
  }
}

function modelCandidates() {
  const envModel = String(process.env.GROQ_MODEL || '').trim()
  const ordered = envModel ? [envModel, ...DEFAULT_GROQ_MODELS] : DEFAULT_GROQ_MODELS
  return [...new Set(ordered)]
}

export async function requestTimetable(profile) {
  if (!validateTimetableProfile(profile)) {
    const error = new Error('Please provide a complete daily routine before generating an optimal timetable.')
    error.statusCode = 400
    throw error
  }
  const key = process.env.GROQ_TIMETABLE_API_KEY
  if (!key) {
    const error = new Error('Timetable generation is not configured. Add GROQ_TIMETABLE_API_KEY to your .env file.')
    error.statusCode = 503
    throw error
  }
  const models = modelCandidates()
  let lastError
  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const generated = await generateOnce({ key, model, profile })
        if (generated) return generated
      } catch (error) {
        const message = String(error?.message || '')
        const modelNotFound = error.statusCode === 404 || /model.*not found|does not exist|decommissioned/i.test(message)
        if (modelNotFound) {
          lastError = error
          break
        }
        if (error.statusCode && error.statusCode !== 429 && error.statusCode < 500) throw error
        lastError = error
      }
    }
  }
  const error = lastError || new Error('The generated timetable did not pass validation. Please try again.')
  if (!error.statusCode) error.statusCode = 502
  throw error
}
