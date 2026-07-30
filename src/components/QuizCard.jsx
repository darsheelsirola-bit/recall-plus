import { ArrowRight, Brain, CheckCircle2 } from 'lucide-react'

export default function QuizCard({ hasQuestions, loading, onGenerate, onStart, error }) {
  return (
    <div className={`rounded-2xl border p-5 ${hasQuestions ? 'border-mint/35 bg-emerald-50/60' : 'border-indigo/15 bg-lavender/50'}`}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-full ${hasQuestions ? 'bg-mint text-white' : 'bg-white text-indigo'}`}>
            {hasQuestions ? <CheckCircle2 size={23} /> : <Brain size={22} />}
          </span>
          <div><p className="font-extrabold text-ink">{hasQuestions ? '12 questions ready' : 'Create a fresh topic quiz'}</p><p className="mt-0.5 text-sm text-ink/55">{hasQuestions ? 'Saved on this device and ready anytime.' : 'Groq will create 4 easy, 4 medium, and 4 hard questions.'}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasQuestions ? <button className="btn-secondary" onClick={onGenerate} disabled={loading}>{loading ? 'Regenerating…' : 'Regenerate'}</button> : null}
          <button className="btn-primary" onClick={hasQuestions ? onStart : onGenerate} disabled={loading}>
            {loading ? 'Generating…' : hasQuestions ? 'Start Quiz' : 'Generate Quiz'} <ArrowRight size={17} />
          </button>
        </div>
      </div>
      {error ? <p className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-red-600">{error} Retry when you’re ready.</p> : null}
    </div>
  )
}
