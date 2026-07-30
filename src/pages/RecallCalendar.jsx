import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import EditTimetableModal from '../components/EditTimetableModal'
import GenerationLimitStatus from '../components/GenerationLimitStatus'
import OptimalStudyWizard from '../components/OptimalStudyWizard'
import { SUBJECT_COLORS, UNKNOWN_SUBJECT_COLOR } from '../constants/subjects'
import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import syllabus from '../data/syllabus.json'
import { useAppData } from '../hooks/useAppData'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { CALENDAR_SUBJECTS, countOverdueRecalls, createRecallItem, normalizeRecallItem, spreadRecallTimes } from '../utils/recallCalendar'
import { addDays, formatDate, getTodayDate, toDateOnly } from '../utils/dateUtils'
import { formatStudyMinutes } from '../utils/logUtils'
import { buildFallbackTimetable, getBlocksForDate, mergeTimetableBlocks, normalizeTimetableBlock } from '../utils/studyTimetable'
import {
  getData,
  saveDataBatchOrThrow,
  saveDataOrThrow,
  STORAGE_KEYS,
} from '../utils/storage'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FILTERS = ['All', ...CALENDAR_SUBJECTS]
const HOURS = Array.from({ length: 24 }, (_, index) => index)
const HOUR_HEIGHT = 48

function weekRows(rangeStartDate) {
  const monthStart = new Date(`${rangeStartDate.slice(0, 7)}-01T12:00:00`)
  const firstWeekStart = new Date(monthStart)
  firstWeekStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7))

  const endMonthLastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12)
  const lastWeekEnd = new Date(endMonthLastDay)
  const weekday = (endMonthLastDay.getDay() + 6) % 7
  lastWeekEnd.setDate(endMonthLastDay.getDate() + (6 - weekday))

  const rows = []
  for (let cursor = new Date(firstWeekStart); cursor <= lastWeekEnd; cursor.setDate(cursor.getDate() + 7)) {
    const weekStart = new Date(cursor)
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + dayIndex)
      return {
        date: toDateOnly(date),
        day: date.getDate(),
      }
    })
    rows.push({ weekStart: toDateOnly(weekStart), days })
  }
  return rows
}

function monthTitle(cursor) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(cursor)
}

function RecallEvent({ item, onClick }) {
  const color = SUBJECT_COLORS[item.subject] || UNKNOWN_SUBJECT_COLOR
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] transition hover:brightness-95"
      style={{ backgroundColor: `${color}16`, color }}
      title={`${item.dueTime} · ${item.topic}`}
    >
      <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate font-semibold">{item.dueTime} {item.topic}</span>
    </button>
  )
}

function TimetablePill({ block }) {
  const color = SUBJECT_COLORS[block.subject] || UNKNOWN_SUBJECT_COLOR
  return (
    <div
      className="rounded border border-dashed px-1.5 py-1 text-[10px] font-semibold"
      style={{ borderColor: `${color}80`, backgroundColor: `${color}14`, color }}
    >
      {block.startTime} {block.label}
    </div>
  )
}

function matchesTimetableFilter(block, filter) {
  if (filter === 'All') return true
  if (block.techniqueId) return false
  return block.subject === filter
}

function minutesFromTime(value = '00:00') {
  const [hours, minutes] = String(value).split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 0
  return (hours * 60) + minutes
}

