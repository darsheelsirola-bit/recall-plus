/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react'
import { useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'

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
  const { loading, error } = useCurriculumSubjects([value.subject])
  const subjectData = syllabus.find((item) => item.subject === value.subject)
  const chapters = getChapters(value.subject, syllabus)
  const topics = getTopics(value.subject, value.chapter, syllabus)

  useEffect(() => {
    if (!chapters.length) return
    const chapter = chapters.some((item) => item.name === value.chapter)
      ? value.chapter
      : chapters[0].name
    const availableTopics = getTopics(value.subject, chapter, syllabus)
    const topic = availableTopics.includes(value.topic)
      ? value.topic
      : availableTopics[0] || ''
    if (chapter !== value.chapter || topic !== value.topic) {
      onChange({ ...value, chapter, topic })
    }
  }, [chapters, syllabus, value, onChange])

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
      {loading ? <p role="status" className="text-sm text-muted-foreground md:col-span-3">Loading the selected subject curriculum…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive md:col-span-3">{error}</p> : null}
      {!loading && !error && subjectData?.contentStatus === 'pending_verification' ? <p className="text-sm text-muted-foreground md:col-span-3">This selected subject has no verified official chapter or topic outline yet.</p> : null}
    </div>
  )
}
