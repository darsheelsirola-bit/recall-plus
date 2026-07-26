import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function BackButton({ to, onClick, label = 'Back', className = '' }) {
  if (to) {
    return (
      <Button variant="outline" size="sm" className={className} render={<Link to={to} />}>
        <ArrowLeft data-icon="inline-start" />
        {label}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" className={className} onClick={onClick}>
      <ArrowLeft data-icon="inline-start" />
      {label}
    </Button>
  )
}
