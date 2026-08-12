import type {
  AcademicPathway,
  CurriculumNode,
  CurriculumSubject,
  SubjectSelection,
  UserAcademicProfile,
} from '../data/curriculum/types.ts'
import {
  CBSE_2026_27_XI_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XI_SUBJECTS_BY_ID,
} from '../data/curriculum/cbse/2026-27/class-11/catalogue.ts'
import { supabase } from '../lib/supabase.ts'
import { runForExpectedSessionUser } from '../utils/authSessionGuard.ts'

export interface ActiveUserSubject extends SubjectSelection {
  subject: CurriculumSubject
}

export interface LegacySubjectCandidate {
  id: string
  detectedName: string
  curriculumSubjectId: string | null
  occurrenceCount: number
  confidence: 'exact' | 'alias' | 'unresolved'
  resolutionStatus: 'mapped' | 'unresolved' | 'confirmed' | 'dismissed'
}

export interface AcademicWorkspace {
  profile: UserAcademicProfile
  subjects: ActiveUserSubject[]
  curriculumNodes: readonly CurriculumNode[]
  migrationCandidates: LegacySubjectCandidate[]
}

interface AcademicProfileRow {
  user_id: string
  board: 'CBSE'
  grade: 'XI'
  academic_year: '2026-27'
  curriculum_version_id: string
  pathway: AcademicPathway | null
  timezone: 'Asia/Kolkata'
  school_name: string | null
  onboarding_completed: boolean
  onboarding_completed_at: string | null
}

interface UserSubjectRow {
  curriculum_subject_id: string
  subject_position: number
  selection_type: 'main' | 'additional'
}

interface MigrationCandidateRow {
  id: string
  normalized_name: string
  legacy_names: string[]
  curriculum_subject_id: string | null
  occurrence_count: number
  confidence: LegacySubjectCandidate['confidence']
  resolution_status: LegacySubjectCandidate['resolutionStatus']
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
    && error.message.trim()
  ) return error.message
  return fallback
}

function mapProfile(row: AcademicProfileRow): UserAcademicProfile {
  return {
    userId: row.user_id,
    board: row.board,
    grade: row.grade,
    academicYear: row.academic_year,
    curriculumVersionId: row.curriculum_version_id,
    pathway: row.pathway as AcademicPathway,
    timezone: row.timezone,
    schoolName: row.school_name,
    onboardingCompleted: row.onboarding_completed,
    onboardingCompletedAt: row.onboarding_completed_at,
  }
}

function mapSubject(row: UserSubjectRow): ActiveUserSubject | null {
  const subject = CBSE_2026_27_XI_SUBJECTS_BY_ID.get(row.curriculum_subject_id)
  if (!subject) return null
  return {
    curriculumSubjectId: row.curriculum_subject_id,
    subjectPosition: row.subject_position,
    selectionType: row.selection_type,
    subject,
  }
}

