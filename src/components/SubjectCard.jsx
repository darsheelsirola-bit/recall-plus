import { Atom, Calculator, FlaskConical } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

const meta = {
  Physics: { icon: Atom, className: 'bg-lavender text-indigo' },
  Chemistry: { icon: FlaskConical, className: 'bg-emerald-50 text-emerald-600' },
  Maths: { icon: Calculator, className: 'bg-amber-50 text-amber-600' },
}

export default function SubjectCard({ subject, chapterCount, topicCount, studiedCount = 0, onClick }) {
  const item = meta[subject] || meta.Maths
  const Icon = item.icon
  const percentage = topicCount ? Math.round((studiedCount / topicCount) * 100) : 0
  return (
    <Card className="transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft">
      <button onClick={onClick} className="w-full text-left">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <span className={`grid size-11 place-items-center rounded-xl ${item.className}`}><Icon className="size-5" strokeWidth={1.8} /></span>
            <span className="text-sm font-semibold tabular-nums">{percentage}%</span>
          </div>
          <h3 className="mt-4 text-base font-semibold">{subject}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{chapterCount} chapters · {topicCount} topics</p>
          <Progress value={percentage} className="mt-4" />
          <p className="mt-2 text-xs text-muted-foreground">{studiedCount} topics studied</p>
        </CardContent>
      </button>
    </Card>
  )
}
