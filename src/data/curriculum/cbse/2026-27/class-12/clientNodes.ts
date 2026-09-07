import type { CurriculumNode } from '../../../types.ts'

type NodeModule = { default: CurriculumNode[] }

const nodeModules = import.meta.glob<NodeModule>('./client-nodes/*.json')
const cache = new Map<string, readonly CurriculumNode[]>()

function modulePath(subjectId: string): string {
  return `./client-nodes/${subjectId}.json`
}

export async function loadClientCurriculumNodes(
  subjectIds: readonly string[],
): Promise<readonly CurriculumNode[]> {
  const uniqueSubjectIds = [...new Set(subjectIds)]
  const subjectNodes = await Promise.all(uniqueSubjectIds.map(async (subjectId) => {
    const cached = cache.get(subjectId)
    if (cached) return cached
    const loader = nodeModules[modulePath(subjectId)]
    if (!loader) {
      cache.set(subjectId, Object.freeze([]))
      return []
    }
    const module = await loader()
    const nodes = Object.freeze(module.default.map((node) => Object.freeze(node)))
    cache.set(subjectId, nodes)
    return nodes
  }))
  return subjectNodes.flat()
}
