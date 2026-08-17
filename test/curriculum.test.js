import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CBSE_2026_27_XI_GROUP_COUNTS,
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_PATHWAY_PRESETS,
  CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
  CBSE_2026_27_XI_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XI_SUBJECTS,
  CBSE_2026_27_XI_SUBJECTS_BY_CODE,
  CBSE_2026_27_XI_VERSION,
  CBSE_2026_27_XII_NODES,
  CBSE_2026_27_XII_SELECTABLE_SUBJECTS,
  CBSE_2026_27_XII_SUBJECTS_BY_CODE,
  CBSE_2026_27_XII_VERSION,
  RECALL_XI_ALLOWLIST_CODES,
  RECALL_XI_LANGUAGE_CODES,
  RECALL_XII_ALLOWLIST_CODES,
  resolveLegacySubject,
  subjectIdsForPreset,
  subjectIdsForXiiPreset,
  validateCbse2026ClassXiCombination,
  validateCbse2026ClassXiiCombination,
  validateCurriculumCatalog,
} from '../src/data/curriculum/index.ts'

function selections(codes) {
  return codes.map((code, index) => {
    const subject = CBSE_2026_27_XI_SUBJECTS_BY_CODE.get(code)
    assert.ok(subject, `Expected catalogue subject ${code}`)
    return {
      curriculumSubjectId: subject.id,
      subjectPosition: index + 1,
      selectionType: index === 5 ? 'additional' : 'main',
    }
  })
}

