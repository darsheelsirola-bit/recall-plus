import { ArrowRight, CalendarClock } from 'lucide-react'
import { formatDate } from '../utils/dateUtils'

export default function ReviewCard({ review, onStart, state = 'upcoming' }) {
  const tone = state === 'overdue' ? 'bg-red-50 text-coral' : state === 'today' ? 'bg-lavender text-indigo' : 'bg-emerald-50 text-emerald-700'
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone}`}><CalendarClock size={19} /></span>
        <span className={`status-chip ${tone}`}>{state === 'today' ? 'Due today' : state === 'overdue' ? 'Overdue' : state === 'completed' ? 'Completed' : formatDate(review.nextReviewDate, { day: 'numeric', month: 'short' })}</span>
      </div>
      <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-ink/40">{review.subject} · {review.chapter}</p>
      <h3 className="mt-1 text-lg font-extrabold text-ink">{review.topic}</h3>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-ink/45">Last studied</dt><dd className="mt-1 font-bold text-ink">{formatDate(review.lastStudiedDate, { day: 'numeric', month: 'short' })}</dd></div>
        <div><dt className="text-xs text-ink/45">Last score</dt><dd className="mt-1 font-bold text-ink">{review.lastQuizScore == null ? 'Not taken' : `${review.lastQuizScore}%`}</dd></div>
        <div><dt className="text-xs text-ink/45">Confidence</dt><dd className="mt-1 font-bold text-ink">{review.confidence}</dd></div>
        <div><dt className="text-xs text-ink/45">Review no.</dt><dd className="mt-1 font-bold text-ink">{review.reviewCount + 1}</dd></div>
      </dl>
      {state !== 'completed' ? <button className="mt-5 flex items-center gap-2 text-sm font-extrabold text-indigo" onClick={onStart}>Start review <ArrowRight size={16} /></button> : null}
    </article>
  )
}
