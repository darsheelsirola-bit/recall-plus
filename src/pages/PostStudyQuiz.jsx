import { ArrowRight, CalendarClock, Check, CheckCircle2, Info, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { curriculumRequestSelection, useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'
import GenerationLimitStatus from '../components/GenerationLimitStatus'
import PageHeader from '../components/PageHeader'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import { generateQuizQuestions } from '../services/groqService'
import { GENERATION_LIMIT_MESSAGE } from '../types/generation'
import { addDays, formatDate, getTodayDate } from '../utils/dateUtils'
import { calculateScore, createId, getTopicStatus, validateVerifiedQuizQuestions } from '../utils/quizUtils'
import { getPostStudyGap, upsertPostStudyRecalls } from '../utils/recallCalendar'
import {
  getData,
  getStorageUser,
  saveDataBatchOrThrow,
  saveDataForUserOrThrow,
  STORAGE_KEYS,
} from '../utils/storage'
import { createSubmissionGuard } from '../utils/submissionGuard'

function fallbackQuestions(subject, topics) {
  const focus = topics.join(', ')
  const options = ['Review the core definition', 'Ignore the underlying assumptions', 'Memorise without understanding', 'Skip checking units or conditions']
  return [
    { id: 'fallback-easy', difficulty: 'easy', question: `Which approach is the best starting point when recalling ${focus} in ${subject}?`, options, answer: options[0], explanation: 'Start from the core definition, then rebuild relationships and applications from it.' },
    { id: 'fallback-easy-2', difficulty: 'easy', question: `What is the fastest way to begin revising ${focus} before solving problems?`, options: ['List the key formulae/definitions first', 'Jump directly to hard questions', 'Read random notes', 'Skip revision'], answer: 'List the key formulae/definitions first', explanation: 'Starting from core definitions and formulas reduces confusion later.' },
    { id: 'fallback-medium-1', difficulty: 'medium', question: `What should you verify first after solving a typical ${focus} problem?`, options: ['The result satisfies the given conditions', 'The handwriting style', 'The page number', 'The length of the question'], answer: 'The result satisfies the given conditions', explanation: 'A valid solution must satisfy the conditions stated in the problem.' },
    { id: 'fallback-medium-2', difficulty: 'medium', question: `Which revision method gives the strongest evidence that you understand ${focus}?`, options: ['Explain it without notes', 'Read the same paragraph again', 'Highlight every sentence', 'Copy the answer word for word'], answer: 'Explain it without notes', explanation: 'Explaining without notes tests retrieval and reveals gaps clearly.' },
    { id: 'fallback-medium-3', difficulty: 'medium', question: `When revising ${focus}, which step improves retention most?`, options: ['Practice spaced recall across the week', 'Read once and move on', 'Memorise examples only', 'Skip mistakes review'], answer: 'Practice spaced recall across the week', explanation: 'Spacing and retrieval are proven to strengthen memory.' },
    { id: 'fallback-medium-4', difficulty: 'medium', question: `What should you do after identifying an error in a ${focus} question?`, options: ['Write the corrected method and retry a similar question', 'Ignore it and continue', 'Only read solution once', 'Switch subjects immediately'], answer: 'Write the corrected method and retry a similar question', explanation: 'Immediate correction plus application prevents repeated mistakes.' },
    { id: 'fallback-hard-1', difficulty: 'hard', question: `When two ideas in ${focus} appear to conflict, what is the strongest next step?`, options: ['Compare their assumptions and domains', 'Choose the shorter statement', 'Ignore both ideas', 'Use whichever was read last'], answer: 'Compare their assumptions and domains', explanation: 'Many apparent conflicts disappear when assumptions and valid domains are compared.' },
    { id: 'fallback-hard-2', difficulty: 'hard', question: `Which action best transfers your understanding of ${focus} to an unfamiliar question?`, options: ['Identify the governing principle before calculating', 'Search for identical wording', 'Guess from the options', 'Use every formula you remember'], answer: 'Identify the governing principle before calculating', explanation: 'Transfer begins by identifying the principle that controls the unfamiliar situation.' },
    { id: 'fallback-hard-3', difficulty: 'hard', question: `In a mixed-topic test, what best helps you apply ${focus} correctly?`, options: ['Classify the problem type before solving', 'Use the most recent formula only', 'Solve without checking assumptions', 'Answer by elimination only'], answer: 'Classify the problem type before solving', explanation: 'Problem classification helps choose the correct concept and method.' },
    { id: 'fallback-hard-4', difficulty: 'hard', question: `What strategy is strongest when a ${focus} question looks unfamiliar?`, options: ['Break it into known sub-concepts and constraints', 'Skip immediately', 'Copy a memorized pattern', 'Assume data is irrelevant'], answer: 'Break it into known sub-concepts and constraints', explanation: 'Decomposition converts unfamiliar problems into solvable chunks.' },
  ]
}

function savedPostStudyQuestions(logId) {
  const saved = getData(`post_study_questions_${logId}`, [])
  return validateVerifiedQuizQuestions(saved, 10) ? saved : null
}

export default function PostStudyQuiz() {
  const [searchParams] = useSearchParams()
  const { curriculumVersionId, isActiveRecord, syllabus } = useActiveCurriculum()
  const logId = searchParams.get('logId')
  const log = getData(STORAGE_KEYS.logs, []).find((item) => item.id === logId)
  const { loading: curriculumLoading, error: curriculumError } = useCurriculumSubjects(log ? [log.subject] : [])
  const archivedLog = Boolean(log && !isActiveRecord(log))
  const topics = log ? (Array.isArray(log.topics) && log.topics.length ? log.topics : [log.topic].filter(Boolean)) : []
  const curriculumSelection = log
    ? curriculumRequestSelection(syllabus, log.subject, [log.chapter], topics)
    : null
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(Boolean(log))
  const [mode, setMode] = useState(log ? 'loading' : 'missing')
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [result, setResult] = useState(null)
  const [dueDate, setDueDate] = useState('')
  const generationRef = useRef(false)
  const submissionGuardRef = useRef(createSubmissionGuard())
  const quizUsage = useGenerationUsage('quiz')
  const generationBlocked = quizUsage.loading || quizUsage.inProgress || quizUsage.exhausted || Boolean(quizUsage.error)

  async function buildQuiz() {
    if (!log || archivedLog || generationRef.current || (loading && mode !== 'loading')) return
    if (curriculumLoading) return
    if (curriculumError) {
      setSaveError(curriculumError)
      setLoading(false)
      setMode('missing')
      return
    }
    if (quizUsage.exhausted) {
      setQuestions(savedPostStudyQuestions(log.id) || fallbackQuestions(log.subject, topics))
      setNotice(GENERATION_LIMIT_MESSAGE)
      setLoading(false)
      setMode('active')
      return
    }
    if (quizUsage.error) {
      setQuestions(savedPostStudyQuestions(log.id) || fallbackQuestions(log.subject, topics))
      setNotice('Generation limits could not be verified, so a safe saved or local recall check is being used instead.')
      setLoading(false)
      setMode('active')
      return
    }
    if (quizUsage.loading || quizUsage.inProgress) return

    generationRef.current = true
    setLoading(true)
    setNotice('')
    setSaveError('')
    setAnswers({})
    submissionGuardRef.current.reset()
    const ownerId = getStorageUser()
    try {
      if (!curriculumSelection) throw new Error('The saved log no longer maps to active official curriculum nodes.')
      const generated = await generateQuizQuestions(curriculumSelection, {
        count: 10,
        level: 'mixed',
        purpose: 'recall',
      })
      if (!ownerId || getStorageUser() !== ownerId) return
      setQuestions(generated)
      saveDataForUserOrThrow(ownerId, `post_study_questions_${log.id}`, generated)
    } catch (error) {
      if (!ownerId || getStorageUser() !== ownerId) return
      const usable = savedPostStudyQuestions(log.id) || fallbackQuestions(log.subject, topics)
      setQuestions(usable)
      setNotice(`The AI quiz was unavailable, so a safe ten-question recall check is being used instead. Reason: ${error.message}`)
    } finally {
      generationRef.current = false
      setLoading(false)
      setMode('active')
    }
  }

  useEffect(() => {
    if (!log || archivedLog || curriculumLoading || mode !== 'loading' || quizUsage.loading || quizUsage.inProgress) return undefined
    const timer = window.setTimeout(() => buildQuiz(), 0)
    return () => window.clearTimeout(timer)
  }, [archivedLog, curriculumLoading, log?.id, mode, quizUsage.loading, quizUsage.inProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  function submitQuiz() {
    if (!submissionGuardRef.current.claim()) return
    const summary = calculateScore(questions, answers)
    const quizResult = {
      id: createId(), type: 'post-study', date: getTodayDate(), completedAt: new Date().toISOString(), sourceLogId: log.id,
      subject: log.subject, curriculumVersionId: log.curriculumVersionId || curriculumVersionId, curriculumSubjectId: log.curriculumSubjectId || null, curriculumNodeIds: curriculumSelection ? [...curriculumSelection.chapterNodeIds, ...curriculumSelection.topicNodeIds] : [], chapter: log.chapter, topic: topics.join(', '), topics,
      confidence: log.confidence, ...summary, status: getTopicStatus(summary.percentage),
    }
    const statuses = getData(STORAGE_KEYS.topicStatuses, {})
    topics.forEach((topic) => { statuses[`${log.subject}|${log.chapter}|${topic}`] = summary.percentage >= 80 ? 'Mastered' : 'Needs Revision' })
    const nextReviews = upsertPostStudyRecalls(
      getData(STORAGE_KEYS.reviews, []),
      log,
      quizResult,
      getData(STORAGE_KEYS.studyTimetable, []),
    )
    try {
      saveDataBatchOrThrow([
        [STORAGE_KEYS.quizResults, [quizResult, ...getData(STORAGE_KEYS.quizResults, [])]],
        [STORAGE_KEYS.reviews, nextReviews],
        [STORAGE_KEYS.topicStatuses, statuses],
      ])
    } catch (persistenceError) {
      submissionGuardRef.current.reset()
      setSaveError(persistenceError.message)
      return
    }
    setResult(quizResult)
    const scheduled = nextReviews.find((item) => item.quizResultId === quizResult.id)
    setDueDate(
      scheduled?.nextReviewDate
      || addDays(getTodayDate(), getPostStudyGap(summary.percentage, log.confidence, log.notes)),
    )
    setMode('result')
  }

  if (!log) return <><PageHeader title="Quick Check" description="We could not find the study session for this quiz." /><Alert variant="destructive"><X /><AlertTitle>Study log not found</AlertTitle><AlertDescription>Return to Study Logs or add a new session.</AlertDescription></Alert><div className="mt-4 flex gap-3"><Button render={<Link to="/logs" />}>Study logs</Button><Button variant="outline" render={<Link to="/add-log" />}>Add study log</Button></div></>

  if (archivedLog) return <><PageHeader title="Quick Check unavailable" description={`${log.subject} is no longer in your active curriculum.`} /><Alert><Info /><AlertTitle>Archived study session</AlertTitle><AlertDescription>This log remains in your history, but Recall+ will not generate new quizzes or revisions for a removed subject.</AlertDescription></Alert><div className="mt-4"><Button render={<Link to="/logs" />}>Back to study history</Button></div></>

  if (loading || mode === 'loading') return <><PageHeader title="Building your Quick Check" description={`${log.subject} · ${log.chapter}`} /><Card><CardContent className="space-y-4 p-8"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><p className="text-sm text-muted-foreground">Creating 2 easy, 4 moderate, and 4 hard questions from your real study topics.</p></CardContent></Card></>

  if (mode === 'result' && result) return <><PageHeader title="Recall scheduled" description={`${log.subject} · ${topics.join(', ')}`} /><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><Card className="border-0 bg-ink text-white"><CardContent className="p-7"><p className="text-sm text-white/55">Quick Check score</p><p className="mt-2 text-6xl font-semibold">{result.score}/10</p><Badge className="mt-5 bg-white/10 text-white">{log.confidence} confidence</Badge></CardContent></Card><Card><CardHeader><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><CalendarClock className="size-5" /></span><CardTitle className="mt-3 text-2xl">Next revision: {formatDate(dueDate)}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Schedule now follows active recall + spaced repetition: weaker retrieval is reviewed sooner, stronger retrieval is spaced further.</p><Button className="mt-6" render={<Link to="/recall-calendar" />}>Open Recall Calendar <ArrowRight data-icon="inline-end" /></Button></CardContent></Card></div><div className="mt-6 space-y-4">{questions.map((question, index) => { const correct = answers[question.id] === question.answer; return <Card key={question.id}><CardContent className="flex gap-4 p-5"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${correct ? 'bg-accent text-mint' : 'bg-rose-50 text-coral'}`}>{correct ? <Check className="size-4" /> : <X className="size-4" />}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question {index + 1} · {question.difficulty}</p><p className="mt-1 font-semibold">{question.question}</p><p className="mt-3 text-sm text-muted-foreground"><strong className="text-foreground">Answer:</strong> {question.answer}</p><p className="mt-1 text-sm text-muted-foreground">{question.explanation}</p></div></CardContent></Card> })}</div></>

  const allAnswered = Object.keys(answers).length === questions.length
  return (
    <>
      <PageHeader
        title="Quick Check"
        description={`${log.subject} · ${log.chapter} · ${topics.join(', ')}`}
        actions={<Badge variant="outline">{log.confidence} confidence</Badge>}
      />
      {notice ? (
        <Alert className="mb-5">
          <Info />
          <AlertTitle>Fallback quiz ready</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {saveError ? (
        <Alert variant="destructive" className="mb-5">
          <X />
          <AlertTitle>Could not save your Quick Check</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Ten questions before you move on</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">AI-generated recall check</p>
              <GenerationLimitStatus feature="quiz" className="mt-2" />
            </div>
            <Button variant="outline" onClick={buildQuiz} disabled={loading || generationBlocked}>
              <RotateCcw className={loading ? 'animate-spin' : ''} data-icon="inline-start" />
              {loading ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-7">
          {questions.map((question, index) => (
            <section key={question.id} className="border-t border-border pt-6 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Question {index + 1}</p>
                <Badge variant="outline" className="capitalize">
                  {question.difficulty === 'medium' ? 'Moderate' : question.difficulty}
                </Badge>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{question.question}</h2>
              <div className="mt-4 grid gap-2 md:grid-cols-2" role="radiogroup" aria-label={`Answers for question ${index + 1}`}>
                {question.options.map((option) => {
                  const selected = answers[question.id] === option
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={option}
                      onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left text-sm transition ${selected ? 'border-primary bg-secondary text-primary' : 'border-border hover:border-primary/40'}`}
                    >
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-border'}`}>
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>
                      {option}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          <div className="flex justify-end">
            <Button disabled={!allAnswered} onClick={submitQuiz}>
              Schedule my recall <CheckCircle2 data-icon="inline-end" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
