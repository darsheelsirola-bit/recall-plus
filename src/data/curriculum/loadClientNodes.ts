import type { CurriculumNode } from './types.ts'
import { loadClientCurriculumNodes as loadXiClientNodes } from './cbse/2026-27/class-11/clientNodes.ts'
import { loadClientCurriculumNodes as loadXiiClientNodes } from './cbse/2026-27/class-12/clientNodes.ts'

/** Vite-only client node loader. Do not import from Node test/scripts. */
export async function loadClientCurriculumNodes(
  subjectIds: readonly string[],
): Promise<readonly CurriculumNode[]> {
  const xiIds = subjectIds.filter((id) => id.includes('-xi-'))
  const xiiIds = subjectIds.filter((id) => id.includes('-xii-'))
  const [xiNodes, xiiNodes] = await Promise.all([
    xiIds.length ? loadXiClientNodes(xiIds) : Promise.resolve([]),
    xiiIds.length ? loadXiiClientNodes(xiiIds) : Promise.resolve([]),
  ])
  return [...xiNodes, ...xiiNodes]
}
