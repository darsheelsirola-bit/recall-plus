/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo } from 'react'
import { useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'

export function getBooks(subject, syllabus = []) {
  return syllabus.find((item) => item.subject === subject)?.books || []
}

export function getChapters(subject, syllabus = [], bookName = null) {
  const subjectData = syllabus.find((item) => item.subject === subject)
  if (!subjectData) return []
  if (bookName) {
    return subjectData.books?.find((book) => book.name === bookName)?.chapters || []
  }
  return subjectData.chapters || []
}

export function getTopics(subject, chapter, syllabus = [], bookName = null) {
  return getChapters(subject, syllabus, bookName).find((item) => item.name === chapter)?.topics || []
}

function defaultBook(subjectData) {
  if (!subjectData?.books?.length) return ''
  return subjectData.books.find((book) => book.chapters.length)?.name || subjectData.books[0].name
}

export function createInitialSelection(syllabus = []) {
  const subject = syllabus[0]?.subject || ''
  const subjectData = syllabus[0]
  const book = defaultBook(subjectData)
  const chapters = getChapters(subject, syllabus, book || null)
  const chapter = chapters[0]?.name || ''
  const topic = getTopics(subject, chapter, syllabus, book || null)[0] || ''
  return { subject, book, chapter, topic }
}

export function selectionFromParams(searchParams, syllabus = []) {
  const fallback = createInitialSelection(syllabus)
  const subjectCandidate = searchParams.get('subject')
  const subject = syllabus.some((item) => item.subject === subjectCandidate)
    ? subjectCandidate
    : fallback.subject
  const subjectData = syllabus.find((item) => item.subject === subject)
  const bookCandidate = searchParams.get('book')
  const books = getBooks(subject, syllabus)
  const book = books.length
    ? (books.some((item) => item.name === bookCandidate) ? bookCandidate : defaultBook(subjectData))
    : ''
  const chapterCandidate = searchParams.get('chapter')
  const chapters = getChapters(subject, syllabus, book || null)
  const chapter = chapters.some((item) => item.name === chapterCandidate)
    ? chapterCandidate
    : chapters[0]?.name || ''
  const topicCandidate = searchParams.get('topic')
  const topics = getTopics(subject, chapter, syllabus, book || null)
  const topic = topics.includes(topicCandidate) ? topicCandidate : topics[0] || ''
  return { subject, book, chapter, topic }
}

function chapterOptionLabel(chapter, index, hasBooks) {
  if (hasBooks && chapter.bookName) {
    return `${chapter.bookName} · ${chapter.name}`
  }
  return `Chapter ${index + 1}: ${chapter.name}`
}

export default function SelectionFields({ value, onChange, className = '' }) {
  const { syllabus } = useActiveCurriculum()
  const { loading, error } = useCurriculumSubjects([value.subject])
  const subjectData = syllabus.find((item) => item.subject === value.subject)
  const books = useMemo(() => getBooks(value.subject, syllabus), [syllabus, value.subject])
  const hasBooks = books.length > 0
  const chapters = getChapters(value.subject, syllabus, hasBooks ? (value.book || null) : null)
  const topics = getTopics(value.subject, value.chapter, syllabus, hasBooks ? (value.book || null) : null)

  useEffect(() => {
    const nextBook = hasBooks
      ? (books.some((item) => item.name === value.book) ? value.book : defaultBook(subjectData))
      : ''
    const nextChapters = getChapters(value.subject, syllabus, nextBook || null)
    if (!nextChapters.length && !hasBooks) return
    const chapter = nextChapters.some((item) => item.name === value.chapter)
      ? value.chapter
      : nextChapters[0]?.name || ''
    const availableTopics = getTopics(value.subject, chapter, syllabus, nextBook || null)
    const topic = availableTopics.includes(value.topic)
      ? value.topic
      : availableTopics[0] || ''
    if (nextBook !== (value.book || '') || chapter !== value.chapter || topic !== value.topic) {
      onChange({ ...value, book: nextBook, chapter, topic })
    }
  }, [books, hasBooks, syllabus, subjectData, value, onChange])

  function changeSubject(subject) {
    const next = syllabus.find((item) => item.subject === subject)
    const book = defaultBook(next)
    const chapter = getChapters(subject, syllabus, book || null)[0]?.name || ''
    onChange({
      subject,
      book,
      chapter,
      topic: getTopics(subject, chapter, syllabus, book || null)[0] || '',
    })
  }

  function changeBook(book) {
    const chapter = getChapters(value.subject, syllabus, book || null)[0]?.name || ''
    onChange({
      ...value,
      book,
      chapter,
      topic: getTopics(value.subject, chapter, syllabus, book || null)[0] || '',
    })
  }

  function changeChapter(chapter) {
    const matched = chapters.find((item) => item.name === chapter)
    const book = hasBooks ? (matched?.bookName || value.book || '') : ''
    onChange({
      ...value,
      book,
      chapter,
      topic: getTopics(value.subject, chapter, syllabus, book || null)[0] || '',
    })
  }

  const gridCols = hasBooks ? 'md:grid-cols-4' : 'md:grid-cols-3'

  return (
    <div className={`grid gap-4 ${gridCols} ${className}`}>
      <label className="field-label">
        Subject
        <select className="field" value={value.subject} onChange={(event) => changeSubject(event.target.value)}>
          {syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}
        </select>
      </label>
      {hasBooks ? (
        <label className="field-label">
          Book
          <select className="field" value={value.book || ''} onChange={(event) => changeBook(event.target.value)}>
            {books.map((book) => (
              <option key={book.id} value={book.name}>{book.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field-label">
        {hasBooks ? 'Chapter' : 'Chapter / Unit'}
        <select className="field" value={value.chapter} onChange={(event) => changeChapter(event.target.value)}>
          {chapters.map((item, index) => (
            <option key={`${item.bookId || 'root'}:${item.name}`} value={item.name}>
              {chapterOptionLabel(item, index, false)}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Topic
        <select className="field" value={value.topic} onChange={(event) => onChange({ ...value, topic: event.target.value })}>
          {topics.map((topic) => <option key={topic}>{topic}</option>)}
        </select>
      </label>
      {loading ? <p role="status" className="text-sm text-muted-foreground md:col-span-full">Loading the selected subject curriculum…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive md:col-span-full">{error}</p> : null}
      {!loading && !error && subjectData?.contentStatus === 'pending_verification' ? (
        <p className="text-sm text-muted-foreground md:col-span-full">
          This selected subject has no verified official chapter or topic outline yet.
        </p>
      ) : null}
    </div>
  )
}
