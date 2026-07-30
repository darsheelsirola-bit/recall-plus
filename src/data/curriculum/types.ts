export type CurriculumBoard = 'CBSE'
export type CurriculumGrade = 'XI'
export type CurriculumAcademicYear = '2026-27'
export type AcademicPathway = 'science' | 'commerce' | 'humanities'
export type SubjectGroup = 'L' | 'A' | 'S' | 'IA'
export type SubjectCategory =
  | 'language'
  | 'academic_elective'
  | 'skill_elective'
  | 'internal_assessment'
export type CurriculumNodeType =
  | 'unit'
  | 'chapter'
  | 'topic'
  | 'subtopic'
  | 'practical'
  | 'project'
  | 'activity'
  | 'assessment_area'
export type CurriculumContentStatus =
  | 'verified_outline'
  | 'pending_verification'
export type SubjectSelectionType = 'main' | 'additional'

export interface CurriculumVersion {
  id: string
  board: CurriculumBoard
  academicYear: CurriculumAcademicYear
  grade: CurriculumGrade
  version: string
  status: 'reviewed'
  sourceUrl: string
  sourceTitle: string
  sourceHash: string
  importedAt: string
  verifiedAt: string
}

export interface CurriculumSource {
  url: string
  title: string
  sha256: string | null
}

export interface CurriculumSubject {
  id: string
  curriculumVersionId: string
  subjectCode: string | null
  name: string
  shortName: string
  subjectGroup: SubjectGroup
  category: SubjectCategory
  hasTheory: boolean | null
  hasPractical: boolean | null
  hasInternalAssessment: boolean | null
  pathwayTags: readonly (
    | AcademicPathway
    | 'common'
    | 'language'
    | 'skill'
  )[]
  source: CurriculumSource
  contentStatus: CurriculumContentStatus
  officialOrder: number
  active: true
}

export interface CurriculumNode {
  id: string
  subjectId: string
  parentId: string | null
  nodeType: CurriculumNodeType
  title: string
  description: string | null
  officialOrder: number
  marksWeightage: number | null
  sourcePage: number | null
  sourceUrl: string
  externalKey: string
  active: true
}

export interface SubjectSelection {
  curriculumSubjectId: string
  subjectPosition: number
  selectionType: SubjectSelectionType
}

export type SubjectCombinationErrorCode =
  | 'SUBJECT_COUNT'
  | 'DUPLICATE_SUBJECT'
  | 'UNKNOWN_SUBJECT'
  | 'INACTIVE_SUBJECT'
  | 'INVALID_INTERNAL_SUBJECT'
  | 'REQUIRED_LANGUAGE'
  | 'SUBJECT_ONE_LANGUAGE'
  | 'SUBJECT_TWO_GROUP'
  | 'MAIN_SUBJECT_GROUP'
  | 'SUBJECT_FIVE_GROUP'
  | 'ADDITIONAL_SUBJECT_GROUP'
  | 'MAIN_POSITION'
  | 'ADDITIONAL_POSITION'
  | 'MATH_CONFLICT'
  | 'COMPUTER_CONFLICT'
  | 'BUSINESS_CONFLICT'
  | 'LANGUAGE_LEVEL_CONFLICT'

export interface SubjectCombinationError {
  code: SubjectCombinationErrorCode
  message: string
  subjectCodes: readonly string[]
}

export interface SubjectCombinationValidationResult {
  valid: boolean
  errors: SubjectCombinationError[]
  normalizedSelections: SubjectSelection[]
}

export interface UserAcademicProfile {
  userId: string
  board: CurriculumBoard
  grade: CurriculumGrade
  academicYear: CurriculumAcademicYear
  curriculumVersionId: string
  pathway: AcademicPathway
  timezone: 'Asia/Kolkata'
  schoolName: string | null
  onboardingCompleted: boolean
  onboardingCompletedAt: string | null
}
