export const SUBJECT_COLORS = Object.freeze({
  Physics: '#3838B8',
  Chemistry: '#2BB9A5',
  Maths: '#FF716A',
  Technique: '#8B5CF6',
})

export const UNKNOWN_SUBJECT_COLOR = '#94A3B8'

const PALETTE = Object.freeze([
  '#3838B8',
  '#2BB9A5',
  '#FF716A',
  '#8B5CF6',
  '#F59E0B',
  '#0EA5E9',
  '#EC4899',
  '#16A34A',
])

export function subjectColor(subject, index = 0) {
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject]
  let hash = 0
  for (const character of String(subject || '')) {
    hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  }
  return PALETTE[(hash + index) % PALETTE.length]
}
