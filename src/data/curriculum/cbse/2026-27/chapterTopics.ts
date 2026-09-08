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
  return Object.freeze([...nodes, ...additions])
}
