import { ArrowRight, Brain, Check, CheckCircle2, CalendarClock, RotateCcw, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import GenerationLimitStatus from '../components/GenerationLimitStatus'
import PageHeader from '../components/PageHeader'
import { curriculumRequestSelection, useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'
import SelectionFields, { selectionFromParams } from '../components/SelectionFields'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import { generateQuizQuestions } from '../services/groqService'
import { GENERATION_LIMIT_MESSAGE } from '../types/generation'
import { formatDate, getTodayDate } from '../utils/dateUtils'
import { SMALL_QUIZ_COUNT, calculateScore, createId, createQuestionStorageKey, getTopicStatus, validateVerifiedQuizQuestions } from '../utils/quizUtils'
import { createOrUpdateReviewData } from '../utils/spacedRepetition'
import {
  getData,
  getStorageUser,
  saveDataBatchOrThrow,
  saveDataForUserOrThrow,
  STORAGE_KEYS,
} from '../utils/storage'
import { createSubmissionGuard } from '../utils/submissionGuard'

function daysUntil(dateString) {
  const today = new Date(`${getTodayDate()}T12:00:00`)
  const target = new Date(`${dateString}T12:00:00`)
  return Math.round((target - today) / 86_400_000)
}

function recallMessage(percentage, days) {
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  if (percentage >= 80) return { tone: 'good', text: `Strong recall! You've earned a longer gap — revise this ${when}.` }
  if (percentage >= 50) return { tone: 'ok', text: `Solid, but keep it fresh — plan to revise this ${when}.` }
  return { tone: 'weak', text: `This one needs attention — revise it soon, ${when}.` }
}

export default function SmallQuiz() {
  const { curriculumVersionId, syllabus } = useActiveCurriculum()
  const [searchParams] = useSearchParams()
  const [selection, setSelection] = useState(() => selectionFromParams(searchParams, syllabus))
  const [questions, setQuestions] = useState([])
  const [mode, setMode] = useState('setup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [review, setReview] = useState(null)
  const { loading: curriculumLoading, error: curriculumError } = useCurriculumSubjects([selection.subject])
  const generationRef = useRef(false)
  const submissionGuardRef = useRef(createSubmissionGuard())
  const quizUsage = useGenerationUsage('quiz')

  const storageKey = createQuestionStorageKey(selection.subject, selection.chapter, selection.topic, 'small')
  const curriculumSelection = curriculumRequestSelection(
    syllabus,
    selection.subject,
    [selection.chapter],
    [selection.topic],
  )
  const generationBlocked = quizUsage.loading || quizUsage.inProgress || quizUsage.exhausted || Boolean(quizUsage.error)

  function changeSelection(nextSelection) {
    setSelection(nextSelection)
    setQuestions([])
    setMode('setup')
    setAnswers({})
    setResult(null)
    setReview(null)
    setError('')
    submissionGuardRef.current.reset()
  }

  async function startQuiz() {
    if (generationRef.current || loading) return
    if (curriculumLoading) return
    if (curriculumError) {
      setError(curriculumError)
      return
    }
    if (!selection.subject || !selection.chapter || !selection.topic) {
      setError('Choose a subject with a verified official curriculum outline.')
      return
    }
    const cached = getData(storageKey, [])
    if (validateVerifiedQuizQuestions(cached, SMALL_QUIZ_COUNT)) {
      setQuestions(cached)
      setAnswers({})
      submissionGuardRef.current.reset()
      setMode('active')
      return
    }
    if (quizUsage.exhausted) {
      setError(GENERATION_LIMIT_MESSAGE)
      return
    }
    if (generationBlocked) return

    generationRef.current = true
    setLoading(true)
    setError('')
    const ownerId = getStorageUser()
    try {
      if (!curriculumSelection) throw new Error('The selected official curriculum nodes could not be verified.')
      const generated = await generateQuizQuestions(curriculumSelection, {
        count: SMALL_QUIZ_COUNT,
        level: 'mixed',
        purpose: 'recall',
      })
      if (!ownerId || getStorageUser() !== ownerId) return
      saveDataForUserOrThrow(ownerId, storageKey, generated)
      setQuestions(generated)
      setAnswers({})
      submissionGuardRef.current.reset()
      setMode('active')
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      generationRef.current = false
      setLoading(false)
    }
  }

  function submit() {
    if (!submissionGuardRef.current.claim()) return
    const summary = calculateScore(questions, answers)
    const quizResult = { id: createId(), type: 'diagnostic', date: getTodayDate(), completedAt: new Date().toISOString(), ...selection, curriculumVersionId, curriculumSubjectId: syllabus.find((item) => item.subject === selection.subject)?.subjectId || '', curriculumNodeIds: curriculumSelection ? [...curriculumSelection.chapterNodeIds, ...curriculumSelection.topicNodeIds] : [], ...summary, status: getTopicStatus(summary.percentage) }
    const statuses = getData(STORAGE_KEYS.topicStatuses, {})
    statuses[`${selection.subject}|${selection.chapter}|${selection.topic}`] = summary.percentage >= 80 ? 'Mastered' : 'Needs Revision'
    const reviewUpdate = createOrUpdateReviewData(
      getData(STORAGE_KEYS.reviews, []),
      selection.subject,
      selection.chapter,
      selection.topic,
      summary.percentage,
      {
        timetable: getData(STORAGE_KEYS.studyTimetable, []),
        curriculumVersionId,
        curriculumSubjectId: quizResult.curriculumSubjectId,
      },
    )
    try {
      saveDataBatchOrThrow([
        [STORAGE_KEYS.quizResults, [quizResult, ...getData(STORAGE_KEYS.quizResults, [])]],
        [STORAGE_KEYS.topicStatuses, statuses],
        [STORAGE_KEYS.reviews, reviewUpdate.reviews],
      ])
    } catch (persistenceError) {
      submissionGuardRef.current.reset()
      setError(persistenceError.message)
      return
    }
    setResult(quizResult)
    setReview(reviewUpdate.review)
    setMode('result')
  }

  if (mode === 'active') {
    const allAnswered = Object.keys(answers).length === questions.length
    return (
      <>
        <PageHeader title="Recall check" description={`${selection.subject} · ${selection.chapter} · ${selection.topic}`} />
        {error ? <Alert variant="destructive" className="mb-5"><X /><AlertTitle>Could not save your recall check</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <section className="panel p-5 sm:p-7">
          <p className="text-sm font-bold text-ink/50">{questions.length} quick questions — answer them all to get your recall date.</p>
          <div className="mt-6 space-y-6">
            {questions.map((question, questionIndex) => (
              <div key={question.id} className="border-t border-ink/10 pt-6 first:border-0 first:pt-0">
                <div className="flex items-center justify-between"><p className="text-xs font-extrabold uppercase tracking-wider text-ink/40">Question {questionIndex + 1}</p><span className={`status-chip ${question.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700' : question.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-coral'}`}>{question.difficulty}</span></div>
                <h2 className="mt-2 text-lg font-extrabold leading-7 text-ink">{question.question}</h2>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label={`Answers for question ${questionIndex + 1}`}>{question.options.map((option, optionIndex) => { const selected = answers[question.id] === option; return <button type="button" role="radio" aria-checked={selected} key={option} onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))} className={`flex min-h-11 items-center gap-3 rounded-2xl border p-3.5 text-left text-sm font-bold transition ${selected ? 'border-indigo bg-lavender text-indigo' : 'border-ink/10 bg-white text-ink hover:border-indigo/30'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${selected ? 'border-indigo bg-indigo text-white' : 'border-ink/15 text-ink/45'}`}>{selected ? <Check size={14} /> : String.fromCharCode(65 + optionIndex)}</span>{option}</button> })}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button type="button" className="min-h-11 px-3 text-sm font-extrabold text-ink/50" onClick={() => setMode('setup')}>Cancel</button>
            <button className="btn-primary" disabled={!allAnswered} onClick={submit}>See my recall date <CheckCircle2 size={17} /></button>
          </div>
        </section>
      </>
    )
  }

  if (mode === 'result' && result && review) {
    const days = daysUntil(review.nextReviewDate)
    const message = recallMessage(result.percentage, days)
    const toneClass = message.tone === 'good' ? 'bg-mint/10 text-mint' : message.tone === 'ok' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-coral'
    return (
      <>
        <PageHeader title="Recall scheduled" description={`${selection.subject} · ${selection.topic}`} actions={<button className="btn-secondary" onClick={() => changeSelection(selection)}><RotateCcw size={17} /> Another topic</button>} />
        <section className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <div className="rounded-3xl bg-ink p-7 text-white"><p className="text-sm font-bold text-white/55">You scored</p><p className="mt-2 text-6xl font-extrabold">{result.percentage}%</p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-extrabold ${result.status === 'Strong' ? 'bg-mint text-white' : result.status === 'Average' ? 'bg-amber-300 text-ink' : 'bg-coral text-white'}`}>{result.status}</span></div>
          <div className="panel p-6">
            <div className={`flex items-center gap-3 rounded-2xl p-4 ${toneClass}`}><CalendarClock size={22} /><p className="text-sm font-bold leading-6">{message.text}</p></div>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-xs font-extrabold uppercase tracking-wider text-ink/40">Next recall</p><p className="mt-1 text-2xl font-extrabold text-ink">{formatDate(review.nextReviewDate)}</p><p className="text-sm text-ink/50">{days <= 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days away`}</p></div>
              <Link to="/recall-calendar" className="btn-primary">Open Recall Calendar <ArrowRight size={17} /></Link>
            </div>
          </div>
        </section>
        <div className="mt-6 space-y-4">{questions.map((question, questionIndex) => { const correct = answers[question.id] === question.answer; return <article className="panel p-5 sm:p-6" key={question.id}><div className="flex gap-4"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${correct ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-coral'}`}>{correct ? <Check size={18} /> : <X size={18} />}</span><div><p className="text-xs font-extrabold uppercase tracking-wider text-ink/40">Question {questionIndex + 1}</p><h3 className="mt-1 font-extrabold leading-6 text-ink">{question.question}</h3><p className="mt-3 text-sm text-ink/60">Your answer: <strong className={correct ? 'text-emerald-700' : 'text-coral'}>{answers[question.id]}</strong></p>{!correct ? <p className="mt-1 text-sm text-ink/60">Correct answer: <strong className="text-ink">{question.answer}</strong></p> : null}<div className="mt-4 rounded-xl bg-lavender/50 p-4 text-sm leading-6 text-ink/70"><strong className="text-ink">Why:</strong> {question.explanation}</div></div></div></article> })}</div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Recall check" description="A quick 5-question check. Your score sets when you should recall this topic next." />
      <section className="panel p-5 sm:p-6"><SelectionFields value={selection} onChange={changeSelection} /></section>
      <div className="panel mt-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-lavender text-indigo"><Brain size={21} /></span><div><p className="font-extrabold text-ink">5-question recall check</p><p className="mt-0.5 text-sm text-ink/55">Score well and we space it out; struggle and we bring it back sooner.</p></div></div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button className="btn-primary" onClick={startQuiz} disabled={loading || generationBlocked}>{loading ? <RotateCcw size={17} className="animate-spin" /> : <Brain size={17} />}{loading ? 'Building…' : 'Start recall check'}</button>
            <GenerationLimitStatus feature="quiz" />
          </div>
        </div>
        {loading ? <div className="mt-4 flex flex-col gap-2" aria-label="Building quiz"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div> : null}
        {error ? <Alert variant="destructive" className="mt-4"><X /><AlertTitle>Could not build this quiz</AlertTitle><AlertDescription>{error} Please retry in a moment.</AlertDescription></Alert> : null}
      </div>
      <section className="mt-6 grid gap-5 md:grid-cols-3">{[['80%+', 'Spaced further out', 'bg-mint/10 text-mint'], ['50–79%', 'Revisit soon', 'bg-amber-50 text-amber-700'], ['Below 50%', 'Bring it back fast', 'bg-red-50 text-coral']].map(([range, copy, tone]) => <div className="panel p-5" key={range}><span className={`status-chip ${tone}`}>{range}</span><p className="mt-3 font-extrabold text-ink">{copy}</p></div>)}</section>
    </>
  )
}
