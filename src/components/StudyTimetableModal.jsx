import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useActiveCurriculum } from '../academic/activeCurriculum'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { createTimetableBlock } from '../utils/studyTimetable'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function emptyForm(subject) {
  return {
  weekday: 0,
  startTime: '17:00',
  durationMinutes: 60,
  subject,
  label: '',
  notes: '',
  }
}

export default function StudyTimetableModal({ open, blocks = [], onClose, onAdd, onUpdate, onDelete }) {
  const { subjectNames } = useActiveCurriculum()
  const subjectOptions = subjectNames
  const [form, setForm] = useState(() => emptyForm(''))
  const formSubject = subjectOptions.includes(form.subject) ? form.subject : subjectOptions[0] || ''
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const dialogRef = useDialogFocus(open, onClose)

  const sorted = useMemo(() => [...blocks].sort((a, b) => (a.weekday - b.weekday) || a.startTime.localeCompare(b.startTime)), [blocks])

  if (!open) return null

  function addBlock(event) {
    event.preventDefault()
    if (!formSubject) return
    const block = createTimetableBlock({
      ...form,
      subject: formSubject,
      durationMinutes: Number(form.durationMinutes),
      source: 'manual',
      label: form.label.trim() || `${formSubject} study`,
    })
    onAdd?.(block)
    setForm(emptyForm(subjectNames[0] || ''))
  }

  function startEdit(block) {
    setEditingId(block.id)
    setDraft({ ...block })
  }

  function saveEdit() {
    if (!draft) return
    onUpdate?.(draft.id, { ...draft, durationMinutes: Number(draft.durationMinutes), updatedAt: new Date().toISOString() })
    setEditingId(null)
    setDraft(null)
  }

  return (
    <div ref={dialogRef} tabIndex="-1" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm outline-none" role="dialog" aria-modal="true" aria-label="Study timetable">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-6 shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Study timetable</p>
            <h2 className="mt-1 text-2xl font-semibold">Add recurring study blocks</h2>
            <p className="mt-1 text-sm text-muted-foreground">These repeat weekly and appear in your Recall Calendar.</p>
          </div>
          <Button type="button" data-dialog-autofocus size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
        </div>

        <form onSubmit={addBlock} className="mt-5 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="field-label">Day
            <select className="field mt-1" value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}>
              {DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
          </label>
          <label className="field-label">Start time<input className="field mt-1" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
          <label className="field-label">Duration (minutes)<input className="field mt-1" type="number" min="30" max="180" step="5" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></label>
          <label className="field-label">Subject
            <select className="field mt-1" value={formSubject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>
              {subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}
            </select>
          </label>
          <label className="field-label lg:col-span-2">Label<input className="field mt-1" placeholder="Focused study block" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
          <label className="field-label sm:col-span-2 lg:col-span-3">Notes (optional)<textarea className="field mt-1 min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={!formSubject}><Plus data-icon="inline-start" /> Add block</Button></div>
        </form>

        <div className="mt-5 space-y-2">
          {sorted.length ? sorted.map((block) => {
            const editing = editingId === block.id
            const view = editing ? draft : block
            return (
              <article key={block.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{DAY_LABELS[view.weekday]} · {view.startTime} · {view.durationMinutes} min</p>
                    <p className="text-xs text-muted-foreground">{view.subject} · {view.label}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => editing ? saveEdit() : startEdit(block)} title={editing ? 'Save' : 'Edit'}><Pencil /></Button>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => onDelete?.(block.id)} title="Remove"><Trash2 /></Button>
                  </div>
                </div>
                {editing ? <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <select className="field" value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>{DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select>
                  <input className="field" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} />
                  <input className="field" type="number" min="30" max="180" step="5" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} />
                  <select className="field sm:col-span-1" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })}>{subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}</select>
                  <input className="field sm:col-span-2" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
                </div> : null}
              </article>
            )
          }) : <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No timetable blocks yet. Add your first recurring study block above.</div>}
        </div>
      </div>
    </div>
  )
}
