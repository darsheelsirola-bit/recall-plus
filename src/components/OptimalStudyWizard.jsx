import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import GenerationLimitStatus from './GenerationLimitStatus'
import { SUBJECT_COLORS } from '../constants/subjects'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { buildFallbackTimetable } from '../utils/studyTimetable'
import { generateOptimalTimetable } from '../services/timetableService'
import { GENERATION_LIMIT_MESSAGE } from '../types/generation'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ACTIVE_PERIODS = [
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
  ['night', 'Night'],
]
const SUBJECTS = ['Physics', 'Chemistry', 'Maths']
const CANDIDATE_TIMES = ['06:30', '09:00', '10:30', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']

const DEFAULT_PROFILE = {
  wakeTime: '06:30',
  sleepTime: '22:30',
  school: { days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '14:00' },
  tuition: { days: [0, 2, 4], startTime: '17:00', endTime: '18:30' },
  sports: { enabled: false, sessions: [{ days: [1, 3], startTime: '18:30', endTime: '19:30' }] },
  mostActivePeriod: 'evening',
  freeTimeDescription: '',
  preferredSessionMinutes: 60,
  weeklySessions: 7,
}

function DayPicker({ value = [], onChange }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {DAY_LABELS.map((label, day) => {
        const selected = value.includes(day)
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(selected ? value.filter((item) => item !== day) : [...value, day])}
            aria-pressed={selected}
            className={`min-h-11 min-w-11 rounded-full border px-3 py-2 text-xs font-semibold ${selected ? 'border-primary bg-secondary text-primary' : 'border-border text-muted-foreground'}`}
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

function minutesFromClock(value = '00:00') {
  const [hours, minutes] = String(value).split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 0
  return (hours * 60) + minutes
}

function overlaps(a, b) {
  return a.start < b.end && a.end > b.start
}

function pickSlot(existingBlocks, durationMinutes, seed = 0) {
  const duration = Math.max(30, Math.min(180, Number(durationMinutes) || 60))
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = (seed + offset) % 7
    for (const startTime of CANDIDATE_TIMES) {
      const start = minutesFromClock(startTime)
      const end = start + duration
      const hasConflict = existingBlocks.some((item) => {
        if (Number(item.weekday) !== weekday) return false
        const itemStart = minutesFromClock(item.startTime)
        const itemEnd = itemStart + (Number(item.durationMinutes) || 60)
        return overlaps({ start, end }, { start: itemStart, end: itemEnd })
      })
      if (!hasConflict) return { weekday, startTime, durationMinutes: duration }
    }
  }
  return { weekday: seed % 7, startTime: CANDIDATE_TIMES[seed % CANDIDATE_TIMES.length], durationMinutes: duration }
}

export default function OptimalStudyWizard({ open, initialProfile, onClose, onApply }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...initialProfile }))
  const [usedFallback, setUsedFallback] = useState(false)
  const [expandedSubjects, setExpandedSubjects] = useState(() => Object.fromEntries(SUBJECTS.map((subject) => [subject, true])))
  const generationRef = useRef(false)
  const dialogRef = useDialogFocus(open, onClose)
  const timetableUsage = useGenerationUsage('timetable')
  const generationBlocked = timetableUsage.loading || timetableUsage.inProgress || timetableUsage.exhausted || Boolean(timetableUsage.error)

  const stepTitle = useMemo(() => [
    'Wake and sleep time',
    'School schedule',
    'Tuition schedule',
    'Sports schedule',
    'Energy and free time',
    'Review and generate',
  ][step] || 'Preview plan', [step])

  function updateSection(section, field, value) {
    setProfile((current) => ({ ...current, [section]: { ...current[section], [field]: value } }))
  }

  function updateSports(field, value) {
    setProfile((current) => ({ ...current, sports: { ...current.sports, [field]: value } }))
  }

  async function generatePlan() {
    if (generationRef.current || loading) return
    if (timetableUsage.exhausted) {
      setError(GENERATION_LIMIT_MESSAGE)
      return
    }
    if (generationBlocked) return

    generationRef.current = true
    setLoading(true)
    setError('')
    setUsedFallback(false)
    try {
      const generated = await generateOptimalTimetable(profile)
      setResult({
        blocks: (generated.blocks || []).map((block) => ({ ...block, label: sanitizeStudyLabel(block.label, block.subject) })),
        summary: generated.summary || 'Generated using your routine.',
      })
      setStep(6)
    } catch (generationError) {
      const fallback = buildFallbackTimetable(profile)
      setResult({
        blocks: fallback.map((block) => ({ ...block, label: sanitizeStudyLabel(block.label, block.subject) })),
        summary: 'We could not reach AI right now, so we created a smart local timetable from your answers.',
      })
      setUsedFallback(true)
      setError(generationError.message)
      setStep(6)
    } finally {
      generationRef.current = false
      setLoading(false)
    }
  }

  function updateResultBlock(index, fields) {
    setResult((current) => {
      if (!current?.blocks) return current
      const nextBlocks = current.blocks.map((item, itemIndex) => (itemIndex === index ? { ...item, ...fields } : item))
      return { ...current, blocks: nextBlocks }
    })
  }

  function moveBlock(fromIndex, toIndex) {
    setResult((current) => {
      if (!current?.blocks?.length || fromIndex === toIndex || toIndex < 0 || toIndex >= current.blocks.length) return current
      const next = [...current.blocks]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return { ...current, blocks: next }
    })
  }

  function applyPlan() {
    if (!result?.blocks?.length) return
    const cleanedBlocks = result.blocks.map((block) => ({ ...block, label: sanitizeStudyLabel(block.label, block.subject) }))
    const failure = onApply?.(profile, cleanedBlocks, { summary: result.summary, fallback: usedFallback })
    if (failure) {
      setError(failure)
      return
    }
    onClose?.()
  }

  function toggleSubject(subject) {
    setExpandedSubjects((current) => ({ ...current, [subject]: !current[subject] }))
  }

  function setSubjectFrequency(subject, value) {
    const target = Math.max(0, Math.min(14, Number(value) || 0))
    setResult((current) => {
      if (!current?.blocks) return current
      const existing = current.blocks
      const forSubject = existing.filter((block) => block.subject === subject)
      if (target === forSubject.length) return current
      if (target < forSubject.length) {
        let removeCount = forSubject.length - target
        const next = [...existing].reverse().filter((block) => {
          if (block.subject !== subject || removeCount === 0) return true
          removeCount -= 1
          return false
        }).reverse()
        return { ...current, blocks: next }
      }
      const additions = Array.from({ length: target - forSubject.length }, (_, idx) => {
        const seed = forSubject.length + idx
        const slot = pickSlot(existing, profile.preferredSessionMinutes || 60, seed)
        return {
          subject,
          label: `${subject} study`,
          weekday: slot.weekday,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
        }
      })
      return { ...current, blocks: [...existing, ...additions] }
    })
  }

  const groupedPreview = useMemo(() => {
    if (!result?.blocks) return []
    return SUBJECTS.map((subject) => ({
      subject,
      slots: result.blocks
        .map((block, index) => ({ block, index }))
        .filter((item) => item.block.subject === subject),
    }))
  }, [result])

  if (!open) return null

  return (
    <div ref={dialogRef} tabIndex="-1" className="fixed inset-0 z-50 grid place-items-center overflow-x-hidden overflow-y-auto bg-ink/45 p-3 backdrop-blur-sm outline-none sm:p-4" role="dialog" aria-modal="true" aria-label="Find optimal study timetable">
      <div className="max-h-[calc(100dvh-1.5rem)] min-w-0 w-full max-w-3xl overflow-x-hidden overflow-y-auto rounded-2xl bg-card p-4 shadow-lift sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Find optimal study</p>
            <h2 className="mt-1 text-2xl font-semibold">{stepTitle}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Step {Math.min(step + 1, 7)} of 7</p>
              {step === 6 && result ? (
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${usedFallback ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-mint/25 bg-accent text-mint'}`}>
                  {usedFallback ? 'Fallback plan is ready' : 'AI plan is ready'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { if (step === 0) onClose?.(); else setStep((value) => Math.max(0, value - 1)) }}
              disabled={loading}
            >
              {step === 0 ? 'Back' : 'Previous step'}
            </Button>
            <Button type="button" data-dialog-autofocus size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close wizard"><X /></Button>
          </div>
        </div>

        {step === 0 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field-label">Wake up time<input className="field" type="time" value={profile.wakeTime} onChange={(event) => setProfile({ ...profile, wakeTime: event.target.value })} /></label>
          <label className="field-label">Sleep time<input className="field" type="time" value={profile.sleepTime} onChange={(event) => setProfile({ ...profile, sleepTime: event.target.value })} /></label>
        </div> : null}

        {step === 1 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field-label">School start<input className="field" type="time" value={profile.school.startTime} onChange={(event) => updateSection('school', 'startTime', event.target.value)} /></label>
          <label className="field-label">School end<input className="field" type="time" value={profile.school.endTime} onChange={(event) => updateSection('school', 'endTime', event.target.value)} /></label>
          <div className="sm:col-span-2"><p className="field-label">School days</p><DayPicker value={profile.school.days} onChange={(value) => updateSection('school', 'days', value)} /></div>
        </div> : null}

        {step === 2 ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field-label">Tuition start<input className="field" type="time" value={profile.tuition.startTime} onChange={(event) => updateSection('tuition', 'startTime', event.target.value)} /></label>
          <label className="field-label">Tuition end<input className="field" type="time" value={profile.tuition.endTime} onChange={(event) => updateSection('tuition', 'endTime', event.target.value)} /></label>
          <div className="sm:col-span-2"><p className="field-label">Tuition days</p><DayPicker value={profile.tuition.days} onChange={(value) => updateSection('tuition', 'days', value)} /></div>
        </div> : null}

        {step === 3 ? <div className="mt-6">
          <div className="flex items-center gap-2">
            <Button type="button" variant={profile.sports.enabled ? 'default' : 'outline'} onClick={() => updateSports('enabled', true)}>Yes, I play</Button>
            <Button type="button" variant={!profile.sports.enabled ? 'default' : 'outline'} onClick={() => updateSports('enabled', false)}>No sports</Button>
          </div>
          {profile.sports.enabled ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="field-label">Sports start<input className="field" type="time" value={profile.sports.sessions[0].startTime} onChange={(event) => updateSports('sessions', [{ ...profile.sports.sessions[0], startTime: event.target.value }])} /></label>
            <label className="field-label">Sports end<input className="field" type="time" value={profile.sports.sessions[0].endTime} onChange={(event) => updateSports('sessions', [{ ...profile.sports.sessions[0], endTime: event.target.value }])} /></label>
            <div className="sm:col-span-2"><p className="field-label">Sports days</p><DayPicker value={profile.sports.sessions[0].days} onChange={(value) => updateSports('sessions', [{ ...profile.sports.sessions[0], days: value }])} /></div>
          </div> : <p className="mt-4 rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">No sports slots will be blocked in your suggested plan.</p>}
        </div> : null}

        {step === 4 ? <div className="mt-6 grid gap-4">
          <label className="field-label">When are you most active?
            <select className="field mt-2" value={profile.mostActivePeriod} onChange={(event) => setProfile({ ...profile, mostActivePeriod: event.target.value })}>
              {ACTIVE_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field-label">When are you usually free?<textarea className="field mt-2 min-h-24" maxLength={1000} placeholder="Example: I am usually free after 7pm on weekdays and afternoons on Sunday." value={profile.freeTimeDescription} onChange={(event) => setProfile({ ...profile, freeTimeDescription: event.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field-label">Preferred session length (minutes)<input className="field mt-2" type="number" min="30" max="120" step="5" value={profile.preferredSessionMinutes} onChange={(event) => setProfile({ ...profile, preferredSessionMinutes: Number(event.target.value) || 60 })} /></label>
            <label className="field-label">Target sessions per week<input className="field mt-2" type="number" min="4" max="14" step="1" value={profile.weeklySessions} onChange={(event) => setProfile({ ...profile, weeklySessions: Number(event.target.value) || 7 })} /></label>
          </div>
        </div> : null}

        {step === 5 ? <div className="mt-6 rounded-xl bg-secondary/45 p-4 text-sm">
          <p className="font-semibold">Review your routine</p>
          <p className="mt-2">Wake {profile.wakeTime} · Sleep {profile.sleepTime}</p>
          <p>School: {profile.school.days.length} days · {profile.school.startTime}-{profile.school.endTime}</p>
          <p>Tuition: {profile.tuition.days.length} days · {profile.tuition.startTime}-{profile.tuition.endTime}</p>
          <p>Sports: {profile.sports.enabled ? `${profile.sports.sessions[0].days.length} days` : 'No'}</p>
          <p>Most active: {profile.mostActivePeriod}</p>
          <p>Preferred session: {profile.preferredSessionMinutes} min · {profile.weeklySessions} sessions/week</p>
        </div> : null}

        {step === 6 && result ? <div className="mt-4">
          {error ? <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p> : null}
          <div className="text-xs text-muted-foreground">Use subject cards below. Set frequency per week, click a subject to edit slots, and drag with the 3-line handle to reorder.</div>
          <div className="mt-3 max-h-[52vh] space-y-3 overflow-x-hidden overflow-y-auto">
            {groupedPreview.map(({ subject, slots }) => {
              const color = SUBJECT_COLORS[subject]
              const expanded = Boolean(expandedSubjects[subject])
              return (
                <section key={subject} className="min-w-0 rounded-xl border p-3" style={{ borderColor: `${color}66`, backgroundColor: `${color}10` }}>
                  <div className="flex min-w-0 w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold" style={{ color }}>{subject}</p>
                      <p className="text-xs text-muted-foreground">{slots.length} slot{slots.length === 1 ? '' : 's'} this week</p>
                    </div>
                    <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:gap-6">
                      <label className="flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span className="text-center">Frequency/week</span>
                        <input className="field h-8 w-20 !px-2 text-sm" type="number" min="0" max="14" value={slots.length} onChange={(event) => setSubjectFrequency(subject, event.target.value)} />
                      </label>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-center text-xs font-medium text-muted-foreground">Slots</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => toggleSubject(subject)}>
                          {expanded ? 'Hide slots' : 'Show slots'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="mt-3 space-y-2">
                      {slots.length ? slots.map(({ block, index }, slotPosition) => (
                        <div
                          key={`${subject}-${index}`}
                          className="rounded-lg border border-border bg-background p-2"
                        >
                          <div className="grid gap-2 sm:grid-cols-[96px_1fr_92px_108px_92px] sm:items-center">
                            <div className="flex gap-2" aria-label={`Reorder ${subject} slot`}>
                              <Button type="button" size="icon-sm" variant="outline" aria-label={`Move ${subject} slot up`} disabled={slotPosition === 0} onClick={() => moveBlock(index, slots[slotPosition - 1].index)}><ChevronUp /></Button>
                              <Button type="button" size="icon-sm" variant="outline" aria-label={`Move ${subject} slot down`} disabled={slotPosition === slots.length - 1} onClick={() => moveBlock(index, slots[slotPosition + 1].index)}><ChevronDown /></Button>
                            </div>
                            <input aria-label={`${subject} slot label`} className="field h-11 text-sm" value={sanitizeStudyLabel(block.label, subject)} onChange={(event) => updateResultBlock(index, { label: event.target.value })} />
                            <select aria-label={`${subject} slot day`} className="field h-11 text-sm" value={block.weekday} onChange={(event) => updateResultBlock(index, { weekday: Number(event.target.value) })}>{DAY_LABELS.map((label, day) => <option key={label} value={day}>{label}</option>)}</select>
                            <input aria-label={`${subject} slot start time`} className="field h-11 text-sm" type="time" value={block.startTime} onChange={(event) => updateResultBlock(index, { startTime: event.target.value })} />
                            <input aria-label={`${subject} slot duration in minutes`} className="field h-11 text-sm" type="number" min="30" max="180" step="5" value={block.durationMinutes} onChange={(event) => updateResultBlock(index, { durationMinutes: event.target.value })} />
                          </div>
                        </div>
                      )) : <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">No slots for {subject}. Increase frequency to add new study slots.</p>}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </div> : null}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <GenerationLimitStatus feature="timetable" />
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {step < 5 ? <Button type="button" onClick={() => setStep((value) => value + 1)}>Next</Button> : null}
            {step === 5 ? <Button type="button" onClick={generatePlan} disabled={loading || generationBlocked}>{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}{loading ? 'Generating plan…' : 'Generate plan'}</Button> : null}
            {step === 6 ? (
              <>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="button" variant="outline" onClick={generatePlan} disabled={loading || generationBlocked}>{loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}{loading ? 'Generating…' : 'Generate another'}</Button>
                <Button type="button" onClick={applyPlan}>Confirm and apply</Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
