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
  resolveLegacySubject,
  subjectIdsForPreset,
  validateCbse2026ClassXiCombination,
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
  it('contains every official selectable code and internal-assessment area', () => {
    assert.deepEqual(CBSE_2026_27_XI_GROUP_COUNTS, {
      L: 39,
      A: 39,
      S: 43,
      IA: 3,
    })
    assert.equal(CBSE_2026_27_XI_SELECTABLE_SUBJECTS.length, 121)
    assert.equal(CBSE_2026_27_XI_SUBJECTS.length, 124)

    const codesFor = (group) => CBSE_2026_27_XI_SELECTABLE_SUBJECTS
      .filter((subject) => subject.subjectGroup === group)
      .map((subject) => subject.subjectCode)
    assert.deepEqual(codesFor('L'), [
      '001', '301', '002', '302', '003', '303', '022', '322', '104', '105',
      '106', '107', '189', '108', '109', '110', '111', '112', '113', '114',
      '115', '116', '117', '118', '120', '121', '123', '124', '125', '126',
      '188', '191', '192', '193', '194', '195', '196', '197', '198',
    ])
    assert.deepEqual(codesFor('A'), [
      '027', '028', '029', '030', '031', '032', '033', '034', '035', '036',
      '037', '039', '041', '241', '042', '043', '044', '045', '046', '048',
      '049', '050', '051', '052', '054', '055', '056', '057', '058', '059',
      '060', '061', '064', '065', '083', '066', '073', '074', '076',
    ])
    assert.deepEqual(codesFor('S'), [
      '801', '802', '803', '804', '805', '806', '807', '808', '809', '810',
      '811', '812', '813', '814', '816', '817', '818', '819', '820', '821',
      '822', '823', '824', '825', '826', '827', '828', '829', '830', '831',
      '833', '834', '835', '836', '837', '841', '842', '843', '844', '845',
      '846', '847', '848',
    ])
  })

  it('contains the cross-stream and major subject codes required by the product', () => {
    const requiredCodes = [
      '001', '301', '002', '302',
      '041', '241', '042', '043', '044',
      '027', '028', '029', '030', '037', '039',
      '048', '054', '055', '065', '083', '074',
      '801', '802', '833', '843',
    ]
    requiredCodes.forEach((code) => {
      assert.ok(CBSE_2026_27_XI_SUBJECTS_BY_CODE.has(code), `Missing ${code}`)
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

  it('passes the structural catalogue validator', () => {
    const result = validateCurriculumCatalog({
      version: CBSE_2026_27_XI_VERSION,
      subjects: CBSE_2026_27_XI_SUBJECTS,
      nodes: CBSE_2026_27_XI_NODES,
      reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
      expectedGroupCounts: { L: 39, A: 39, S: 43, IA: 3 },
    })
    assert.equal(result.valid, true, JSON.stringify(result.issues))
    assert.equal(result.counts.reviewedSubjects, 24)
  })

  it('detects duplicate catalogue subject IDs', () => {
    const result = validateCurriculumCatalog({
      version: CBSE_2026_27_XI_VERSION,
      subjects: [...CBSE_2026_27_XI_SUBJECTS, CBSE_2026_27_XI_SUBJECTS[0]],
      nodes: CBSE_2026_27_XI_NODES,
      reviewedSubjectCodes: CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES,
      expectedGroupCounts: { L: 40, A: 39, S: 43, IA: 3 },
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
      ['301', '042', '843', '043', '041', '118'],
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

  it('rejects official mutually exclusive subject combinations', () => {
    const cases = [
      { codes: ['301', '042', '043', '041', '241'], error: 'MATH_CONFLICT' },
      { codes: ['301', '042', '083', '065', '041'], error: 'COMPUTER_CONFLICT' },
      { codes: ['301', '054', '833', '030', '041'], error: 'BUSINESS_CONFLICT' },
      { codes: ['301', '001', '042', '043', '041'], error: 'LANGUAGE_LEVEL_CONFLICT' },
    ]
    cases.forEach(({ codes, error }) => {
      const result = validateCbse2026ClassXiCombination(selections(codes))
      assert.ok(result.errors.some((entry) => entry.code === error), error)
    })
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
