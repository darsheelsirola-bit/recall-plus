import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTimetableProfile,
  validateGeneratedTimetable,
  validateTimetableProfile,
} from '../shared/timetableValidation.js'

const profile = {
  wakeTime: '06:00',
  sleepTime: '22:00',
  school: { days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '14:00' },
  tuition: { days: [0, 2, 4], startTime: '17:00', endTime: '18:30' },
  sports: { enabled: true, sessions: [{ days: [1, 3], startTime: '19:00', endTime: '20:00' }] },
  mostActivePeriod: 'evening',
  freeTimeDescription: 'Mostly free after school except tuition and sports',
}

test('profile validator accepts complete routine', () => {
  assert.equal(validateTimetableProfile(profile), true)
})

test('profile validator rejects missing wake and sleep', () => {
  assert.equal(validateTimetableProfile({ ...profile, wakeTime: '', sleepTime: '' }), false)
})

test('profile validator rejects reversed times and oversized day arrays', () => {
  assert.equal(validateTimetableProfile({
    ...profile,
    school: { ...profile.school, startTime: '14:00', endTime: '08:00' },
  }), false)
  assert.equal(validateTimetableProfile({
    ...profile,
    tuition: { ...profile.tuition, days: [0, 1, 2, 3, 4, 5, 6, 0] },
  }), false)
})

test('profile validator rejects unknown properties at every level', () => {
  assert.equal(validateTimetableProfile({ ...profile, attackerControlled: 'ignored before' }), false)
  assert.equal(validateTimetableProfile({
    ...profile,
    school: { ...profile.school, hidden: 'ignored before' },
  }), false)
  assert.equal(validateTimetableProfile({
    ...profile,
    sports: {
      ...profile.sports,
      sessions: [{ ...profile.sports.sessions[0], hidden: 'ignored before' }],
    },
  }), false)
})

test('profile normalization returns a canonical allowlisted shape', () => {
  const normalized = normalizeTimetableProfile({
    ...profile,
    school: { ...profile.school, days: [4, 2, 0, 3, 1] },
    freeTimeDescription: '  Free after school  ',
  })
  assert.deepEqual(normalized.school.days, [0, 1, 2, 3, 4])
  assert.equal(normalized.freeTimeDescription, 'Free after school')
})

test('generated timetable validation rejects blocked overlaps', () => {
  const blocks = [
    { weekday: 0, startTime: '09:00', durationMinutes: 60, subject: 'Physics', label: 'Physics focus' },
  ]
  assert.equal(validateGeneratedTimetable(blocks, profile), false)
})

test('generated timetable validation accepts valid non-overlapping blocks', () => {
  const blocks = [
    { weekday: 0, startTime: '15:30', durationMinutes: 60, subject: 'Physics', label: 'Physics focus' },
    { weekday: 2, startTime: '19:00', durationMinutes: 60, subject: 'Mathematics', label: 'Mathematics practice' },
  ]
  assert.equal(validateGeneratedTimetable(blocks, profile), true)
})

test('technique block validates with short duration', () => {
  const block = {
    weekday: 6,
    startTime: '21:00',
    durationMinutes: 5,
    subject: 'Technique',
    techniqueId: 'environment',
    label: 'Environment design',
  }
  assert.equal(validateGeneratedTimetable([block], profile), true)
})

test('technique block rejects invalid technique id', () => {
  const block = {
    weekday: 6,
    startTime: '21:00',
    durationMinutes: 10,
    subject: 'Technique',
    techniqueId: 'spaced-repetition',
    label: 'Spaced repetition ladder',
  }
  assert.equal(validateGeneratedTimetable([block], profile), false)
})

test('generated timetable rejects unknown fields and oversized labels', () => {
  assert.equal(validateGeneratedTimetable([{
    weekday: 6,
    startTime: '19:00',
    durationMinutes: 60,
    subject: 'Physics',
    label: 'Physics recall',
    hidden: 'provider-controlled',
  }], profile), false)
  assert.equal(validateGeneratedTimetable([{
    weekday: 6,
    startTime: '19:00',
    durationMinutes: 60,
    subject: 'Physics',
    label: 'x'.repeat(161),
  }], profile), false)
})

test('generated timetable rejects an official subject outside the learner active set', () => {
  const block = {
    weekday: 6,
    startTime: '19:00',
    durationMinutes: 60,
    subject: 'Physics',
    label: 'Physics recall',
  }
  assert.equal(validateGeneratedTimetable([block], profile, ['Physics', 'Chemistry']), true)
  assert.equal(validateGeneratedTimetable([block], profile, ['History', 'Political Science']), false)
})
