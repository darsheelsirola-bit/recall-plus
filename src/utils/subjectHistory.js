import { getData, STORAGE_KEYS } from './storage.js'

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('en-IN')
}

function arraySubjectCount(records, subjectName) {
  const target = normalized(subjectName)
  return Array.isArray(records)
    ? records.filter((record) => normalized(record?.subject) === target).length
    : 0
}

export function countSubjectHistory(subjectName) {
  const target = normalized(subjectName)
  const statuses = getData(STORAGE_KEYS.topicStatuses, {})
  return {
    studyLogs: arraySubjectCount(getData(STORAGE_KEYS.logs, []), subjectName),
    quizzes: arraySubjectCount(
      getData(STORAGE_KEYS.quizResults, []),
      subjectName,
    ),
    revisions: arraySubjectCount(
      getData(STORAGE_KEYS.reviews, []),
      subjectName,
    ),
    progressRecords: statuses && typeof statuses === 'object'
      ? Object.keys(statuses).filter((key) => (
        normalized(key.split('||')[0]) === target
      )).length
      : 0,
    timetableEntries: arraySubjectCount(
      getData(STORAGE_KEYS.studyTimetable, []),
      subjectName,
    ),
  }
}

export function totalSubjectHistory(counts) {
  return Number(counts?.studyLogs || 0)
    + Number(counts?.quizzes || 0)
    + Number(counts?.revisions || 0)
    + Number(counts?.progressRecords || 0)
}
