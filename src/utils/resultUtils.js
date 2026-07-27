export function resultTimestamp(result = {}) {
  const precise = result.completedAt || result.createdAt || result.updatedAt
  if (precise) {
    const timestamp = Date.parse(precise)
    if (Number.isFinite(timestamp)) return timestamp
  }

  const dateOnly = typeof result.date === 'string' ? result.date : ''
  const timestamp = Date.parse(`${dateOnly}T12:00:00`)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function getResultTopics(result = {}) {
  if (Array.isArray(result.topics) && result.topics.length) {
    return result.topics.map((topic) => String(topic).trim()).filter(Boolean)
  }

  const topic = String(result.topic || '').trim()
  if (!topic) return []
  return topic.includes(',')
    ? topic.split(',').map((part) => part.trim()).filter(Boolean)
    : [topic]
}

export function latestResultsByTopic(results = []) {
  const latest = new Map()

  results.forEach((result) => {
    getResultTopics(result).forEach((topic) => {
      const candidate = { ...result, topic }
      const key = `${candidate.subject}|${candidate.chapter}|${topic}`
      const current = latest.get(key)
      if (!current || resultTimestamp(candidate) > resultTimestamp(current)) {
        latest.set(key, candidate)
      }
    })
  })

  return [...latest.values()]
}
