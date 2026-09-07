import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CBSE_2026_27_XI_NODES_BY_SUBJECT } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'
import { CBSE_2026_27_XII_NODES_BY_SUBJECT } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const checking = process.argv.includes('--check')

async function syncGrade(
  label: string,
  relativeDirectory: readonly string[],
  nodesBySubject: Map<string, readonly unknown[]>,
): Promise<void> {
  const outputDirectory = join(projectRoot, ...relativeDirectory)
  const expectedFiles = new Map(
    [...nodesBySubject.entries()]
      .filter(([, nodes]) => nodes.length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([subjectId, nodes]) => [
        `${subjectId}.json`,
        `${JSON.stringify(nodes, null, 2)}\n`,
      ]),
  )

  if (checking) {
    const actualFiles = (await readdir(outputDirectory))
      .filter((name) => name.endsWith('.json'))
      .sort()
    const expectedNames = [...expectedFiles.keys()].sort()
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedNames)) {
      throw new Error(
        `${label} client curriculum modules are stale. Expected ${expectedNames.length} exact JSON files; run npm run curriculum:client.`,
      )
    }
    for (const [name, expected] of expectedFiles) {
      const actual = await readFile(join(outputDirectory, name), 'utf8')
      if (actual !== expected) {
        throw new Error(
          `${label} client curriculum module ${name} is stale; run npm run curriculum:client.`,
        )
      }
    }
    console.log(
      `Verified ${expectedFiles.size} ${label} subject-specific client curriculum modules.`,
    )
    return
  }

  await mkdir(outputDirectory, { recursive: true })
  const expectedNames = new Set(expectedFiles.keys())
  const staleFiles = (await readdir(outputDirectory))
    .filter((name) => name.endsWith('.json') && !expectedNames.has(name))
  await Promise.all(staleFiles.map((name) => unlink(join(outputDirectory, name))))
  for (const [name, content] of expectedFiles) {
    await writeFile(join(outputDirectory, name), content, 'utf8')
  }
  console.log(
    `Generated ${expectedFiles.size} ${label} subject-specific client curriculum modules and removed ${staleFiles.length} stale module(s).`,
  )
}

await syncGrade(
  'Class XI',
  ['src', 'data', 'curriculum', 'cbse', '2026-27', 'class-11', 'client-nodes'],
  CBSE_2026_27_XI_NODES_BY_SUBJECT,
)
await syncGrade(
  'Class XII',
  ['src', 'data', 'curriculum', 'cbse', '2026-27', 'class-12', 'client-nodes'],
  CBSE_2026_27_XII_NODES_BY_SUBJECT,
)
