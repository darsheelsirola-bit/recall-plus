import { useEffect, useMemo } from 'react'
import { useAcademicProfile } from './AcademicProfileProvider'
import {
  buildActiveSyllabus,
  curriculumSubjectIdsForNames,
} from './activeCurriculumData'

export {
  activeSubjectNameSet,
  buildActiveSyllabus,
  curriculumSubjectIdsForNames,
  curriculumRequestSelection,
  filterActiveSubjectRecords,
  isActiveSubjectRecord,
  mergeActiveRecordUpdates,
} from './activeCurriculumData'

export function useActiveCurriculum() {
  const { workspace } = useAcademicProfile()
  const subjectSelections = workspace?.subjects
  const curriculumNodes = workspace?.curriculumNodes
  const curriculumVersionId = workspace?.profile.curriculumVersionId || ''
  return useMemo(() => {
    const selections = subjectSelections || []
    const syllabus = buildActiveSyllabus(selections, curriculumNodes || [])
    const activeSubjectNames = new Set(syllabus.map((item) => item.subject))
    const activeSubjectIds = new Set(syllabus.map((item) => item.subjectId))
    return {
      syllabus,
      curriculumVersionId,
      subjects: selections,
      activeSubjectNames,
      activeSubjectIds,
      subjectNames: syllabus.map((item) => item.subject),
      isActiveSubject: (subject) => activeSubjectNames.has(String(subject || '')),
      isActiveRecord: (record) => {
        const subjectId = String(record?.curriculumSubjectId || '').trim()
        return subjectId
          ? activeSubjectIds.has(subjectId)
          : activeSubjectNames.has(String(record?.subject || ''))
      },
    }
  }, [curriculumNodes, curriculumVersionId, subjectSelections])
}

export function useCurriculumSubjects(subjectNames = []) {
  const {
    workspace,
    loadCurriculumSubjects,
    curriculumLoadingSubjectIds,
    loadedCurriculumSubjectIds,
    curriculumError,
  } = useAcademicProfile()
  const nameKey = [...new Set(subjectNames.filter(Boolean).map(String))]
    .sort()
    .join('\u0000')
  const subjectIds = useMemo(() => {
    const names = new Set(nameKey ? nameKey.split('\u0000') : [])
    return curriculumSubjectIdsForNames(workspace?.subjects, [...names])
  }, [nameKey, workspace?.subjects])
  const subjectIdKey = subjectIds.join('\u0000')

  useEffect(() => {
    if (subjectIds.length) void loadCurriculumSubjects(subjectIds)
  }, [loadCurriculumSubjects, subjectIdKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadingIds = new Set(curriculumLoadingSubjectIds)
  const loadedIds = new Set(loadedCurriculumSubjectIds)
  const ready = subjectIds.every((subjectId) => loadedIds.has(subjectId))
  return {
    loading: subjectIds.length > 0 && !ready && !curriculumError
      ? true
      : subjectIds.some((subjectId) => loadingIds.has(subjectId)),
    ready,
    error: curriculumError,
  }
}
