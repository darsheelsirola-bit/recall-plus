import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CBSE_2026_27_XI_GROUP_COUNTS,
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
  CBSE_2026_27_XI_SUBJECTS,
  CBSE_2026_27_XI_VERSION,
  validateCurriculumCatalog,
} from '../src/data/curriculum/index.ts'

export function validateCheckedInCbseCurriculum() {
  return validateCurriculumCatalog({
    version: CBSE_2026_27_XI_VERSION,
    subjects: CBSE_2026_27_XI_SUBJECTS,
    nodes: CBSE_2026_27_XI_NODES,
    reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
    expectedGroupCounts: {
      L: 39,
      A: 39,
      S: 43,
      IA: 3,
    },
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = validateCheckedInCbseCurriculum()
  if (!result.valid) {
    result.issues.forEach((issue) => {
      console.error(`[${issue.code}] ${issue.message}`)
    })
    process.exitCode = 1
  } else {
    console.log(
      `CBSE 2026-27 Class XI catalogue valid: ${result.counts.selectableSubjects} selectable subjects, `
      + `${result.counts.reviewedSubjects} reviewed outlines, ${result.counts.nodes} curriculum nodes.`,
    )
  }
}