describe('CBSE 2026-27 Class XI curriculum catalogue', () => {
  it('contains exactly the Recall+ allowlist subjects', () => {
    assert.deepEqual(CBSE_2026_27_XI_GROUP_COUNTS, {
      L: 3,
      A: 19,
      S: 2,
      IA: 0,
    })
    assert.equal(CBSE_2026_27_XI_SELECTABLE_SUBJECTS.length, 24)
    assert.equal(CBSE_2026_27_XI_SUBJECTS.length, 24)
    assert.deepEqual(
      CBSE_2026_27_XI_SELECTABLE_SUBJECTS.map((subject) => subject.subjectCode).sort(),
      [...RECALL_XI_ALLOWLIST_CODES].sort(),
    )
  })

  it('exposes only English Core, Hindi Core, and French as languages', () => {
    const languages = CBSE_2026_27_XI_SELECTABLE_SUBJECTS
      .filter((subject) => subject.subjectGroup === 'L')
      .map((subject) => subject.subjectCode)
      .sort()
    assert.deepEqual(languages, [...RECALL_XI_LANGUAGE_CODES].sort())
    ;['001', '002', '003', '104', '105'].forEach((code) => {
      assert.equal(CBSE_2026_27_XI_SUBJECTS_BY_CODE.has(code), false)
    })
  })

  it('does not include removed electives or unapproved skill subjects', () => {
    ;['065', '045', '064', '802', '801', '833', '031'].forEach((code) => {
      assert.equal(CBSE_2026_27_XI_SUBJECTS_BY_CODE.has(code), false, code)
    })
  })

  it('uses stable unique IDs and source-linked nodes', () => {
    assert.equal(
      new Set(CBSE_2026_27_XI_SUBJECTS.map((subject) => subject.id)).size,
      CBSE_2026_27_XI_SUBJECTS.length,
    )
    assert.equal(
      new Set(CBSE_2026_27_XI_NODES.map((node) => node.externalKey)).size,
      CBSE_2026_27_XI_NODES.length,
    )
    CBSE_2026_27_XI_NODES.forEach((node) => {
      assert.match(node.sourceUrl, /^https:\/\/cbseacademic\.nic\.in\//)
      assert.ok(node.sourcePage === null || node.sourcePage > 0)
    })
  })

  it('models English Hornbill and Snapshots as books with chapters', () => {
    const englishNodes = CBSE_2026_27_XI_NODES.filter(
      (node) => node.subjectId === 'cbse-2026-27-xi-301',
    )
    const hornbill = englishNodes.find((node) => node.title === 'Hornbill')
    const snapshots = englishNodes.find((node) => node.title === 'Snapshots')
    assert.ok(hornbill)
    assert.ok(snapshots)
    assert.equal(hornbill.nodeType, 'book')
    assert.equal(snapshots.nodeType, 'book')
    assert.equal(hornbill.parentId, null)
    assert.equal(snapshots.parentId, null)

    const portrait = englishNodes.find((node) => node.title === 'The Portrait of a Lady')
    assert.ok(portrait)
    assert.equal(portrait.nodeType, 'chapter')
    assert.equal(portrait.parentId, hornbill.id)

    const summer = englishNodes.find(
      (node) => node.title === 'The Summer of the Beautiful White Horse',
    )
    assert.ok(summer)
    assert.equal(summer.nodeType, 'chapter')
    assert.equal(summer.parentId, snapshots.id)

    assert.equal(
      englishNodes.some((node) =>
        node.nodeType === 'topic' && (node.title === 'Hornbill' || node.title === 'Snapshots')),
      false,
    )
  })

  it('keeps Geography textbooks as separate books', () => {
    const geographyNodes = CBSE_2026_27_XI_NODES.filter(
      (node) => node.subjectId === 'cbse-2026-27-xi-029',
    )
    const books = geographyNodes.filter((node) => node.nodeType === 'book')
    assert.ok(books.length >= 3)
    assert.ok(books.every((book) => book.parentId === null))
    books.forEach((book) => {
      assert.ok(geographyNodes.some((node) =>
        node.parentId === book.id && (node.nodeType === 'chapter' || node.nodeType === 'practical')))
    })
  })

  it('passes the structural catalogue validator', () => {
    const result = validateCurriculumCatalog({
      version: CBSE_2026_27_XI_VERSION,
      subjects: CBSE_2026_27_XI_SUBJECTS,
      nodes: CBSE_2026_27_XI_NODES,
      reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
      expectedGroupCounts: { L: 3, A: 19, S: 2, IA: 0 },
    })
    assert.equal(result.valid, true, JSON.stringify(result.issues))
  })

  it('detects duplicate catalogue subject IDs', () => {
    const result = validateCurriculumCatalog({
      version: CBSE_2026_27_XI_VERSION,
      subjects: [...CBSE_2026_27_XI_SUBJECTS, CBSE_2026_27_XI_SUBJECTS[0]],
      nodes: CBSE_2026_27_XI_NODES,
      reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
      expectedGroupCounts: { L: 4, A: 19, S: 2, IA: 0 },
    })
    assert.equal(result.valid, false)
    assert.ok(result.issues.some((issue) => issue.code === 'DUPLICATE_SUBJECT_ID'))
  })
})

describe('CBSE Class XI subject-combination rules', () => {
  it('accepts valid science, commerce, and humanities combinations', () => {
    const combinations = [
      ['301', '042', '043', '044', '041'],
      ['301', '055', '054', '030', '241'],
      ['301', '027', '028', '037', '039'],
      ['118', '042', '843', '043', '041', '302'],
    ]
    combinations.forEach((codes) => {
      const result = validateCbse2026ClassXiCombination(selections(codes))
      assert.equal(result.valid, true, `${codes.join(', ')}: ${JSON.stringify(result.errors)}`)
    })
  })

  it('enforces the required language and positional group rules', () => {
    const noLanguage = validateCbse2026ClassXiCombination(
      selections(['042', '043', '044', '037', '041']),
    )
    assert.ok(noLanguage.errors.some((error) => error.code === 'REQUIRED_LANGUAGE'))
    assert.ok(noLanguage.errors.some((error) => error.code === 'SUBJECT_ONE_LANGUAGE'))

    const skillAtFive = validateCbse2026ClassXiCombination(
      selections(['301', '042', '043', '044', '843']),
    )
    assert.ok(skillAtFive.errors.some((error) => error.code === 'SUBJECT_FIVE_GROUP'))
  })

  it('rejects mutually exclusive mathematics selections', () => {
    const result = validateCbse2026ClassXiCombination(
      selections(['301', '042', '043', '041', '241']),
    )
    assert.ok(result.errors.some((entry) => entry.code === 'MATH_CONFLICT'))
  })

  it('exposes stable pathway presets without restricting custom choices', () => {
    assert.deepEqual(CBSE_2026_27_XI_PATHWAY_PRESETS.science.pcm, ['042', '043', '041'])
    assert.deepEqual(CBSE_2026_27_XI_PATHWAY_PRESETS.commerce.withoutMathematics, ['055', '054', '030'])
    assert.deepEqual(CBSE_2026_27_XI_PATHWAY_PRESETS.humanities.custom, [])
    assert.deepEqual(
      subjectIdsForPreset('science', 'pcb'),
      ['cbse-2026-27-xi-042', 'cbse-2026-27-xi-043', 'cbse-2026-27-xi-044'],
    )
  })
})

describe('CBSE 2026-27 Class XII curriculum catalogue', () => {
  it('mirrors the Class XI allowlist with XII subject IDs', () => {
    assert.equal(CBSE_2026_27_XII_VERSION.grade, 'XII')
    assert.equal(CBSE_2026_27_XII_SELECTABLE_SUBJECTS.length, 24)
    assert.deepEqual(
      CBSE_2026_27_XII_SELECTABLE_SUBJECTS.map((subject) => subject.subjectCode).sort(),
      [...RECALL_XII_ALLOWLIST_CODES].sort(),
    )
    assert.deepEqual(
      [...RECALL_XII_ALLOWLIST_CODES].sort(),
      [...RECALL_XI_ALLOWLIST_CODES].sort(),
    )
  })

  it('models English Flamingo and Vistas as books with Class XII chapters', () => {
    const englishNodes = CBSE_2026_27_XII_NODES.filter(
      (node) => node.subjectId === 'cbse-2026-27-xii-301',
    )
    const flamingo = englishNodes.find((node) => node.title === 'Flamingo')
    const vistas = englishNodes.find((node) => node.title === 'Vistas')
    assert.ok(flamingo)
    assert.ok(vistas)
    assert.equal(flamingo.nodeType, 'book')
    assert.equal(vistas.nodeType, 'book')

    const lastLesson = englishNodes.find((node) => node.title === 'The Last Lesson')
    assert.ok(lastLesson)
    assert.equal(lastLesson.parentId, flamingo.id)

    const thirdLevel = englishNodes.find((node) => node.title === 'The Third Level')
    assert.ok(thirdLevel)
    assert.equal(thirdLevel.parentId, vistas.id)
  })

  it('accepts a valid Class XII science combination', () => {
    const codes = ['301', '042', '043', '843', '041']
    const picks = codes.map((code, index) => {
      const subject = CBSE_2026_27_XII_SUBJECTS_BY_CODE.get(code)
      assert.ok(subject)
      return {
        curriculumSubjectId: subject.id,
        subjectPosition: index + 1,
        selectionType: 'main',
      }
    })
    const result = validateCbse2026ClassXiiCombination(picks)
    assert.equal(result.valid, true)
    assert.deepEqual(
      subjectIdsForXiiPreset('science', 'pcm'),
      ['cbse-2026-27-xii-042', 'cbse-2026-27-xii-043', 'cbse-2026-27-xii-041'],
    )
  })
})

describe('legacy subject mapping', () => {
  it('maps common PCM and cross-stream aliases deterministically', () => {
    assert.deepEqual(resolveLegacySubject('Physics'), {
      normalized: 'physics',
      curriculumSubjectId: 'cbse-2026-27-xi-042',
      subjectCode: '042',
      confidence: 'exact',
    })
    assert.equal(resolveLegacySubject('Maths').subjectCode, '041')
    assert.equal(resolveLegacySubject('Pol Science').subjectCode, '028')
    assert.equal(resolveLegacySubject('AI').subjectCode, '843')
    assert.equal(resolveLegacySubject('unknown elective').confidence, 'unresolved')
  })
})
