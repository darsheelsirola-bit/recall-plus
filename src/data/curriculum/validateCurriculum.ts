import type {
  CurriculumNode,
  CurriculumSubject,
  CurriculumVersion,
} from './types.ts'

export interface CurriculumValidationIssue {
  code: string
  message: string
}

export interface CurriculumValidationResult {
  valid: boolean
  issues: CurriculumValidationIssue[]
  counts: {
    subjects: number
    selectableSubjects: number
    nodes: number
    reviewedSubjects: number
  }
}

interface CurriculumValidationInput {
  version: CurriculumVersion
  subjects: readonly CurriculumSubject[]
  nodes: readonly CurriculumNode[]
  reviewedSubjectCodes: readonly string[]
  expectedGroupCounts: Readonly<Record<'L' | 'A' | 'S' | 'IA', number>>
}

const OFFICIAL_SOURCE_HOST = 'cbseacademic.nic.in'
const SHA256_PATTERN = /^[a-f0-9]{64}$/

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  })
  return [...duplicates].sort()
}

function isOfficialSource(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === OFFICIAL_SOURCE_HOST
  } catch {
    return false
  }
}

export function validateCurriculumCatalog({
  version,
  subjects,
  nodes,
  reviewedSubjectCodes,
  expectedGroupCounts,
}: CurriculumValidationInput): CurriculumValidationResult {
  const issues: CurriculumValidationIssue[] = []
  const add = (code: string, message: string) => issues.push({ code, message })
  const selectable = subjects.filter((subject) => subject.subjectGroup !== 'IA')
  const reviewedCodes = new Set(reviewedSubjectCodes)
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  if (!isOfficialSource(version.sourceUrl)) {
    add('VERSION_SOURCE', 'Curriculum version source must use the official CBSE Academic domain.')
  }
  if (!SHA256_PATTERN.test(version.sourceHash)) {
    add('VERSION_HASH', 'Curriculum version source hash must be a lowercase SHA-256 value.')
  }

  ;(['L', 'A', 'S', 'IA'] as const).forEach((group) => {
    const actual = subjects.filter((subject) => subject.subjectGroup === group).length
    if (actual !== expectedGroupCounts[group]) {
      add('GROUP_COUNT', `Expected ${expectedGroupCounts[group]} Group-${group} records; found ${actual}.`)
    }
  })

  if (selectable.length !== 121) {
    add('SELECTABLE_COUNT', `Expected 121 selectable subject codes; found ${selectable.length}.`)
  }

  duplicateValues(subjects.map((subject) => subject.id)).forEach((id) =>
    add('DUPLICATE_SUBJECT_ID', `Duplicate curriculum subject ID: ${id}`))
  duplicateValues(
    selectable.flatMap((subject) => subject.subjectCode ? [subject.subjectCode] : []),
  ).forEach((code) =>
    add('DUPLICATE_SUBJECT_CODE', `Duplicate curriculum subject code: ${code}`))
  duplicateValues(nodes.map((node) => node.id)).forEach((id) =>
    add('DUPLICATE_NODE_ID', `Duplicate curriculum node ID: ${id}`))
  duplicateValues(nodes.map((node) => node.externalKey)).forEach((key) =>
    add('DUPLICATE_EXTERNAL_KEY', `Duplicate curriculum node external key: ${key}`))

  subjects.forEach((subject) => {
    if (subject.curriculumVersionId !== version.id) {
      add('VERSION_REFERENCE', `${subject.id} references a different curriculum version.`)
    }
    if (!isOfficialSource(subject.source.url)) {
      add('SUBJECT_SOURCE', `${subject.id} does not use an official CBSE Academic source URL.`)
    }
    if (subject.source.sha256 !== null && !SHA256_PATTERN.test(subject.source.sha256)) {
      add('SUBJECT_HASH', `${subject.id} has an invalid source SHA-256 value.`)
    }
    if (subject.subjectGroup === 'IA' && subject.subjectCode !== null) {
      add('INTERNAL_CODE', `${subject.id} must not use a selectable subject code.`)
    }
    if (subject.subjectGroup !== 'IA' && !subject.subjectCode) {
      add('MISSING_CODE', `${subject.id} must include its official subject code.`)
    }

    const isReviewed = Boolean(subject.subjectCode && reviewedCodes.has(subject.subjectCode))
    if (isReviewed !== (subject.contentStatus === 'verified_outline')) {
      add('CONTENT_STATUS', `${subject.id} content status does not match its reviewed outline state.`)
    }
    const subjectNodes = nodes.filter((node) => node.subjectId === subject.id)
    if (isReviewed && subjectNodes.length === 0) {
      add('MISSING_OUTLINE', `${subject.id} is reviewed but has no curriculum nodes.`)
    }
    if (!isReviewed && subjectNodes.length > 0) {
      add('UNVERIFIED_OUTLINE', `${subject.id} has nodes without reviewed-source status.`)
    }
  })

  reviewedSubjectCodes.forEach((code) => {
    if (!selectable.some((subject) => subject.subjectCode === code)) {
      add('UNKNOWN_REVIEWED_CODE', `Reviewed outline references unknown subject code ${code}.`)
    }
  })

  nodes.forEach((node) => {
    const subject = subjectsById.get(node.subjectId)
    if (!subject) {
      add('UNKNOWN_NODE_SUBJECT', `${node.id} references unknown subject ${node.subjectId}.`)
    }
    if (!isOfficialSource(node.sourceUrl)) {
      add('NODE_SOURCE', `${node.id} does not use an official CBSE Academic source URL.`)
    }
    if (!Number.isInteger(node.officialOrder) || node.officialOrder < 1) {
      add('NODE_ORDER', `${node.id} has an invalid official order.`)
    }
    if (node.sourcePage !== null && (!Number.isInteger(node.sourcePage) || node.sourcePage < 1)) {
      add('NODE_PAGE', `${node.id} has an invalid source page.`)
    }
    if (node.marksWeightage !== null && node.marksWeightage < 0) {
      add('NODE_MARKS', `${node.id} has a negative marks weightage.`)
    }
    if (node.parentId) {
      const parent = nodesById.get(node.parentId)
      if (!parent) {
        add('UNKNOWN_PARENT', `${node.id} references missing parent ${node.parentId}.`)
      } else if (parent.subjectId !== node.subjectId) {
        add('CROSS_SUBJECT_PARENT', `${node.id} has a parent from another subject.`)
      }
    }
  })

  return {
    valid: issues.length === 0,
    issues,
    counts: {
      subjects: subjects.length,
      selectableSubjects: selectable.length,
      nodes: nodes.length,
      reviewedSubjects: reviewedSubjectCodes.length,
    },
  }
}
