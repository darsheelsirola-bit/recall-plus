import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ReviewCard from '../components/ReviewCard'
import { useAppData } from '../hooks/useAppData'
import { isDueToday, isOverdue } from '../utils/dateUtils'
import { getData, saveData, STORAGE_KEYS } from '../utils/storage'

const tabs = ['Due today', 'Overdue', 'Upcoming', 'Completed']

export default function Review() {
  useAppData()
  const [tab, setTab] = useState('Due today')
  const navigate = useNavigate()
  const reviews = getData(STORAGE_KEYS.reviews, [])
  const groups = useMemo(() => ({
    'Due today': reviews.filter((item) => !item.completed && isDueToday(item.nextReviewDate)),
    Overdue: reviews.filter((item) => !item.completed && isOverdue(item.nextReviewDate)),
    Upcoming: reviews.filter((item) => !item.completed && !isDueToday(item.nextReviewDate) && !isOverdue(item.nextReviewDate)),
    Completed: reviews.filter((item) => item.completed),
  }), [reviews])
  const state = tab === 'Due today' ? 'today' : tab.toLowerCase()

  function startReview(review) {
    navigate(`/quiz?subject=${encodeURIComponent(review.subject)}&chapter=${encodeURIComponent(review.chapter)}&topic=${encodeURIComponent(review.topic)}&review=${review.id}`)
  }

  function completeAllDue() {
    const updated = reviews.map((item) => isDueToday(item.nextReviewDate) ? { ...item, completed: true } : item)
    saveData(STORAGE_KEYS.reviews, updated)
  }

  return (
    <>
      <PageHeader title="Review queue" description="Your spaced-repetition plan, sorted by what needs attention first." actions={groups['Due today'].length ? <button className="btn-secondary" onClick={completeAllDue}>Mark today complete</button> : null} />
      <div className="flex gap-2 overflow-x-auto border-b border-ink/10 pb-3">{tabs.map((item) => <button key={item} className={`tab-button ${tab === item ? 'tab-button-active' : ''}`} onClick={() => setTab(item)}>{item}<span className="ml-2 opacity-55">{groups[item].length}</span></button>)}</div>
      {groups[tab].length ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups[tab].map((review) => <ReviewCard key={review.id} review={review} state={state} onStart={() => startReview(review)} />)}</div> : <div className="empty-state mt-6"><h2 className="text-lg font-extrabold text-ink">Nothing here yet</h2><p className="mt-2 max-w-md text-sm text-ink/50">Add a study log to schedule your first review. Reviews will move between these lists automatically.</p></div>}
    </>
  )
}
