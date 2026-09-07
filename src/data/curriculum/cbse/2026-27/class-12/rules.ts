import type {
  AcademicPathway,
  SubjectCombinationError,
  SubjectCombinationValidationResult,
  SubjectSelection,
} from '../../../types.ts'
import {
  CBSE_2026_27_XII_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XII_SUBJECTS_BY_ID,
  RECALL_XII_LANGUAGE_CODES,
} from './catalogue.ts'

const codeToId = new Map(
  CBSE_2026_27_XII_SELECTABLE_SUBJECTS.map((subject) => [
    subject.subjectCode,
    subject.id,
  ]),
)

export const CBSE_2026_27_XII_SUBJECT_CODES = Object.freeze({
  englishCore: '301',
  hindiCore: '302',
  french: '118',
  mathematics: '041',
  appliedMathematics: '241',
  computerScience: '083',
  businessStudies: '054',
})

export const CBSE_2026_27_XII_RULES = Object.freeze({
  board: 'CBSE',
  academicYear: '2026-27',
  grade: 'XII',
  minimumMainSubjects: 5,
  maximumMainSubjects: 5,
  maximumAdditionalSubjects: 1,
  validSubjectCount: [5, 6] as const,
  subjectOne: Object.freeze({
    allowedGroup: 'L',
    allowedCodes: [...RECALL_XII_LANGUAGE_CODES] as const,
  }),
  subjectTwoAllowedGroups: ['L', 'A'] as const,
  subjectThreeToFourAllowedGroups: ['A', 'S'] as const,
  subjectFiveAllowedGroup: 'A',
  subjectSixAllowedGroups: ['L', 'A', 'S'] as const,
  requiredLanguageCodes: [...RECALL_XII_LANGUAGE_CODES] as const,
  mutuallyExclusiveSets: [
    [
      CBSE_2026_27_XII_SUBJECT_CODES.mathematics,
      CBSE_2026_27_XII_SUBJECT_CODES.appliedMathematics,
    ],
  ] as const,
  sourceUrl:
    'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf',
  sourcePages: [7, 8, 9, 10, 11, 12] as const,
})

export const CBSE_2026_27_XII_PATHWAY_PRESETS: Readonly<Record<
  AcademicPathway,
  Readonly<Record<string, readonly string[]>>
>> = Object.freeze({
  science: Object.freeze({
    pcm: Object.freeze(['042', '043', '041']),
    pcb: Object.freeze(['042', '043', '044']),
    pcmb: Object.freeze(['042', '043', '041', '044']),
    custom: Object.freeze([]),
  }),
  commerce: Object.freeze({
    mathematics: Object.freeze(['055', '054', '030', '041']),
    appliedMathematics: Object.freeze(['055', '054', '030', '241']),
    withoutMathematics: Object.freeze(['055', '054', '030']),
    custom: Object.freeze([]),
  }),
  humanities: Object.freeze({
    custom: Object.freeze([]),
  }),
})

export function subjectIdsForXiiPreset(
  pathway: AcademicPathway,
  preset: string,
): readonly string[] {
  const codes = CBSE_2026_27_XII_PATHWAY_PRESETS[pathway]?.[preset] || []
  return codes.flatMap((code) => {
    const id = codeToId.get(code)
    return id ? [id] : []
  })
}

function error(
  code: SubjectCombinationError['code'],
  message: string,
  subjectCodes: readonly string[] = [],
): SubjectCombinationError {
  return { code, message, subjectCodes }
}

function conflict(
  selectedCodes: Set<string>,
  codes: readonly string[],
): string[] {
  return codes.filter((code) => selectedCodes.has(code))
}

