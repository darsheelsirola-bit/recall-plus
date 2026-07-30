import type {
  AcademicPathway,
  CurriculumSubject,
  SubjectSelection,
} from '../data/curriculum/types.ts'
import {
  CBSE_2026_27_XI_SELECTABLE_SUBJECTS,
  subjectIdsForPreset,
  validateCbse2026ClassXiCombination,
} from '../data/curriculum/index.ts'

export const ONBOARDING_STEP_COUNT = 6

export function academicRouteDestination(
  onboardingCompleted: boolean,
  pathname: string,
  editing: boolean,
): string | null {
  if (!onboardingCompleted && pathname !== '/onboarding') return '/onboarding'
  if (onboardingCompleted && pathname === '/onboarding' && !editing) return '/'
  return null
}

export interface OnboardingDraft {
  step: number
  schoolName: string
  pathway: AcademicPathway | null
  preset: string
  subjectIds: string[]
}

export interface PathwayPreset {
  id: string
  label: string
  description: string
}

export const PATHWAY_PRESETS: Readonly<Record<
  AcademicPathway,
  readonly PathwayPreset[]
>> = Object.freeze({
  science: Object.freeze([
    { id: 'pcm', label: 'PCM', description: 'Physics, Chemistry and Mathematics' },
    { id: 'pcb', label: 'PCB', description: 'Physics, Chemistry and Biology' },
    { id: 'pcmb', label: 'PCMB', description: 'Physics, Chemistry, Mathematics and Biology' },
    { id: 'custom', label: 'Custom', description: 'Build a different valid combination' },
  ]),
  commerce: Object.freeze([
    { id: 'mathematics', label: 'With Mathematics', description: 'Accountancy, Business Studies, Economics and Mathematics' },
    { id: 'appliedMathematics', label: 'With Applied Mathematics', description: 'Accountancy, Business Studies, Economics and Applied Mathematics' },
    { id: 'withoutMathematics', label: 'Without Mathematics', description: 'Accountancy, Business Studies and Economics' },
    { id: 'custom', label: 'Custom', description: 'Build a different valid combination' },
  ]),
  humanities: Object.freeze([
    { id: 'socialSciences', label: 'Social sciences', description: 'History, Political Science, Geography and Economics' },
    { id: 'custom', label: 'Custom', description: 'Build your own Humanities combination' },
  ]),
})

const HUMANITIES_COMMON_CODES = ['027', '028', '029', '030'] as const
const subjectsByCode = new Map(
  CBSE_2026_27_XI_SELECTABLE_SUBJECTS.map((subject) => [
    subject.subjectCode,
    subject,
  ]),
)

export function defaultOnboardingDraft(
  pathway: AcademicPathway | null = null,
  schoolName = '',
  subjectIds: readonly string[] = [],
): OnboardingDraft {
  return {
    step: 1,
    schoolName,
    pathway,
    preset: 'custom',
    subjectIds: [...new Set(subjectIds)],
  }
}

export function presetSubjectIds(
  pathway: AcademicPathway,
  preset: string,
): readonly string[] {
  if (pathway === 'humanities' && preset === 'socialSciences') {
    return HUMANITIES_COMMON_CODES.flatMap((code) => {
      const subject = subjectsByCode.get(code)
      return subject ? [subject.id] : []
    })
  }
  return subjectIdsForPreset(pathway, preset)
}

export function subjectCategoryLabel(subject: CurriculumSubject): string {
  if (subject.subjectGroup === 'L') return 'Group L · Language'
  if (subject.subjectGroup === 'A') return 'Group A · Academic elective'
  return 'Group S · Skill elective'
}

export function recommendedSubjects(
  pathway: AcademicPathway,
): CurriculumSubject[] {
  return CBSE_2026_27_XI_SELECTABLE_SUBJECTS
    .filter((subject) => (
      subject.pathwayTags.includes(pathway)
      || subject.pathwayTags.includes('common')
    ))
    .sort((left, right) => left.officialOrder - right.officialOrder)
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [Array.from(values)]
  return values.flatMap((value, index) => {
    const remainder = values.filter((_, innerIndex) => innerIndex !== index)
    return permutations(remainder).map((tail) => [value, ...tail])
  })
}

export function arrangeSubjectSelections(
  subjectIds: readonly string[],
): SubjectSelection[] | null {
  const uniqueIds = [...new Set(subjectIds)]
  if (![5, 6].includes(uniqueIds.length)) return null

  for (const orderedIds of permutations(uniqueIds)) {
    const selections = orderedIds.map((curriculumSubjectId, index) => ({
      curriculumSubjectId,
      subjectPosition: index + 1,
      selectionType: index === 5 ? 'additional' as const : 'main' as const,
    }))
    if (validateCbse2026ClassXiCombination(selections).valid) {
      return selections
    }
  }
  return null
}

export function draftStorageKey(userId: string): string {
  return `recall-plus:onboarding:${encodeURIComponent(userId)}`
}

export function readOnboardingDraft(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
): OnboardingDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>
    const pathway = ['science', 'commerce', 'humanities'].includes(
      String(parsed.pathway),
    )
      ? parsed.pathway as AcademicPathway
      : null
    const subjectIds = Array.isArray(parsed.subjectIds)
      ? parsed.subjectIds
        .filter((id): id is string => typeof id === 'string')
        .filter((id) => (
          CBSE_2026_27_XI_SELECTABLE_SUBJECTS
            .some((subject) => subject.id === id)
        ))
      : []
    return {
      step: Math.min(
        ONBOARDING_STEP_COUNT,
        Math.max(1, Number.isInteger(parsed.step) ? Number(parsed.step) : 1),
      ),
      schoolName: typeof parsed.schoolName === 'string'
        ? parsed.schoolName.slice(0, 160)
        : '',
      pathway,
      preset: typeof parsed.preset === 'string' ? parsed.preset : 'custom',
      subjectIds: [...new Set(subjectIds)].slice(0, 6),
    }
  } catch {
    return null
  }
}

export function writeOnboardingDraft(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  draft: OnboardingDraft,
): void {
  storage.setItem(draftStorageKey(userId), JSON.stringify(draft))
}
