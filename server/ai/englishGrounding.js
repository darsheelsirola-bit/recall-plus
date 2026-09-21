import rawEnglishChapterFacts from './englishChapterFacts.json' with { type: 'json' }
import rawEnglishChapterFactsXii from './englishChapterFactsXii.json' with { type: 'json' }

const allRawEnglishChapterFacts = [...rawEnglishChapterFacts, ...rawEnglishChapterFactsXii]

let cachedFacts

function normalizedText(value, maxLength) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= maxLength ? normalized : null
}

export function normalizeEnglishChapterFacts(value) {
  if (!Array.isArray(value)) return []
  const normalized = []
  const factIds = new Set()

  for (const entry of value) {
    const grade = normalizedText(String(entry?.grade ?? ''), 8)
    const chapter = normalizedText(entry?.chapter, 200)
    const sourceUrl = normalizedText(entry?.sourceUrl, 2_000)
    if (!grade || !chapter || !sourceUrl || !Array.isArray(entry.facts) || !entry.facts.length) return []

    const facts = []
    for (const item of entry.facts) {
      const id = normalizedText(item?.id, 120)
      const text = normalizedText(item?.text, 1_500)
      if (!id || !text || factIds.has(id)) return []
      factIds.add(id)
      facts.push({ id, text })
    }
    normalized.push({ grade, chapter, sourceUrl, facts })
  }
  return normalized
}

export function loadEnglishChapterFacts() {
  if (cachedFacts) return cachedFacts
  cachedFacts = normalizeEnglishChapterFacts(allRawEnglishChapterFacts)
  if (!cachedFacts.length || cachedFacts.length !== allRawEnglishChapterFacts.length) {
    throw new Error('The bundled English chapter facts are invalid.')
  }
  return cachedFacts
}

/**
 * Build an exact, server-owned fact map for an authorized Class XI/XII English
 * selection. Grounding is all-or-nothing; the caller fails closed when any
 * selected English chapter lacks a reviewed fact bundle.
 */
export function buildEnglishGrounding({
  curriculumVersionId,
  subject,
  chapterTitles,
  chapterNodeIds,
  facts = loadEnglishChapterFacts(),
}) {
  if (
    !/\benglish\b/i.test(String(subject || ''))
    || !Array.isArray(chapterTitles)
    || !chapterTitles.length
    || !Array.isArray(chapterNodeIds)
    || chapterTitles.length !== chapterNodeIds.length
  ) return null

  const grade = String(curriculumVersionId || '').includes('-xii-')
    ? '12'
    : String(curriculumVersionId || '').includes('-xi-') ? '11' : null
  if (!grade) return null

  const entriesByChapter = new Map(
    facts
      .filter((entry) => entry.grade === grade)
      .map((entry) => [entry.chapter, entry]),
  )
  const selected = chapterTitles.map((title, index) => {
    const chapter = normalizedText(title, 200)
    const sourceReference = normalizedText(chapterNodeIds[index], 512)
    const entry = chapter ? entriesByChapter.get(chapter) : null
    return entry && sourceReference ? { ...entry, sourceReference } : null
  })
  if (selected.some((entry) => !entry)) return null

  const groundedFacts = selected.flatMap((entry) => entry.facts.map((fact) => ({
    ...fact,
    chapter: entry.chapter,
    sourceUrl: entry.sourceUrl,
    sourceReference: entry.sourceReference,
  })))
  if (!groundedFacts.length || new Set(groundedFacts.map(({ id }) => id)).size !== groundedFacts.length) return null

  return {
    grade,
    chapters: selected.map(({ chapter, sourceUrl, sourceReference }) => ({ chapter, sourceUrl, sourceReference })),
    facts: groundedFacts,
    factsById: new Map(groundedFacts.map((fact) => [fact.id, fact])),
  }
}

export function groundingPromptFacts(grounding) {
  if (!grounding) return ''
  return JSON.stringify(grounding.chapters.map(({ chapter, sourceUrl, sourceReference }) => ({
    chapter,
    sourceUrl,
    sourceReference,
    facts: grounding.facts
      .filter((fact) => fact.chapter === chapter && fact.sourceReference === sourceReference)
      .map(({ id, text }) => ({ id, text })),
  })))
}
