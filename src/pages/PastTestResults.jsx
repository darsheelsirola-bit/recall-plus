import { CalendarDays, Clock3, FileBarChart2 } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useActiveCurriculum } from '../academic/activeCurriculum'
import BackButton from '../components/BackButton'
import PageHeader from '../components/PageHeader'
import { formatDate } from '../utils/dateUtils'
import { formatStudyMinutes } from '../utils/logUtils'
import { getData, STORAGE_KEYS } from '../utils/storage'

function getPracticeTests() {
  return getData(STORAGE_KEYS.quizResults, [])
    .filter((item) => item.type === 'practice')
    .sort((a, b) => `${b.completedAt || b.date || ''}${b.id || ''}`.localeCompare(`${a.completedAt || a.date || ''}${a.id || ''}`))
}

function formatTestDateTime(test) {
  if (!test.completedAt) return formatDate(test.date)
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(test.completedAt))
}

function DifficultyBreakdown({ questionReview = [] }) {
  const stats = questionReview.reduce((out, item) => {
    const key = item.difficulty || 'unknown'
    const group = out[key] || { total: 0, correct: 0 }
    group.total += 1
    if (item.correct) group.correct += 1
    out[key] = group
    return out
  }, {})
  const levels = ['easy', 'medium', 'hard'].filter((level) => stats[level])
  if (!levels.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {levels.map((level) => {
        const entry = stats[level]
        const percent = entry.total ? Math.round((entry.correct / entry.total) * 100) : 0
        return (
          <Card key={level}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{level}</p>
              <p className="mt-1 text-2xl font-semibold">{percent}%</p>
              <p className="text-xs text-muted-foreground">{entry.correct}/{entry.total} correct</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function PastTestDetail({ test, archived }) {
  const hasQuestionReview = Array.isArray(test.questionReview) && test.questionReview.length
  return (
    <>
      <PageHeader
        title="Past Test Analysis"
        description={`${test.subject} · ${test.chapter}`}
        actions={<BackButton to="/quiz/results" label="Back to all past tests" />}
      />
      <section className="rounded-2xl bg-ink p-6 text-white">
        <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
          <div>
            <p className="text-sm text-white/60">Final score</p>
            <p className="mt-1 text-5xl font-semibold">{test.percentage}%</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <Badge className="bg-white/10 text-white">{test.status || 'Result'}</Badge>
              {archived ? <Badge className="bg-white/10 text-white">Archived subject</Badge> : null}
            </div>
          </div>
          <div className="text-sm text-white/75">
            <p>{test.score}/{test.totalQuestions} correct · {test.difficulty} level</p>
            <p className="mt-1">{formatStudyMinutes(test.durationMinutes)} · {test.chapters?.length || 1} chapter{(test.chapters?.length || 1) === 1 ? '' : 's'} · {test.topics?.length || 1} topic{(test.topics?.length || 1) === 1 ? '' : 's'}</p>
            <p className="mt-1">Taken on {formatTestDateTime(test)}</p>
          </div>
        </div>
      </section>

      {hasQuestionReview ? (
        <>
          <div className="mt-5">
            <h2 className="text-lg font-semibold">Performance by difficulty</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use this to see where your understanding is strongest and where more recall is needed.</p>
            <div className="mt-3">
              <DifficultyBreakdown questionReview={test.questionReview} />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <h2 className="text-lg font-semibold">Question-by-question analysis</h2>
            {test.questionReview.map((item, index) => (
              <Card key={item.id || `${item.question}-${index}`}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question {index + 1} · {item.difficulty}</p>
                  <p className="mt-1 font-semibold">{item.question}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Your answer: <strong className={item.correct ? 'text-mint' : 'text-coral'}>{item.chosen || 'Not answered'}</strong></p>
                  {!item.correct ? <p className="text-sm text-muted-foreground">Correct answer: <strong className="text-foreground">{item.answer}</strong></p> : null}
                  <p className="mt-2 rounded-lg bg-secondary/70 p-3 text-sm text-muted-foreground"><strong className="text-foreground">Explanation:</strong> {item.explanation}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Alert className="mt-5">
          <FileBarChart2 />
          <AlertTitle>Detailed analysis unavailable for this old test</AlertTitle>
          <AlertDescription>This test was saved before detailed question tracking was added. New tests will include full analysis here.</AlertDescription>
        </Alert>
      )}
    </>
  )
}

export default function PastTestResults() {
  const { resultId } = useParams()
  const { isActiveRecord } = useActiveCurriculum()
  const tests = getPracticeTests()
  if (!resultId) {
    return (
      <>
        <PageHeader
          title="Past Test Results"
          description="Open any test to view full analysis and question-level performance."
          actions={<BackButton to="/quiz" label="Back to Practice Test" />}
        />
        {tests.length ? (
          <div className="space-y-3">
            {tests.map((test) => (
              <Link key={test.id} to={`/quiz/results/${test.id}`} className="block">
                <Card className={`transition hover:-translate-y-0.5 hover:shadow-md ${isActiveRecord(test) ? '' : 'opacity-75'}`}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-lg">{test.subject} · {test.chapter}</CardTitle>
                      <div className="flex flex-wrap gap-2.5">
                        {!isActiveRecord(test) ? <Badge variant="outline">Archived subject</Badge> : null}
                        <Badge variant="outline">{test.percentage}%</Badge>
                      </div>
                    </div>
                    <CardDescription>{test.topic}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" /> {formatTestDateTime(test)}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="size-4" /> {formatStudyMinutes(test.durationMinutes, { compact: true })}</span>
                      <span>{test.score}/{test.totalQuestions} correct</span>
                      <span className="capitalize">{test.difficulty}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Alert>
            <AlertTitle>No past practice tests yet</AlertTitle>
            <AlertDescription>Complete a practice test first, then come back here for analysis.</AlertDescription>
          </Alert>
        )}
      </>
    )
  }

  const test = tests.find((item) => item.id === resultId)
  if (!test) return <Navigate to="/quiz/results" replace />
  return <PastTestDetail test={test} archived={!isActiveRecord(test)} />
}
