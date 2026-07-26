import { CalendarDays, CheckCircle2, Clock3, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SUBJECT_COLORS, UNKNOWN_SUBJECT_COLOR } from '../constants/subjects'
import { addDays, formatDate, getTodayDate } from '../utils/dateUtils'

export default function RecallCalendarCard({ item, overdue = false, onComplete, onRemove, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(item.nextReviewDate)
  const [time, setTime] = useState(item.dueTime || '17:00')
  const color = SUBJECT_COLORS[item.subject] || UNKNOWN_SUBJECT_COLOR

  function saveEdit() {
    onUpdate(item.id, { nextReviewDate: date, dueTime: time, status: 'scheduled', completed: false })
    setEditing(false)
  }

  return <Card className={overdue ? 'border-coral/25 bg-rose-50/30' : ''}>
    <CardHeader>
      <div className="flex items-start justify-between gap-3"><Badge variant="outline" className="rounded-full" style={{ borderColor: `${color}55`, color }}><span className="mr-1.5 size-2 rounded-full" style={{ backgroundColor: color }} />{item.subject}</Badge><Badge className={overdue ? 'bg-rose-100 text-coral' : 'bg-secondary text-primary'}>{overdue ? 'Needs a new moment' : item.difficulty}</Badge></div>
      <CardTitle className="mt-2 text-lg">{item.topic}</CardTitle>
      <p className="text-sm text-muted-foreground">{item.chapter}</p>
    </CardHeader>
    <CardContent>
      {editing ? <div className="grid grid-cols-2 gap-3"><label className="field-label">Date<input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field-label">Time<input className="field" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><div className="col-span-2 flex gap-2"><Button size="sm" onClick={saveEdit}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></div> : <div className="space-y-3 text-sm"><div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" /><span>{formatDate(item.nextReviewDate)} at {item.dueTime || '17:00'}</span></div><div className="flex items-center gap-2 text-muted-foreground"><Clock3 className="size-4" /><span>{item.lastQuizCorrect == null ? 'No Quick Check score yet' : `${item.lastQuizCorrect}/5 · ${item.confidence} confidence`}</span></div></div>}
    </CardContent>
    {!editing ? <CardFooter className="flex-wrap gap-2 bg-transparent"><Button size="sm" onClick={() => onComplete(item.id)}><CheckCircle2 data-icon="inline-start" /> Complete</Button><Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil data-icon="inline-start" /> Edit</Button><Button size="sm" variant="ghost" onClick={() => onUpdate(item.id, { nextReviewDate: addDays(getTodayDate(), 1), status: 'scheduled', completed: false })}><RotateCcw data-icon="inline-start" /> Tomorrow</Button><Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.topic}`} onClick={() => onRemove(item.id)}><Trash2 /></Button></CardFooter> : null}
  </Card>
}
