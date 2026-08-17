export interface LegacySubjectResolution {
  normalized: string
  curriculumSubjectId: string | null
  subjectCode: string | null
  confidence: 'exact' | 'alias' | 'unresolved'
}

const aliases: Readonly<Record<string, string>> = Object.freeze({
  physics: '042',
  phy: '042',
  chemistry: '043',
  chem: '043',
  mathematics: '041',
  maths: '041',
  math: '041',
  biology: '044',
  bio: '044',
  'artificial intelligence': '843',
  ai: '843',
  'computer science': '083',
  cs: '083',
  'informatics practices': '065',
  'informatics practice': '065',
  ip: '065',
  economics: '030',
  accounts: '055',
  accountancy: '055',
  'business studies': '054',
  bst: '054',
  history: '027',
  geography: '029',
  'political science': '028',
  'pol science': '028',
  'political sci': '028',
  psychology: '037',
  sociology: '039',
  'legal studies': '074',
  'physical education': '048',
  pe: '048',
  'applied mathematics': '241',
  'applied maths': '241',
  entrepreneurship: '066',
})

const canonicalNames: Readonly<Record<string, string>> = Object.freeze({
  '042': 'physics',
  '043': 'chemistry',
  '041': 'mathematics',
  '044': 'biology',
  '843': 'artificial intelligence',
  '083': 'computer science',
  '065': 'informatics practices',
  '030': 'economics',
  '055': 'accountancy',
  '054': 'business studies',
  '027': 'history',
  '029': 'geography',
  '028': 'political science',
  '037': 'psychology',
  '039': 'sociology',
  '074': 'legal studies',
  '048': 'physical education',
  '241': 'applied mathematics',
  '066': 'entrepreneurship',
})

function normalizeLegacyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function resolveLegacySubject(value: unknown): LegacySubjectResolution {
  const normalized = normalizeLegacyName(value)
  const code = aliases[normalized] || null
  return {
    normalized,
    curriculumSubjectId: code ? `cbse-2026-27-xii-${code}` : null,
    subjectCode: code,
    confidence: code
      ? normalized === canonicalNames[code]
        ? 'exact'
        : 'alias'
      : 'unresolved',
  }
}

export const LEGACY_SUBJECT_ALIASES = aliases
