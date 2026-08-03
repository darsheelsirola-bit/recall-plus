import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFallbackTimetable, getBlocksForDate, mergeTimetableBlocks, normalizeTimetableBlock, weekdayFromDate } from '../src/utils/studyTimetable.js'

test('weekdayFromDate maps monday to zero', () => {
  assert.equal(weekdayFromDate('2026-06-22'), 0)
  assert.equal(weekdayFromDate('2026-06-28'), 6)
})

test('getBlocksForDate returns matching weekday blocks only', () => {
  const blocks = [
    { id: 'a', weekday: 0, startTime: '17:00', durationMinutes: 60, subject: 'Physics', label: 'Physics focus' },
    { id: 'b', weekday: 1, startTime: '18:00', durationMinutes: 60, subject: 'Chemistry', label: 'Chemistry focus' },
  ]
  const monday = getBlocksForDate(blocks, '2026-06-22')
  assert.equal(monday.length, 1)
  assert.equal(monday[0].id, 'a')
})

test('mergeTimetableBlocks replace-ai keeps manual blocks', () => {
  const current = [
    { id: 'manual-1', source: 'manual', weekday: 0, startTime: '17:00', durationMinutes: 60, subject: 'Physics', label: 'Manual' },
    { id: 'ai-1', source: 'ai', weekday: 1, startTime: '18:00', durationMinutes: 60, subject: 'Chemistry', label: 'Old AI' },
  ]
  const incoming = [
    { id: 'ai-2', source: 'ai', weekday: 2, startTime: '19:00', durationMinutes: 60, subject: 'Maths', label: 'New AI' },
  ]
  const next = mergeTimetableBlocks(current, incoming, 'replace-ai')
  assert.equal(next.some((item) => item.id === 'manual-1'), true)
  assert.equal(next.some((item) => item.id === 'ai-1'), false)
  assert.equal(next.some((item) => item.id === 'ai-2'), true)
})

test('fallback timetable respects blocked school window', () => {
  const profile = {
    subjects: ['English Core', 'Physics', 'Chemistry', 'Biology', 'Physical Education'],
    wakeTime: '06:00',
    sleepTime: '22:00',
    school: { days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '14:00' },
    tuition: { days: [1, 3], startTime: '17:00', endTime: '18:30' },
    sports: { enabled: false, sessions: [] },
    mostActivePeriod: 'evening',
  }
  const blocks = buildFallbackTimetable(profile)
  assert.equal(blocks.length > 0, true)
  const mondaySchoolOverlap = blocks.some((block) => {
    if (block.weekday !== 0) return false
    const [hours, minutes] = block.startTime.split(':').map(Number)
    const start = (hours * 60) + minutes
    const end = start + block.durationMinutes
    return start < 14 * 60 && end > 8 * 60
  })
  assert.equal(mondaySchoolOverlap, false)
})

test('fallback timetable avoids fixed blocked windows 08-09 and 14-15', () => {
  const profile = {
    subjects: ['English Core', 'Accountancy', 'Business Studies', 'Economics', 'Applied Mathematics'],
    wakeTime: '06:00',
    sleepTime: '22:00',
    school: { days: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '13:00' },
    tuition: { days: [1, 3], startTime: '18:00', endTime: '19:00' },
    sports: { enabled: false, sessions: [] },
    mostActivePeriod: 'evening',
    preferredSessionMinutes: 60,
    weeklySessions: 10,
  }
  const blocks = buildFallbackTimetable(profile)
  const hasFixedBlockedOverlap = blocks.some((block) => {
    const [hours, minutes] = block.startTime.split(':').map(Number)
    const start = (hours * 60) + minutes
    const end = start + block.durationMinutes
    const overlapsMorning = start < (9 * 60) && end > (8 * 60)
    const overlapsAfternoon = start < (15 * 60) && end > (14 * 60)
    return overlapsMorning || overlapsAfternoon
  })
  assert.equal(hasFixedBlockedOverlap, false)
})

test('fallback timetable can suggest multiple slots in one day', () => {
  const profile = {
    subjects: ['English Core', 'History', 'Political Science', 'Geography', 'Psychology'],
    wakeTime: '05:30',
    sleepTime: '22:30',
    school: { days: [0, 1, 2, 3, 4], startTime: '09:00', endTime: '13:00' },
    tuition: { days: [2, 4], startTime: '18:00', endTime: '19:00' },
    sports: { enabled: false, sessions: [] },
    mostActivePeriod: 'evening',
    preferredSessionMinutes: 60,
    weeklySessions: 10,
  }
  const blocks = buildFallbackTimetable(profile)
  const countByDay = blocks.reduce((map, block) => {
    map.set(block.weekday, (map.get(block.weekday) || 0) + 1)
    return map
  }, new Map())
  const hasMultipleInOneDay = [...countByDay.values()].some((count) => count > 1)
  assert.equal(hasMultipleInOneDay, true)
})

test('normalizeTimetableBlock preserves technique metadata', () => {
  const block = normalizeTimetableBlock({
    techniqueId: 'error-log',
    weekday: 6,
    startTime: '15:00',
    durationMinutes: 45,
    source: 'technique',
  })
  assert.equal(block.techniqueId, 'error-log')
  assert.equal(block.subject, 'Technique')
  assert.equal(block.source, 'technique')
  assert.equal(block.label, 'Error log review')
  assert.equal(block.durationMinutes, 45)
})

test('normalizeTimetableBlock preserves curriculum identity for academic blocks', () => {
  const block = normalizeTimetableBlock({
    subject: 'Physics',
    curriculumVersionId: 'cbse-2026-27-xi-v1',
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    weekday: 1,
    startTime: '17:00',
    durationMinutes: 45,
    source: 'ai',
  })
  assert.equal(block.curriculumVersionId, 'cbse-2026-27-xi-v1')
  assert.equal(block.curriculumSubjectId, 'cbse-2026-27-xi-042')
})
