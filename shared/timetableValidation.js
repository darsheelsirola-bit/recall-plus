import { CBSE_2026_27_XI_SELECTABLE_SUBJECTS } from '../src/data/curriculum/index.ts'
import { isTimetableTechniqueId, TECHNIQUE_SUBJECT } from '../src/data/timetablePsychologyTechniques.js'

export const VALID_ACTIVE_PERIODS = ['morning', 'afternoon', 'evening', 'night']
export const VALID_TIMETABLE_SUBJECTS = CBSE_2026_27_XI_SELECTABLE_SUBJECTS
  .map((subject) => subject.name)
export { TECHNIQUE_SUBJECT }
const FIXED_BLOCK_WINDOWS = Object.freeze([
  ['08:00', '09:00'],
  ['14:00', '15:00'],
])

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return (hours * 60) + minutes
}

function isWeekday(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).every((key) => keys.includes(key))
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return []
  return days.filter(isWeekday).sort((left, right) => left - right)
}

function hasValidDays(days) {
  return Array.isArray(days)
    && days.length >= 1
    && days.length <= 7
    && days.every(isWeekday)
    && new Set(days).size === days.length
}

function normalizeSession(session = {}) {
  return {
    days: normalizeDays(session.days),
    startTime: session.startTime,
    endTime: session.endTime,
  }
}

function collectBlockedWindows(profile = {}) {
  const blocked = new Map()
  const append = (weekday, start, end) => {
    if (!blocked.has(weekday)) blocked.set(weekday, [])
    blocked.get(weekday).push([start, end])
  }
  for (let day = 0; day < 7; day += 1) {
    FIXED_BLOCK_WINDOWS.forEach(([startText, endText]) => {
      const start = parseTime(startText)
      const end = parseTime(endText)
      append(day, start, end)
    })
  }
  const addSession = (session) => {
    const start = parseTime(session.startTime)
    const end = parseTime(session.endTime)
    if (start == null || end == null || end <= start) return
    session.days.forEach((day) => append(day, start, end))
  }
  addSession(normalizeSession(profile.school))
  addSession(normalizeSession(profile.tuition))
  if (profile.sports?.enabled && Array.isArray(profile.sports?.sessions)) {
    profile.sports.sessions.map(normalizeSession).forEach(addSession)
  }
  return blocked
}

function overlapsAny(start, end, windows = []) {
  return windows.some(([windowStart, windowEnd]) => start < windowEnd && end > windowStart)
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeStrictSession(session) {
  if (!hasOnlyKeys(session, ['days', 'startTime', 'endTime'])) return null
  if (!hasValidDays(session.days)) return null
  const start = parseTime(session.startTime)
  const end = parseTime(session.endTime)
  if (start == null || end == null || end <= start) return null
  return {
    days: normalizeDays(session.days),
    startTime: session.startTime,
    endTime: session.endTime,
  }
}

/**
 * Return the exact profile shape that is safe to hash and send to the
 * provider. Unknown properties are rejected instead of being silently hashed.
 */
export function normalizeTimetableProfile(profile) {
  if (!hasOnlyKeys(profile, [
    'wakeTime',
    'sleepTime',
    'school',
    'tuition',
    'sports',
    'mostActivePeriod',
    'freeTimeDescription',
    'preferredSessionMinutes',
    'weeklySessions',
  ])) return null

  if (
    profile.freeTimeDescription != null
    && (
      typeof profile.freeTimeDescription !== 'string'
      || profile.freeTimeDescription.length > 1000
    )
  ) return null
  const wake = parseTime(profile.wakeTime)
  const sleep = parseTime(profile.sleepTime)
  if (wake == null || sleep == null || sleep <= wake) return null
  if (!VALID_ACTIVE_PERIODS.includes(profile.mostActivePeriod)) return null
  if (
    !Number.isInteger(profile.preferredSessionMinutes ?? 60)
    || (profile.preferredSessionMinutes ?? 60) < 30
    || (profile.preferredSessionMinutes ?? 60) > 180
  ) return null
  if (
    !Number.isInteger(profile.weeklySessions ?? 7)
    || (profile.weeklySessions ?? 7) < 1
    || (profile.weeklySessions ?? 7) > 14
  ) return null

  const school = normalizeStrictSession(profile.school)
  const tuition = normalizeStrictSession(profile.tuition)
  if (!school || !tuition) return null
  if (
    !hasOnlyKeys(profile.sports, ['enabled', 'sessions'])
    ||
    typeof profile.sports?.enabled !== 'boolean'
    || !Array.isArray(profile.sports?.sessions)
    || profile.sports.sessions.length > 7
  ) return null

  const sportsSessions = profile.sports.sessions.map(normalizeStrictSession)
  if (sportsSessions.some((session) => !session)) return null

  return {
    wakeTime: profile.wakeTime,
    sleepTime: profile.sleepTime,
    school,
    tuition,
    sports: {
      enabled: profile.sports.enabled,
      sessions: sportsSessions,
    },
    mostActivePeriod: profile.mostActivePeriod,
    freeTimeDescription: String(profile.freeTimeDescription || '').trim().replace(/\s+/g, ' '),
    preferredSessionMinutes: profile.preferredSessionMinutes ?? 60,
    weeklySessions: profile.weeklySessions ?? 7,
  }
}

export function validateTimetableProfile(profile) {
  return normalizeTimetableProfile(profile) !== null
}

export function validateTimetableBlock(block, profile) {
  if (!hasOnlyKeys(block, [
    'weekday',
    'startTime',
    'durationMinutes',
    'subject',
    'label',
    'techniqueId',
  ])) return false
  if (!isWeekday(block.weekday)) return false
  if (!isNonEmptyText(block.label) || block.label.length > 160) return false

  const isTechnique = isTimetableTechniqueId(block.techniqueId)
  if (isTechnique) {
    if (block.subject !== TECHNIQUE_SUBJECT) return false
    if (!Number.isInteger(block.durationMinutes) || block.durationMinutes < 5 || block.durationMinutes > 180) return false
  } else {
    if (block.techniqueId != null) return false
    if (!VALID_TIMETABLE_SUBJECTS.includes(block.subject)) return false
    if (!Number.isInteger(block.durationMinutes) || block.durationMinutes < 30 || block.durationMinutes > 180) return false
  }

  const start = parseTime(block.startTime)
  if (start == null) return false
  const end = start + block.durationMinutes

  const wake = parseTime(profile?.wakeTime)
  const sleep = parseTime(profile?.sleepTime)
  if (wake != null && sleep != null && (start < wake || end > sleep)) return false

  const blocked = collectBlockedWindows(profile)
  if (overlapsAny(start, end, blocked.get(block.weekday) || [])) return false
  return true
}

export function validateGeneratedTimetable(blocks, profile) {
  if (!Array.isArray(blocks) || !blocks.length) return false
  if (!blocks.every((block) => validateTimetableBlock(block, profile))) return false
  for (let i = 0; i < blocks.length; i += 1) {
    const a = blocks[i]
    const aStart = parseTime(a.startTime)
    const aEnd = aStart + a.durationMinutes
    for (let j = i + 1; j < blocks.length; j += 1) {
      const b = blocks[j]
      if (a.weekday !== b.weekday) continue
      const bStart = parseTime(b.startTime)
      const bEnd = bStart + b.durationMinutes
      if (aStart < bEnd && aEnd > bStart) return false
    }
  }
  return true
}
