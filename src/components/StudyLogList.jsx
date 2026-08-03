import { Clock3, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { formatDate } from '../utils/dateUtils'
import { formatStudyMinutes, getLogTopics } from '../utils/logUtils'

export default function StudyLogList({ logs, isActiveRecord = null, onEdit, emptyHint = 'Add your first study log to see it here.' }) {
  if (!logs.length) {
    return (
      <Empty className="min-h-56 border border-dashed border-border">
        <EmptyHeader><EmptyMedia variant="icon"><Clock3 /></EmptyMedia><EmptyTitle>No study logs yet</EmptyTitle><EmptyDescription>{emptyHint}</EmptyDescription></EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
      {logs.map((log) => {
        const topics = getLogTopics(log)
        const archived = typeof isActiveRecord === 'function' && !isActiveRecord(log)
        return (
          <article key={log.id} className={`rounded-xl border border-border bg-background p-4 transition ${archived ? 'opacity-75' : 'hover:border-primary/25'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold">{log.subject}</p>
                  {archived ? <Badge variant="outline" className="rounded-full">Archived subject</Badge> : null}
                  <span className="text-xs text-muted-foreground">{formatDate(log.date)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topics.length ? topics.map((topic) => <Badge key={topic} variant="secondary" className="rounded-full">{topic}</Badge>) : <span className="text-xs text-muted-foreground">No topic</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Clock3 className="size-3.5" /> {formatStudyMinutes(log.timeSpent, { compact: true })}</span>
                {onEdit && !archived ? <Button type="button" onClick={() => onEdit(log)} variant="ghost" size="icon-sm" aria-label={`Edit ${log.subject} log`}><Pencil /></Button> : null}
              </div>
            </div>
            {log.notes ? <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm leading-6 text-muted-foreground">{log.notes}</p> : null}
            {log.confidence ? <p className="mt-2 text-xs font-medium text-muted-foreground">Confidence: {log.confidence}</p> : null}
          </article>
        )
      })}
    </div>
  )
}
