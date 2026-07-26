import { CalendarDays, Clock3, NotebookPen, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PageHeader from '../components/PageHeader'
import { getChapters, getTopics, selectionFromParams } from '../components/SelectionFields'
import syllabus from '../data/syllabus.json'
import { getTodayDate } from '../utils/dateUtils'
import { formatStudyMinutes, getLogTopics } from '../utils/logUtils'
import { createId } from '../utils/quizUtils'
import { scheduleFirstReview } from '../utils/spacedRepetition'
import { getData, saveData, STORAGE_KEYS } from '../utils/storage'
import { getBlocksForDate } from '../utils/studyTimetable'

function formatTime(time = '') {
  if (!time) return '--'
  const [hoursText, minutesText] = String(time).split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return time
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export default function AddLog() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editId = searchParams.get('id')
  const editingLog = editId ? getData(STORAGE_KEYS.logs, []).find((log) => log.id === editId) : null

  const [initial] = useState(() => {
    if (editingLog) {
      return {
        subject: editingLog.subject,
        chapter: editingLog.chapter,
        topics: getLogTopics(editingLog),
        date: editingLog.date || getTodayDate(),
        timeSpent: editingLog.timeSpent ?? 45,
        confidence: editingLog.confidence || 'Medium',
        notes: editingLog.notes || '',
        timetableBlockId: editingLog.timetableFollowUp?.blockId || '',
        followedTimetable: editingLog.timetableFollowUp?.followed ?? 'yes',
      }
    }
    const fromParams = selectionFromParams(searchParams)
    return {
      subject: fromParams.subject,
      chapter: fromParams.chapter,
      topics: searchParams.has('topic') && fromParams.topic ? [fromParams.topic] : [],
      date: getTodayDate(),
      timeSpent: 45,
      confidence: 'Medium',
      notes: '',
      timetableBlockId: '',
      followedTimetable: 'yes',
    }
  })

  const [subject, setSubject] = useState(initial.subject)
  const [chapter, setChapter] = useState(initial.chapter)
  const [topics, setTopics] = useState(initial.topics)
  const [date, setDate] = useState(initial.date)
  const [timeSpent, setTimeSpent] = useState(initial.timeSpent)
  const [confidence, setConfidence] = useState(initial.confidence)
  const [notes, setNotes] = useState(initial.notes)
  const [timetableBlockId, setTimetableBlockId] = useState(initial.timetableBlockId)
  const [followedTimetable, setFollowedTimetable] = useState(initial.followedTimetable)

  const chapters = getChapters(subject)
  const chapterTopics = getTopics(subject, chapter)
  const timetableBlocks = getBlocksForDate(getData(STORAGE_KEYS.studyTimetable, []), date)
  const effectiveTimetableBlockId = timetableBlockId || timetableBlocks[0]?.id || ''
  const selectedTimetableBlock = timetableBlocks.find((block) => block.id === effectiveTimetableBlockId) || null

  function changeSubject(nextSubject) {
    setSubject(nextSubject)
    setChapter(getChapters(nextSubject)[0]?.name || '')
    setTopics([])
  }

  function changeChapter(nextChapter) {
    setChapter(nextChapter)
    setTopics([])
  }

  function toggleTopic(topic) {
    setTopics((current) => (current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]))
  }

  function selectTimetableBlock(blockId) {
    const block = timetableBlocks.find((item) => item.id === blockId)
    setTimetableBlockId(blockId)
    if (!block) return
    if (block.subject !== subject) {
      const firstChapter = getChapters(block.subject)[0]?.name || ''
      setSubject(block.subject)
      setChapter(firstChapter)
      setTopics([])
    }
    setTimeSpent(block.durationMinutes)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!topics.length) return
    const logs = getData(STORAGE_KEYS.logs, [])
    const actualDuration = Number(timeSpent)
    const timetableFollowUp = effectiveTimetableBlockId ? {
      blockId: effectiveTimetableBlockId,
      followed: followedTimetable,
      plannedSubject: selectedTimetableBlock?.subject || '',
      plannedLabel: selectedTimetableBlock?.label || '',
      plannedStartTime: selectedTimetableBlock?.startTime || '',
      targetedDurationMinutes: selectedTimetableBlock?.durationMinutes || null,
      actualDurationMinutes: actualDuration,
      studiedSubject: subject,
      studiedChapter: chapter,
      studiedTopics: topics,
    } : null
    const fields = { subject, chapter, topics, topic: topics[0], date, timeSpent: actualDuration, confidence, notes: notes.trim(), timetableFollowUp }

    let savedLog
    if (editingLog) {
      savedLog = { ...editingLog, ...fields }
      saveData(STORAGE_KEYS.logs, logs.map((log) => (log.id === editingLog.id ? { ...log, ...fields } : log)))
    } else {
      savedLog = { id: createId(), ...fields }
      saveData(STORAGE_KEYS.logs, [savedLog, ...logs])
    }

    const statuses = getData(STORAGE_KEYS.topicStatuses, {})
    topics.forEach((topic) => {
      const key = `${subject}|${chapter}|${topic}`
      if (statuses[key] !== 'Mastered') statuses[key] = 'Studied'
      if (editingLog) scheduleFirstReview(subject, chapter, topic, confidence)
    })
    saveData(STORAGE_KEYS.topicStatuses, statuses)

    if (editingLog) {
      navigate('/logs')
      return
    }
    navigate(`/post-study-quiz?logId=${encodeURIComponent(savedLog.id)}`)
  }

  return (
    <>
      <PageHeader
        title={editingLog ? 'Edit study log' : 'Study log'}
        actions={<Button variant="outline" render={<Link to="/logs" />}>View all study logs</Button>}
      />
      <form onSubmit={handleSubmit} className="grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><NotebookPen className="size-5" /></span><div><h2 className="text-lg font-semibold">Study log</h2><p className="text-sm text-muted-foreground">Pick a chapter, then tap every topic you covered.</p></div></div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="field-label">Subject<select className="field" value={subject} onChange={(event) => changeSubject(event.target.value)}>{syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}</select></label>
            <label className="field-label">Date<div className="relative"><CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" size={18} /><input className="field pl-11" type="date" max={getTodayDate()} value={date} onChange={(event) => { setDate(event.target.value); setTimetableBlockId('') }} required /></div></label>
          </div>

          <label className="field-label mt-5">Chapter<select className="field" value={chapter} onChange={(event) => changeChapter(event.target.value)}>{chapters.map((item, index) => <option key={item.name} value={item.name}>Chapter {index + 1}: {item.name}</option>)}</select></label>

          <div className="mt-6">
            <p className="field-label">Topics covered{topics.length ? <span className="ml-2 text-xs font-bold text-indigo">{topics.length} selected</span> : null}</p>
            {topics.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span key={topic} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                    {topic}
                    <button type="button" onClick={() => toggleTopic(topic)} className="grid h-4 w-4 place-items-center rounded-full bg-white/25 hover:bg-white/40" aria-label={`Remove ${topic}`}><X size={11} /></button>
                  </span>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">Tap topics below to add them.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {chapterTopics.map((topic) => { const active = topics.includes(topic); return <button type="button" key={topic} onClick={() => toggleTopic(topic)} className={`min-h-9 rounded-full border px-3 py-1.5 text-sm font-medium transition ${active ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>{active ? '✓ ' : '+ '}{topic}</button> })}
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="field-label">Time spent (minutes)<div className="relative"><Clock3 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" size={18} /><input className="field pl-11" type="number" min="5" max="600" value={timeSpent} onChange={(event) => setTimeSpent(event.target.value)} required /></div></label>
            <fieldset><legend className="field-label">Confidence level</legend><div className="grid grid-cols-3 gap-2">{['Low', 'Medium', 'High'].map((level) => <button type="button" key={level} onClick={() => setConfidence(level)} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition ${confidence === level ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/30'}`}>{level}</button>)}</div></fieldset>
          </div>

          <label className="field-label mt-6">Notes &amp; reflection<textarea className="field min-h-32 resize-y" placeholder="Key ideas, mistakes, or questions to revisit…" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!topics.length}>{editingLog ? 'Update study log' : 'Save study log'}</Button>
            {editingLog ? <Button variant="outline" type="button" onClick={() => navigate('/logs')}>Cancel</Button> : null}
          </div>
        </Card>

        <Card className="p-5 sm:p-6 xl:self-start">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent text-mint"><Clock3 className="size-5" /></span><div><h2 className="text-lg font-semibold">Timetable check-in</h2><p className="text-sm text-muted-foreground">Compare planned study with what you actually completed.</p></div></div>

          {timetableBlocks.length ? (
            <>
              <label className="field-label mt-6">Timetable slot
                <select className="field" value={effectiveTimetableBlockId} onChange={(event) => selectTimetableBlock(event.target.value)}>
                  <option value="">Choose a slot</option>
                  {timetableBlocks.map((block) => (
                    <option key={block.id} value={block.id}>{formatTime(block.startTime)} · {block.subject} · {formatStudyMinutes(block.durationMinutes, { compact: true })}</option>
                  ))}
                </select>
              </label>

              <fieldset className="mt-5">
                <legend className="field-label">Were you able to follow it?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['yes', 'Yes'],
                    ['no', 'No'],
                  ].map(([value, label]) => (
                    <button type="button" key={value} onClick={() => setFollowedTimetable(value)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${followedTimetable === value ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/30'}`}>{label}</button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5 rounded-xl border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duration comparison</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">Targeted</p>
                    <p className="mt-1 text-xl font-semibold">{selectedTimetableBlock ? formatStudyMinutes(selectedTimetableBlock.durationMinutes, { compact: true }) : '--'}</p>
                  </div>
                  <label className="rounded-lg bg-accent p-3">
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <input className="mt-1 w-full bg-transparent text-xl font-semibold outline-none" type="number" min="5" max="600" value={timeSpent} onChange={(event) => setTimeSpent(event.target.value)} aria-label="Actual duration in minutes" />
                  </label>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-border bg-background p-4">
                <p className="text-sm font-semibold">{followedTimetable === 'no' ? 'What did you actually study?' : 'Studied content'}</p>
                {followedTimetable === 'no' ? <p className="mt-1 text-xs text-muted-foreground">No problem. Enter the real chapter and topics so this is saved as an accurate study log.</p> : null}
                <label className="field-label mt-4 block">Actual subject
                  <select className="field" value={subject} onChange={(event) => changeSubject(event.target.value)}>
                    {syllabus.map((item) => <option key={item.subject}>{item.subject}</option>)}
                  </select>
                </label>
                <label className="field-label mt-4 block">Actual chapter
                  <select className="field" value={chapter} onChange={(event) => changeChapter(event.target.value)}>
                    {chapters.map((item, index) => <option key={item.name} value={item.name}>Chapter {index + 1}: {item.name}</option>)}
                  </select>
                </label>
                <div className="mt-4">
                  <p className="field-label">Actual topics{topics.length ? <span className="ml-2 text-xs font-bold text-indigo">{topics.length} selected</span> : null}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chapterTopics.map((topic) => {
                      const active = topics.includes(topic)
                      return (
                        <button type="button" key={topic} onClick={() => toggleTopic(topic)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>
                          {active ? '✓ ' : '+ '}{topic}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <Button className="mt-5 w-full" type="submit" disabled={!topics.length}>{editingLog ? 'Update log' : 'Add log'}</Button>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              No timetable slots are scheduled for this date. Add or generate a timetable in Recall Calendar to use this check-in.
            </div>
          )}
        </Card>

      </form>
    </>
  )
}
