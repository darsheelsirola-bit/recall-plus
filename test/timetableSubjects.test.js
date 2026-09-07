import test from 'node:test'
import assert from 'node:assert/strict'
import { CBSE_2026_27_XI_SELECTABLE_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-11/catalogue.ts'
import { VALID_TIMETABLE_SUBJECTS } from '../shared/timetableSubjects.js'

test('server-safe subject names match the complete official catalogue', () => {
  assert.deepEqual(VALID_TIMETABLE_SUBJECTS, CBSE_2026_27_XI_SELECTABLE_SUBJECTS.map((subject) => subject.name))
})
