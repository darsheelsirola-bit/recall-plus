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

const ACADEMIC_BASE =
  'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/'
const SKILL_BASE =
  'https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/'

const reviewedSources: Readonly<Record<string, CurriculumSource>> = Object.freeze({
  '001': {
    url: `${ACADEMIC_BASE}English_elective_SecP2_2026-27.pdf`,
    title: 'English Elective, Classes XI-XII, 2026-27',
    sha256: '624caad4033a7fd99760c96ec5fa23763739d243b12c52446c9ab6d581fbecb2',
  },
  '301': {
    url: `${ACADEMIC_BASE}English_core_SecP2_2026-27.pdf`,
    title: 'English Core, Classes XI-XII, 2026-27',
    sha256: 'd2af35ab80de3dc6f1f62f3cd2b58f9cc95a39ca1d47abc45412a1034459092c',
  },
  '002': {
    url: `${ACADEMIC_BASE}Hindi_Elective_SecP2_2026-27.pdf`,
    title: 'Hindi Elective, Classes XI-XII, 2026-27',
    sha256: '6f288e1cc34cdb341348d176ad6a748a6760966675dc93e6644e5fe971dbbccb',
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
  '064': {
    url: `${ACADEMIC_BASE}Home_Science_SecP2_2026-27.pdf`,
    title: 'Home Science, Classes XI-XII, 2026-27',
    sha256: 'a8bb5904a25b50a3a4b145cca47f74fa9a6f9e4cf66d39a5fec09e50e1358fdb',
  },
  '065': {
    url: `${ACADEMIC_BASE}Informatics_Practices_SecP2_2026-27.pdf`,
    title: 'Informatics Practices, Classes XI-XII, 2026-27',
    sha256: '05747d6271e50d1221f312c710a3175e967f6d2d0f29a0f2cbc992f8267f8d34',
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
  '802': {
    url: `${SKILL_BASE}802-IT.pdf`,
    title: 'Information Technology (802), Classes XI-XII, 2026-27',
    sha256: 'c85720f1a12459593ed5096fed7d7f2b36cfed88f89cd897806b66cc993364c7',
  },
  '843': {
    url: `${SKILL_BASE}843-AI-XI.pdf`,
    title: 'Artificial Intelligence (843), Class XI, 2026-27',
    sha256: '3c5f083923758ceab8c5af60171bde3c95b839620a3da046cefc968eddc4a6d8',
  },
})

const languageSubjects: readonly SubjectTuple[] = [
  ['001', 'English Elective', 'English Elective', ['common', 'language']],
  ['301', 'English Core', 'English Core', ['common', 'language']],
  ['002', 'Hindi Elective', 'Hindi Elective', ['common', 'language']],
  ['302', 'Hindi Core', 'Hindi Core', ['common', 'language']],
  ['003', 'Urdu Elective'],
  ['303', 'Urdu Core'],
  ['022', 'Sanskrit Elective'],
  ['322', 'Sanskrit Core'],
  ['104', 'Punjabi'],
  ['105', 'Bengali'],
  ['106', 'Tamil'],
  ['107', 'Telugu (AP)', 'Telugu AP'],
  ['189', 'Telugu (Telangana)', 'Telugu Telangana'],
  ['108', 'Sindhi'],
  ['109', 'Marathi'],
  ['110', 'Gujarati'],
  ['111', 'Manipuri'],
  ['112', 'Malayalam'],
  ['113', 'Odia'],
  ['114', 'Assamese'],
  ['115', 'Kannada'],
  ['116', 'Arabic'],
  ['117', 'Tibetan'],
  ['118', 'French'],
  ['120', 'German'],
  ['121', 'Russian'],
  ['123', 'Persian'],
  ['124', 'Nepali'],
  ['125', 'Limboo'],
  ['126', 'Lepcha'],
  ['188', 'Bhoti'],
  ['191', 'Kokborok'],
  ['192', 'Bodo'],
  ['193', 'Tangkhul'],
  ['194', 'Japanese'],
  ['195', 'Bhutia'],
  ['196', 'Spanish'],
  ['197', 'Kashmiri'],
  ['198', 'Mizo'],
]

const academicSubjects: readonly SubjectTuple[] = [
  ['027', 'History', 'History', ['humanities']],
  ['028', 'Political Science', 'Political Science', ['humanities']],
  ['029', 'Geography', 'Geography', ['humanities']],
  ['030', 'Economics', 'Economics', ['commerce', 'humanities']],
  ['031', 'Carnatic Music (Vocal)'],
  ['032', 'Carnatic Music (Melodic Instruments)'],
  ['033', 'Carnatic Music (Percussion Instruments - Mridangam)'],
  ['034', 'Hindustani Music (Vocal)'],
  ['035', 'Hindustani Music (Melodic Instruments)'],
  ['036', 'Hindustani Music (Percussion Instruments)'],
  ['037', 'Psychology', 'Psychology', ['humanities']],
  ['039', 'Sociology', 'Sociology', ['humanities']],
  ['041', 'Mathematics', 'Mathematics', ['science', 'commerce', 'humanities']],
  ['241', 'Applied Mathematics', 'Applied Mathematics', ['commerce', 'humanities']],
  ['042', 'Physics', 'Physics', ['science']],
  ['043', 'Chemistry', 'Chemistry', ['science']],
  ['044', 'Biology', 'Biology', ['science']],
  ['045', 'Biotechnology', 'Biotechnology', ['science']],
  ['046', 'Engineering Graphics', 'Engineering Graphics', ['science']],
  ['048', 'Physical Education', 'Physical Education', ['common']],
  ['049', 'Painting'],
  ['050', 'Graphics'],
  ['051', 'Sculpture'],
  ['052', 'Applied/Commercial Art'],
  ['054', 'Business Studies', 'Business Studies', ['commerce']],
  ['055', 'Accountancy', 'Accountancy', ['commerce']],
  ['056', 'Kathak Dance'],
  ['057', 'Bharatanatyam Dance'],
  ['058', 'Kuchipudi Dance'],
  ['059', 'Odissi Dance'],
  ['060', 'Manipuri Dance'],
  ['061', 'Kathakali Dance'],
  ['064', 'Home Science', 'Home Science', ['humanities']],
  ['065', 'Informatics Practices', 'Informatics Practices', ['science', 'commerce', 'humanities']],
  ['083', 'Computer Science', 'Computer Science', ['science', 'commerce', 'humanities']],
  ['066', 'Entrepreneurship', 'Entrepreneurship', ['commerce']],
  ['073', 'Knowledge Tradition and Practices of India', 'Knowledge Traditions'],
  ['074', 'Legal Studies', 'Legal Studies', ['commerce', 'humanities']],
  ['076', 'NCC'],
]

const skillSubjects: readonly SubjectTuple[] = [
  ['801', 'Retail'],
  ['802', 'Information Technology', 'Information Technology'],
  ['803', 'Web Application'],
  ['804', 'Automotive'],
  ['805', 'Financial Markets Management'],
  ['806', 'Tourism'],
  ['807', 'Beauty and Wellness'],
  ['808', 'Agriculture'],
  ['809', 'Food Production'],
  ['810', 'Front Office Operations'],
  ['811', 'Banking'],
  ['812', 'Marketing'],
  ['813', 'Health Care'],
  ['814', 'Insurance'],
  ['816', 'Horticulture'],
  ['817', 'Typography and Computer Application'],
  ['818', 'Geospatial Technology'],
  ['819', 'Electrical Technology'],
  ['820', 'Electronic Technology'],
  ['821', 'Multi-Media'],
  ['822', 'Taxation'],
  ['823', 'Cost Accounting'],
  ['824', 'Office Procedures and Practices'],
  ['825', 'Shorthand (English)'],
  ['826', 'Shorthand (Hindi)'],
  ['827', 'Air-Conditioning and Refrigeration'],
  ['828', 'Medical Diagnostics'],
  ['829', 'Textile Design'],
  ['830', 'Design'],
  ['831', 'Salesmanship'],
  ['833', 'Business Administration', 'Business Administration', ['commerce']],
  ['834', 'Food Nutrition and Dietetics'],
  ['835', 'Mass Media Studies', 'Mass Media Studies', ['humanities']],
  ['836', 'Library and Information Science'],
  ['837', 'Fashion Studies'],
  ['841', 'Yoga'],
  ['842', 'Early Childhood Care and Education'],
  ['843', 'Artificial Intelligence', 'Artificial Intelligence', ['science', 'commerce', 'humanities']],
  ['844', 'Data Science', 'Data Science', ['science', 'commerce']],
  ['845', 'Physical Activity Trainer'],
  ['846', 'Land Transportation Associate'],
  ['847', 'Electronics and Hardware'],
  ['848', 'Design Thinking and Innovation'],
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
    hasPractical: group === 'S' ? true : reviewed ? ['037', '042', '043', '044', '048', '055', '064', '065', '083'].includes(subjectCode) : null,
    hasInternalAssessment: reviewed ? ['001', '002', '301', '302', '037', '048'].includes(subjectCode) : null,
    pathwayTags: group === 'L'
      ? [...new Set<PathwayTag>([...pathwayTags, 'language'])]
      : group === 'S'
        ? [...new Set<PathwayTag>([...pathwayTags, 'skill'])]
        : pathwayTags,
    source,
    contentStatus: (reviewed ? 'verified_outline' : 'pending_verification') as CurriculumContentStatus,
    officialOrder,
    active: true,
  })
}

