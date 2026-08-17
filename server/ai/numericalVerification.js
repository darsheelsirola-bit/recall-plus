import { hasOnlyKeys, normalizedRequiredText } from '../requestValidation.js'

const OPERATIONS = new Set(['add', 'subtract', 'multiply', 'divide'])

function calculatedValue(operation, operands) {
  if (operation === 'add') return operands[0] + operands[1]
  if (operation === 'subtract') return operands[0] - operands[1]
  if (operation === 'multiply') return operands[0] * operands[1]
  if (operation === 'divide' && operands[1] !== 0) return operands[0] / operands[1]
  return Number.NaN
}

function optionValue(option, expectedUnit) {
  const match = String(option || '').trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(.*)$/)
  if (!match) return null
  const unit = match[2].replaceAll(' ', '').toLowerCase()
  if (unit !== expectedUnit.replaceAll(' ', '').toLowerCase()) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

export function deterministicNumericalAnswer(question) {
  if (question?.questionType !== 'numerical') return undefined
  const calculation = question?.calculation
  if (!hasOnlyKeys(calculation, ['operation', 'operands', 'unit', 'decimals'])) return null
  if (!OPERATIONS.has(calculation.operation)) return null
  if (!Array.isArray(calculation.operands) || calculation.operands.length !== 2) return null
  if (!calculation.operands.every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000)) return null
  if (!Number.isInteger(calculation.decimals) || calculation.decimals < 0 || calculation.decimals > 6) return null
  const unit = normalizedRequiredText(calculation.unit, 40)
  if (!unit) return null

  const raw = calculatedValue(calculation.operation, calculation.operands)
  if (!Number.isFinite(raw)) return null
  const expected = Number(raw.toFixed(calculation.decimals))
  const tolerance = 0.5 * (10 ** -calculation.decimals)
  const matches = question.options.filter((option) => {
    const value = optionValue(option, unit)
    return value != null && Math.abs(value - expected) < tolerance
  })
  return matches.length === 1 ? matches[0] : null
}
