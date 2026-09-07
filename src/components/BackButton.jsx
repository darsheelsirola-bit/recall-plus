import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function BackButton({ to, onClick, label = 'Back', className = '' }) {
  const classes = cn('shrink-0', className)

  if (to) {
    return (
      <Button variant="outline" size="sm" className={classes} render={<Link to={to} />}>
        <ArrowLeft data-icon="inline-start" />
        {label}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" className={classes} onClick={onClick}>
      <ArrowLeft data-icon="inline-start" />
      {label}
    </Button>
  )
}
