import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateScore, createId, createQuestionStorageKey, getTopicStatus } from '../src/utils/quizUtils.js'

test('calculateScore counts correct answers and computes percentage', () => {
  const questions = [
    { id: 'q1', answer: 'a' },
    { id: 'q2', answer: 'b' },
    { id: 'q3', answer: 'c' },
    { id: 'q4', answer: 'd' },
  ]
  const answers = { q1: 'a', q2: 'x', q3: 'c', q4: 'd' } // 3 of 4 correct
  assert.deepEqual(calculateScore(questions, answers), { score: 3, totalQuestions: 4, percentage: 75 })
})

test('calculateScore handles an empty quiz without dividing by zero', () => {
  assert.deepEqual(calculateScore([], {}), { score: 0, totalQuestions: 0, percentage: 0 })
})

test('getTopicStatus uses the documented thresholds', () => {
  assert.equal(getTopicStatus(80), 'Strong')
  assert.equal(getTopicStatus(100), 'Strong')
  assert.equal(getTopicStatus(79), 'Average')
  assert.equal(getTopicStatus(50), 'Average')
  assert.equal(getTopicStatus(49), 'Weak')
  assert.equal(getTopicStatus(0), 'Weak')
})

test('createQuestionStorageKey is stable and namespaced by selection', () => {
  assert.equal(createQuestionStorageKey('Physics', 'Kinematics', 'Vectors'), 'questions_Physics_Kinematics_Vectors')
})

test('createId returns unique, non-empty ids', () => {
  const a = createId()
  const b = createId()
  assert.equal(typeof a, 'string')
  assert.ok(a.length > 0)
  assert.notEqual(a, b)
})
