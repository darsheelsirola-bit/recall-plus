import { motivationalQuotes } from '../data/motivationalQuotes.js'
import { psychologyTechniques } from '../data/psychologyTechniques.js'
import { addDays, getTodayDate, getWeekStart, isDueToday, isOverdue } from './dateUtils.js'
import { formatStudyMinutes } from './logUtils.js'
import { getData, saveData, STORAGE_KEYS } from './storage.js'
import { findWeakTopics } from './weakTopics.js'

function dateHash(date) {
  return date.split('-').reduce((sum, part) => sum + Number(part), 0)
}

export function getQuoteOfDay(today = getTodayDate()) {
  const state = getData(STORAGE_KEYS.insightQuoteState, { shownIds: [], lastDate: '', currentId: '' })
  const cached = motivationalQuotes.find((quote) => quote.id === state.currentId)
  if (state.lastDate === today && cached) return cached

  let available = motivationalQuotes.filter((quote) => !state.shownIds.includes(quote.id))
  if (!available.length) available = [...motivationalQuotes]

  const quote = available[dateHash(today) % available.length]
  const shownIds = state.shownIds.includes(quote.id)
    ? state.shownIds
    : [...state.shownIds, quote.id]

  saveData(STORAGE_KEYS.insightQuoteState, {
    shownIds: shownIds.length >= motivationalQuotes.length ? [quote.id] : shownIds,
    lastDate: today,
    currentId: quote.id,
  })

  return quote
}

function buildContext(logs, results, reviews) {
  const today = getTodayDate()
  const weekStart = getWeekStart(today)
  const dueReviews = reviews.filter((review) => !review.completed && (isDueToday(review.nextReviewDate) || isOverdue(review.nextReviewDate)))
  const todayMinutes = logs.filter((log) => log.date === today).reduce((sum, log) => sum + Number(log.timeSpent || 0), 0)
  const weeklyMinutes = logs.filter((log) => log.date >= weekStart).reduce((sum, log) => sum + Number(log.timeSpent || 0), 0)
  const average = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.percentage, 0) / results.length)
    : null

  const weakTopics = findWeakTopics(results, reviews)

  const studyDays = new Set(logs.map((log) => log.date))
  let streak = 0
  let cursor = today
  if (!studyDays.has(cursor)) cursor = addDays(cursor, -1)
  while (studyDays.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return {
    today,
    logs,
    results,
    dueReviews,
    todayMinutes,
    weeklyMinutes,
    average,
    weakTopics,
    streak,
    hasData: logs.length > 0 || results.length > 0,
  }
}

