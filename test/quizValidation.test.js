import test from 'node:test'
import assert from 'node:assert/strict'
import { validateQuizQuestions } from '../shared/quizValidation.js'

function makeQuestion(difficulty, n) {
  const options = [`opt-${n}-a`, `opt-${n}-b`, `opt-${n}-c`, `opt-${n}-d`]
  return {
    id: `${difficulty}-${n}`,
    difficulty,
    question: `Question ${difficulty} ${n}?`,
    options,
    answer: options[1],
    explanation: 'Because reasons.',
  }
}

const DIFFICULTIES = ['easy', 'medium', 'hard']

function makeQuiz(count) {
  return Array.from({ length: count }, (_, n) => makeQuestion(DIFFICULTIES[n % DIFFICULTIES.length], n))
}

test('accepts a well-formed quiz of any length', () => {
  assert.equal(validateQuizQuestions(makeQuiz(5)), true)
  assert.equal(validateQuizQuestions(makeQuiz(30)), true)
})

test('enforces expectedCount when provided', () => {
  assert.equal(validateQuizQuestions(makeQuiz(5), 5), true)
  assert.equal(validateQuizQuestions(makeQuiz(5), 6), false)
  assert.equal(validateQuizQuestions(makeQuiz(20), 20), true)
})

test('rejects non-arrays and empty arrays', () => {
  assert.equal(validateQuizQuestions(null), false)
  assert.equal(validateQuizQuestions({}), false)
  assert.equal(validateQuizQuestions([]), false)
})

test('rejects an unknown difficulty', () => {
  const quiz = makeQuiz(5)
  quiz[0].difficulty = 'extreme'
  assert.equal(validateQuizQuestions(quiz), false)
})

test('rejects when the answer is not one of the options', () => {
  const quiz = makeQuiz(5)
  quiz[0].answer = 'something else entirely'
  assert.equal(validateQuizQuestions(quiz), false)
})

test('rejects duplicate options', () => {
  const quiz = makeQuiz(5)
  quiz[0].options = ['same', 'same', 'other', 'more']
  quiz[0].answer = 'same'
  assert.equal(validateQuizQuestions(quiz), false)
})

test('rejects wrong option count, blank strings, and missing fields', () => {
  const tooFew = makeQuiz(5)
  tooFew[0].options = ['a', 'b', 'c']
  assert.equal(validateQuizQuestions(tooFew), false)

  const blank = makeQuiz(5)
  blank[0].options = ['a', 'b', 'c', '   ']
  assert.equal(validateQuizQuestions(blank), false)

  const noExplanation = makeQuiz(5)
  noExplanation[0].explanation = '   '
  assert.equal(validateQuizQuestions(noExplanation), false)

  const noId = makeQuiz(5)
  delete noId[0].id
  assert.equal(validateQuizQuestions(noId), false)
})