const internalSubjects: readonly CurriculumSubject[] = [
  ['hpe', 'Health and Physical Education'],
  ['work-experience', 'Work Experience'],
  ['general-studies', 'General Studies'],
].map(([key, name], index): CurriculumSubject => Object.freeze({
    id: `cbse-2026-27-xi-ia-${key}`,
    curriculumVersionId: CBSE_2026_27_XI_VERSION_ID,
    subjectCode: null,
    name,
    shortName: name,
    subjectGroup: 'IA',
    category: 'internal_assessment',
    hasTheory: null,
    hasPractical: null,
    hasInternalAssessment: true,
    pathwayTags: ['common'] as const,
    source: catalogueSource('IA'),
    contentStatus: 'pending_verification',
    officialOrder: index + 1,
    active: true,
  }))

export const CBSE_2026_27_XI_SUBJECTS: readonly CurriculumSubject[] =
  Object.freeze([
    ...languageSubjects.map((subject, index) =>
      toSubject(subject, 'L', 'language', index + 1)),
    ...academicSubjects.map((subject, index) =>
      toSubject(subject, 'A', 'academic_elective', index + 1)),
    ...skillSubjects.map((subject, index) =>
      toSubject(subject, 'S', 'skill_elective', index + 1)),
    ...internalSubjects,
  ])

export const CBSE_2026_27_XI_SELECTABLE_SUBJECTS =
  CBSE_2026_27_XI_SUBJECTS.filter((subject) => subject.subjectGroup !== 'IA')

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
  IA: internalSubjects.length,
})
