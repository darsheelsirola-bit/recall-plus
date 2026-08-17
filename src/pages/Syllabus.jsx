import { BookOpen, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '../components/PageHeader'
import SubjectCard from '../components/SubjectCard'
import TopicCard from '../components/TopicCard'
import { useAcademicProfile } from '../academic/AcademicProfileProvider'
import { useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'
import { getData, STORAGE_KEYS } from '../utils/storage'

function filterSyllabus(syllabus, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return syllabus
  return syllabus.map((item) => {
    const books = (item.books || [])
      .map((book) => ({
        ...book,
        chapters: book.chapters
          .map((chapter) => ({
            ...chapter,
            topics: chapter.topics.filter((topic) =>
              `${book.name} ${chapter.name} ${topic}`.toLowerCase().includes(normalized)),
          }))
          .filter((chapter) => chapter.topics.length || chapter.name.toLowerCase().includes(normalized)),
      }))
      .filter((book) => (
        book.chapters.length
        || book.name.toLowerCase().includes(normalized)
      ))
    const chapters = item.chapters
      .map((chapter) => ({
        ...chapter,
        topics: chapter.topics.filter((topic) =>
          `${chapter.bookName || ''} ${chapter.name} ${topic}`.toLowerCase().includes(normalized)),
      }))
      .filter((chapter) => (
        chapter.topics.length
        || chapter.name.toLowerCase().includes(normalized)
        || (chapter.bookName || '').toLowerCase().includes(normalized)
      ))
    return { ...item, books, chapters }
  }).filter((item) => (
    item.chapters.length
    || item.subject.toLowerCase().includes(normalized)
  ))
}

function ChapterList({
  chapters,
  openChapter,
  setOpenChapter,
  statusFor,
  onQuiz,
  indent = false,
}) {
  return chapters.map((chapter, index) => {
    const key = `${chapter.bookId || 'root'}:${chapter.name}`
    const expanded = openChapter === key
    return (
      <article
        key={key}
        className={`overflow-hidden rounded-xl border border-border bg-background ${indent ? 'ml-3 sm:ml-5' : ''}`}
      >
        <button
          onClick={() => setOpenChapter(expanded ? '' : key)}
          className="flex min-h-14 w-full items-center gap-3 p-3.5 text-left transition hover:bg-secondary/30"
          aria-expanded={expanded}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-primary">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{chapter.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{chapter.topics.length} topics</p>
          </div>
          <ChevronDown className={`size-4 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded ? (
          <div className="border-t border-border px-4 sm:px-5">
            {chapter.topics.map((topic) => (
              <TopicCard
                key={topic}
                topic={topic}
                status={statusFor(chapter.name, topic)}
                onQuiz={() => onQuiz(chapter, topic)}
              />
            ))}
          </div>
        ) : null}
      </article>
    )
  })
}

export default function Syllabus() {
  const { syllabus } = useActiveCurriculum()
  const { curriculumLoadingSubjectIds, loadedCurriculumSubjectIds, workspace } = useAcademicProfile()
  const [activeSubject, setActiveSubject] = useState(() => syllabus[0]?.subject || '')
  const [openChapter, setOpenChapter] = useState('')
  const [openBook, setOpenBook] = useState('')
  const [query, setQuery] = useState('')
  const { loading: curriculumLoading, error: curriculumError } = useCurriculumSubjects([activeSubject])
  const navigate = useNavigate()
  const statuses = getData(STORAGE_KEYS.topicStatuses, {})
  const results = useMemo(() => filterSyllabus(syllabus, query), [query, syllabus])
  const loadingSubjectIds = useMemo(
    () => new Set(curriculumLoadingSubjectIds),
    [curriculumLoadingSubjectIds],
  )
  const loadedSubjectIds = useMemo(
    () => new Set(loadedCurriculumSubjectIds),
    [loadedCurriculumSubjectIds],
  )
  const subjectData = results.find((item) => item.subject === activeSubject)
  const hasBooks = Boolean(subjectData?.books?.length)

  function statusFor(chapter, topic) {
    return statuses[`${activeSubject}|${chapter}|${topic}`] || 'Not Started'
  }

  function quizFor(chapter, topic) {
    const params = new URLSearchParams({
      subject: activeSubject,
      chapter: chapter.name,
      topic,
    })
    if (chapter.bookName) params.set('book', chapter.bookName)
    navigate(`/quiz?${params.toString()}`)
  }

  return (
    <>
      <PageHeader title={`Class ${workspace?.profile.grade || 'XI'} syllabus`} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {syllabus.map((item) => {
          const topicCount = item.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0)
          const studiedCount = item.chapters.reduce((sum, chapter) => sum + chapter.topics.filter((topic) => statuses[`${item.subject}|${chapter.name}|${topic}`]).length, 0)
          const curriculumState = loadingSubjectIds.has(item.subjectId)
            ? 'loading'
            : loadedSubjectIds.has(item.subjectId)
              ? 'loaded'
              : 'idle'
          return (
            <SubjectCard
              key={item.subject}
              subject={item.subject}
              chapterCount={item.chapters.length}
              topicCount={topicCount}
              studiedCount={studiedCount}
              curriculumState={curriculumState}
              contentStatus={item.contentStatus}
              onClick={() => {
                setActiveSubject(item.subject)
                setOpenChapter('')
                setOpenBook('')
              }}
            />
          )
        })}
      </section>

      <Card className="mt-4">
        <CardHeader className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{activeSubject}</CardTitle>
              <Badge variant="secondary" className="rounded-full">
                {hasBooks
                  ? `${subjectData.books.length} books · ${subjectData?.chapters.length || 0} chapters`
                  : `${subjectData?.chapters.length || 0} chapters`}
              </Badge>
            </div>
            <CardDescription>
              {hasBooks
                ? 'Browse books, then open chapters and topics.'
                : 'Open a chapter or unit to review its topics and current status.'}
            </CardDescription>
          </div>
          <div className="w-full sm:ml-auto sm:w-72 sm:justify-self-end">
            <label className="relative block">
              <span className="sr-only">Search syllabus</span>
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="field mt-0 pl-10"
                placeholder="Search books, chapters, topics"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hasBooks ? subjectData.books.map((book) => {
            const expanded = openBook === book.id || (!openBook && subjectData.books[0]?.id === book.id)
            return (
              <section key={book.id} className="overflow-hidden rounded-2xl border border-border bg-muted/15">
                <button
                  type="button"
                  onClick={() => setOpenBook(expanded ? '' : book.id)}
                  className="flex min-h-16 w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/25"
                  aria-expanded={expanded}
                >
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Book
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">{book.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{book.chapters.length} chapters</p>
                  </div>
                  <ChevronDown className={`size-4 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded ? (
                  <div className="flex flex-col gap-2 border-t border-border p-3 sm:p-4">
                    <ChapterList
                      chapters={book.chapters}
                      openChapter={openChapter}
                      setOpenChapter={setOpenChapter}
                      statusFor={statusFor}
                      onQuiz={quizFor}
                      indent
                    />
                    {!book.chapters.length ? (
                      <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                        Chapter detail pending verification against the official textbook.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            )
          }) : (
            <ChapterList
              chapters={subjectData?.chapters || []}
              openChapter={openChapter}
              setOpenChapter={setOpenChapter}
              statusFor={statusFor}
              onQuiz={quizFor}
            />
          )}
          {curriculumLoading ? (
            <p role="status" className="rounded-xl border border-border bg-secondary/35 p-4 text-sm text-muted-foreground">
              Loading {activeSubject} curriculum…
            </p>
          ) : null}
          {curriculumError ? (
            <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              {curriculumError}
            </p>
          ) : null}
          {!curriculumLoading && !subjectData?.chapters.length && !subjectData?.books?.length ? (
            <Empty className="min-h-56 border border-dashed border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><BookOpen /></EmptyMedia>
                <EmptyTitle>
                  {subjectData?.contentStatus === 'pending_verification'
                    ? 'Official outline pending verification'
                    : 'No matching curriculum items'}
                </EmptyTitle>
                <EmptyDescription>
                  {subjectData?.contentStatus === 'pending_verification'
                    ? 'This subject is selected and available across Recall+, but chapters and topics will appear only after its official CBSE syllabus has been reviewed.'
                    : 'Try a shorter or different search term.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}