export async function loadAcademicWorkspace(
  expectedUserId: string,
): Promise<AcademicWorkspace> {
  const [profileResult, subjectsResult, candidatesResult] =
    await runForExpectedSessionUser(
      supabase.auth,
      expectedUserId,
      () => Promise.all([
        supabase
          .from('user_academic_profiles')
          .select(
            'user_id, board, grade, academic_year, curriculum_version_id, pathway, timezone, school_name, onboarding_completed, onboarding_completed_at',
          )
          .eq('user_id', expectedUserId)
          .maybeSingle(),
        supabase
          .from('user_subjects')
          .select('curriculum_subject_id, subject_position, selection_type')
          .eq('user_id', expectedUserId)
          .is('archived_at', null)
          .order('subject_position'),
        supabase
          .from('user_subject_migration_candidates')
          .select(
            'id, normalized_name, legacy_names, curriculum_subject_id, occurrence_count, confidence, resolution_status',
          )
          .eq('user_id', expectedUserId)
          .in('resolution_status', ['mapped', 'unresolved'])
          .order('occurrence_count', { ascending: false }),
      ]),
    )

  if (profileResult.error) {
    throw new Error(`Could not load your academic profile: ${profileResult.error.message}`)
  }

  let profileRow = (profileResult.data ?? null) as AcademicProfileRow | null
  if (!profileRow) {
    const { error: ensureError } = await runForExpectedSessionUser(
      supabase.auth,
      expectedUserId,
      () => supabase.rpc('ensure_recall_user_bootstrap'),
    )
    if (ensureError) {
      throw new Error(
        'Your academic profile is missing. Sign out and back in, then retry.',
      )
    }
    const retry = await runForExpectedSessionUser(
      supabase.auth,
      expectedUserId,
      () => supabase
        .from('user_academic_profiles')
        .select(
          'user_id, board, grade, academic_year, curriculum_version_id, pathway, timezone, school_name, onboarding_completed, onboarding_completed_at',
        )
        .eq('user_id', expectedUserId)
        .maybeSingle(),
    )
    if (retry.error || !retry.data) {
      throw new Error(
        'Your academic profile is missing. Sign out and back in, then retry.',
      )
    }
    profileRow = retry.data as AcademicProfileRow
  }
  if (subjectsResult.error) {
    throw new Error(`Could not load your subjects: ${subjectsResult.error.message}`)
  }
  if (candidatesResult.error) {
    throw new Error(
      `Could not load your previous subject suggestions: ${candidatesResult.error.message}`,
    )
  }

  const subjects = ((subjectsResult.data ?? []) as UserSubjectRow[])
    .map(mapSubject)
    .filter((subject): subject is ActiveUserSubject => Boolean(subject))
  return {
    profile: mapProfile(profileRow),
    subjects,
    curriculumNodes: [],
    migrationCandidates: ((candidatesResult.data ?? []) as MigrationCandidateRow[])
      .map((row) => ({
        id: row.id,
        detectedName: row.legacy_names[0] ?? row.normalized_name,
        curriculumSubjectId: row.curriculum_subject_id,
        occurrenceCount: row.occurrence_count,
        confidence: row.confidence,
        resolutionStatus: row.resolution_status,
      })),
  }
}

export async function saveAcademicOnboardingProgress(
  expectedUserId: string,
  pathway: AcademicPathway | null,
  schoolName: string,
): Promise<void> {
  const { error } = await runForExpectedSessionUser(
    supabase.auth,
    expectedUserId,
    () => supabase.rpc('save_recall_onboarding_progress', {
      p_pathway: pathway,
      p_school_name: schoolName.trim() || null,
    }),
  )
  if (error) {
    throw new Error(errorMessage(error, 'Could not save your onboarding progress.'))
  }
}

export async function saveAcademicProfile(
  expectedUserId: string,
  pathway: AcademicPathway,
  schoolName: string,
  selections: readonly SubjectSelection[],
): Promise<void> {
  const { error } = await runForExpectedSessionUser(
    supabase.auth,
    expectedUserId,
    () => supabase.rpc('save_recall_academic_profile', {
      p_pathway: pathway,
      p_school_name: schoolName.trim() || null,
      p_selections: selections,
    }),
  )
  if (error) {
    const detail = typeof error.details === 'string' ? error.details : ''
    let combinationMessage = ''
    if (detail.startsWith('{')) {
      try {
        const parsed = JSON.parse(detail) as {
          errors?: Array<{ message?: string }>
        }
        combinationMessage = parsed.errors
          ?.map((entry) => entry.message)
          .filter(Boolean)
          .join(' ') ?? ''
      } catch {
        combinationMessage = ''
      }
    }
    throw new Error(
      combinationMessage
      || errorMessage(error, 'Could not save your academic profile.'),
    )
  }
}

export const academicSubjectCatalogue = CBSE_2026_27_XI_SELECTABLE_SUBJECTS
