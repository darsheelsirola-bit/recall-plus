import { GripVertical, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import GenerationLimitStatus from './GenerationLimitStatus'
import { SUBJECT_COLORS } from '../constants/subjects'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import { generateOptimalTimetable } from '../services/timetableService'
import { GENERATION_LIMIT_MESSAGE } from '../types/generation'
import { buildFallbackTimetable, normalizeTimetableBlock } from '../utils/studyTimetable'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SUBJECTS = ['Physics', 'Chemistry', 'Maths']
const DEFAULT_PROFILE = {
  wakeTime: '06:30',
  sleepTime: '22:30',
  mostActivePeriod: 'evening',
  preferredSessionMinutes: 60,
  weeklySessions: 7,
  freeTimeDescription: '',
  school: { days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '14:00' },
  tuition: { days: [0, 2, 4], startTime: '17:00', endTime: '18:30' },
  sports: { enabled: false, sessions: [] },
}

function DayPicker({ value = [], onChange, single = false }) {
  if (single) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            className={`rounded-md border px-2 py-1 text-xs ${value === day ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
            onClick={() => onChange(day)}
          >
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {DAY_LABELS.map((label, day) => {
        const selected = value.includes(day)
        return (
          <button
            key={label}
            type="button"
            className={`rounded-md border px-2 py-1 text-xs ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}
            onClick={() => {
              if (selected) onChange(value.filter((item) => item !== day))
              else onChange([...value, day].sort((a, b) => a - b))
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function sanitizeStudyLabel(label, subject) {
  const cleaned = String(label || '')
    .replace(/\b(recall|review)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || `${subject} study`
}

function viewTitle(view) {
  if (view === 'sports') return 'Sports routine'
  return 'Edit slots directly'
}

export default function EditTimetableModal({ open, blocks = [], initialProfile, onClose, onSave, onDelete }) {
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...initialProfile }))
  const [draftBlocks, setDraftBlocks] = useState(() => blocks.filter((block) => !block.techniqueId).map((block) => normalizeTimetableBlock(block)))
  const [expandedSubjects, setExpandedSubjects] = useState(() => Object.fromEntries(SUBJECTS.map((subject) => [subject, true])))
  const [draggingIndex, setDraggingIndex] = useState(null)
  const [view, setView] = useState('main')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generationRef = useRef(false)
  const timetableUsage = useGenerationUsage('timetable')
  const generationBlocked = timetableUsage.loading || timetableUsage.inProgress || timetableUsage.exhausted || Boolean(timetableUsage.error)

  const grouped = useMemo(() => SUBJECTS.map((subject) => ({
    subject,
    slots: draftBlocks.map((block, index) => ({ block, index })).filter((item) => item.block.subject === subject && !item.block.techniqueId),
  })), [draftBlocks])

  if (!open) return null

  function updateBlock(index, fields) {
    setDraftBlocks((current) => current.map((item, itemIndex) => (itemIndex === index ? normalizeTimetableBlock({ ...item, ...fields }) : item)))
  }

  function moveBlock(fromIndex, toIndex) {
    setDraftBlocks((current) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function toggleSubject(subject) {
    setExpandedSubjects((current) => ({ ...current, [subject]: !current[subject] }))
  }

  function setSubjectFrequency(subject, value) {
    const target = Math.max(0, Math.min(14, Number(value) || 0))
    setDraftBlocks((current) => {
      const existing = [...current]
      const forSubject = existing.filter((item) => item.subject === subject && !item.techniqueId)
      if (target === forSubject.length) return existing
      if (target < forSubject.length) {
        let removeCount = forSubject.length - target
        return existing.reverse().filter((item) => {
          if (item.subject !== subject || item.techniqueId || removeCount === 0) return true
          removeCount -= 1
          return false
        }).reverse()
      }
      const additions = Array.from({ length: target - forSubject.length }, (_, idx) => {
        const seed = forSubject.length + idx
        return normalizeTimetableBlock({
          subject,
          label: `${subject} study`,
          weekday: seed % 7,
          startTime: `${String(16 + (seed % 4)).padStart(2, '0')}:00`,
          durationMinutes: profile.preferredSessionMinutes || 60,
          source: 'manual',
        })
      })
      return [...existing, ...additions]
    })
  }

  function updateSportsEnabled(nextEnabled) {
    if (!nextEnabled) {
      setProfile((current) => ({
        ...current,
        sports: { enabled: false, sessions: [] },
      }))
      setView('main')
      return
    }
    setProfile((current) => {
      const existing = current.sports?.sessions?.[0]
      return {
        ...current,
        sports: {
          enabled: true,
          sessions: existing ? current.sports.sessions : [{ days: [1, 3, 5], startTime: '18:00', endTime: '19:00' }],
        },
      }
    })
    setView('sports')
  }

  function updateSportsSession(fields) {
    setProfile((current) => {
      const first = current.sports?.sessions?.[0] || { days: [], startTime: '18:00', endTime: '19:00' }
      return {
        ...current,
        sports: {
          enabled: true,
          sessions: [{ ...first, ...fields }],
        },
      }
    })
  }

  async function regenerate() {
    if (generationRef.current || loading) return
    if (timetableUsage.exhausted) {
      setError(GENERATION_LIMIT_MESSAGE)
      return
    }
    if (generationBlocked) return

    generationRef.current = true
    setLoading(true)
    setError('')
    try {
      const generated = await generateOptimalTimetable(profile)
      const next = (generated.blocks || []).map((block) => normalizeTimetableBlock({ ...block, label: sanitizeStudyLabel(block.label, block.subject) }))
      setDraftBlocks(next.filter((block) => !block.techniqueId))
    } catch (generationError) {
      const fallback = buildFallbackTimetable(profile).map((block) => normalizeTimetableBlock({ ...block, label: sanitizeStudyLabel(block.label, block.subject) }))
      setDraftBlocks(fallback.filter((block) => !block.techniqueId))
      setError(generationError.message)
    } finally {
      generationRef.current = false
      setLoading(false)
    }
  }

  function save() {
    const cleaned = draftBlocks
      .filter((block) => !block.techniqueId)
      .map((block) => normalizeTimetableBlock({ ...block, label: sanitizeStudyLabel(block.label, block.subject) }))
    const failure = onSave?.(profile, cleaned)
    if (failure) {
      setError(failure)
      return
    }
    onClose?.()
  }

  const sportsSession = profile.sports?.sessions?.[0] || { days: [], startTime: '18:00', endTime: '19:00' }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-ink/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit timetable">
      <div className="my-2 w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Edit timetable</p>
            <h2 className="mt-1 text-2xl font-semibold">{viewTitle(view)}</h2>
          </div>
        <div className="flex shrink-0 items-center gap-2">
          {view !== 'main' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setView('main')}>Back</Button>
          ) : null}
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        </div>

        {view === 'sports' ? (
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Add sports time so timetable generation avoids collisions.</p>
            <label className="field-label mt-3 block">
              Sports days
              <DayPicker value={sportsSession.days} onChange={(days) => updateSportsSession({ days })} />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="field-label">Start time<input className="field mt-1" type="time" value={sportsSession.startTime} onChange={(event) => updateSportsSession({ startTime: event.target.value })} /></label>
              <label className="field-label">End time<input className="field mt-1" type="time" value={sportsSession.endTime} onChange={(event) => updateSportsSession({ endTime: event.target.value })} /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" onClick={() => setView('main')}>Save sports details</Button>
            </div>
          </div>
        ) : null}

        {view === 'main' ? (
          <>
            <div className="mt-4 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-3 lg:grid-cols-6">
              <label className="field-label">Wake<input className="field mt-1" type="time" value={profile.wakeTime} onChange={(event) => setProfile({ ...profile, wakeTime: event.target.value })} /></label>
              <label className="field-label">Sleep<input className="field mt-1" type="time" value={profile.sleepTime} onChange={(event) => setProfile({ ...profile, sleepTime: event.target.value })} /></label>
              <label className="field-label">Active
                <select className="field mt-1" value={profile.mostActivePeriod} onChange={(event) => setProfile({ ...profile, mostActivePeriod: event.target.value })}>
                  {['morning', 'afternoon', 'evening', 'night'].map((period) => <option key={period}>{period}</option>)}
                </select>
              </label>
              <label className="field-label">Session min<input className="field mt-1" type="number" min="30" max="120" step="5" value={profile.preferredSessionMinutes} onChange={(event) => setProfile({ ...profile, preferredSessionMinutes: Number(event.target.value) || 60 })} /></label>
              <label className="field-label">Sessions/week<input className="field mt-1" type="number" min="4" max="14" value={profile.weeklySessions} onChange={(event) => setProfile({ ...profile, weeklySessions: Number(event.target.value) || 7 })} /></label>
              <div className="flex flex-col items-start justify-end gap-2">
                <Button type="button" variant="outline" onClick={regenerate} disabled={loading || generationBlocked}>{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}{loading ? 'Regenerating…' : 'Regenerate'}</Button>
                <GenerationLimitStatus feature="timetable" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4">
              <label className="field-label">
                Sports
                <select
                  className="field mt-1"
                  value={profile.sports?.enabled ? 'yes' : 'no'}
                  onChange={(event) => updateSportsEnabled(event.target.value === 'yes')}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              {profile.sports?.enabled ? <Button type="button" variant="outline" onClick={() => setView('sports')}>Edit sports details</Button> : null}
            </div>
          </>
        ) : null}

        {error ? <p className="mt-3 rounded-lg border border-coral/25 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

        {view === 'main' ? (
          <div className="mt-4 space-y-3">
            {grouped.map(({ subject, slots }) => {
              const color = SUBJECT_COLORS[subject]
              const expanded = Boolean(expandedSubjects[subject])
              return (
                <section key={subject} className="rounded-xl border p-3" style={{ borderColor: `${color}66`, backgroundColor: `${color}10` }}>
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" className="text-left" onClick={() => toggleSubject(subject)}>
                      <p className="text-sm font-semibold" style={{ color }}>{subject}</p>
                      <p className="text-xs text-muted-foreground">{slots.length} slot{slots.length === 1 ? '' : 's'} this week</p>
                    </button>
                    <div className="flex items-end gap-6">
                      <label className="flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span className="text-center">Frequency/week</span>
                        <input className="field h-8 w-20 !px-2 text-sm" type="number" min="0" max="14" value={slots.length} onChange={(event) => setSubjectFrequency(subject, event.target.value)} />
                      </label>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-center text-xs font-medium text-muted-foreground">Slots</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => toggleSubject(subject)}>{expanded ? 'Hide slots' : 'Show slots'}</Button>
                      </div>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-3 space-y-2">
                      {slots.length ? slots.map(({ block, index }) => (
                        <div
                          key={`${subject}-${index}`}
                          draggable
                          onDragStart={() => setDraggingIndex(index)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => { if (draggingIndex != null) moveBlock(draggingIndex, index); setDraggingIndex(null) }}
                          className="rounded-lg border border-border bg-background p-2"
                        >
                          <div className="grid gap-2 sm:grid-cols-[24px_1fr_92px_108px_92px] sm:items-center">
                            <button type="button" className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground" title="Move slot"><GripVertical className="size-3.5" /></button>
                            <input className="field h-8 text-sm" value={sanitizeStudyLabel(block.label, subject)} onChange={(event) => updateBlock(index, { label: event.target.value })} />
                            <select className="field h-8 text-sm" value={block.weekday} onChange={(event) => updateBlock(index, { weekday: Number(event.target.value) })}>{DAY_LABELS.map((label, day) => <option key={label} value={day}>{label}</option>)}</select>
                            <input className="field h-8 text-sm" type="time" value={block.startTime} onChange={(event) => updateBlock(index, { startTime: event.target.value })} />
                            <input className="field h-8 text-sm" type="number" min="30" max="180" step="5" value={block.durationMinutes} onChange={(event) => updateBlock(index, { durationMinutes: event.target.value })} />
                          </div>
                        </div>
                      )) : <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">No slots for {subject}. Increase frequency to add new study slots.</p>}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="destructive" onClick={onDelete}><Trash2 data-icon="inline-start" /> Delete timetable</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save}>Save timetable</Button>
        </div>
      </div>
    </div>
  )
}
