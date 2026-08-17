import test from 'node:test'
import assert from 'node:assert/strict'
import { deterministicNumericalAnswer } from '../server/ai/numericalVerification.js'

test('deterministic numerical verification selects the one calculated option', () => {
  assert.equal(deterministicNumericalAnswer({
    questionType: 'numerical',
    options: ['4 m/s', '5 m/s', '16 m/s', '80 m/s'],
    calculation: {
      operation: 'divide',
      operands: [20, 4],
      unit: 'm/s',
      decimals: 0,
    },
  }), '5 m/s')
})

test('deterministic numerical verification rejects ambiguous or inconsistent options', () => {
  const base = {
    questionType: 'numerical',
    calculation: {
      operation: 'multiply',
      operands: [2, 3],
      unit: 'N',
      decimals: 0,
    },
  }
  assert.equal(deterministicNumericalAnswer({ ...base, options: ['6 N', '6 N', '3 N', '2 N'] }), null)
  assert.equal(deterministicNumericalAnswer({ ...base, options: ['6 J', '5 N', '3 N', '2 N'] }), null)
  assert.equal(deterministicNumericalAnswer({ ...base, calculation: { ...base.calculation, operands: [2, 0], operation: 'divide' }, options: ['0 N', '1 N', '2 N', '3 N'] }), null)
})

test('theory questions bypass deterministic numerical verification', () => {
  assert.equal(deterministicNumericalAnswer({ questionType: 'theory' }), undefined)
})
