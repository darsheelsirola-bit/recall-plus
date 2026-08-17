import type {
  AcademicPathway,
  CurriculumContentStatus,
  CurriculumSource,
  CurriculumSubject,
  SubjectCategory,
  SubjectGroup,
} from '../../../types.ts'
import {
  CBSE_2026_27_XI_SCHEME_URL,
  CBSE_2026_27_XI_SKILL_LIST_URL,
  CBSE_2026_27_XI_VERSION_ID,
} from './version.ts'

type PathwayTag = AcademicPathway | 'common' | 'language' | 'skill'
type SubjectTuple = readonly [
  code: string,
  name: string,
  shortName?: string,
  pathwayTags?: readonly PathwayTag[],
]

/** Authoritative Recall+ Class XI subject allowlist for this release. */
export const RECALL_XI_ALLOWLIST_CODES = Object.freeze([
  '027', '028', '029', '030', '034', '037', '039', '041', '042', '043', '044',
  '048', '049', '054', '055', '066', '074', '083', '118', '241', '301', '302',
  '843', '837',
] as const)

export const RECALL_XI_LANGUAGE_CODES = Object.freeze(['301', '302', '118'] as const)

const ACADEMIC_BASE =
  'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/'
const SKILL_BASE =
  'https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/'
const NCERT_TEXTBOOKS = 'https://ncert.nic.in/textbook.php'

