import { ArrowRight, BookOpen, CheckCircle2, Clock3 } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useActiveCurriculum } from '../academic/activeCurriculum'
import PageHeader from '../components/PageHeader'
import { useAppData } from '../hooks/useAppData'
import { formatDate } from '../utils/dateUtils'
import { buildRecallQueue, suggestNewTopics } from '../utils/recallPlan'
import { getData, saveData, STORAGE_KEYS } from '../utils/storage'

const quizLink = ({ subject, chapter, topic }) => `/small-quiz?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&topic=${encodeURIComponent(topic)}`

export default function Recall() {
  useAppData()
  const { syllabus, isActiveRecord } = useActiveCurriculum()
  const allTopics = useMemo(() => syllabus.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => ({ subject: subject.subject, chapter: chapter.name, topic })))), [syllabus])
  const allReviews = getData(STORAGE_KEYS.reviews, [])
  const reviews = allReviews.filter(isActiveRecord)
  const logs = getData(STORAGE_KEYS.logs, []).filter(isActiveRecord)
  const queue = buildRecallQueue(reviews, logs)
  const suggestions = suggestNewTopics(allTopics, reviews, logs, 6)
  const totalMinutes = queue.reduce((sum, item) => sum + item.reviseMinutes, 0)
  const markRevised = (id) => saveData(STORAGE_KEYS.reviews, allReviews.map((review) => (review.id === id ? { ...review, completed: true } : review)))

  return (
    <>
      <PageHeader title="Recall queue" description={queue.length ? 'Review what is due, then test the memory—not the notes.' : 'Nothing is due. You can get ahead with a fresh topic.'} actions={queue.length ? <Badge variant="outline" className="rounded-full">About {totalMinutes} min</Badge> : null} />
      {queue.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queue.map((item) => (
            <Card key={item.id}>
              <CardHeader><div className="flex items-start justify-between gap-3"><Badge variant="outline" className="rounded-full">{item.subject}</Badge><Badge className={`rounded-full ${item.overdue ? 'bg-rose-50 text-coral' : 'bg-amber-50 text-amber-700'}`}>{item.overdue ? 'Overdue' : 'Today'}</Badge></div><CardTitle className="mt-2 text-lg">{item.topic}</CardTitle><CardDescription>{item.chapter}</CardDescription></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-4"><span className="grid size-10 place-items-center rounded-xl bg-card text-primary"><Clock3 className="size-4" /></span><div><p className="text-xl font-semibold">~{item.reviseMinutes} min</p><p className="text-xs text-muted-foreground">Suggested review</p></div></div>
                <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">Last score</span><span className={`font-semibold ${item.lastQuizScore == null ? 'text-muted-foreground' : item.lastQuizScore >= 80 ? 'text-mint' : item.lastQuizScore >= 50 ? 'text-amber-600' : 'text-coral'}`}>{item.lastQuizScore == null ? 'Not tested' : `${item.lastQuizScore}%`}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(item.nextReviewDate, { day: 'numeric', month: 'short' })}</p>
              </CardContent>
              <CardFooter className="gap-2 bg-transparent"><Button variant="ghost" className="flex-1" onClick={() => markRevised(item.id)}><CheckCircle2 data-icon="inline-start" /> Revised</Button><Button className="flex-1" render={<Link to={quizLink(item)} />}>Test me <ArrowRight data-icon="inline-end" /></Button></CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card className="border-0 bg-ink text-white shadow-lift"><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center"><span className="grid size-12 place-items-center rounded-xl bg-white/10"><CheckCircle2 className="size-5" /></span><div><h2 className="text-xl font-semibold">You are all caught up</h2><p className="mt-1 text-sm text-white/55">No topics are due for recall. Pick something fresh to keep moving.</p></div></CardContent></Card>
          <div className="mb-3 mt-6"><h2 className="section-title">Fresh topics</h2><p className="section-copy">Topics you have not logged or scheduled yet.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((item) => (
              <Card key={`${item.subject}-${item.chapter}-${item.topic}`}><CardHeader><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><BookOpen className="size-4" /></span><Badge variant="outline" className="mt-3 w-fit rounded-full">{item.subject}</Badge><CardTitle className="mt-2 text-lg">{item.topic}</CardTitle><CardDescription>{item.chapter}</CardDescription></CardHeader><CardFooter className="gap-2 bg-transparent"><Button variant="outline" className="flex-1" render={<Link to={`/add-log?subject=${encodeURIComponent(item.subject)}&chapter=${encodeURIComponent(item.chapter)}&topic=${encodeURIComponent(item.topic)}`} />}>Log study</Button><Button className="flex-1" render={<Link to={quizLink(item)} />}>Small quiz</Button></CardFooter></Card>
            ))}
            {!suggestions.length ? <Empty className="min-h-56 border border-dashed border-border md:col-span-2 xl:col-span-3"><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>Every topic has been touched</EmptyTitle><EmptyDescription>Take a recall check to keep your recall schedule fresh.</EmptyDescription></EmptyHeader></Empty> : null}
          </div>
        </>
      )}
    </>
  )
}
