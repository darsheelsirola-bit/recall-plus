import { ArrowRight, BookOpen, Bot, Brain, Loader2, Quote, RotateCcw, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '../components/PageHeader'
import { useAppData } from '../hooks/useAppData'
import { generateInsights, loadCachedInsights, saveCachedInsightsForUser } from '../services/insightService'
import { buildAiInsights } from '../utils/aiInsight'
import { formatDate, getTodayDate } from '../utils/dateUtils'
import { getData, getStorageUser, STORAGE_KEYS } from '../utils/storage'
import { buildChapterContexts, buildFallbackInsights, findWeakTopics, weakTopicsFingerprint } from '../utils/weakTopics'

function topicLink(subject, chapter, topic, type = 'practice') {
  const params = `subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&topic=${encodeURIComponent(topic)}`
  return type === 'recall' ? `/small-quiz?${params}` : `/quiz?${params}`
}

function ChapterInsightCard({ chapter }) {
  const prioritizedTopics = Array.isArray(chapter.prioritizedTopics)
    ? chapter.prioritizedTopics
    : []
  const studySections = Array.isArray(chapter.studyFrom?.sections)
    ? chapter.studyFrom.sections
    : []
  const firstTopic = prioritizedTopics[0]?.topic
  return (
    <article className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="rounded-full">{chapter.subject}</Badge>
          <h3 className="mt-2 text-lg font-semibold">{chapter.chapter}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{chapter.basedOn}</p>
        </div>
        <Badge className="rounded-full bg-rose-50 text-coral">{chapter.focusArea}</Badge>
      </div>

      <p className="mt-4 text-sm leading-7 text-foreground">{chapter.insight}</p>

      {prioritizedTopics.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Do these topics first</p>
          <ol className="mt-2 space-y-2">
            {prioritizedTopics.map((item) => (
              <li key={item.topic} className="flex gap-3 rounded-lg bg-secondary/35 px-3 py-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">{item.order}</span>
                <div>
                  <p className="font-semibold">{item.topic}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {chapter.studyFrom ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-primary" />
            Study from
          </div>
          <p className="mt-2 text-sm font-medium">{chapter.studyFrom.primary}</p>
          {studySections.length ? (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {studySections.map((section) => <li key={section}>• {section}</li>)}
            </ul>
          ) : null}
          {chapter.studyFrom.secondary ? (
            <p className="mt-3 text-xs text-muted-foreground">Also: {chapter.studyFrom.secondary}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-sm font-medium text-primary">{chapter.action}</p>

      {firstTopic ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<Link to={topicLink(chapter.subject, chapter.chapter, firstTopic, 'practice')} />}>Practice</Button>
          <Button size="sm" variant="outline" render={<Link to={topicLink(chapter.subject, chapter.chapter, firstTopic, 'recall')} />}>Recall check</Button>
          <Button size="sm" variant="ghost" render={<Link to={`/add-log?subject=${encodeURIComponent(chapter.subject)}&chapter=${encodeURIComponent(chapter.chapter)}&topic=${encodeURIComponent(firstTopic)}`} />}>Log study</Button>
        </div>
      ) : null}
    </article>
  )
}

export default function Dashboard() {
  useAppData()
  const logs = getData(STORAGE_KEYS.logs, [])
  const results = getData(STORAGE_KEYS.quizResults, [])
  const reviews = getData(STORAGE_KEYS.reviews, [])
  const statuses = getData(STORAGE_KEYS.topicStatuses, {})
  const { quote, snapshot, tips, techniques, headline: fallbackHeadline } = buildAiInsights(logs, results, reviews)

  const weakTopics = findWeakTopics(results, reviews)
  const chapterContexts = buildChapterContexts(weakTopics, { results, logs, reviews, statuses })
  const fingerprint = weakTopicsFingerprint(chapterContexts)

  const [insights, setInsights] = useState(() => loadCachedInsights(fingerprint))
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  async function fetchInsights(force = false) {
    if (!chapterContexts.length) {
      setInsights(null)
      setNotice('')
      return
    }

    if (!force) {
      const cached = loadCachedInsights(fingerprint)
      if (cached) {
        setInsights(cached)
        setNotice(cached.source?.startsWith('local')
          ? 'Showing saved insight cards built from your scores. Tap Regenerate for a fresh Groq rewrite.'
          : '')
        return
      }
    }

    setLoading(true)
    setNotice('')
    const ownerId = getStorageUser()
    try {
      const payload = await generateInsights(chapterContexts)
      if (!ownerId || getStorageUser() !== ownerId) return
      saveCachedInsightsForUser(ownerId, fingerprint, payload)
      setInsights(payload)
      if (payload.source?.startsWith('local')) {
        setNotice('Groq was busy or unreachable — showing insight cards from your saved scores. Tap Regenerate to retry.')
      }
    } catch (fetchError) {
      if (!ownerId || getStorageUser() !== ownerId) return
      const fallback = { ...buildFallbackInsights(chapterContexts), source: 'local-error' }
      saveCachedInsightsForUser(ownerId, fingerprint, fallback)
      setInsights(fallback)
      setNotice(fetchError.message || 'Could not reach Groq. Showing local insight cards instead.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchInsights(false)
    }, 0)
    return () => window.clearTimeout(timer)
    // Re-run only when weak-topic fingerprint changes, not on every array identity.
  }, [fingerprint]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayHeadline = insights?.headline || fallbackHeadline
  const hasChapterInsights = Array.isArray(insights?.chapters) && insights.chapters.length > 0

  return (
    <>
      <PageHeader
        title="AI Insight"
        description="Chapter-specific study plans based on your recall scores, practice tests, and study logs."
      />

      <section className="rounded-3xl bg-ink p-8 text-white md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="rounded-full bg-white/10 text-white hover:bg-white/10">
              <Bot className="size-3.5" /> Daily insight
            </Badge>
            <h2 className="mt-4 text-2xl font-semibold md:text-3xl">{displayHeadline}</h2>
            <p className="mt-2 text-sm text-white/55">{formatDate(getTodayDate(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {insights?.summary ? <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">{insights.summary}</p> : null}
          </div>
          <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-amber-300">
            <TrendingUp className="size-6" />
          </span>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-7">
          <div className="flex items-start gap-3">
            <Quote className="mt-1 size-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Quote of the day</p>
              <p className="mt-3 text-lg font-medium leading-8 md:text-xl">&ldquo;{quote.text}&rdquo;</p>
              <p className="mt-3 text-sm text-white/50">— {quote.author}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/45">{item.label}</p>
              <p className="mt-1 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-5 text-primary" />
                {hasChapterInsights ? 'Your weak chapters' : 'Suggested for you'}
              </CardTitle>
              <CardDescription>
                {hasChapterInsights
                  ? 'Personalised tips from your scores, missed questions, and syllabus — with book references.'
                  : 'Actionable tips based on your logs, scores, and recall schedule.'}
              </CardDescription>
            </div>
            {chapterContexts.length ? (
              <Button size="sm" variant="outline" onClick={() => fetchInsights(true)} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
                Regenerate
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {loading && !hasChapterInsights ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : null}

            {notice ? (
              <Alert variant={insights?.source?.startsWith('local') ? 'default' : 'destructive'}>
                <AlertTitle>{insights?.source?.startsWith('local') ? 'Using offline insights' : 'Could not generate AI insights'}</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            ) : null}

            {hasChapterInsights ? insights.chapters.map((chapter) => (
              <ChapterInsightCard key={`${chapter.subject}-${chapter.chapter}`} chapter={chapter} />
            )) : tips.map((tip) => (
              <div key={tip.title} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{tip.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{tip.copy}</p>
                </div>
                <Button variant="outline" className="shrink-0" render={<Link to={tip.to} />}>{tip.label}</Button>
              </div>
            ))}

            {!loading && !hasChapterInsights && !weakTopics.length && !tips.length ? (
              <p className="text-sm text-muted-foreground">Take a recall check or practice test to unlock chapter-specific AI insights.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Psychology techniques</CardTitle>
            <CardDescription>Methods matched to your current study patterns.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {techniques.map((technique) => (
              <Link
                key={technique.id}
                to={`/psychology/${technique.id}`}
                className="group rounded-xl border border-border p-4 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-secondary/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold group-hover:text-primary">{technique.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{technique.reason}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{technique.summary}</p>
              </Link>
            ))}
            <Button variant="link" className="self-start px-0" render={<Link to="/psychology" />}>
              Browse all techniques <ArrowRight data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
