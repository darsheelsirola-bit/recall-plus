/**
 * Server-safe insight fallback helpers.
 * Kept out of src/utils/weakTopics.js so API routes do not import browser/JSON
 * modules (which can crash Vercel serverless cold starts).
 */

export function buildBasedOnLine(ctx) {
  const parts = []
  const weakest = ctx.weakTopics?.[0]
  if (weakest?.recallScore != null) parts.push(`${weakest.recallScore}% recall`)
  if (weakest?.practiceScore != null) parts.push(`${weakest.practiceScore}% practice`)
  if (ctx.missedQuestions?.length) {
    parts.push(`${ctx.missedQuestions.length} missed question${ctx.missedQuestions.length === 1 ? '' : 's'}`)
  }
  parts.push(`${ctx.studyMinutes || 0} min studied in this chapter`)
  return parts.join(' · ')
}

function defaultStudyFrom(ctx) {
  const sources = ctx.studySources
  if (!sources) {
    return {
      primary: `${ctx.subject} — ${ctx.chapter}`,
      sections: ['Read the chapter', 'Solve back-of-chapter exercises'],
      secondary: '',
    }
  }
  return {
    primary: `${sources.ncert.book} — Ch ${sources.ncert.chapterNumber}: ${sources.ncert.chapterTitle}`,
    sections: sources.ncert.keySections?.slice(0, 3) || ['Read the chapter', 'Solve exercises'],
    secondary: `${sources.secondary.book} — Ch ${sources.secondary.chapterNumber}: ${sources.secondary.chapterTitle}`,
  }
}

function defaultPrioritizedTopics(ctx) {
  const topics = []
  const seen = new Set()

  ;[...(ctx.weakTopics || [])]
    .sort((a, b) => (a.weakestScore ?? 100) - (b.weakestScore ?? 100))
    .forEach((item) => {
      if (seen.has(item.topic)) return
      seen.add(item.topic)
      topics.push({
        topic: item.topic,
        reason: `Weakest score: ${item.weakestScore}%`,
      })
    })

  ;(ctx.unstudiedTopics || []).forEach((topic) => {
    if (seen.has(topic) || topics.length >= 4) return
    seen.add(topic)
    topics.push({ topic, reason: 'Not studied yet — build the base first' })
  })

  if (!topics.length && ctx.syllabusTopics?.length) {
    topics.push({ topic: ctx.syllabusTopics[0], reason: 'Start with the first syllabus topic' })
  }

  return topics.slice(0, 4).map((item, index) => ({ ...item, order: index + 1 }))
}

export function buildFallbackChapterInsight(ctx) {
  const prioritizedTopics = defaultPrioritizedTopics(ctx)
  const studyFrom = defaultStudyFrom(ctx)
  const focusTopic = prioritizedTopics[0]?.topic || ctx.chapter
  const missed = ctx.missedQuestions?.[0]

  let insight = `Your scores in ${ctx.chapter} are below 50%.`
  if (missed?.explanation) insight += ` A recent mistake pattern: ${missed.explanation}`
  else if (!ctx.studyMinutes) insight += ' You have not logged study time for this chapter yet.'
  else insight += ' Review the weak topics below before moving ahead.'

  return {
    curriculumVersionId: ctx.curriculumVersionId || null,
    curriculumSubjectId: ctx.curriculumSubjectId || null,
    chapterNodeId: ctx.chapterNodeId || null,
    topicNodeIds: ctx.topicNodeIds || [],
    subject: ctx.subject,
    chapter: ctx.chapter,
    insight,
    basedOn: buildBasedOnLine(ctx),
    prioritizedTopics,
    studyFrom,
    action: `Open ${studyFrom.primary} and study ${focusTopic} for 30 minutes, then take a recall check.`,
    focusArea: ctx.missedQuestions?.length ? 'problem-solving' : 'conceptual understanding',
  }
}

export function buildFallbackInsights(chapterContexts = []) {
  const chapters = chapterContexts.map(buildFallbackChapterInsight)
  return {
    headline: chapters.length === 1
      ? `Strengthen ${chapters[0].chapter}`
      : 'Turn your weak chapters into strengths this week',
    summary: 'Based on your recall checks, practice tests, and study logs.',
    chapters,
    source: 'local',
  }
}
