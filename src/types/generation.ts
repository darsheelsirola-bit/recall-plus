export type GenerationFeature = 'quiz' | 'timetable'

export interface GenerationFeatureStatus {
  limit: number
  used: number
  remaining: number
  inProgress: boolean
  localDate: string
  resetAt: string
}

export interface GenerationUsageResponse {
  quiz: GenerationFeatureStatus
  timetable: GenerationFeatureStatus
}

export interface GenerationUsageEventDetail {
  feature: GenerationFeature
  remaining?: number
  used?: number
  limit?: number
  resetAt?: string
  localDate?: string
  inProgress?: boolean
}

export interface GenerationApiMetadata {
  remaining?: number
  used?: number
  limit?: number
  resetAt?: string
  localDate?: string
  inProgress?: boolean
}

export const DAILY_GENERATION_LIMIT = 10
export const GENERATION_LIMIT_MESSAGE = 'You have reached today’s limit of 10 generations. Try again tomorrow.'
