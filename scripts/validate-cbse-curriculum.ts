import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
  CBSE_2026_27_XI_SUBJECTS,
  CBSE_2026_27_XI_VERSION,
  CBSE_2026_27_XII_NODES,
  CBSE_2026_27_XII_REVIEWED_SUBJECT_CODES,
  CBSE_2026_27_XII_SUBJECTS,
  CBSE_2026_27_XII_VERSION,
  validateCurriculumCatalog,
} from '../src/data/curriculum/index.ts'

const expectedGroupCounts = {
  L: 3,
  A: 19,
  S: 2,
  IA: 0,
}

export function validateCheckedInCbseCurriculum() {
  const xi = validateCurriculumCatalog({
    version: CBSE_2026_27_XI_VERSION,
    subjects: CBSE_2026_27_XI_SUBJECTS,
    nodes: CBSE_2026_27_XI_NODES,
    reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
    expectedGroupCounts,
  })
  const xii = validateCurriculumCatalog({
    version: CBSE_2026_27_XII_VERSION,
    subjects: CBSE_2026_27_XII_SUBJECTS,
    nodes: CBSE_2026_27_XII_NODES,
    reviewedSubjectCodes: CBSE_2026_27_XII_REVIEWED_SUBJECT_CODES,
    expectedGroupCounts,
  })
  return {
    valid: xi.valid && xii.valid,
    issues: [...xi.issues, ...xii.issues],
    counts: {
      selectableSubjects: xi.counts.selectableSubjects + xii.counts.selectableSubjects,
      reviewedSubjects: xi.counts.reviewedSubjects + xii.counts.reviewedSubjects,
      nodes: xi.counts.nodes + xii.counts.nodes,
    },
    xi,
    xii,
  }
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
      `CBSE 2026-27 Class XI catalogue valid: ${result.xi.counts.selectableSubjects} selectable subjects, `
      + `${result.xi.counts.reviewedSubjects} reviewed outlines, ${result.xi.counts.nodes} curriculum nodes.`,
    )
    console.log(
      `CBSE 2026-27 Class XII catalogue valid: ${result.xii.counts.selectableSubjects} selectable subjects, `
      + `${result.xii.counts.reviewedSubjects} reviewed outlines, ${result.xii.counts.nodes} curriculum nodes.`,
    )
  }
}
