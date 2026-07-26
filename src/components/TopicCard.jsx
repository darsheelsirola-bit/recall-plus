import { Check, Circle, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const statusStyles = {
  'Not Started': { icon: Circle, className: 'text-ink/45 bg-ink/5' },
  Studied: { icon: Check, className: 'text-indigo bg-lavender' },
  'Needs Revision': { icon: RotateCcw, className: 'text-coral bg-red-50' },
  Mastered: { icon: Check, className: 'text-emerald-700 bg-emerald-50' },
}

export default function TopicCard({ topic, status = 'Not Started', onQuiz }) {
  const style = statusStyles[status]
  const Icon = style.icon
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${style.className}`}><Icon className="size-4" strokeWidth={2} /></span>
        <div><p className="text-sm font-semibold">{topic}</p><Badge variant="outline" className="mt-1 rounded-full px-2 py-0 text-[11px] text-muted-foreground">{status}</Badge></div>
      </div>
      <Button onClick={onQuiz} variant="ghost" size="sm" className="self-start sm:self-auto">Practice</Button>
    </div>
  )
}
