import { addDays, getTodayDate } from './dateUtils.js'
import { getData, saveData, STORAGE_KEYS } from './storage.js'

const REVIEW_GAPS = [1, 3, 7, 14, 30]

export function getNextReviewDate(reviewCount = 0, percentage = null) {
  let gap
  if (percentage !== null && percentage < 50) gap = 1
  else {
    const baseIndex = Math.min(Math.max(reviewCount, 0), REVIEW_GAPS.length - 1)
    const boostedIndex = percentage !== null && percentage >= 80 ? Math.min(baseIndex + 1, REVIEW_GAPS.length - 1) : baseIndex
    gap = REVIEW_GAPS[boostedIndex]
  }
  return addDays(getTodayDate(), gap)
}

export function createOrUpdateReview(subject, chapter, topic, percentage = null) {
  const reviews = getData(STORAGE_KEYS.reviews, [])
  const index = reviews.findIndex((item) => item.subject === subject && item.chapter === chapter && item.topic === topic)
  const current = index >= 0 ? reviews[index] : null
  const nextCount = percentage === null ? (current?.reviewCount || 0) : (current?.reviewCount || 0) + 1
  const review = {
    id: current?.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    subject,
    chapter,
    topic,
    lastStudiedDate: getTodayDate(),
    nextReviewDate: getNextReviewDate(nextCount, percentage),
    lastQuizScore: percentage ?? current?.lastQuizScore ?? null,
    confidence: current?.confidence || 'Medium',
    reviewCount: nextCount,
    completed: false,
  }
  if (index >= 0) reviews[index] = review
  else reviews.unshift(review)
  saveData(STORAGE_KEYS.reviews, reviews)
  return review
}

export function scheduleFirstReview(subject, chapter, topic, confidence = 'Medium') {
  const reviews = getData(STORAGE_KEYS.reviews, [])
  const index = reviews.findIndex((item) => item.subject === subject && item.chapter === chapter && item.topic === topic)
  const review = {
    id: index >= 0 ? reviews[index].id : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    subject,
    chapter,
    topic,
    lastStudiedDate: getTodayDate(),
    nextReviewDate: getNextReviewDate(0, null),
    lastQuizScore: index >= 0 ? reviews[index].lastQuizScore : null,
    confidence,
    reviewCount: index >= 0 ? reviews[index].reviewCount : 0,
    completed: false,
  }
  if (index >= 0) reviews[index] = review
  else reviews.unshift(review)
  saveData(STORAGE_KEYS.reviews, reviews)
  return review
}