export function validateCbse2026ClassXiiCombination(
  selections: readonly SubjectSelection[],
): SubjectCombinationValidationResult {
  const normalizedSelections = selections
    .map((selection) => ({
      curriculumSubjectId: String(selection.curriculumSubjectId || '').trim(),
      subjectPosition: Number(selection.subjectPosition),
      selectionType: selection.selectionType,
    }))
    .sort((left, right) => left.subjectPosition - right.subjectPosition)
  const errors: SubjectCombinationError[] = []

  if (![5, 6].includes(normalizedSelections.length)) {
    errors.push(error('SUBJECT_COUNT', 'Select exactly five main subjects and, optionally, one additional subject.'))
  }

  const ids = normalizedSelections.map((selection) => selection.curriculumSubjectId)
  if (new Set(ids).size !== ids.length) {
    errors.push(error('DUPLICATE_SUBJECT', 'Each subject can be selected only once.'))
  }

  const resolved = normalizedSelections.map((selection) => ({
    selection,
    subject: CBSE_2026_27_XII_SUBJECTS_BY_ID.get(selection.curriculumSubjectId),
  }))
  resolved.forEach(({ subject }) => {
    if (!subject) {
      errors.push(error('UNKNOWN_SUBJECT', 'One or more selected subjects are not part of the current CBSE Class XII catalogue.'))
    } else if (!subject.active) {
      errors.push(error('INACTIVE_SUBJECT', `${subject.name} is not active for this curriculum version.`, [subject.subjectCode || '']))
    } else if (subject.subjectGroup === 'IA') {
      errors.push(error('INVALID_INTERNAL_SUBJECT', `${subject.name} is an internal assessment area and cannot occupy a main or additional subject position.`))
    }
  })

  const known = resolved.filter((entry) => Boolean(entry.subject))
  const selectedCodes = new Set(
    known.flatMap(({ subject }) => subject?.subjectCode ? [subject.subjectCode] : []),
  )
  const positions = normalizedSelections.map((selection) => selection.subjectPosition)
  if (
    positions.some((position) => !Number.isInteger(position) || position < 1 || position > 6)
    || new Set(positions).size !== positions.length
  ) {
    errors.push(error('MAIN_POSITION', 'Subject positions must be unique whole numbers from 1 to 6.'))
  }

  normalizedSelections.forEach((selection) => {
    const shouldBeAdditional = selection.subjectPosition === 6
    if (shouldBeAdditional && selection.selectionType !== 'additional') {
      errors.push(error('ADDITIONAL_POSITION', 'Subject 6 must be marked as the additional subject.'))
    }
    if (!shouldBeAdditional && selection.selectionType !== 'main') {
      errors.push(error('MAIN_POSITION', 'Subjects 1 to 5 must be marked as main subjects.'))
    }
  })

  const subjectAt = (position: number) =>
    known.find(({ selection }) => selection.subjectPosition === position)?.subject
  const subjectOne = subjectAt(1)
  if (
    subjectOne
    && (
      subjectOne.subjectGroup !== CBSE_2026_27_XII_RULES.subjectOne.allowedGroup
      || !CBSE_2026_27_XII_RULES.subjectOne.allowedCodes.includes(
        subjectOne.subjectCode as typeof CBSE_2026_27_XII_RULES.subjectOne.allowedCodes[number],
      )
    )
  ) {
    errors.push(error(
      'SUBJECT_ONE_LANGUAGE',
      'Subject 1 must be English Core, Hindi Core, or French.',
      subjectOne.subjectCode ? [subjectOne.subjectCode] : [],
    ))
  }

  const subjectTwo = subjectAt(2)
  if (
    subjectTwo
    && !CBSE_2026_27_XII_RULES.subjectTwoAllowedGroups.includes(
      subjectTwo.subjectGroup as 'L' | 'A',
    )
  ) {
    errors.push(error(
      'SUBJECT_TWO_GROUP',
      'Subject 2 must be another Group-L language or one Group-A academic elective.',
      subjectTwo.subjectCode ? [subjectTwo.subjectCode] : [],
    ))
  }

  for (let position = 3; position <= 4; position += 1) {
    const subject = subjectAt(position)
    if (
      subject
      && !CBSE_2026_27_XII_RULES.subjectThreeToFourAllowedGroups.includes(
        subject.subjectGroup as 'A' | 'S',
      )
    ) {
      errors.push(error(
        'MAIN_SUBJECT_GROUP',
        `Subject ${position} must be a Group-A academic elective or Group-S skill elective.`,
        subject.subjectCode ? [subject.subjectCode] : [],
      ))
    }
  }

  const subjectFive = subjectAt(5)
  if (
    subjectFive
    && subjectFive.subjectGroup !== CBSE_2026_27_XII_RULES.subjectFiveAllowedGroup
  ) {
    errors.push(error(
      'SUBJECT_FIVE_GROUP',
      'Subject 5 must be a Group-A academic elective.',
      subjectFive.subjectCode ? [subjectFive.subjectCode] : [],
    ))
  }

  const subjectSix = subjectAt(6)
  if (
    subjectSix
    && !CBSE_2026_27_XII_RULES.subjectSixAllowedGroups.includes(
      subjectSix.subjectGroup as 'L' | 'A' | 'S',
    )
  ) {
    errors.push(error(
      'ADDITIONAL_SUBJECT_GROUP',
      'The additional subject must be a Group-L, Group-A, or Group-S subject.',
      subjectSix.subjectCode ? [subjectSix.subjectCode] : [],
    ))
  }

  if (
    !CBSE_2026_27_XII_RULES.requiredLanguageCodes.some((code) =>
      selectedCodes.has(code))
  ) {
    errors.push(error('REQUIRED_LANGUAGE', 'Your combination must include English Core, Hindi Core, or French.'))
  }

  const mathConflict = conflict(selectedCodes, ['041', '241'])
  if (mathConflict.length > 1) {
    errors.push(error('MATH_CONFLICT', 'You cannot select both Mathematics and Applied Mathematics.', mathConflict))
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedSelections,
  }
}
