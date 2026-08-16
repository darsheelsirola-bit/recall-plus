import { AlarmClock, ArrowLeft, ArrowRight, Brain, Check, CheckCircle2, History, Layers3, Lightbulb, SlidersHorizontal, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import PageHeader from '../components/PageHeader'
import BackButton from '../components/BackButton'
import GenerationLimitStatus from '../components/GenerationLimitStatus'
import { curriculumRequestSelection, useActiveCurriculum, useCurriculumSubjects } from '../academic/activeCurriculum'
import { getChapters, getTopics, selectionFromParams } from '../components/SelectionFields'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import { generateQuizQuestions } from '../services/groqService'
import { GENERATION_LIMIT_MESSAGE } from '../types/generation'
import { getTodayDate } from '../utils/dateUtils'
import { formatStudyMinutes } from '../utils/logUtils'
import { calculateScore, createId, createQuestionStorageKey, formatClock, getTopicStatus, validateVerifiedQuizQuestions } from '../utils/quizUtils'
import {
  getData,
  getStorageUser,
  saveDataForUserOrThrow,
  saveDataOrThrow,
  STORAGE_KEYS,
} from '../utils/storage'
import { createSubmissionGuard } from '../utils/submissionGuard'

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', copy: 'Build confidence and recall the basics', tone: 'bg-accent text-mint' },
  { value: 'medium', label: 'Medium', copy: 'Apply concepts and connect ideas', tone: 'bg-amber-50 text-amber-700' },
  { value: 'hard', label: 'Hard', copy: 'Challenge deeper understanding', tone: 'bg-rose-50 text-coral' },
]

const STUDY_TIPS = [
  'Read every question fully before looking at the options.',
  'If you feel stuck, eliminate the clearly wrong choices first.',
  'Recall the concept in your own words before choosing an answer.',
  'Keep a steady pace—accuracy matters more than rushing.',
  'Use difficult questions to find what you should revise next.',
]

const TIP_ROTATION_MS = 4000

function getAvailableTopics(subject, chapters, syllabus) {
  return chapters.flatMap((chapter) => getTopics(subject, chapter, syllabus).map((topic) => ({ chapter, topic })))
}

function configStorageKey(subject, chapters, topics, difficulty, duration, questionCount) {
  return createQuestionStorageKey(
    subject,
    chapters.join(' + '),
    topics.join(' + '),
    `practice_${difficulty}_${duration}m_${questionCount}q`,
  )
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min))
}

function loadCachedQuestions(key, expectedCount) {
  const cached = getData(key, [])
  return validateVerifiedQuizQuestions(cached, expectedCount) ? cached : []
}

