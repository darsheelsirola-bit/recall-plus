import type { CurriculumNode } from '../../types.ts'
import topics from './chapter-topics.json' with { type: 'json' }

/** Append source-reviewed topics without changing any existing node identifier. */
export function withChapterTopics(nodes: readonly CurriculumNode[]): readonly CurriculumNode[] {
  const parents = new Map(nodes.map((node) => [node.id, node]))
  const additions: CurriculumNode[] = topics.flatMap((entry) => {
    const parent = parents.get(entry.parentId)
    if (!parent) return []
    if (parent.subjectId !== entry.subjectId) throw new Error(`Topic subject mismatch: ${entry.id}`)
    return [{
      ...entry,
      nodeType: 'topic' as const,
      description: null,
      marksWeightage: null,
      externalKey: entry.id.slice(5),
      active: true as const,
    }]
  })

  // Employability Skills are mandatory for every skill course. Reuse the
  // official XI/XII Employability Skills topic rows already attached to Fashion
  // Studies for the matching AI units instead of maintaining divergent copies.
  const aiEmployabilityTopics: CurriculumNode[] = topics.flatMap((entry) => {
    if (!entry.subjectId.endsWith('-837')) return []
    const sourceParent = parents.get(entry.parentId)
    if (!sourceParent) return []
    const targetSubjectId = entry.subjectId.replace(/-837$/, '-843')
    const targetParent = nodes.find((node) => (
      node.subjectId === targetSubjectId
      && node.nodeType === sourceParent.nodeType
      && node.title === sourceParent.title
    ))
    if (!targetParent) return []
    const id = entry.id.replace(/^node-topic-/, 'node-topic-ai-')
    return [{
      ...entry,
      id,
      parentId: targetParent.id,
      subjectId: targetSubjectId,
      nodeType: 'topic' as const,
      description: null,
      marksWeightage: null,
      externalKey: id.slice(5),
      active: true as const,
    }]
  })
  return Object.freeze([...nodes, ...additions, ...aiEmployabilityTopics])
}
