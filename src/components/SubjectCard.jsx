import { BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { subjectColor } from '../constants/subjects'

export default function SubjectCard({
  subject,
  chapterCount,
  topicCount,
  studiedCount = 0,
  curriculumState = 'loaded',
  contentStatus = 'verified_outline',
  onClick,
}) {
  const color = subjectColor(subject)
  const percentage = topicCount ? Math.round((studiedCount / topicCount) * 100) : 0
  const pendingVerification = contentStatus === 'pending_verification'
  const countsReady = curriculumState === 'loaded' && !pendingVerification
  const detail = pendingVerification
    ? 'Official outline pending verification'
    : curriculumState === 'loading'
      ? 'Loading official curriculum…'
      : curriculumState === 'idle'
        ? 'Open to load official curriculum'
        : `${chapterCount} curriculum sections · ${topicCount} topics`
  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft">
      <button onClick={onClick} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${color}16`, color }}><BookOpen className="size-5" strokeWidth={1.8} /></span>
            <span className="text-sm font-semibold tabular-nums">{countsReady ? `${percentage}%` : '—'}</span>
          </div>
          <h3 className="mt-4 text-base font-semibold">{subject}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          {countsReady ? <Progress value={percentage} className="mt-4" /> : <div aria-hidden="true" className="mt-4 h-2 rounded-full bg-secondary" />}
          <p className="mt-2 text-xs text-muted-foreground">{countsReady ? `${studiedCount} topics studied` : pendingVerification ? 'No verified topics available yet' : 'Curriculum loads only when opened'}</p>
        </CardContent>
      </button>
    </Card>
  )
}
