import { addDays, getTodayDate } from './dateUtils.js'
import {
  findBalancedRecallSchedule,
  getPostStudyGap,
  getRecallDuration,
} from './recallCalendar.js'
import { getData, saveDataOrThrow, STORAGE_KEYS } from './storage.js'

const REVIEW_GAPS = [3, 6, 10, 15, 20]

export function getNextReviewDate(reviewCount = 0, percentage = null, confidence = 'Medium', remarks = '') {
  let gap
  if (percentage !== null && percentage < 50) gap = 3
  else {
    const baseIndex = Math.min(Math.max(reviewCount, 0), REVIEW_GAPS.length - 1)
    const boostedIndex = percentage !== null && percentage >= 80 ? Math.min(baseIndex + 1, REVIEW_GAPS.length - 1) : baseIndex
    gap = REVIEW_GAPS[boostedIndex]
    if (percentage !== null) {
      const evidenceGap = getPostStudyGap(percentage, confidence, remarks)
      gap = Math.round((gap + evidenceGap) / 2)
    }
  }
  return addDays(getTodayDate(), Math.min(20, Math.max(3, gap)))
}

export function createOrUpdateReview(subject, chapter, topic, percentage = null) {
  const update = createOrUpdateReviewData(
    getData(STORAGE_KEYS.reviews, []),
    subject,
    chapter,
    topic,
    percentage,
  )
  saveDataOrThrow(STORAGE_KEYS.reviews, update.reviews)
  return update.review
}

export function createOrUpdateReviewData(reviews, subject, chapter, topic, percentage = null, options = {}) {
  const nextReviews = Array.isArray(reviews) ? reviews.map((review) => ({ ...review })) : []
  const index = nextReviews.findIndex((item) => item.subject === subject && item.chapter === chapter && item.topic === topic)
  const current = index >= 0 ? nextReviews[index] : null
  const nextCount = percentage === null ? (current?.reviewCount || 0) : (current?.reviewCount || 0) + 1
  const confidence = options.confidence || current?.confidence || 'Medium'
  const remarks = String(options.remarks ?? current?.remarks ?? '').trim()
  const durationMinutes = getRecallDuration(percentage, confidence, remarks)
  const preferredDate = getNextReviewDate(nextCount, percentage, confidence, remarks)
  const balanced = findBalancedRecallSchedule({
    preferredDate,
    subject,
    topic,
    durationMinutes,
    scheduledItems: nextReviews,
    timetable: options.timetable || [],
    excludedId: current?.id,
  })
  const review = {
    id: current?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    subject,
    curriculumSubjectId: options.curriculumSubjectId || current?.curriculumSubjectId || null,
    chapter,
    topic,
    lastStudiedDate: getTodayDate(),
    nextReviewDate: balanced?.nextReviewDate || preferredDate,
    dueTime: balanced?.dueTime || current?.dueTime || '17:00',
    durationMinutes,
    lastQuizScore: percentage ?? current?.lastQuizScore ?? null,
    confidence,
    remarks,
    reviewCount: nextCount,
    completed: false,
  }
  if (index >= 0) nextReviews[index] = review
  else nextReviews.unshift(review)
  return { review, reviews: nextReviews }
}

export function scheduleFirstReview(subject, chapter, topic, confidence = 'Medium', remarks = '') {
  const update = scheduleFirstReviewData(
    getData(STORAGE_KEYS.reviews, []),
    subject,
    chapter,
    topic,
    confidence,
    remarks,
  )
  saveDataOrThrow(STORAGE_KEYS.reviews, update.reviews)
  return update.review
}

export function scheduleFirstReviewData(reviews, subject, chapter, topic, confidence = 'Medium', remarks = '', timetable = [], curriculumSubjectId = null) {
  const nextReviews = Array.isArray(reviews) ? reviews.map((review) => ({ ...review })) : []
  const index = nextReviews.findIndex((item) => item.subject === subject && item.chapter === chapter && item.topic === topic)
  const current = index >= 0 ? nextReviews[index] : null
  const preferredDate = addDays(getTodayDate(), getPostStudyGap(50, confidence, remarks))
  const durationMinutes = getRecallDuration(null, confidence, remarks)
  const balanced = findBalancedRecallSchedule({
    preferredDate,
    subject,
    topic,
    durationMinutes,
    scheduledItems: nextReviews,
    timetable,
    excludedId: current?.id,
  })
  const review = {
    id: current?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    subject,
    curriculumSubjectId: curriculumSubjectId || current?.curriculumSubjectId || null,
    chapter,
    topic,
    lastStudiedDate: getTodayDate(),
    nextReviewDate: balanced?.nextReviewDate || preferredDate,
    dueTime: balanced?.dueTime || current?.dueTime || '17:00',
    durationMinutes,
    lastQuizScore: current?.lastQuizScore ?? null,
    confidence,
    remarks: String(remarks || '').trim(),
    reviewCount: current?.reviewCount || 0,
    completed: false,
  }
  if (index >= 0) nextReviews[index] = review
  else nextReviews.unshift(review)
  return { review, reviews: nextReviews }
}
