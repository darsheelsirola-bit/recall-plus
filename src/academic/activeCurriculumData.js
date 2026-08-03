import { CBSE_2026_27_XI_NODES_BY_SUBJECT } from '../data/curriculum/index.ts'

function descendants(node, byParent) {
  const children = byParent.get(node.id) || []
  if (!children.length) return [node]
  return children.flatMap((child) => descendants(child, byParent))
}

function subjectSyllabus(selection) {
  const { subject } = selection
  const nodes = CBSE_2026_27_XI_NODES_BY_SUBJECT.get(subject.id) || []
  const byParent = new Map()
  nodes.forEach((node) => {
    const key = node.parentId || ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(node)
  })
  const topLevel = (byParent.get('') || [])
    .sort((left, right) => left.officialOrder - right.officialOrder)
  return {
    id: subject.id,
    subjectId: subject.id,
    subject: subject.name,
    shortName: subject.shortName,
    subjectCode: subject.subjectCode,
    subjectGroup: subject.subjectGroup,
    contentStatus: subject.contentStatus,
    selectionType: selection.selectionType,
    subjectPosition: selection.subjectPosition,
    chapters: topLevel.map((node) => ({
      id: node.id,
      name: node.title,
      nodeType: node.nodeType,
      sourceUrl: node.sourceUrl,
      topics: descendants(node, byParent)
        .filter((descendant) => descendant.id !== node.id)
        .map((descendant) => descendant.title),
    })),
  }
}

export function buildActiveSyllabus(subjectSelections = []) {
  return [...subjectSelections]
    .sort((left, right) => left.subjectPosition - right.subjectPosition)
    .map(subjectSyllabus)
}

export function activeSubjectNameSet(subjectSelections = []) {
  return new Set(subjectSelections.map((selection) => selection.subject.name))
}

export function isActiveSubjectRecord(record, activeNames, activeIds = new Set()) {
  const subjectId = String(record?.curriculumSubjectId || '').trim()
  if (subjectId) return activeIds.has(subjectId)
  return activeNames.has(String(record?.subject || ''))
}

export function filterActiveSubjectRecords(records, activeNames, activeIds = new Set()) {
  return Array.isArray(records)
    ? records.filter((record) => isActiveSubjectRecord(record, activeNames, activeIds))
    : []
}

export function mergeActiveRecordUpdates(existing = [], nextActive = [], isActiveRecord) {
  const current = Array.isArray(existing) ? existing : []
  const next = Array.isArray(nextActive) ? nextActive : []
  const nextById = new Map(next.map((record) => [record.id, record]))
  const existingIds = new Set(current.map((record) => record.id))
  const added = next.filter((record) => !existingIds.has(record.id))
  return [
    ...added,
    ...current.flatMap((record) => {
      if (!isActiveRecord(record)) return [record]
      const updated = nextById.get(record.id)
      return updated ? [updated] : []
    }),
  ]
}
