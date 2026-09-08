const text = { type: 'string' }
const object = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) })

// Constrained decoding keeps generated output aligned with the validator.
// Answer accuracy is still checked independently after generation.
export function quizSchema(sourceRefs) {
  return object({ questions: { type: 'array', items: object({
    id: text,
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    questionType: { type: 'string', enum: ['theory', 'numerical'] },
    question: text,
    options: { type: 'array', items: text },
    answer: text,
    explanation: text,
    sourceReference: { type: 'string', enum: sourceRefs },
    calculation: { anyOf: [{ type: 'null' }, object({
      operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
      operands: { type: 'array', items: { type: 'number' } },
      unit: text,
      decimals: { type: 'integer' },
    })] },
  }) } })
}

export const verificationSchema = object({ verifications: { type: 'array', items: object({ id: text, answer: text }) } })
