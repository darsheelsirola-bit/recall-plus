import { Award, BarChart3, BookOpen, Flame, Target } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress as ProgressBar } from '@/components/ui/progress'
import PageHeader from '../components/PageHeader'
import BackButton from '../components/BackButton'
import ProgressCard from '../components/ProgressCard'
import StudyLogList from '../components/StudyLogList'
import syllabus from '../data/syllabus.json'
import { useAppData } from '../hooks/useAppData'
import { formatDate, getStudyStreak } from '../utils/dateUtils'
import { latestResultsByTopic } from '../utils/resultUtils'
import { getData, STORAGE_KEYS } from '../utils/storage'

export default function Progress() {
  useAppData()
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const logs = getData(STORAGE_KEYS.logs, [])
  const results = getData(STORAGE_KEYS.quizResults, [])
  const statuses = getData(STORAGE_KEYS.topicStatuses, {})
  const average = results.length ? Math.round(results.reduce((sum, result) => sum + result.percentage, 0) / results.length) : 0
  const latestByTopic = latestResultsByTopic(results)
  const strong = latestByTopic.filter((item) => item.percentage >= 80)
  const weak = latestByTopic.filter((item) => item.percentage < 50)

  function toggle(target) { setView((current) => (current === target ? null : target)) }

  return (
    <>
      <PageHeader
        title={view === 'logs' ? 'All study logs' : view === 'quiz' ? 'Quiz history' : 'Learning progress'}
        actions={view ? <BackButton onClick={() => setView(null)} /> : null}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProgressCard icon={BookOpen} label="Study logs" value={logs.length} helper="sessions recorded" onClick={() => toggle('logs')} active={view === 'logs'} />
        <ProgressCard icon={BarChart3} label="Quizzes completed" value={results.length} helper="results saved" tone="mint" onClick={() => toggle('quiz')} active={view === 'quiz'} />
        <ProgressCard icon={Target} label="Average score" value={`${average}%`} helper={results.length ? 'across all quizzes' : 'take a quiz to begin'} tone="amber" />
        <ProgressCard icon={Flame} label="Study streak" value={`${getStudyStreak(logs)} days`} helper="consecutive study days" tone="coral" />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
        {view === 'logs' ? (
          <Card><CardHeader><CardTitle>All study logs</CardTitle><CardDescription>{logs.length} session{logs.length === 1 ? '' : 's'} recorded.</CardDescription></CardHeader><CardContent><StudyLogList logs={logs} onEdit={(log) => navigate(`/add-log?id=${log.id}`)} emptyHint="Log a study session to see it here." /></CardContent></Card>
        ) : view === 'quiz' ? (
          <Card>
            <CardHeader><CardTitle>Quiz history</CardTitle><CardDescription>Your most recent attempts first.</CardDescription></CardHeader>
            <CardContent>
              {results.length ? <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">{results.map((result) => (
                <div key={result.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{result.topic}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{result.subject} · {result.chapter}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(result.date)}{result.type ? ` · ${result.type}` : ''}</p></div>
                  <Badge className={`rounded-full ${result.percentage >= 80 ? 'bg-accent text-mint' : result.percentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-coral'}`}>{result.percentage}%</Badge>
                </div>
              ))}</div> : <Empty className="min-h-56 border border-dashed border-border"><EmptyHeader><EmptyMedia variant="icon"><BarChart3 /></EmptyMedia><EmptyTitle>No quizzes yet</EmptyTitle><EmptyDescription>Take a recall check or practice test to start your score history.</EmptyDescription></EmptyHeader></Empty>}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Subject progress</CardTitle><CardDescription>Topics with any active learning status.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-6">{syllabus.map((subject) => {
              const total = subject.chapters.reduce((sum, chapter) => sum + chapter.topics.length, 0)
              const studied = subject.chapters.reduce((sum, chapter) => sum + chapter.topics.filter((topic) => statuses[`${subject.subject}|${chapter.name}|${topic}`]).length, 0)
              const percentage = total ? Math.round((studied / total) * 100) : 0
              return <div key={subject.subject}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">{subject.subject}</p><p className="mt-0.5 text-xs text-muted-foreground">{studied} of {total} topics</p></div><span className="text-sm font-semibold text-primary">{percentage}%</span></div><ProgressBar value={percentage} className="mt-3" /></div>
            })}</CardContent>
          </Card>
        )}

        <Card className="border-0 bg-ink text-white shadow-lift">
          <CardHeader><span className="grid size-11 place-items-center rounded-xl bg-white/10 text-teal-300"><Award className="size-5" /></span><CardTitle className="mt-3 text-xl text-white">{strong.length ? `${strong.length} strong topic${strong.length === 1 ? '' : 's'}` : 'Your wins will collect here'}</CardTitle><CardDescription className="text-white/55">Score 80% or more to add a topic to this list.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">{strong.slice(0, 4).map((item) => <div key={`${item.subject}-${item.topic}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.topic}</p><p className="text-xs text-white/45">{item.subject}</p></div><span className="font-semibold text-teal-300">{item.percentage}%</span></div>)}{!strong.length ? <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/55">Your first strong result will feel good here.</div> : null}</CardContent>
        </Card>
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle>Weak topics</CardTitle><CardDescription>Latest quiz score below 50%.</CardDescription><CardAction><Badge className="rounded-full bg-rose-50 text-coral">{weak.length}</Badge></CardAction></CardHeader>
        <CardContent>{weak.length ? <div className="overflow-x-auto rounded-xl border border-border"><table className="data-table"><thead><tr><th>Topic</th><th>Subject</th><th>Score</th><th>Last attempt</th></tr></thead><tbody>{weak.map((item) => <tr key={`${item.subject}-${item.topic}`}><td className="font-semibold">{item.topic}</td><td>{item.subject}</td><td><Badge className="rounded-full bg-rose-50 text-coral">{item.percentage}%</Badge></td><td>{formatDate(item.date)}</td></tr>)}</tbody></table></div> : <Empty className="min-h-48 border border-dashed border-border"><EmptyHeader><EmptyMedia variant="icon"><Target /></EmptyMedia><EmptyTitle>No weak topics</EmptyTitle><EmptyDescription>This list will point you to the right practice after your first quizzes.</EmptyDescription></EmptyHeader></Empty>}</CardContent>
      </Card>
    </>
  )
}
