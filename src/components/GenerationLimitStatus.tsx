import { useGenerationUsage } from '../contexts/GenerationUsageContext'
import {
  GENERATION_LIMIT_MESSAGE,
  type GenerationFeature,
} from '../types/generation'

interface GenerationLimitStatusProps {
  feature: GenerationFeature
  className?: string
}

export default function GenerationLimitStatus({ feature, className = '' }: GenerationLimitStatusProps) {
  const { remaining, limit, exhausted, loading, error } = useGenerationUsage(feature)
  const label = feature === 'quiz' ? 'Quiz' : 'Timetable'

  return (
    <div className={className} aria-live="polite">
      <p className="text-xs font-medium text-muted-foreground">
        {label} generations remaining today: {loading ? '…' : remaining}/{limit}
      </p>
      {exhausted ? <p role="alert" className="mt-1 text-xs font-semibold text-coral">{GENERATION_LIMIT_MESSAGE}</p> : null}
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-coral">Generation limits are temporarily unavailable. Please retry shortly.</p> : null}
    </div>
  )
}