const reviewedSources: Readonly<Record<string, CurriculumSource>> = Object.freeze({
  '301': {
    url: `${ACADEMIC_BASE}English_core_SecP2_2026-27.pdf`,
    title: 'English Core, Classes XI-XII, 2026-27',
    sha256: 'd2af35ab80de3dc6f1f62f3cd2b58f9cc95a39ca1d47abc45412a1034459092c',
  },
  '302': {
    url: `${ACADEMIC_BASE}Hindi_Core_SecP2_2026-27.pdf`,
    title: 'Hindi Core, Classes XI-XII, 2026-27',
    sha256: '5edab54393581154c2cf8b78802af528c2c1daeb7acfc377c461851b00f55d51',
  },
  '027': {
    url: `${ACADEMIC_BASE}History_SecP2_2026-27.pdf`,
    title: 'History, Classes XI-XII, 2026-27',
    sha256: '7c0c1280f90db4cf7f38824723ddda852c250bcbb5a458a20c2977c4381e53c4',
  },
  '028': {
    url: `${ACADEMIC_BASE}PoliticalScience_SecP2_2026-27.pdf`,
    title: 'Political Science, Classes XI-XII, 2026-27',
    sha256: '0914d089d6cd78cf56eec27fff9d42400706d8edf04163a9106b242df9e617e8',
  },
  '029': {
    url: `${ACADEMIC_BASE}Geography_SecP2_2026-27.pdf`,
    title: 'Geography, Classes XI-XII, 2026-27',
    sha256: '00e85430d75f8063902943817a57c9f22f037efb1d188b26d342b88550f8b90b',
  },
  '030': {
    url: `${ACADEMIC_BASE}Economics_SecP2_2026-27.pdf`,
    title: 'Economics, Classes XI-XII, 2026-27',
    sha256: '927800c6e72b377509533fbe281fb1aa72383e20a3ab5b7b480bd976330b49fa',
  },
  '037': {
    url: `${ACADEMIC_BASE}Psychology_SecP2_2026-27.pdf`,
    title: 'Psychology, Classes XI-XII, 2026-27',
    sha256: '98f63864c0e161fc5d31347764e1edf591de7ae2028a9351c5519fb3429d216a',
  },
  '039': {
    url: `${ACADEMIC_BASE}Sociology_SecP2_2026-27.pdf`,
    title: 'Sociology, Classes XI-XII, 2026-27',
    sha256: '8b6ba4e2bd232445be46fb01a64030a6d1b7af3d0cd066fefca73a0850a10684',
  },
  '041': {
    url: `${ACADEMIC_BASE}Maths_SecP2_2026-27.pdf`,
    title: 'Mathematics, Classes XI-XII, 2026-27',
    sha256: '5bf4105d4076189fe00b879fd6d41ffadec87a894a078a7fb912b2f219769572',
  },
  '241': {
    url: `${ACADEMIC_BASE}Applied_Mathematics_SecP2_2026-27.pdf`,
    title: 'Applied Mathematics, Classes XI-XII, 2026-27',
    sha256: '3125b1b6b00d8081bff34a1276d5f5203daa719af961d943380b4b0cb9d35a70',
  },
  '042': {
    url: `${ACADEMIC_BASE}Physics_SecP2_2026-27.pdf`,
    title: 'Physics, Classes XI-XII, 2026-27',
    sha256: '9e32271cf5a86caa605cffe2a4b5e19710abc3d3a8715ef725ba78cd94caf1f7',
  },
  '043': {
    url: `${ACADEMIC_BASE}Chemistry_SecP2_2026-27.pdf`,
    title: 'Chemistry, Classes XI-XII, 2026-27',
    sha256: '5610f09d357d3ccc9a7b39fc29cb7b1f4530847753783b16c72fff691acd2418',
  },
  '044': {
    url: `${ACADEMIC_BASE}Biology_SecP2_2026-27.pdf`,
    title: 'Biology, Classes XI-XII, 2026-27',
    sha256: '3a5767515b41b12b9356151e759beba48bb15a1b711b96c321fa273a7fa7a6ee',
  },
  '048': {
    url: `${ACADEMIC_BASE}PhysicalEducation_SecP2_2026-27.pdf`,
    title: 'Physical Education, Classes XI-XII, 2026-27',
    sha256: '5a063f5bdc3a92d60a4a86e83c985ffafc7d716359ab511cb2f09a0275c02c7a',
  },
  '054': {
    url: `${ACADEMIC_BASE}BusinessStudies_SecP2_2026-27.pdf`,
    title: 'Business Studies, Classes XI-XII, 2026-27',
    sha256: '94230c4d0627fc919ca96dd02dd1df1f21a065dd1f04455df364df7350fa8cb2',
  },
  '055': {
    url: `${ACADEMIC_BASE}Accountancy_SecP2_2026-27.pdf`,
    title: 'Accountancy, Classes XI-XII, 2026-27',
    sha256: '4a87dbd15758e42c2aa454d83708299a04b6fc12896392b13d12b9ae857ecc27',
  },
  '083': {
    url: `${ACADEMIC_BASE}Computer_Science_SecP2_2026-27.pdf`,
    title: 'Computer Science, Classes XI-XII, 2026-27',
    sha256: 'a46821a87292e5feb296a1ffdb5163f413258d1cb378b871c745539e34f96e82',
  },
  '074': {
    url: `${ACADEMIC_BASE}LegalStudies_SecP2_2026-27.pdf`,
    title: 'Legal Studies, Classes XI-XII, 2026-27',
    sha256: 'd1f7836c059406e66d6b092cffddb5120adb27a826be7b6413936fc330dd7348',
  },
  '118': {
    url: `${ACADEMIC_BASE}French_SecP2_2026-27.pdf`,
    title: 'French, Classes XI-XII, 2026-27',
    sha256: null,
  },
  '034': {
    url: `${ACADEMIC_BASE}Hindustani_Vocal_SecP2_2026-27.pdf`,
    title: 'Hindustani Music Vocal, Classes XI-XII, 2026-27',
    sha256: null,
  },
  '049': {
    url: `${ACADEMIC_BASE}Fine_Arts_SecP2_2026-27.pdf`,
    title: 'Fine Arts / Painting, Classes XI-XII, 2026-27',
    sha256: null,
  },
  '066': {
    url: `${ACADEMIC_BASE}Enterprenuership_SecP2_2026-27.pdf`,
    title: 'Entrepreneurship, Classes XI-XII, 2026-27',
    sha256: null,
  },
  '837': {
    url: 'https://cbseacademic.nic.in/web_material/Curriculum26/SrSec/837-FASHION_STUDIES-XI.pdf',
    title: 'Fashion Studies (837), Class XI, 2025-26',
    sha256: null,
  },
  '843': {
    url: `${SKILL_BASE}843-AI-XI.pdf`,
    title: 'Artificial Intelligence (843), Class XI, 2026-27',
    sha256: '3c5f083923758ceab8c5af60171bde3c95b839620a3da046cefc968eddc4a6d8',
  },
})

const languageSubjects: readonly SubjectTuple[] = [
  ['301', 'English Core', 'English Core', ['common', 'language']],
  ['302', 'Hindi Core', 'Hindi Core', ['common', 'language']],
  ['118', 'French', 'French', ['common', 'language']],
]