function rankTechniques(context) {
  const ranked = new Map()

  function add(id, weight, reason) {
    const current = ranked.get(id)
    if (!current || weight > current.weight) ranked.set(id, { id, weight, reason })
  }

  if (context.dueReviews.length) {
    add('spaced-repetition', 10, `${context.dueReviews.length} recall${context.dueReviews.length === 1 ? '' : 's'} due — revise before learning new topics.`)
    add('active-recall', 8, 'Test due topics from memory before opening notes.')
  }

  if (context.weakTopics.length) {
    add('error-log', 9, `${context.weakTopics.length} weak topic${context.weakTopics.length === 1 ? '' : 's'} need targeted mistake review.`)
    add('active-recall', 8, 'Use blank-page recall on topics scoring below 50%.')
  }

  if (context.todayMinutes === 0) {
    add('two-minute-rule', 10, 'No study logged today — start with a 2-minute ritual now.')
    add('implementation-intention', 7, 'Set one If-Then plan for your next study block.')
  }

  if (context.streak === 0 && context.logs.length) {
    add('implementation-intention', 8, 'Rebuild momentum with a fixed daily trigger and task.')
    add('temptation-bundling', 6, 'Pair your next session with a small reward after completion.')
  }

  if (context.weeklyMinutes < 300) {
    add('pomodoro', 7, 'Short timed cycles can raise your weekly study minutes.')
    add('environment', 6, 'Prepare your desk tonight so tomorrow starts without friction.')
  }

  if (context.average !== null && context.average < 65 && context.results.length >= 2) {
    add('error-log', 8, 'Recent quiz scores suggest logging and retrying repeated mistakes.')
  }

  if (context.streak >= 5) {
    add('energy-matching', 6, 'Protect your streak by placing hard topics in peak-energy hours.')
  }

  const rotating = ['dopamine-reset', 'sleep-consistency', 'pre-sleep-preview', 'environment', 'energy-matching']
  add(rotating[dateHash(context.today) % rotating.length], 4, 'A daily technique to keep habits sharp.')

  return [...ranked.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((entry) => {
      const technique = psychologyTechniques.find((item) => item.id === entry.id)
      return technique ? { ...technique, reason: entry.reason } : null
    })
    .filter(Boolean)
}

function buildTips(context) {
  const tips = []

  if (context.dueReviews.length) {
    const next = context.dueReviews[0]
    tips.push({
      title: 'Handle recalls first',
      copy: `${context.dueReviews.length} topic${context.dueReviews.length === 1 ? '' : 's'} need revision today. Start with ${next.topic}.`,
      to: '/recall-calendar',
      label: 'Open calendar',
    })
  }

  if (context.weakTopics.length) {
    const weak = context.weakTopics[0]
    tips.push({
      title: 'Strengthen a weak topic',
      copy: `${weak.topic} scored ${weak.weakestScore}%. Run a focused practice test on it.`,
      to: `/quiz?subject=${encodeURIComponent(weak.subject)}&chapter=${encodeURIComponent(weak.chapter)}&topic=${encodeURIComponent(weak.topic)}`,
      label: 'Practice now',
    })
  }

  if (context.todayMinutes < 45) {
    tips.push({
      title: 'Add focused study time',
      copy: context.todayMinutes
        ? `You have ${formatStudyMinutes(context.todayMinutes)} logged today. Aim for at least one 45-minute block.`
        : 'No study logged yet today. One focused block is enough to move forward.',
      to: '/add-log',
      label: 'Log session',
    })
  }

  if (context.weeklyMinutes < 420) {
    tips.push({
      title: 'Raise weekly consistency',
      copy: `You studied ${formatStudyMinutes(context.weeklyMinutes)} this week. A steady 60 minutes/day builds strong recall.`,
      to: '/recall-calendar',
      label: 'Plan slots',
    })
  }

  if (context.average !== null && context.average >= 80) {
    tips.push({
      title: 'Keep your recall rhythm',
      copy: `Your average score is ${context.average}%. Maintain spaced reviews so strong topics stay strong.`,
      to: '/progress',
      label: 'View progress',
    })
  }

  if (!context.hasData) {
    tips.push({
      title: 'Start with one study log',
      copy: 'Log your first session to unlock personalised tips, streak tracking, and recall scheduling.',
      to: '/add-log',
      label: 'Add first log',
    })
  }

  if (context.streak >= 3) {
    tips.push({
      title: 'Protect your streak',
      copy: `${context.streak}-day streak active. Even 20 minutes today keeps the habit alive.`,
      to: '/add-log',
      label: 'Log today',
    })
  }

  const fallback = [
    { title: 'Review before you read', copy: 'Spend 5 minutes recalling key ideas before opening notes.', to: '/psychology/active-recall', label: 'Learn method' },
    { title: 'Plan tomorrow tonight', copy: 'Write one If-Then line per subject before bed.', to: '/psychology/implementation-intention', label: 'See technique' },
    { title: 'Use your timetable', copy: 'Follow your study blocks and check in after each session.', to: '/recall-calendar', label: 'View timetable' },
  ]

  const seen = new Set()
  const merged = [...tips, ...fallback].filter((tip) => {
    if (seen.has(tip.title)) return false
    seen.add(tip.title)
    return true
  })

  return merged.slice(0, 4)
}

function buildSnapshot(context) {
  return [
    { label: 'Study streak', value: context.streak ? `${context.streak} day${context.streak === 1 ? '' : 's'}` : 'Start today' },
    { label: 'Today', value: context.todayMinutes ? formatStudyMinutes(context.todayMinutes) : 'Not logged' },
    { label: 'This week', value: formatStudyMinutes(context.weeklyMinutes) },
    { label: 'Recalls due', value: String(context.dueReviews.length) },
    { label: 'Quiz average', value: context.average !== null ? `${context.average}%` : '—' },
    { label: 'Weak topics', value: String(context.weakTopics.length) },
  ]
}

export function buildAiInsights(logs, results, reviews) {
  const context = buildContext(logs, results, reviews)
  return {
    quote: getQuoteOfDay(context.today),
    snapshot: buildSnapshot(context),
    tips: buildTips(context),
    techniques: rankTechniques(context),
    headline: context.dueReviews.length
      ? `Focus on ${context.dueReviews.length} due recall${context.dueReviews.length === 1 ? '' : 's'} today`
      : context.weakTopics.length
        ? 'Turn weak topics into strengths this week'
        : context.todayMinutes === 0
          ? 'Start with one focused study block'
          : 'You are building steady momentum',
  }
}
