import { CORE_SUBJECTS, SUBJECT_COLORS, UNKNOWN_SUBJECT_COLOR } from '../constants/subjects'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { BarChart3 } from 'lucide-react'
import { formatDate, getTodayDate } from '../utils/dateUtils'
import { formatStudyMinutes, getWeeklyStudyBySubject } from '../utils/logUtils'

export default function StudyTimeChart({ logs }) {
  const data = getWeeklyStudyBySubject(logs)
  const weekTotal = data.reduce((sum, day) => sum + day.total, 0)

  if (!weekTotal) {
    return (
      <Empty className="min-h-60 border border-dashed border-border">
        <EmptyHeader><EmptyMedia variant="icon"><BarChart3 /></EmptyMedia><EmptyTitle>No study time yet</EmptyTitle><EmptyDescription>Start logging study sessions to see your study time graph.</EmptyDescription></EmptyHeader>
      </Empty>
    )
  }

  const today = getTodayDate()
  const maxDailyTotal = Math.max(...data.map((day) => day.total), 1)
  const averageDailyTotal = weekTotal / 7
  const averagePosition = Math.min((averageDailyTotal / maxDailyTotal) * 100, 100)
  const weeklyBySubject = data.reduce((totals, day) => {
    Object.entries(day.bySubject).forEach(([subject, minutes]) => {
      totals[subject] = (totals[subject] || 0) + minutes
    })
    return totals
  }, {})
  const unknownSubjects = Object.keys(weeklyBySubject).filter((subject) => !CORE_SUBJECTS.includes(subject))
  const subjects = [...CORE_SUBJECTS, ...unknownSubjects]

  return (
    <div>
      <div
        className="relative h-[220px]"
        role="img"
        aria-label={`Study time by subject from Monday to Sunday. Weekly total ${formatStudyMinutes(weekTotal)}. Average ${formatStudyMinutes(Math.round(averageDailyTotal))} per day.`}
      >
        <div className="absolute inset-x-0 bottom-8 top-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
          <div
            className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-dashed border-mint/80"
            style={{ bottom: `${averagePosition}%` }}
          >
            <span className="absolute -right-0 -top-3 rounded-md bg-card px-1.5 text-[10px] font-semibold tracking-wide text-mint">avg</span>
          </div>

          <div className="absolute inset-0 z-10 grid grid-cols-7 items-end gap-2 sm:gap-4">
            {data.map((day) => {
              const isToday = day.date === today
              const barHeight = day.total ? Math.max((day.total / maxDailyTotal) * 100, 6) : 0
              return (
                <div key={day.date} className="flex h-full min-w-0 flex-col items-center justify-end">
                  {day.total ? <span className="mb-1 text-[10px] font-medium text-muted-foreground">{day.total}m</span> : null}
                  <div
                    className={`flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-xl ${isToday ? 'ring-2 ring-indigo/20 ring-offset-2' : ''}`}
                    style={{ height: `${barHeight}%` }}
                    title={`${formatDate(day.date)} · ${formatStudyMinutes(day.total, { compact: true })}`}
                  >
                    {subjects.map((subject) => {
                      const minutes = day.bySubject[subject] || 0
                      if (!minutes) return null
                      return (
                        <div
                          key={subject}
                          style={{ flexGrow: minutes, backgroundColor: SUBJECT_COLORS[subject] || UNKNOWN_SUBJECT_COLOR }}
                          title={`${subject}: ${formatStudyMinutes(minutes, { compact: true })}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 grid grid-cols-7 gap-2 sm:gap-4">
          {data.map((day) => {
            const isToday = day.date === today
            return (
              <div key={day.date} className="flex justify-center">
                <span
                  className={`grid size-7 place-items-center rounded-full text-[11px] font-semibold ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  aria-label={`${formatDate(day.date, { weekday: 'long' })}${isToday ? ', today' : ''}`}
                >
                  {day.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-border pt-5" aria-label="Weekly subject totals">
        {subjects.map((subject) => (
          <div key={subject} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SUBJECT_COLORS[subject] || UNKNOWN_SUBJECT_COLOR }} />
            <span className="font-medium">{subject}</span>
            <span className="font-medium tabular-nums text-muted-foreground">{formatStudyMinutes(weeklyBySubject[subject] || 0, { compact: true })}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