function timeFromMinutes(value = 0) {
  const safe = Math.max(0, Math.min(1439, Number(value) || 0))
  const hours = String(Math.floor(safe / 60)).padStart(2, '0')
  const minutes = String(safe % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function isOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function blockedWindowsForProfile(profile = {}, weekday) {
  const windows = [
    [minutesFromTime('08:00'), minutesFromTime('09:00')],
    [minutesFromTime('14:00'), minutesFromTime('15:00')],
  ]
  ;['school', 'tuition'].forEach((section) => {
    const routine = profile?.[section]
    if (routine?.days?.includes(weekday)) windows.push([minutesFromTime(routine.startTime), minutesFromTime(routine.endTime)])
  })
  if (profile?.sports?.enabled && Array.isArray(profile.sports.sessions)) {
    profile.sports.sessions.forEach((session) => {
      if (session?.days?.includes(weekday)) windows.push([minutesFromTime(session.startTime), minutesFromTime(session.endTime)])
    })
  }
  return windows.filter(([start, end]) => end > start)
}

function resolveTimetableConflicts(blocks = [], { profile, reviews = [], preservedBlocks = [] } = {}) {
  const wake = minutesFromTime(profile?.wakeTime || '06:00')
  const sleep = minutesFromTime(profile?.sleepTime || '22:30')
  const existingByWeekday = new Map()

  function addWindow(weekday, start, end) {
    if (!existingByWeekday.has(weekday)) existingByWeekday.set(weekday, [])
    existingByWeekday.get(weekday).push([start, end])
  }

  preservedBlocks.forEach((block) => {
    addWindow(block.weekday, minutesFromTime(block.startTime), minutesFromTime(block.startTime) + Number(block.durationMinutes || 60))
  })

  reviews.filter((item) => !item.completed).forEach((item) => {
    const weekday = (new Date(`${item.nextReviewDate}T12:00:00`).getDay() + 6) % 7
    addWindow(weekday, minutesFromTime(item.dueTime), minutesFromTime(item.dueTime) + Number(item.durationMinutes || 30))
  })

  const repaired = []

  blocks.forEach((block, index) => {
    const duration = Math.max(30, Math.min(180, Number(block.durationMinutes || profile?.preferredSessionMinutes || 60)))
    const preferredWeekday = Number.isInteger(Number(block.weekday)) ? Number(block.weekday) : index % 7
    const preferredStart = minutesFromTime(block.startTime)
    let chosen = null

    for (let dayOffset = 0; dayOffset < 7 && !chosen; dayOffset += 1) {
      const weekday = (preferredWeekday + dayOffset) % 7
      const blocked = [...(existingByWeekday.get(weekday) || []), ...blockedWindowsForProfile(profile, weekday)]
      const candidates = []
      for (let start = wake; start + duration <= sleep; start += 30) {
        candidates.push(start)
      }
      candidates.sort((a, b) => Math.abs(a - preferredStart) - Math.abs(b - preferredStart))
      const start = candidates.find((candidate) => !blocked.some(([blockedStart, blockedEnd]) => isOverlap(candidate, candidate + duration, blockedStart, blockedEnd)))
      if (start != null) chosen = { weekday, start }
    }

    if (!chosen) {
      chosen = { weekday: preferredWeekday, start: Math.max(wake, Math.min(preferredStart, sleep - duration)) }
    }

    addWindow(chosen.weekday, chosen.start, chosen.start + duration)
    repaired.push(normalizeTimetableBlock({
      ...block,
      weekday: chosen.weekday,
      startTime: timeFromMinutes(chosen.start),
      durationMinutes: duration,
    }))
  })

  return repaired
}

export default function RecallCalendar() {
  useAppData()
  const today = getTodayDate()
  const logs = getData(STORAGE_KEYS.logs, []).filter((item) => CALENDAR_SUBJECTS.includes(item.subject))
  const timetable = getData(STORAGE_KEYS.studyTimetable, []).map(normalizeTimetableBlock).filter((block) => !block.techniqueId)
  const reviews = spreadRecallTimes(
    getData(STORAGE_KEYS.reviews, []).map(normalizeRecallItem),
    timetable,
  )
  const savedAvailability = getData(STORAGE_KEYS.studyAvailability, null)
  const timetableUsage = useGenerationUsage('timetable')

  const [cursor, setCursor] = useState(() => new Date(`${today}T12:00:00`))
  const [selectedDate, setSelectedDate] = useState(null)
  const [filter, setFilter] = useState('All')
  const [showManual, setShowManual] = useState(false)
  const manualDialogRef = useDialogFocus(showManual, () => setShowManual(false))
  const [editingId, setEditingId] = useState(null)
  const [scheduleError, setScheduleError] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [showTimetableEditor, setShowTimetableEditor] = useState(false)
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => new Date())
  const timelineRef = useRef(null)
  const weekScrollRef = useRef(null)

  const initialSubject = syllabus.find((item) => item.subject === 'Physics') || syllabus[0]
  const [manual, setManual] = useState({
    subject: initialSubject.subject,
    chapter: initialSubject.chapters[0].name,
    topic: initialSubject.chapters[0].topics[0],
    dueDate: today,
    dueTime: '17:00',
    durationMinutes: 30,
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const supported = reviews.filter((item) => CALENDAR_SUBJECTS.includes(item.subject))
  const filtered = filter === 'All' ? supported : supported.filter((item) => item.subject === filter)
  const weeks = useMemo(() => weekRows(toDateOnly(cursor)), [cursor])

  const eventsByDate = new Map()
  filtered.filter((item) => !item.completed).forEach((item) => {
    if (!eventsByDate.has(item.nextReviewDate)) eventsByDate.set(item.nextReviewDate, [])
    eventsByDate.get(item.nextReviewDate).push(item)
  })

  const selectedReviews = eventsByDate.get(selectedDate) || []
  const selectedTimetable = (selectedDate ? getBlocksForDate(timetable, selectedDate) : [])
    .filter((item) => matchesTimetableFilter(item, filter))
  const firstSelectedTime = [...selectedReviews.map((item) => item.dueTime), ...selectedTimetable.map((item) => item.startTime)].sort()[0] || ''
  const selectedLogs = logs.filter((log) => log.date === selectedDate && (filter === 'All' || log.subject === filter))

  const overdueCount = countOverdueRecalls(filtered, today, selectedDate)
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const monthCount = filtered.filter((item) => !item.completed && item.nextReviewDate.startsWith(monthKey)).length

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const currentLineTop = Math.min((currentMinutes / 60) * HOUR_HEIGHT, HOURS.length * HOUR_HEIGHT)

  const manualSubject = syllabus.find((item) => item.subject === manual.subject) || syllabus[0]
  const manualChapters = manualSubject.chapters
  const manualChapter = manualChapters.find((item) => item.name === manual.chapter) || manualChapters[0]
  const manualTopics = manualChapter.topics

  const selectedWeek = selectedDate
    ? Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - ((new Date(`${selectedDate}T12:00:00`).getDay() + 6) % 7)))
    : []

  useEffect(() => {
    if (!selectedDate || !timelineRef.current) return
    const targetMinutes = firstSelectedTime
      ? firstSelectedTime.split(':').map(Number).reduce((hours, minutes) => hours * 60 + minutes)
      : selectedDate === today ? (new Date().getHours() * 60) + new Date().getMinutes() : 8 * 60
    timelineRef.current.scrollTop = Math.max((targetMinutes / 60) * HOUR_HEIGHT - HOUR_HEIGHT, 0)
  }, [selectedDate, filter, firstSelectedTime, today])

  function persistReviews(next) {
    try {
      saveDataOrThrow(STORAGE_KEYS.reviews, next)
      return true
    } catch (persistenceError) {
      setScheduleError(persistenceError.message)
      return false
    }
  }

  function persistTimetableAndAvailability(profile, next) {
    try {
      saveDataBatchOrThrow([
        [STORAGE_KEYS.studyAvailability, profile],
        [STORAGE_KEYS.studyTimetable, next],
      ])
      return true
    } catch (persistenceError) {
      setScheduleError(persistenceError.message)
      return false
    }
  }

  function hasTimeConflict(candidate, ignoredId = null) {
    const candidateStart = minutesFromTime(candidate.dueTime)
    const candidateEnd = candidateStart + Number(candidate.durationMinutes || 30)
    const reviewConflict = reviews.some((item) => {
      if (item.id === ignoredId || item.completed || item.nextReviewDate !== candidate.nextReviewDate) return false
      const start = minutesFromTime(item.dueTime)
      const end = start + Number(item.durationMinutes || 30)
      return isOverlap(candidateStart, candidateEnd, start, end)
    })
    if (reviewConflict) return true

    const weekday = (new Date(`${candidate.nextReviewDate}T12:00:00`).getDay() + 6) % 7
    const timetableConflict = timetable.some((slot) => {
      if (slot.weekday !== weekday) return false
      const start = minutesFromTime(slot.startTime)
      const end = start + Number(slot.durationMinutes || 60)
      return isOverlap(candidateStart, candidateEnd, start, end)
    })
    return timetableConflict
  }

  function hasTimetableConflict(nextBlocks) {
    for (let i = 0; i < nextBlocks.length; i += 1) {
      const a = nextBlocks[i]
      const aStart = minutesFromTime(a.startTime)
      const aEnd = aStart + Number(a.durationMinutes || 60)
      for (let j = i + 1; j < nextBlocks.length; j += 1) {
        const b = nextBlocks[j]
        if (a.weekday !== b.weekday) continue
        const bStart = minutesFromTime(b.startTime)
        const bEnd = bStart + Number(b.durationMinutes || 60)
        if (isOverlap(aStart, aEnd, bStart, bEnd)) return true
      }
    }

    const reviewByWeekday = reviews
      .filter((item) => !item.completed)
      .map((item) => ({
        weekday: (new Date(`${item.nextReviewDate}T12:00:00`).getDay() + 6) % 7,
        start: minutesFromTime(item.dueTime),
        end: minutesFromTime(item.dueTime) + Number(item.durationMinutes || 30),
      }))

    return nextBlocks.some((slot) => {
      const start = minutesFromTime(slot.startTime)
      const end = start + Number(slot.durationMinutes || 60)
      return reviewByWeekday.some((reviewSlot) => (
        reviewSlot.weekday === slot.weekday && isOverlap(start, end, reviewSlot.start, reviewSlot.end)
      ))
    })
  }

  function update(id, fields) {
    const current = reviews.find((item) => item.id === id)
    if (!current) return false
    const candidate = normalizeRecallItem({ ...current, ...fields, updatedAt: new Date().toISOString() })
    if (hasTimeConflict(candidate, id)) {
      setScheduleError('That time overlaps another revision. Choose a different time or duration.')
      return false
    }
    setScheduleError('')
    return persistReviews(reviews.map((item) => (item.id === id ? candidate : item)))
  }

  function remove(id) {
    if (window.confirm('Remove this revision from your calendar?')) persistReviews(reviews.filter((item) => item.id !== id))
  }

  function complete(id) {
    const current = reviews.find((item) => item.id === id)
    if (!current) return
    const completed = normalizeRecallItem({
      ...current,
      completed: true,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setScheduleError('')
    persistReviews(reviews.map((item) => (item.id === id ? completed : item)))
  }

  function movePeriod(delta) {
    if (selectedDate) {
      const nextDate = addDays(selectedDate, delta * 7)
      setSelectedDate(nextDate)
      setCursor(new Date(`${nextDate}T12:00:00`))
      return
    }
    const todayMonth = new Date(`${today.slice(0, 7)}-01T12:00:00`)
    const maxMonth = new Date(todayMonth.getFullYear() + 1, todayMonth.getMonth(), 1, 12)
    setCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + delta, 1, 12)
      if (next > maxMonth) return maxMonth
      return next
    })
  }

  function goToday() {
    setCursor(new Date(`${today}T12:00:00`))
    setSelectedDate(null)
  }

  function openManualForDate(date = selectedDate || today) {
    setManual((current) => ({ ...current, dueDate: date }))
    setScheduleError('')
    setShowManual(true)
  }

  function changeManualSubject(subject) {
    const nextSubject = syllabus.find((item) => item.subject === subject)
    const chapter = nextSubject.chapters[0]
    setManual((current) => ({ ...current, subject, chapter: chapter.name, topic: chapter.topics[0] }))
  }

  function changeManualChapter(chapterName) {
    const chapter = manualChapters.find((item) => item.name === chapterName)
    setManual((current) => ({ ...current, chapter: chapterName, topic: chapter.topics[0] }))
  }

  function addManual(event) {
    event.preventDefault()
    if (!manual.chapter.trim() || !manual.topic.trim()) return
    const item = createRecallItem({
      subject: manual.subject,
      chapter: manual.chapter.trim(),
      topic: manual.topic.trim(),
      dueDate: manual.dueDate,
      dueTime: manual.dueTime,
      durationMinutes: manual.durationMinutes,
    })
    if (hasTimeConflict(item)) {
      setScheduleError('That time overlaps another revision. Choose a different time or duration.')
      return
    }
    setScheduleError('')
    if (!persistReviews([item, ...reviews])) return
    setSelectedDate(manual.dueDate)
    setShowManual(false)
  }

  function applyOptimalPlan(profile, blocks, meta = {}) {
    const preservedBlocks = timetable.filter((item) => item.source !== 'ai')
    const incomingBlocks = blocks.map((item) => normalizeTimetableBlock({ ...item, source: 'ai' }))
    const aiBlocks = resolveTimetableConflicts(incomingBlocks, { profile, reviews, preservedBlocks })
    const hasConflict = hasTimetableConflict([...preservedBlocks, ...aiBlocks])
    if (hasConflict) {
      const fallbackBlocks = resolveTimetableConflicts(buildFallbackTimetable(profile).map((item) => normalizeTimetableBlock({ ...item, source: 'ai' })), { profile, reviews, preservedBlocks })
      if (!persistTimetableAndAvailability(
        profile,
        mergeTimetableBlocks(timetable, fallbackBlocks, 'replace-ai'),
      )) {
        return 'Recall+ could not save the adjusted timetable on this device.'
      }
      setNotice('Some generated slots overlapped, so Recall Plus adjusted them automatically before saving.')
      setShowWizard(false)
      return null
    }
    const merged = mergeTimetableBlocks(timetable, aiBlocks, 'replace-ai')
    if (!persistTimetableAndAvailability(profile, merged)) {
      return 'Recall+ could not save this timetable on this device.'
    }
    setNotice(meta.summary || 'Optimal study timetable applied to your calendar.')
    setShowWizard(false)
    return null
  }

  function saveEditedTimetable(profile, blocks) {
    const normalized = blocks.map((item) => normalizeTimetableBlock({ ...item, source: item.source || 'manual' }))
    if (hasTimetableConflict(normalized)) return 'Timetable has overlapping slots with recalls or other study blocks. Adjust times and try again.'
    if (!persistTimetableAndAvailability(
      profile,
      mergeTimetableBlocks(timetable, normalized, 'replace-all'),
    )) {
      return 'Recall+ could not save this timetable on this device.'
    }
    setNotice('Timetable updated.')
    return null
  }

  function deleteTimetable() {
    if (!window.confirm('Delete the saved timetable blocks?')) return
    try {
      saveDataBatchOrThrow([
        [STORAGE_KEYS.studyTimetable, []],
        [STORAGE_KEYS.studyAvailability, null],
      ])
    } catch (persistenceError) {
      setScheduleError(persistenceError.message)
      return
    }
    setNotice('Timetable deleted. You can generate a new timetable anytime.')
    setShowTimetableEditor(false)
    setShowWizard(false)
  }

  const hasTimetable = timetable.length > 0
  const visibleMonthDate = toDateOnly(cursor)
  const visibleMonth = new Date(`${visibleMonthDate}T12:00:00`)
  const timetableGenerationBlocked = timetableUsage.loading
    || timetableUsage.inProgress
    || timetableUsage.exhausted
    || Boolean(timetableUsage.error)

  return (
    <div className="-mt-4 flex h-[calc(100dvh-9.5rem)] min-h-[36rem] flex-col overflow-hidden md:h-[calc(100dvh-7rem)] lg:-mt-5 lg:h-[calc(100dvh-4rem)]">
      <header className="mb-3 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em]">Recall Calendar</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-3">
          <div className="flex min-w-0 flex-col items-start">
            <Button
              variant="outline"
              disabled={!hasTimetable && timetableGenerationBlocked}
              onClick={() => (hasTimetable ? setShowTimetableEditor(true) : setShowWizard(true))}
            >
              {hasTimetable ? 'Edit timetable' : 'Generate timetable'}
            </Button>
            <GenerationLimitStatus feature="timetable" compact className="mt-1 pl-1" />
          </div>
          <Button className="w-full sm:w-auto" onClick={() => openManualForDate()}><Plus data-icon="inline-start" /> New revision</Button>
        </div>
      </header>

      {notice ? <p role="status" className="mb-2 shrink-0 rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm">{notice}</p> : null}

      <div className="mb-2 flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,.04)] xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Button size="icon-sm" variant="ghost" aria-label={selectedDate ? 'Previous week' : 'Previous month'} onClick={() => movePeriod(-1)}><ChevronLeft /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={selectedDate ? 'Next week' : 'Next month'} onClick={() => movePeriod(1)}><ChevronRight /></Button>
          <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
          <span className="mx-2 h-6 w-px bg-border" />
          <h2 className="min-w-0 text-base font-semibold sm:text-lg">{monthTitle(new Date(`${visibleMonthDate}T12:00:00`))}</h2>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-secondary/60 p-1">
          {FILTERS.map((subject) => (
            <button
              type="button"
              key={subject}
              onClick={() => setFilter(subject)}
              className={`min-h-11 min-w-11 shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${filter === subject ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/60'}`}
            >
              {subject}
            </button>
          ))}
        </div>
      </div>

      {!selectedDate ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_8px_rgba(15,23,42,.04)]" aria-label={`${monthTitle(cursor)} recall calendar`}>
          <div className="grid shrink-0 grid-cols-7 border-b border-border bg-[#fafafa]">
            {WEEKDAYS.map((day) => <div key={day} className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}
          </div>
          <div ref={weekScrollRef} className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[760px]">
              {weeks.map((week, weekIndex) => (
                <div key={week.weekStart} data-week-start={week.weekStart} className={`grid grid-cols-7 ${weekIndex === weeks.length - 1 ? '' : 'border-b border-border/60'}`}>
                  {week.days.map((cell) => {
                    const items = eventsByDate.get(cell.date) || []
                    const timetableItems = getBlocksForDate(timetable, cell.date).filter((item) => matchesTimetableFilter(item, filter))
                    const selected = cell.date === selectedDate
                    const cellDate = new Date(`${cell.date}T12:00:00`)
                    const inVisibleMonth = cellDate.getMonth() === visibleMonth.getMonth() && cellDate.getFullYear() === visibleMonth.getFullYear()
                    const studied = logs.some((log) => log.date === cell.date && (filter === 'All' || log.subject === filter))
                    return (
                      <div
                        key={cell.date}
                        className={`min-h-36 border-r border-border/70 p-2 transition-colors hover:bg-[#f7f7fb] sm:min-h-40 ${!inVisibleMonth ? 'bg-[#fafafa] text-muted-foreground/40' : ''} ${selected ? 'bg-secondary/35 ring-2 ring-inset ring-primary/30' : ''}`}
                      >
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center justify-between rounded-md text-left"
                          aria-label={`Open ${formatDate(cell.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
                          onClick={() => {
                            setSelectedDate(cell.date)
                            setCursor(new Date(`${cell.date}T12:00:00`))
                          }}
                        >
                          <span className={`grid size-7 place-items-center rounded-full text-sm font-semibold ${cell.date === today ? 'bg-primary text-white' : inVisibleMonth ? 'text-foreground' : 'text-muted-foreground/45'}`}>{cell.day}</span>
                          {studied ? <span className="size-2 rounded-full bg-mint" /> : null}
                        </button>
                        <div className="mt-1.5 space-y-1 pr-1">
                          {items.map((item) => <RecallEvent key={item.id} item={item} onClick={(event) => { event.stopPropagation(); setSelectedDate(cell.date) }} />)}
                          {timetableItems.map((block, index) => <TimetablePill key={`${block.id}-${index}`} block={block} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="grid shrink-0 grid-cols-7 overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_8px_rgba(15,23,42,.04)]">
          {selectedWeek.map((date) => {
            const dateValue = new Date(`${date}T12:00:00`)
            const active = date === selectedDate
            return (
              <button
                type="button"
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex min-h-16 flex-col items-center justify-center border-r border-border px-2 py-2 transition-colors last:border-r-0 ${active ? 'bg-primary text-white' : 'hover:bg-secondary/45'}`}
              >
                <span className={`text-[10px] font-semibold uppercase ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{WEEKDAYS[(dateValue.getDay() + 6) % 7]}</span>
                <span className="mt-0.5 text-lg font-semibold">{dateValue.getDate()}</span>
                <span className={`mt-0.5 size-1 rounded-full ${(eventsByDate.has(date) || getBlocksForDate(timetable, date).length) ? (active ? 'bg-white' : 'bg-primary') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
      )}

      {scheduleError && !showManual ? <p role="alert" className="mt-3 rounded-lg border border-coral/25 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{scheduleError}</p> : null}

      {selectedDate ? (
        <section className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_8px_rgba(15,23,42,.04)]">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold">{formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                {!selectedReviews.length && !selectedTimetable.length ? <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-primary"><CalendarDays className="size-3.5" /> No recalls scheduled</span> : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {selectedReviews.length ? `${selectedReviews.length} recall${selectedReviews.length === 1 ? '' : 's'} · ` : ''}
                {selectedTimetable.length ? `${selectedTimetable.length} study block${selectedTimetable.length === 1 ? '' : 's'} · ` : ''}
                {selectedLogs.length} study log{selectedLogs.length === 1 ? '' : 's'}
              </p>
            </div>
            <Button size="icon-sm" variant="ghost" aria-label="Close timeline" onClick={() => setSelectedDate(null)}><X /></Button>
          </div>
          <div ref={timelineRef} className="min-h-0 flex-1 overflow-auto">
            <div className="grid min-w-[760px] grid-cols-[72px_1fr] pt-3">
              <div className="border-r border-border bg-[#fcfcfd]">
                {HOURS.map((hour) => (
                  <div key={hour} className="relative h-12 text-[11px] text-muted-foreground">
                    <span className="absolute right-3 top-0 -translate-y-1/2">{String(hour).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                {HOURS.map((hour, index) => <div key={hour} className="absolute inset-x-0 border-t border-border/70" style={{ top: index * HOUR_HEIGHT }} />)}

                {selectedDate === today ? (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: currentLineTop }}>
                    <span className="-ml-1 size-2.5 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                    <span className="mr-2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ) : null}

                {selectedTimetable.map((item) => {
                  const color = SUBJECT_COLORS[item.subject] || UNKNOWN_SUBJECT_COLOR
                  const [hours, minutes] = item.startTime.split(':').map(Number)
                  const eventHeight = Math.max(36, (item.durationMinutes / 60) * HOUR_HEIGHT)
                  const top = Math.min(((hours * 60 + minutes) / 60) * HOUR_HEIGHT, (HOURS.length * HOUR_HEIGHT) - eventHeight)
                  return (
                    <div
                      key={item.id}
                      className="absolute left-3 right-3 z-[5] overflow-hidden rounded-md border px-3 py-2 shadow-sm"
                      style={{ top, height: eventHeight, borderColor: `${color}99`, backgroundColor: `${color}30`, boxShadow: `inset 4px 0 0 ${color}` }}
                    >
                      <p className="truncate text-xs font-bold" style={{ color }}>Study block · {item.subject}</p>
                      <p className="truncate text-[11px] font-semibold" style={{ color }}>{item.startTime} · {formatStudyMinutes(item.durationMinutes, { compact: true })} · {item.label}</p>
                    </div>
                  )
                })}

                {selectedReviews.map((item) => {
                  const color = SUBJECT_COLORS[item.subject] || UNKNOWN_SUBJECT_COLOR
                  const [hours, minutes] = item.dueTime.split(':').map(Number)
                  const eventHeight = Math.max(40, (item.durationMinutes / 60) * HOUR_HEIGHT)
                  const top = Math.min(((hours * 60 + minutes) / 60) * HOUR_HEIGHT, (HOURS.length * HOUR_HEIGHT) - eventHeight)
                  const editing = editingId === item.id
                  return (
                    <div key={item.id} className="absolute left-3 right-3 z-10 min-h-12 rounded-md border-l-4 px-3 py-2 shadow-sm transition-transform hover:-translate-y-0.5" style={{ top, height: eventHeight, borderLeftColor: color, backgroundColor: `${color}16` }}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.topic} <span className="ml-1 text-[10px]" style={{ color }}>{item.subject}</span></p>
                          <p className="truncate text-xs text-muted-foreground">{item.dueTime} · {formatStudyMinutes(item.durationMinutes, { compact: true })} · {item.chapter}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon-sm" variant="ghost" title="Complete" aria-label={`Complete ${item.topic}`} onClick={() => complete(item.id)}><Check /></Button>
                          <Button size="icon-sm" variant="ghost" title="Edit" aria-label={`Edit ${item.topic}`} onClick={() => setEditingId(editing ? null : item.id)}><Clock3 /></Button>
                          <Button size="icon-sm" variant="ghost" title="Tomorrow" aria-label={`Move ${item.topic} to tomorrow`} onClick={() => update(item.id, { nextReviewDate: addDays(today, 1), completed: false, status: 'scheduled' })}><RotateCcw /></Button>
                          <Button size="icon-sm" variant="ghost" title="Remove" aria-label={`Remove ${item.topic}`} onClick={() => remove(item.id)}><Trash2 /></Button>
                        </div>
                      </div>
                      {editing ? (
                        <div className="mt-2 flex gap-2">
                          <input aria-label={`Date for ${item.topic}`} className="field !min-h-11 !w-40 !px-2 !py-1 text-xs" type="date" value={item.nextReviewDate} onChange={(event) => update(item.id, { nextReviewDate: event.target.value })} />
                          <input aria-label={`Time for ${item.topic}`} className="field !min-h-11 !w-28 !px-2 !py-1 text-xs" type="time" value={item.dueTime} onChange={(event) => update(item.id, { dueTime: event.target.value })} />
                          <input aria-label={`Duration for ${item.topic}`} className="field !min-h-11 !w-24 !px-2 !py-1 text-xs" type="number" min="10" max="180" step="5" value={item.durationMinutes} onChange={(event) => update(item.id, { durationMinutes: Number(event.target.value) })} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-2 flex shrink-0 flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{monthCount}</strong> revisions this month</span>
        <span><strong className={overdueCount ? 'text-coral' : 'text-foreground'}>{overdueCount}</strong> {selectedDate ? 'overdue on this day' : 'overdue overall'}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-secondary" />Study block</span>
        {CALENDAR_SUBJECTS.map((subject) => <span key={subject} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: SUBJECT_COLORS[subject] }} />{subject}</span>)}
      </div>

      {showManual ? (
        <div ref={manualDialogRef} tabIndex="-1" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm outline-none" role="dialog" aria-modal="true" aria-label="Add revision">
          <form onSubmit={addManual} className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-lift">
            <div className="flex justify-between">
              <div>
                <h2 className="text-xl font-semibold">Add a revision</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose directly from your Class 11 syllabus.</p>
              </div>
              <Button type="button" data-dialog-autofocus size="icon-sm" variant="ghost" aria-label="Close" onClick={() => setShowManual(false)}><X /></Button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="field-label">Subject<select className="field" value={manual.subject} onChange={(event) => changeManualSubject(event.target.value)}>{syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}</select></label>
              <label className="field-label">Duration (minutes)<input className="field" type="number" min="10" max="180" step="5" value={manual.durationMinutes} onChange={(event) => setManual({ ...manual, durationMinutes: Number(event.target.value) })} required /></label>
              <label className="field-label">Chapter<select className="field" value={manual.chapter} onChange={(event) => changeManualChapter(event.target.value)}>{manualChapters.map((chapter) => <option key={chapter.name}>{chapter.name}</option>)}</select></label>
              <label className="field-label">Topic<select className="field" value={manual.topic} onChange={(event) => setManual({ ...manual, topic: event.target.value })}>{manualTopics.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
              <label className="field-label">Date<input className="field" type="date" value={manual.dueDate} onChange={(event) => setManual({ ...manual, dueDate: event.target.value })} /></label>
              <label className="field-label">Time<input className="field" type="time" value={manual.dueTime} onChange={(event) => setManual({ ...manual, dueTime: event.target.value })} /></label>
            </div>
            {scheduleError ? <p role="alert" className="mt-4 rounded-lg border border-coral/25 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{scheduleError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowManual(false)}>Cancel</Button>
              <Button type="submit">Add to calendar</Button>
            </div>
          </form>
        </div>
      ) : null}

      <OptimalStudyWizard
        open={showWizard}
        initialProfile={savedAvailability || undefined}
        onClose={() => setShowWizard(false)}
        onApply={applyOptimalPlan}
      />

      {showTimetableEditor ? <EditTimetableModal
        open={showTimetableEditor}
        blocks={timetable}
        initialProfile={savedAvailability || undefined}
        onClose={() => setShowTimetableEditor(false)}
        onSave={saveEditedTimetable}
        onDelete={deleteTimetable}
      /> : null}
    </div>
  )
}
