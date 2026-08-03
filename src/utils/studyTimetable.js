import { getTimetableTechnique, isTimetableTechniqueId, TECHNIQUE_SUBJECT } from '../data/timetablePsychologyTechniques.js'
import { toDateOnly } from './dateUtils.js'
import { createId } from './quizUtils.js'

const DEFAULT_DURATION = 60
const DEFAULT_TIME = '17:00'
const TECHNIQUE_MIN_DURATION = 5
const TECHNIQUE_MAX_DURATION = 180
const FIXED_BLOCK_WINDOWS = Object.freeze([
  ['08:00', '09:00'],
  ['14:00', '15:00'],
])
const ACTIVE_PERIOD_RANGES = {
  morning: [5 * 60, 11 * 60],
  afternoon: [12 * 60, 16 * 60],
  evening: [17 * 60, 21 * 60],
  night: [21 * 60, 24 * 60],
}

function clampDuration(value) {
  return Math.min(180, Math.max(30, Number(value) || DEFAULT_DURATION))
}

function clampTechniqueDuration(value) {
  return Math.min(TECHNIQUE_MAX_DURATION, Math.max(TECHNIQUE_MIN_DURATION, Number(value) || TECHNIQUE_MIN_DURATION))
}

function normalizeSource(block = {}) {
  if (block.source === 'technique' || isTimetableTechniqueId(block.techniqueId)) return 'technique'
  if (block.source === 'manual') return 'manual'
  return 'ai'
}

function parseClock(time = DEFAULT_TIME) {
  const [hours, minutes] = String(time).split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return (hours * 60) + minutes
}