const academicSubjects: readonly SubjectTuple[] = [
  ['027', 'History', 'History', ['humanities']],
  ['028', 'Political Science', 'Political Science', ['humanities']],
  ['029', 'Geography', 'Geography', ['humanities']],
  ['030', 'Economics', 'Economics', ['commerce', 'humanities']],
  ['034', 'Hindustani Music Vocal', 'Hindustani Music Vocal', ['humanities']],
  ['037', 'Psychology', 'Psychology', ['science', 'humanities']],
  ['039', 'Sociology', 'Sociology', ['humanities']],
  ['041', 'Mathematics', 'Mathematics', ['science', 'commerce', 'humanities']],
  ['241', 'Applied Mathematics', 'Applied Mathematics', ['commerce', 'humanities']],
  ['042', 'Physics', 'Physics', ['science']],
  ['043', 'Chemistry', 'Chemistry', ['science']],
  ['044', 'Biology', 'Biology', ['science']],
  ['048', 'Physical Education', 'Physical Education', ['common']],
  ['049', 'Painting', 'Painting', ['humanities']],
  ['054', 'Business Studies', 'Business Studies', ['commerce']],
  ['055', 'Accountancy', 'Accountancy', ['commerce']],
  ['066', 'Entrepreneurship', 'Entrepreneurship', ['commerce', 'humanities']],
  ['074', 'Legal Studies', 'Legal Studies', ['commerce', 'humanities']],
  ['083', 'Computer Science', 'Computer Science', ['science', 'commerce', 'humanities']],
]

const skillSubjects: readonly SubjectTuple[] = [
  ['843', 'Artificial Intelligence', 'Artificial Intelligence', ['science', 'commerce', 'humanities']],
  ['837', 'Fashion Studies', 'Fashion Studies', ['humanities', 'skill']],
]

function catalogueSource(group: SubjectGroup): CurriculumSource {
  if (group === 'S') {
    return {
      url: CBSE_2026_27_XI_SKILL_LIST_URL,
      title: 'CBSE Skill Subjects Offered at Senior Secondary Level',
      sha256: '4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25',
    }
  }
  return {
    url: CBSE_2026_27_XI_SCHEME_URL,
    title: 'Secondary Curriculum Part II (Classes XI-XII), 2026-27',
    sha256: '5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042',
  }
}

function toSubject(
  tuple: SubjectTuple,
  group: SubjectGroup,
  category: SubjectCategory,
  officialOrder: number,
): CurriculumSubject {
  const [subjectCode, name, shortName = name, pathwayTags = []] = tuple
  const source = reviewedSources[subjectCode] || catalogueSource(group)
  const reviewed = Boolean(reviewedSources[subjectCode])
  return Object.freeze({
    id: `cbse-2026-27-xi-${subjectCode}`,
    curriculumVersionId: CBSE_2026_27_XI_VERSION_ID,
    subjectCode,
    name,
    shortName,
    subjectGroup: group,
    category,
    hasTheory: group === 'S' ? true : reviewed ? true : null,
    hasPractical: group === 'S'
      ? true
      : reviewed
        ? ['034', '037', '042', '043', '044', '048', '049', '055', '083'].includes(subjectCode)
        : null,
    hasInternalAssessment: reviewed
      ? ['301', '302', '037', '048', '118'].includes(subjectCode)
      : null,
    pathwayTags: group === 'L'
      ? [...new Set<PathwayTag>([...pathwayTags, 'language'])]
      : group === 'S'
        ? [...new Set<PathwayTag>([...pathwayTags, 'skill'])]
        : pathwayTags,
    source: subjectCode === '301' || subjectCode === '302'
      ? Object.freeze({
          ...source,
          title: `${source.title}; textbooks indexed via ${NCERT_TEXTBOOKS}`,
        })
      : source,
    contentStatus: (reviewed ? 'verified_outline' : 'pending_verification') as CurriculumContentStatus,
    officialOrder,
    active: true,
  })
}

export const CBSE_2026_27_XI_SUBJECTS: readonly CurriculumSubject[] =
  Object.freeze([
    ...languageSubjects.map((subject, index) =>
      toSubject(subject, 'L', 'language', index + 1)),
    ...academicSubjects.map((subject, index) =>
      toSubject(subject, 'A', 'academic_elective', index + 1)),
    ...skillSubjects.map((subject, index) =>
      toSubject(subject, 'S', 'skill_elective', index + 1)),
  ])

export const CBSE_2026_27_XI_SELECTABLE_SUBJECTS = CBSE_2026_27_XI_SUBJECTS

export const CBSE_2026_27_XI_SUBJECTS_BY_ID = new Map(
  CBSE_2026_27_XI_SUBJECTS.map((subject) => [subject.id, subject]),
)

export const CBSE_2026_27_XI_SUBJECTS_BY_CODE = new Map(
  CBSE_2026_27_XI_SUBJECTS.flatMap((subject) =>
    subject.subjectCode ? [[subject.subjectCode, subject] as const] : []),
)

export const CBSE_2026_27_XI_GROUP_COUNTS = Object.freeze({
  L: languageSubjects.length,
  A: academicSubjects.length,
  S: skillSubjects.length,
  IA: 0,
})

export const CBSE_2026_27_XI_NCRT_TEXTBOOK_INDEX = NCERT_TEXTBOOKS
