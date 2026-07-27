export function toDateOnly(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayDate() {
  return toDateOnly(new Date())
}

export function isDueToday(date) {
  return date === getTodayDate()
}

export function isOverdue(date) {
  return Boolean(date) && date < getTodayDate()
}

export function addDays(date, days) {
  const value = new Date(`${date || getTodayDate()}T12:00:00`)
  value.setDate(value.getDate() + days)
  return toDateOnly(value)
}

export function getWeekStart(date = getTodayDate()) {
  const value = new Date(`${date}T12:00:00`)
  const dayOfWeek = value.getDay()
  return addDays(date, dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
}

export function formatDate(date, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(`${date}T12:00:00`))
}

export function getStudyStreak(logs = []) {
  const days = new Set(logs.map((log) => log.date))
  let cursor = getTodayDate()
  let streak = 0
  if (!days.has(cursor)) cursor = addDays(cursor, -1)
  while (days.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
