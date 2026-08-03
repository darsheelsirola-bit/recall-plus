function descendants(node, byParent) {
  const children = byParent.get(node.id) || []
  if (!children.length) return [node]
  return children.flatMap((child) => descendants(child, byParent))
}

function subjectSyllabus(selection, nodesBySubject) {
  const { subject } = selection
  const nodes = nodesBySubject.get(subject.id) || []
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
    chapters: topLevel.map((node) => {
      const topicNodes = descendants(node, byParent)
        .filter((descendant) => descendant.id !== node.id)
        .map((descendant) => ({
          id: descendant.id,
          name: descendant.title,
          nodeType: descendant.nodeType,
        }))
      return {
        id: node.id,
        name: node.title,
        nodeType: node.nodeType,
        sourceUrl: node.sourceUrl,
        topics: topicNodes.map((topic) => topic.name),
        topicNodes,
      }
    }),
  }
}

export function curriculumRequestSelection(syllabus, subjectName, chapterNames, topicNames) {
  const subject = (syllabus || []).find((item) => item.subject === subjectName)
  if (!subject) return null
  const requestedChapters = new Set((chapterNames || []).map(String))
  const requestedTopics = new Set((topicNames || []).map(String))
  const chapters = subject.chapters.filter((chapter) => requestedChapters.has(chapter.name))
  const topicNodes = chapters.flatMap((chapter) => chapter.topicNodes || [])
    .filter((topic) => requestedTopics.has(topic.name))
  if (!chapters.length || !topicNodes.length) return null
  return {
    curriculumSubjectId: subject.subjectId,
    chapterNodeIds: [...new Set(chapters.map((chapter) => chapter.id))],
    topicNodeIds: [...new Set(topicNodes.map((topic) => topic.id))],
  }
}

export function buildActiveSyllabus(subjectSelections = [], curriculumNodes = []) {
  const nodesBySubject = new Map()
  curriculumNodes.forEach((node) => {
    if (!nodesBySubject.has(node.subjectId)) nodesBySubject.set(node.subjectId, [])
    nodesBySubject.get(node.subjectId).push(node)
  })
  return [...subjectSelections]
    .sort((left, right) => left.subjectPosition - right.subjectPosition)
    .map((selection) => subjectSyllabus(selection, nodesBySubject))
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
