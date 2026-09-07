import type {
  CurriculumGrade,
  CurriculumSubject,
  CurriculumVersion,
  SubjectSelection,
  SubjectCombinationValidationResult,
} from './types.ts'
import {
  CBSE_2026_27_XI_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XI_SUBJECTS_BY_ID,
  CBSE_2026_27_XI_VERSION,
  CBSE_2026_27_XI_VERSION_ID,
  validateCbse2026ClassXiCombination,
} from './cbse/2026-27/class-11/index.ts'
import {
  CBSE_2026_27_XII_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XII_SUBJECTS_BY_ID,
  CBSE_2026_27_XII_VERSION,
  CBSE_2026_27_XII_VERSION_ID,
  validateCbse2026ClassXiiCombination,
} from './cbse/2026-27/class-12/index.ts'

export const CURRICULUM_VERSION_BY_GRADE = Object.freeze({
  XI: CBSE_2026_27_XI_VERSION,
  XII: CBSE_2026_27_XII_VERSION,
} satisfies Record<CurriculumGrade, CurriculumVersion>)

export const CURRICULUM_VERSION_ID_BY_GRADE = Object.freeze({
  XI: CBSE_2026_27_XI_VERSION_ID,
  XII: CBSE_2026_27_XII_VERSION_ID,
} satisfies Record<CurriculumGrade, string>)

export function isCurriculumGrade(value: unknown): value is CurriculumGrade {
  return value === 'XI' || value === 'XII'
}

export function gradeForVersionId(versionId: string): CurriculumGrade {
  if (versionId === CBSE_2026_27_XII_VERSION_ID) return 'XII'
  return 'XI'
}

export function selectableSubjectsForGrade(
  grade: CurriculumGrade,
): readonly CurriculumSubject[] {
  return grade === 'XII'
    ? CBSE_2026_27_XII_SELECTABLE_SUBJECTS
    : CBSE_2026_27_XI_SELECTABLE_SUBJECTS
}

export function subjectById(subjectId: string): CurriculumSubject | null {
  return CBSE_2026_27_XII_SUBJECTS_BY_ID.get(subjectId)
    ?? CBSE_2026_27_XI_SUBJECTS_BY_ID.get(subjectId)
    ?? null
}

export function validateSubjectCombination(
  grade: CurriculumGrade,
  selections: readonly SubjectSelection[],
): SubjectCombinationValidationResult {
  return grade === 'XII'
    ? validateCbse2026ClassXiiCombination(selections)
    : validateCbse2026ClassXiCombination(selections)
}