export default function Quiz() {
  const { curriculumVersionId, syllabus } = useActiveCurriculum()
  const [searchParams] = useSearchParams()
  const initialSelection = selectionFromParams(searchParams, syllabus)
  const [subject, setSubject] = useState(initialSelection.subject)
  const [selectedChapters, setSelectedChapters] = useState([initialSelection.chapter])
  const [selectedTopics, setSelectedTopics] = useState([initialSelection.topic])
  const [difficulty, setDifficulty] = useState('medium')
  const [duration, setDuration] = useState(30)
  const [questionCount, setQuestionCount] = useState(10)
  const [questions, setQuestions] = useState(() => loadCachedQuestions(configStorageKey(initialSelection.subject, [initialSelection.chapter], [initialSelection.topic], 'medium', 30, 10), 10))
  const [mode, setMode] = useState('setup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState(null)
  const [remaining, setRemaining] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const submitRef = useRef(() => {})
  const submissionGuardRef = useRef(createSubmissionGuard())
  const generationRef = useRef(false)
  const quizUsage = useGenerationUsage('quiz')
  const { loading: curriculumLoading, error: curriculumError } = useCurriculumSubjects([subject])

  const safeDuration = clamp(duration, 5, 180)
  const safeQuestionCount = clamp(questionCount, 5, 30)
  const availableTopics = getAvailableTopics(subject, selectedChapters, syllabus)
  const chapterLabel = selectedChapters.join(', ')
  const topicLabel = selectedTopics.join(', ')
  const curriculumSelection = curriculumRequestSelection(syllabus, subject, selectedChapters, selectedTopics)
  const storageKey = configStorageKey(subject, selectedChapters, selectedTopics, difficulty, safeDuration, safeQuestionCount)
  const ready = validateVerifiedQuizQuestions(questions, safeQuestionCount)
  const generationBlocked = quizUsage.loading || quizUsage.inProgress || quizUsage.exhausted || Boolean(quizUsage.error)
  const displayError = curriculumError || error
  const pastResultsAction = <Button variant="outline" render={<Link to="/quiz/results" />}><History data-icon="inline-start" /> View past test results</Button>

  useEffect(() => {
    if (selectedChapters.some(Boolean)) return
    const chapters = getChapters(subject, syllabus)
    if (!chapters.length) return
    const requested = selectionFromParams(searchParams, syllabus)
    const nextChapter = requested.subject === subject && requested.chapter
      ? requested.chapter
      : chapters[0].name
    const nextTopic = getTopics(subject, nextChapter, syllabus)[0] || ''
    const timer = window.setTimeout(() => {
      setSelectedChapters([nextChapter])
      setSelectedTopics([requested.subject === subject && requested.topic ? requested.topic : nextTopic])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [searchParams, selectedChapters, subject, syllabus])

  function resetForConfig(nextSubject, nextChapters, nextTopics, nextDifficulty, nextDuration, nextCount) {
    const key = configStorageKey(nextSubject, nextChapters, nextTopics, nextDifficulty, nextDuration, nextCount)
    setQuestions(loadCachedQuestions(key, nextCount))
    submissionGuardRef.current.reset()
    setMode('setup')
    setAnswers({})
    setResult(null)
    setIndex(0)
    setError('')
  }

  function changeSubject(nextSubject) {
    const firstChapter = getChapters(nextSubject, syllabus)[0]?.name || ''
    const firstTopic = getTopics(nextSubject, firstChapter, syllabus)[0] || ''
    setSubject(nextSubject)
    setSelectedChapters([firstChapter])
    setSelectedTopics([firstTopic])
    resetForConfig(nextSubject, [firstChapter], [firstTopic], difficulty, safeDuration, safeQuestionCount)
  }

  function toggleChapter(chapter) {
    if (selectedChapters.includes(chapter) && selectedChapters.length === 1) return
    const nextChapters = selectedChapters.includes(chapter)
      ? selectedChapters.filter((item) => item !== chapter)
      : [...selectedChapters, chapter]
    const allowed = getAvailableTopics(subject, nextChapters, syllabus)
    const allowedNames = new Set(allowed.map((item) => item.topic))
    const retainedTopics = selectedTopics.filter((topic) => allowedNames.has(topic))
    const nextTopics = retainedTopics.length ? retainedTopics : [allowed[0]?.topic].filter(Boolean)
    setSelectedChapters(nextChapters)
    setSelectedTopics(nextTopics)
    resetForConfig(subject, nextChapters, nextTopics, difficulty, safeDuration, safeQuestionCount)
  }

  function toggleTopic(topic) {
    if (selectedTopics.includes(topic) && selectedTopics.length === 1) return
    const nextTopics = selectedTopics.includes(topic)
      ? selectedTopics.filter((item) => item !== topic)
      : [...selectedTopics, topic]
    setSelectedTopics(nextTopics)
    resetForConfig(subject, selectedChapters, nextTopics, difficulty, safeDuration, safeQuestionCount)
  }

  function selectAllTopics() {
    const nextTopics = availableTopics.map((item) => item.topic)
    setSelectedTopics(nextTopics)
    resetForConfig(subject, selectedChapters, nextTopics, difficulty, safeDuration, safeQuestionCount)
  }

  function changeDifficulty(nextDifficulty) {
    setDifficulty(nextDifficulty)
    resetForConfig(subject, selectedChapters, selectedTopics, nextDifficulty, safeDuration, safeQuestionCount)
  }

  function changeDuration(nextDuration) {
    setDuration(nextDuration)
    resetForConfig(subject, selectedChapters, selectedTopics, difficulty, clamp(nextDuration, 5, 180), safeQuestionCount)
  }

  function changeQuestionCount(nextCount) {
    setQuestionCount(nextCount)
    resetForConfig(subject, selectedChapters, selectedTopics, difficulty, safeDuration, clamp(nextCount, 5, 30))
  }

  async function prepareAndStart() {
    if (generationRef.current || loading) return
    if (curriculumLoading) return
    if (!subject || !selectedChapters[0] || !selectedTopics[0]) {
      setError('This subject does not have a verified official outline available for quiz selection yet.')
      return
    }
    if (!ready && quizUsage.exhausted) {
      setError(GENERATION_LIMIT_MESSAGE)
      return
    }
    if (!ready && generationBlocked) return

    generationRef.current = true
    setMode('preparing')
    setLoading(true)
    setError('')
    setTipIndex(0)
    const ownerId = getStorageUser()
    try {
      if (!ready) {
        if (!curriculumSelection) throw new Error('The selected official curriculum nodes could not be verified.')
        const generated = await generateQuizQuestions(curriculumSelection, { count: safeQuestionCount, level: difficulty })
        if (!ownerId || getStorageUser() !== ownerId) return
        saveDataForUserOrThrow(ownerId, storageKey, generated)
        setQuestions(generated)
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 900))
      }
      setAnswers({})
      submissionGuardRef.current.reset()
      setIndex(0)
      setResult(null)
      setRemaining(safeDuration * 60)
      setMode('active')
    } catch (generationError) {
      setError(generationError.message)
      setMode('setup')
    } finally {
      generationRef.current = false
      setLoading(false)
    }
  }

  function submit() {
    if (!submissionGuardRef.current.claim()) return
    const summary = calculateScore(questions, answers)
    const questionReview = questions.map((question) => {
      const chosen = answers[question.id] ?? null
      return {
        id: question.id,
        difficulty: question.difficulty,
        question: question.question,
        chosen,
        answer: question.answer,
        correct: chosen === question.answer,
        explanation: question.explanation,
      }
    })
    const quizResult = {
      id: createId(),
      type: 'practice',
      date: getTodayDate(),
      completedAt: new Date().toISOString(),
      durationMinutes: safeDuration,
      difficulty,
      subject,
      curriculumVersionId,
      curriculumSubjectId: syllabus.find((item) => item.subject === subject)?.subjectId || '',
      curriculumNodeIds: curriculumSelection
        ? [...curriculumSelection.chapterNodeIds, ...curriculumSelection.topicNodeIds]
        : [],
      chapter: chapterLabel,
      topic: topicLabel,
      chapters: selectedChapters,
      topics: selectedTopics,
      questionReview,
      ...summary,
      status: getTopicStatus(summary.percentage),
    }
    try {
      saveDataOrThrow(STORAGE_KEYS.quizResults, [quizResult, ...getData(STORAGE_KEYS.quizResults, [])])
    } catch (persistenceError) {
      submissionGuardRef.current.reset()
      setError(persistenceError.message)
      return
    }
    setResult(quizResult)
    setMode('result')
  }

  useEffect(() => { submitRef.current = submit })

  useEffect(() => {
    if (mode !== 'preparing') return undefined
    const id = window.setInterval(() => setTipIndex((value) => (value + 1) % STUDY_TIPS.length), TIP_ROTATION_MS)
    return () => window.clearInterval(id)
  }, [mode])

  useEffect(() => {
    if (mode !== 'active') return undefined
    const id = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(id)
          submitRef.current()
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [mode])

  if (mode === 'preparing') {
    return (
      <section className="grid min-h-[calc(100vh-5rem)] place-items-center py-10" aria-live="polite" aria-label="Preparing your practice test">
        <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-10 text-center shadow-lift">
          <span className="relative mx-auto grid size-20 place-items-center rounded-3xl bg-secondary text-primary">
            <Brain className="size-9" />
            <span className="absolute inset-0 animate-ping rounded-3xl border border-primary/20" />
          </span>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Preparing your practice test</p>
          <h1 className="mt-3 text-3xl font-semibold">Building questions for you</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{ready ? 'Loading your saved test and setting the timer.' : `Creating ${safeQuestionCount} ${difficulty} questions across ${selectedTopics.length} selected topic${selectedTopics.length === 1 ? '' : 's'}.`}</p>
          <div className="mx-auto mt-8 h-2 max-w-md overflow-hidden rounded-full bg-secondary"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
          <div className="mx-auto mt-8 flex max-w-lg items-start gap-3 rounded-2xl bg-amber-50 p-5 text-left text-amber-950">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Quick study tip</p><p className="mt-1 min-h-12 text-sm font-medium leading-6">{STUDY_TIPS[tipIndex]}</p></div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Your test will begin automatically when it is ready.</p>
        </div>
      </section>
    )
  }

  if (mode === 'active') {
    const question = questions[index]
    const answeredCount = Object.keys(answers).length
    const lowTime = remaining <= 120
    return (
      <>
        <PageHeader title="Practice Test" />
        {displayError ? <Alert variant="destructive" className="mb-5"><X /><AlertTitle>Could not save your test</AlertTitle><AlertDescription>{displayError}</AlertDescription></Alert> : null}
        <div className="grid gap-5 lg:grid-cols-[1fr_270px]">
          <section className="panel p-8">
            <div className="flex items-center justify-between"><p className="font-semibold">Question {index + 1} of {questions.length}</p><Badge variant="outline" className="rounded-full capitalize">{question.difficulty}</Badge></div>
            <Progress value={Math.round(((index + 1) / questions.length) * 100)} className="mt-4" />
            <h2 className="mt-9 text-2xl font-semibold leading-8">{question.question}</h2>
            <div className="mt-7 grid gap-3" role="radiogroup" aria-label={`Answers for question ${index + 1}`}>{question.options.map((option, optionIndex) => { const selected = answers[question.id] === option; return <button type="button" role="radio" aria-checked={selected} key={option} onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))} className={`flex min-h-11 items-center gap-4 rounded-2xl border p-4 text-left font-medium transition ${selected ? 'border-primary bg-secondary text-primary' : 'border-border bg-card hover:border-primary/30'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs ${selected ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground'}`}>{selected ? <Check className="size-4" /> : String.fromCharCode(65 + optionIndex)}</span>{option}</button> })}</div>
            <div className="mt-9 flex items-center justify-between gap-4">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ArrowLeft data-icon="inline-start" /> Previous</Button>
              {index === questions.length - 1 ? <Button onClick={submit}>Submit test <CheckCircle2 data-icon="inline-end" /></Button> : <Button onClick={() => setIndex((value) => value + 1)}>Next question <ArrowRight data-icon="inline-end" /></Button>}
            </div>
          </section>
          <aside className="panel p-5 lg:self-start">
            <div className={`flex items-center gap-3 rounded-2xl p-4 ${lowTime ? 'bg-rose-50 text-coral' : 'bg-secondary text-primary'}`}><AlarmClock className="size-5" /><div><p className="text-2xl font-semibold tabular-nums">{formatClock(remaining)}</p><p className="text-xs opacity-70">time remaining</p></div></div>
            <h2 className="section-title mt-6">Question map</h2>
            <div className="mt-4 grid grid-cols-5 gap-3">{questions.map((item, mapIndex) => { const done = answers[item.id] !== undefined; const current = mapIndex === index; return <button type="button" key={item.id} aria-current={current ? 'step' : undefined} aria-label={`Question ${mapIndex + 1}${done ? ', answered' : ''}`} onClick={() => setIndex(mapIndex)} className={`grid min-h-11 place-items-center rounded-lg text-xs font-semibold transition ${current ? 'bg-primary text-white' : done ? 'bg-accent text-mint' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}>{mapIndex + 1}</button> })}</div>
            <p className="mt-5 text-sm font-medium">{answeredCount} / {questions.length} answered</p>
            <button type="button" className="mt-5 min-h-11 px-3 text-sm font-semibold text-primary" onClick={() => { if (window.confirm('End the test now? Unanswered questions are marked wrong.')) submit() }}>End test early</button>
          </aside>
        </div>
      </>
    )
  }

  if (mode === 'result' && result) {
    return (
      <>
        <PageHeader
          title="Test complete"
          actions={
            <BackButton
              label="Go back"
              onClick={() => resetForConfig(subject, selectedChapters, selectedTopics, difficulty, safeDuration, safeQuestionCount)}
            />
          }
        />
        <section className="rounded-3xl bg-ink p-9 text-white"><div className="grid gap-8 md:grid-cols-[240px_1fr] md:items-center"><div><p className="text-sm text-white/55">Your score</p><p className="mt-2 text-6xl font-semibold">{result.percentage}%</p><Badge className={`mt-4 rounded-full ${result.status === 'Strong' ? 'bg-mint text-white' : result.status === 'Average' ? 'bg-amber-300 text-ink' : 'bg-coral text-white'}`}>{result.status}</Badge></div><div><h2 className="text-2xl font-semibold">{result.score} of {result.totalQuestions} correct</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">{formatStudyMinutes(result.durationMinutes)} · {result.difficulty} level · {result.chapters.length} chapter{result.chapters.length === 1 ? '' : 's'} · {result.topics.length} topic{result.topics.length === 1 ? '' : 's'}</p></div></div></section>
        <div className="mt-6 flex flex-col gap-4">{questions.map((question, questionIndex) => { const correct = answers[question.id] === question.answer; return <article className="panel p-6" key={question.id}><div className="flex gap-4"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${correct ? 'bg-accent text-mint' : 'bg-rose-50 text-coral'}`}>{correct ? <Check className="size-4" /> : <X className="size-4" />}</span><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question {questionIndex + 1} · {question.difficulty}</p><h3 className="mt-1 font-semibold leading-6">{question.question}</h3><p className="mt-3 text-sm text-muted-foreground">Your answer: <strong className={correct ? 'text-mint' : 'text-coral'}>{answers[question.id] ?? 'Not answered'}</strong></p>{!correct ? <p className="mt-1 text-sm text-muted-foreground">Correct answer: <strong className="text-foreground">{question.answer}</strong></p> : null}<div className="mt-4 rounded-xl bg-secondary/50 p-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Why:</strong> {question.explanation}</div></div></div></article> })}</div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Practice Test" actions={pastResultsAction} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card>
          <CardHeader><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Layers3 className="size-5" /></span><CardTitle className="mt-3">Choose what to practise</CardTitle><CardDescription>Select one subject, then combine as many chapters and topics as you need.</CardDescription></CardHeader>
          <CardContent>
            <label className="field-label">Subject<select className="field" value={subject} onChange={(event) => changeSubject(event.target.value)}>{syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}</select></label>

            <div className="mt-6"><div className="flex items-center justify-between"><p className="field-label">Curriculum sections</p><span className="text-xs text-muted-foreground">{selectedChapters.filter(Boolean).length} selected</span></div><div className="mt-3 grid max-h-56 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">{getChapters(subject, syllabus).map((chapter, chapterIndex) => { const active = selectedChapters.includes(chapter.name); return <button type="button" key={chapter.name} aria-pressed={active} onClick={() => toggleChapter(chapter.name)} className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition ${active ? 'border-primary bg-secondary text-primary' : 'border-border bg-background hover:border-primary/30'}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs ${active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{active ? <Check className="size-3.5" /> : chapterIndex + 1}</span><span className="line-clamp-2">{chapter.name}</span></button> })}</div></div>

            <div className="mt-6"><div className="flex items-center justify-between"><p className="field-label">Topics</p><Button variant="link" size="sm" onClick={selectAllTopics}>Select all shown</Button></div><div className="mt-3 grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1">{availableTopics.map(({ chapter, topic }) => { const active = selectedTopics.includes(topic); return <button type="button" key={`${chapter}-${topic}`} aria-pressed={active} onClick={() => toggleTopic(topic)} className={`rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-secondary' : 'border-border bg-background hover:border-primary/30'}`}><span className={`text-sm font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{active ? '✓ ' : ''}{topic}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{chapter}</span></button> })}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><span className="grid size-11 place-items-center rounded-xl bg-accent text-mint"><SlidersHorizontal className="size-5" /></span><CardTitle className="mt-3">Test settings</CardTitle><CardDescription>Fine-tune the challenge before generating.</CardDescription></CardHeader>
          <CardContent>
            <fieldset><legend className="field-label">Difficulty</legend><div className="mt-3 flex flex-col gap-3">{DIFFICULTIES.map((item) => { const active = difficulty === item.value; return <button type="button" key={item.value} aria-pressed={active} onClick={() => changeDifficulty(item.value)} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-primary bg-secondary' : 'border-border bg-background hover:border-primary/30'}`}><span className={`grid size-9 place-items-center rounded-lg font-semibold ${item.tone}`}>{item.label[0]}</span><span><strong className={active ? 'text-primary' : 'text-foreground'}>{item.label}</strong><small className="mt-0.5 block text-xs text-muted-foreground">{item.copy}</small></span></button> })}</div></fieldset>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <label className="field-label">Time (minutes)<div className="relative"><Timer className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className="field mt-2 pl-10" type="number" min="5" max="180" value={duration} onChange={(event) => changeDuration(event.target.value)} /></div><span className="mt-1 block text-xs font-normal text-muted-foreground">5–180 minutes</span></label>
              <label className="field-label">Questions<input className="field" type="number" min="5" max="30" value={questionCount} onChange={(event) => changeQuestionCount(event.target.value)} /><span className="mt-1 block text-xs font-normal text-muted-foreground">5–30 questions</span></label>
            </div>

            <div className="mt-6 rounded-xl bg-ink p-4 text-white"><p className="text-xs font-medium uppercase tracking-wider text-white/45">Test summary</p><p className="mt-2 text-lg font-semibold capitalize">{difficulty} · {safeQuestionCount} questions</p><p className="mt-1 text-sm text-white/55">{formatStudyMinutes(safeDuration)} · {selectedChapters.length} chapter{selectedChapters.length === 1 ? '' : 's'} · {selectedTopics.length} topic{selectedTopics.length === 1 ? '' : 's'}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="flex items-center justify-between gap-5 p-5">
          <div>
            <p className="font-semibold">Start your {safeQuestionCount}-question test</p>
            <p className="mt-1 text-sm text-muted-foreground">{ready ? 'Your saved questions are ready. We will set up the timer and begin.' : `We'll create questions across ${selectedTopics.length} selected topic${selectedTopics.length === 1 ? '' : 's'}, then start automatically.`}</p>
            <GenerationLimitStatus feature="quiz" className="mt-3" />
          </div>
          <Button className="shrink-0" onClick={prepareAndStart} disabled={loading || (!ready && generationBlocked)}>Start test <ArrowRight data-icon="inline-end" /></Button>
        </CardContent>
        {displayError ? <div className="px-5 pb-5"><Alert variant="destructive"><X /><AlertTitle>Could not generate this test</AlertTitle><AlertDescription>{displayError} You can retry, or use saved questions if they are available.</AlertDescription></Alert></div> : null}
      </Card>
      <p className="mt-5 text-center text-xs text-muted-foreground">Practice tests do not change your recall schedule. Generated questions are saved with your Recall+ account.</p>
    </>
  )
}
