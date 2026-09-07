import type { CurriculumVersion } from '../../../types.ts'

export const CBSE_2026_27_XII_VERSION_ID = 'cbse-2026-27-xii-v1'
export const CBSE_2026_27_XII_SCHEME_URL =
  'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf'
export const CBSE_2026_27_XII_CURRICULUM_PAGE =
  'https://cbseacademic.nic.in/curriculum_2027.html'
export const CBSE_2026_27_XII_SKILL_PAGE =
  'https://cbseacademic.nic.in/skill-education-curriculum.html'
export const CBSE_2026_27_XII_SKILL_LIST_URL =
  'https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf'
export const CBSE_2026_27_XII_AI_URL =
  'https://cbseacademic.nic.in/web_material/Curriculum26/SrSec/843-AI-XII.pdf'

export const CBSE_2026_27_XII_VERSION: CurriculumVersion = Object.freeze({
  id: CBSE_2026_27_XII_VERSION_ID,
  board: 'CBSE',
  academicYear: '2026-27',
  grade: 'XII',
  version: '1.0.0',
  status: 'reviewed',
  sourceUrl: CBSE_2026_27_XII_SCHEME_URL,
  sourceTitle: 'Secondary Curriculum Part II (Classes XI-XII), 2026-27',
  sourceHash:
    '5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042',
  importedAt: '2026-08-12T00:00:00.000Z',
  verifiedAt: '2026-08-12T00:00:00.000Z',
})
