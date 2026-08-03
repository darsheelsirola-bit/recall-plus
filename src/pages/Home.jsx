import { ArrowRight, BookOpen, Brain, Clock3, Flame, NotebookPen, Target, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import StudyTimeChart from '../components/StudyTimeChart'
import { useAuth } from '../auth/AuthProvider'
import {
  filterActiveSubjectRecords,
  useActiveCurriculum,
} from '../academic/activeCurriculum'
import { useAppData } from '../hooks/useAppData'
import { addDays, formatDate, getStudyStreak, getTodayDate, getWeekStart } from '../utils/dateUtils'
import { formatStudyMinutes, getLogTopicsLabel } from '../utils/logUtils'
import { buildRecallQueue, suggestNewTopics } from '../utils/recallPlan'
import { latestResultsByTopic } from '../utils/resultUtils'
import { getData, STORAGE_KEYS } from '../utils/storage'

function params({ subject, chapter, topic }) {
  return `subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&topic=${encodeURIComponent(topic)}`
}

function buildFocus(reviews, logs, results, allTopics) {
  const items = []
  const seen = new Set()
  const add = (entry) => {
    const key = `${entry.subject}|${entry.chapter}|${entry.topic}`
    if (!seen.has(key) && items.length < 3) {
      seen.add(key)
      items.push(entry)
    }
  }

  buildRecallQueue(reviews, logs).forEach((review) =>
    add({ label: 'Recall', ...review, meta: formatStudyMinutes(review.reviseMinutes, { compact: true }), to: `/small-quiz?${params(review)}` }),
  )

  latestResultsByTopic(results).filter((result) => result.percentage < 50).forEach((weak) =>
    add({ label: 'Practice', ...weak, meta: `${weak.percentage}%`, to: `/quiz?${params(weak)}` }),
  )

  suggestNewTopics(allTopics, reviews, logs, 3).forEach((fresh) =>
    add({ label: 'Study', ...fresh, meta: 'New', to: `/add-log?${params(fresh)}` }),
  )
  return items
}

const quickActions = [
  { label: 'Add study log', copy: 'Capture today’s session', icon: NotebookPen, to: '/add-log', tone: 'bg-primary text-white' },
  { label: 'Practice test', copy: 'Build a custom test', icon: Timer, to: '/quiz', tone: 'bg-mint text-white' },
  { label: 'Recall calendar', copy: 'Plan today and what comes next', icon: Brain, to: '/recall-calendar', tone: 'bg-coral text-white' },
  { label: 'Browse syllabus', copy: 'Choose your next topic', icon: BookOpen, to: '/syllabus', tone: 'bg-amber-500 text-white' },
]

export default function Home() {
  useAppData()
  const { profile } = useAuth()
  const { activeSubjectIds, activeSubjectNames, subjectNames, syllabus } = useActiveCurriculum()
  const logs = filterActiveSubjectRecords(getData(STORAGE_KEYS.logs, []), activeSubjectNames, activeSubjectIds)
  const reviews = filterActiveSubjectRecords(getData(STORAGE_KEYS.reviews, []), activeSubjectNames, activeSubjectIds)
  const results = filterActiveSubjectRecords(getData(STORAGE_KEYS.quizResults, []), activeSubjectNames, activeSubjectIds)
  const allTopics = syllabus.flatMap((subject) =>
    subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => ({ subject: subject.subject, chapter: chapter.name, topic }))))
  const focus = buildFocus(reviews, logs, results, allTopics)
  const dueRecallCount = buildRecallQueue(reviews, logs).length
  const primary = focus[0]
  const streak = getStudyStreak(logs)
  const todayMinutes = logs.filter((log) => log.date === getTodayDate()).reduce((sum, log) => sum + Number(log.timeSpent || 0), 0)
  const average = results.length ? Math.round(results.reduce((sum, result) => sum + result.percentage, 0) / results.length) : 0
  const weekStart = getWeekStart()
  const weekEnd = addDays(weekStart, 6)
  const weekMinutes = logs
    .filter((log) => log.date >= weekStart && log.date <= weekEnd)
    .reduce((sum, log) => sum + Number(log.timeSpent || 0), 0)
  const weeklyGoal = Math.min(100, Math.round((weekMinutes / 1200) * 100))
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const displayName = profile?.displayName?.trim() || 'Student'

  return (
    <>
      <section className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-2xl font-semibold tracking-[-0.035em] text-primary sm:text-3xl">{greeting}, {displayName}</p>
        <p className="shrink-0 text-sm font-semibold text-muted-foreground sm:text-base">{formatDate(getTodayDate(), { weekday: 'long', day: 'numeric', month: 'short' })}</p>
      </section>

      <section className="mb-4">
        <h1 className="text-[clamp(2.25rem,10vw,4.5rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-ink">
          Remember more. <span className="bg-gradient-to-r from-primary via-blue-500 to-mint bg-clip-text text-transparent">Stress less.</span>
        </h1>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card className="border-0 bg-ink text-white shadow-lift">
          <CardHeader className="gap-2 px-5 pt-5 sm:px-6 sm:pt-6">
            <Badge className="rounded-full bg-white/10 text-white hover:bg-white/10">Today’s primary focus</Badge>
            <CardTitle className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{primary?.topic || 'Choose one topic and begin'}</CardTitle>
            <CardDescription className="text-white/55">{primary ? `${primary.subject} · ${primary.chapter}` : 'Your next study session will build tomorrow’s recall queue.'}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary"><Brain className="size-5" /></span>
                <div><p className="text-sm font-semibold">{primary?.label || 'Start studying'}</p><p className="mt-0.5 text-xs text-white/50">{primary?.meta || 'Pick from your syllabus'}</p></div>
              </div>
              <Button render={<Link to={primary?.to || '/syllabus'} />} className="bg-primary text-white hover:bg-[#514AE7]">
                {primary ? 'Start session' : 'Choose a topic'} <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Study momentum</CardTitle><CardDescription>Your current pace at a glance.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
            {[
              [Clock3, formatStudyMinutes(todayMinutes, { compact: true }), 'Today', 'bg-accent text-mint'],
              [Target, `${average}%`, 'Quiz average', 'bg-secondary text-primary'],
              [Flame, streak, 'Day streak', 'bg-amber-50 text-amber-600'],
              [Brain, dueRecallCount, 'Due recalls', 'bg-rose-50 text-coral'],
            ].map(([Icon, value, label, tone]) => (
              <div key={label} className="rounded-xl border border-border bg-background p-3">
                <span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">{value}</p><p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
            <div className="col-span-2 mt-1"><div className="mb-2 flex justify-between text-xs"><span className="font-medium">Weekly goal</span><span className="text-muted-foreground">{weeklyGoal}%</span></div><Progress value={weeklyGoal} /></div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <Card>
          <CardHeader><CardTitle>Weekly momentum</CardTitle><CardDescription>Study time by subject, Monday through Sunday.</CardDescription></CardHeader>
          <CardContent><StudyTimeChart logs={logs} subjects={subjectNames} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Next up</CardTitle><CardDescription>Your three most useful next moves.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {focus.length ? focus.map((item) => (
              <Link key={`${item.label}-${item.topic}`} to={item.to} className="group flex min-h-16 items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/25 hover:bg-secondary/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Brain className="size-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.topic}</p><p className="truncate text-xs text-muted-foreground">{item.subject} · {item.label}</p></div>
                <Badge variant="secondary" className="rounded-full">{item.meta}</Badge><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            )) : (
              <Empty className="min-h-52 border border-dashed border-border"><EmptyHeader><EmptyMedia variant="icon"><Brain /></EmptyMedia><EmptyTitle>You’re caught up</EmptyTitle><EmptyDescription>Choose a fresh syllabus topic to keep your momentum going.</EmptyDescription></EmptyHeader></Empty>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4">
        <h2 className="section-title">Quick actions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(({ label, copy, icon: Icon, to, tone }) => (
            <Link key={label} to={to} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft">
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
              <div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{copy}</p></div><ArrowRight className="ml-auto size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      {logs.length ? <section className="mt-4"><Card><CardHeader><CardTitle>Most recent session</CardTitle><CardAction><Button variant="link" size="sm" render={<Link to="/logs" />}>View all</Button></CardAction></CardHeader><CardContent><div className="flex flex-col gap-2 rounded-xl bg-background p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{getLogTopicsLabel(logs[0])}</p><p className="mt-1 text-xs text-muted-foreground">{logs[0].subject} · {formatStudyMinutes(logs[0].timeSpent)}</p></div><Badge variant="outline" className="rounded-full">{logs[0].confidence} confidence</Badge></div></CardContent></Card></section> : null}
    </>
  )
}
