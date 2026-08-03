import { useMemo } from 'react'
import { useAcademicProfile } from './AcademicProfileProvider'
import { buildActiveSyllabus } from './activeCurriculumData'

export {
  activeSubjectNameSet,
  buildActiveSyllabus,
  curriculumRequestSelection,
  filterActiveSubjectRecords,
  isActiveSubjectRecord,
  mergeActiveRecordUpdates,
} from './activeCurriculumData'

export function useActiveCurriculum() {
  const { workspace } = useAcademicProfile()
  const subjectSelections = workspace?.subjects
  return useMemo(() => {
    const selections = subjectSelections || []
    const syllabus = buildActiveSyllabus(selections)
    const activeSubjectNames = new Set(syllabus.map((item) => item.subject))
    const activeSubjectIds = new Set(syllabus.map((item) => item.subjectId))
    return {
      syllabus,
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
  }, [subjectSelections])
}