function toClock(totalMinutes = 0) {
  const safe = Math.max(0, Math.min(1439, Number(totalMinutes) || 0))
  const hours = String(Math.floor(safe / 60)).padStart(2, '0')
  const minutes = String(safe % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function normalizeWeekday(weekday = 0) {
  const numeric = Number(weekday)
  if (!Number.isInteger(numeric)) return 0
  if (numeric < 0) return 0
  if (numeric > 6) return 6
  return numeric
}

export function weekdayFromDate(date) {
  const value = new Date(`${toDateOnly(date)}T12:00:00`)
  return (value.getDay() + 6) % 7
}

function normalizeSession(session = {}) {
  return {
    days: Array.isArray(session.days) ? session.days.map(normalizeWeekday) : [],
    startTime: parseClock(session.startTime) == null ? '00:00' : session.startTime,
    endTime: parseClock(session.endTime) == null ? '00:00' : session.endTime,
  }
}

function addBlockedWindow(map, weekday, startTime, endTime) {
  const start = parseClock(startTime)
  const end = parseClock(endTime)
  if (start == null || end == null || end <= start) return
  if (!map.has(weekday)) map.set(weekday, [])
  map.get(weekday).push([start, end])
}

function blockedByWeekday(availability) {
  const blocked = new Map()
  const school = normalizeSession(availability.school)
  const tuition = normalizeSession(availability.tuition)
  for (let day = 0; day < 7; day += 1) {
    FIXED_BLOCK_WINDOWS.forEach(([startTime, endTime]) => addBlockedWindow(blocked, day, startTime, endTime))
  }
  school.days.forEach((day) => addBlockedWindow(blocked, day, school.startTime, school.endTime))
  tuition.days.forEach((day) => addBlockedWindow(blocked, day, tuition.startTime, tuition.endTime))
  if (availability.sports?.enabled && Array.isArray(availability.sports.sessions)) {
    availability.sports.sessions.map(normalizeSession).forEach((session) => {
      session.days.forEach((day) => addBlockedWindow(blocked, day, session.startTime, session.endTime))
    })
  }
  return blocked
}

function normalizeAvailability(input = {}) {
  return {
    wakeTime: parseClock(input.wakeTime) == null ? '06:00' : input.wakeTime,
    sleepTime: parseClock(input.sleepTime) == null ? '22:00' : input.sleepTime,
    school: normalizeSession(input.school),
    tuition: normalizeSession(input.tuition),
    sports: {
      enabled: Boolean(input.sports?.enabled),
      sessions: Array.isArray(input.sports?.sessions) ? input.sports.sessions : [],
    },
    mostActivePeriod: ['morning', 'afternoon', 'evening', 'night'].includes(input.mostActivePeriod) ? input.mostActivePeriod : 'evening',
    freeTimeDescription: String(input.freeTimeDescription || '').trim(),
  }
}

function overlapsAny(start, end, windows = []) {
  return windows.some(([windowStart, windowEnd]) => start < windowEnd && end > windowStart)
}

function scoreCandidate(start, period = 'evening') {
  const [periodStart, periodEnd] = ACTIVE_PERIOD_RANGES[period] || ACTIVE_PERIOD_RANGES.evening
  if (start >= periodStart && start < periodEnd) return 3
  if (Math.abs(start - periodStart) <= 90 || Math.abs(start - periodEnd) <= 90) return 2
  return 1
}

export function normalizeTimetableBlock(block = {}) {
  const start = parseClock(block.startTime)
  const techniqueId = isTimetableTechniqueId(block.techniqueId) ? block.techniqueId : null

  if (techniqueId) {
    const technique = getTimetableTechnique(techniqueId)
    return {
      id: block.id || createId(),
      source: 'technique',
      techniqueId,
      label: technique?.name || String(block.label || '').trim() || 'Technique',
      subject: TECHNIQUE_SUBJECT,
      weekday: normalizeWeekday(block.weekday ?? technique?.weekday ?? 0),
      startTime: start == null ? (technique?.startTime || DEFAULT_TIME) : toClock(start),
      durationMinutes: clampTechniqueDuration(block.durationMinutes ?? technique?.durationMinutes),
      notes: block.notes ? String(block.notes).trim() : '',
      createdAt: block.createdAt || new Date().toISOString(),
      updatedAt: block.updatedAt || new Date().toISOString(),
    }
  }

  const safeSubject = String(block.subject || '').trim()
  const normalizedLabel = String(block.label || '').trim().replace(/\bfocus\b/gi, 'recall')
  return {
    id: block.id || createId(),
    source: normalizeSource(block),
    techniqueId: null,
    label: normalizedLabel || `${safeSubject} recall`,
    subject: safeSubject,
    weekday: normalizeWeekday(block.weekday),
    startTime: start == null ? DEFAULT_TIME : toClock(start),
    durationMinutes: clampDuration(block.durationMinutes),
    notes: block.notes ? String(block.notes).trim() : '',
    createdAt: block.createdAt || new Date().toISOString(),
    updatedAt: block.updatedAt || new Date().toISOString(),
  }
}

export function createTimetableBlock(data = {}) {
  return normalizeTimetableBlock({ ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

export function getBlocksForDate(blocks = [], date) {
  const weekday = weekdayFromDate(date)
  return blocks
    .map(normalizeTimetableBlock)
    .filter((item) => item.weekday === weekday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function mergeTimetableBlocks(existing = [], incoming = [], mode = 'append') {
  const current = existing.map(normalizeTimetableBlock)
  const next = incoming.map(normalizeTimetableBlock)
  const merged = mode === 'replace-ai'
    ? [...current.filter((item) => item.source !== 'ai'), ...next]
    : mode === 'replace-all'
      ? next
      : [...current, ...next]
  const byId = new Map()
  merged.forEach((item) => byId.set(item.id, item))
  return [...byId.values()].sort((a, b) => (a.weekday - b.weekday) || a.startTime.localeCompare(b.startTime))
}

export function buildFallbackTimetable(input = {}) {
  const availability = normalizeAvailability(input)
  const wake = parseClock(availability.wakeTime)
  const sleep = parseClock(availability.sleepTime)
  const blocked = blockedByWeekday(availability)
  const sessionDuration = clampDuration(input.preferredSessionMinutes || DEFAULT_DURATION)
  const targetSessions = Math.min(12, Math.max(4, Number(input.weeklySessions) || 7))
  const subjects = Array.isArray(input.subjects)
    ? [...new Set(input.subjects.map((subject) => String(subject || '').trim()).filter(Boolean))]
    : []
  if (!subjects.length) return []
  const candidates = []
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const windows = blocked.get(weekday) || []
    for (let start = wake; start + sessionDuration <= sleep; start += 30) {
      const end = start + sessionDuration
      if (overlapsAny(start, end, windows)) continue
      candidates.push({ weekday, start, score: scoreCandidate(start, availability.mostActivePeriod) })
    }
  }
  candidates.sort((a, b) => (b.score - a.score) || (a.start - b.start) || (a.weekday - b.weekday))
  const selected = []
  const selectedByDay = new Map()
  for (const candidate of candidates) {
    if (selected.length >= targetSessions) break
    const dayItems = selectedByDay.get(candidate.weekday) || []
    if (dayItems.length >= 3) continue
    const candidateEnd = candidate.start + sessionDuration
    if (dayItems.some((item) => candidate.start < item.end && candidateEnd > item.start)) continue
    dayItems.push({ start: candidate.start, end: candidateEnd })
    selectedByDay.set(candidate.weekday, dayItems)
    selected.push(candidate)
  }
  return selected.map((entry, index) => createTimetableBlock({
    source: 'ai',
    subject: subjects[index % subjects.length],
    label: `${subjects[index % subjects.length]} recall`,
    weekday: entry.weekday,
    startTime: toClock(entry.start),
    durationMinutes: sessionDuration,
  }))
}
