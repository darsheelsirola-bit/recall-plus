import { BookOpen, ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '../components/PageHeader'
import SubjectCard from '../components/SubjectCard'
import TopicCard from '../components/TopicCard'
import { useActiveCurriculum } from '../academic/activeCurriculum'
import { getData, STORAGE_KEYS } from '../utils/storage'

export default function Syllabus() {
  const { syllabus } = useActiveCurriculum()
  const [activeSubject, setActiveSubject] = useState(() => syllabus[0]?.subject || '')
  const [openChapter, setOpenChapter] = useState(() => syllabus[0]?.chapters[0]?.name || '')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const statuses = getData(STORAGE_KEYS.topicStatuses, {})
  const results = useMemo(() => syllabus.map((item) => ({ ...item, chapters: item.chapters.map((chapter) => ({ ...chapter, topics: chapter.topics.filter((topic) => `${chapter.name} ${topic}`.toLowerCase().includes(query.toLowerCase())) })).filter((chapter) => chapter.topics.length) })), [query, syllabus])
  const subjectData = results.find((item) => item.subject === activeSubject)

  function statusFor(chapter, topic) {
    return statuses[`${activeSubject}|${chapter}|${topic}`] || 'Not Started'
  }

  return (
    <>
      <PageHeader title="Class 11 syllabus" />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {syllabus.map((item) => {
          const topicCount = item.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0)
          const studiedCount = item.chapters.reduce((sum, chapter) => sum + chapter.topics.filter((topic) => statuses[`${item.subject}|${chapter.name}|${topic}`]).length, 0)
          return <SubjectCard key={item.subject} subject={item.subject} chapterCount={item.chapters.length} topicCount={topicCount} studiedCount={studiedCount} onClick={() => { setActiveSubject(item.subject); setOpenChapter(item.chapters[0].name) }} />
        })}
      </section>

      <Card className="mt-4">
        <CardHeader className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2"><CardTitle>{activeSubject} chapters</CardTitle><Badge variant="secondary" className="rounded-full">{subjectData?.chapters.length || 0}</Badge></div>
            <CardDescription>Open a chapter to review its topics and current status.</CardDescription>
          </div>
          <div className="w-full sm:ml-auto sm:w-72 sm:justify-self-end">
            <label className="relative block"><span className="sr-only">Search topics</span><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className="field mt-0 pl-10" placeholder="Search topics" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {subjectData?.chapters.map((chapter, index) => {
            const expanded = openChapter === chapter.name
            return (
              <article key={chapter.name} className="overflow-hidden rounded-xl border border-border bg-background">
                <button onClick={() => setOpenChapter(expanded ? '' : chapter.name)} className="flex min-h-16 w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/30" aria-expanded={expanded}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{chapter.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{chapter.topics.length} topics</p></div>
                  <ChevronDown className={`size-4 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded ? <div className="border-t border-border px-4 sm:px-5">{chapter.topics.map((topic) => <TopicCard key={topic} topic={topic} status={statusFor(chapter.name, topic)} onQuiz={() => navigate(`/quiz?subject=${encodeURIComponent(activeSubject)}&chapter=${encodeURIComponent(chapter.name)}&topic=${encodeURIComponent(topic)}`)} />)}</div> : null}
              </article>
            )
          })}
          {!subjectData?.chapters.length ? <Empty className="min-h-56 border border-dashed border-border"><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{subjectData?.contentStatus === 'pending_verification' ? 'Official outline pending verification' : 'No matching curriculum items'}</EmptyTitle><EmptyDescription>{subjectData?.contentStatus === 'pending_verification' ? 'This subject is selected and available across Recall+, but chapters and topics will appear only after its official CBSE syllabus has been reviewed.' : 'Try a shorter or different search term.'}</EmptyDescription></EmptyHeader></Empty> : null}
        </CardContent>
      </Card>
    </>
  )
}
