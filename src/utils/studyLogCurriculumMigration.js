const SUBJECT = 'cbse-2026-27-xi-301'
const VERSION = 'cbse-2026-27-xi-v1'
const ROOT = `node-${SUBJECT}:unit:03:literature-text-book-and-supplementary-reading-text`

// An earlier client published a detailed English tree that was never seeded in
// the database. Keep those historical labels and IDs, but bind sync to the
// verified book-level outline. Server-side subject ownership checks still apply.
export function migrateStudyLogCurriculum(logs) {
  if (!Array.isArray(logs)) return logs
  let changed = false
  const migrated = logs.map((log) => {
    if (log?.curriculumSubjectId !== SUBJECT || log.curriculumVersionId !== VERSION
      || log.subject !== 'English Core' || !Array.isArray(log.curriculumNodeIds)) return log
    const book = [
      { name: 'Hornbill', key: '03:hornbill', topic: '01:hornbill' },
    ].find(({ name, key }) => log.book === name
      && log.curriculumNodeIds.includes(`node-${SUBJECT}:book:${key}`))
    if (!book) return log
    changed = true
    return {
      ...log,
      legacyCurriculumNodeIds: log.legacyCurriculumNodeIds ?? [...log.curriculumNodeIds],
      curriculumNodeIds: [ROOT, `node-${SUBJECT}:${SUBJECT}:unit:03:literature-text-book-and-supplementary-reading-text:topic:${book.topic}`],
    }
  })
  return changed ? migrated : logs
}
