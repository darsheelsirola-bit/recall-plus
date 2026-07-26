import { getPsychologyTechnique } from './psychologyTechniques.js'

export const TECHNIQUE_SUBJECT = 'Technique'

const DEFAULTS = {
  'error-log': { weekday: 6, startTime: '15:00', durationMinutes: 45 },
  'pre-sleep-preview': { weekday: 0, startTime: '21:30', durationMinutes: 10 },
  'implementation-intention': { weekday: 6, startTime: '20:00', durationMinutes: 15 },
  pomodoro: { weekday: 1, startTime: '17:00', durationMinutes: 30 },
  environment: { weekday: 0, startTime: '21:00', durationMinutes: 5 },
}

export const TIMETABLE_TECHNIQUE_IDS = Object.freeze(Object.keys(DEFAULTS))

export const timetablePsychologyTechniques = TIMETABLE_TECHNIQUE_IDS.map((id) => {
  const technique = getPsychologyTechnique(id)
  const defaults = DEFAULTS[id]
  return {
    id,
    name: technique?.name || id,
    summary: technique?.summary || '',
    weekday: defaults.weekday,
    startTime: defaults.startTime,
    durationMinutes: defaults.durationMinutes,
  }
})

export function getTimetableTechnique(id) {
  return timetablePsychologyTechniques.find((item) => item.id === id) || null
}

export function isTimetableTechniqueId(id) {
  return TIMETABLE_TECHNIQUE_IDS.includes(id)
}
