/* eslint-disable react-refresh/only-export-components */
import { useActiveCurriculum } from '../academic/activeCurriculum'

export function getChapters(subject, syllabus = []) {
  return syllabus.find((item) => item.subject === subject)?.chapters || []
}

export function getTopics(subject, chapter, syllabus = []) {
  return getChapters(subject, syllabus).find((item) => item.name === chapter)?.topics || []
}

export function createInitialSelection(syllabus = []) {
  const subject = syllabus[0]?.subject || ''
  const chapter = getChapters(subject, syllabus)[0]?.name || ''
  const topic = getTopics(subject, chapter, syllabus)[0] || ''
  return { subject, chapter, topic }
}

// Build a valid selection from URL query params, falling back to the default
// where a param is missing or doesn't match the syllabus.
export function selectionFromParams(searchParams, syllabus = []) {
  const fallback = createInitialSelection(syllabus)
  const subjectCandidate = searchParams.get('subject')
  const subject = syllabus.some((item) => item.subject === subjectCandidate) ? subjectCandidate : fallback.subject
  const chapterCandidate = searchParams.get('chapter')
  const chapter = getChapters(subject, syllabus).some((item) => item.name === chapterCandidate) ? chapterCandidate : getChapters(subject, syllabus)[0]?.name || ''
  const topicCandidate = searchParams.get('topic')
  const topic = getTopics(subject, chapter, syllabus).includes(topicCandidate) ? topicCandidate : getTopics(subject, chapter, syllabus)[0] || ''
  return { subject, chapter, topic }
}

export default function SelectionFields({ value, onChange, className = '' }) {
  const { syllabus } = useActiveCurriculum()
  const chapters = getChapters(value.subject, syllabus)
  const topics = getTopics(value.subject, value.chapter, syllabus)

  function changeSubject(subject) {
    const chapter = getChapters(subject, syllabus)[0]?.name || ''
    onChange({ subject, chapter, topic: getTopics(subject, chapter, syllabus)[0] || '' })
  }

  function changeChapter(chapter) {
    onChange({ ...value, chapter, topic: getTopics(value.subject, chapter, syllabus)[0] || '' })
  }

  return (
    <div className={`grid gap-4 md:grid-cols-3 ${className}`}>
      <label className="field-label">Subject<select className="field" value={value.subject} onChange={(event) => changeSubject(event.target.value)}>{syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}</select></label>
      <label className="field-label">Chapter<select className="field" value={value.chapter} onChange={(event) => changeChapter(event.target.value)}>{chapters.map((item, index) => <option key={item.name} value={item.name}>Chapter {index + 1}: {item.name}</option>)}</select></label>
      <label className="field-label">Topic<select className="field" value={value.topic} onChange={(event) => onChange({ ...value, topic: event.target.value })}>{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
    </div>
  )
}
