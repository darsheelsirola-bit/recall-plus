import { Card, CardContent } from '@/components/ui/card'

export default function ProgressCard({ label, value, helper, icon: Icon, tone = 'indigo', onClick, active = false }) {
  const colors = { indigo: 'bg-secondary text-primary', mint: 'bg-accent text-mint', coral: 'bg-rose-50 text-coral', amber: 'bg-amber-50 text-amber-700' }
  const interactive = typeof onClick === 'function'
  const content = (
    <CardContent className="p-4">
      <div className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}><Icon className="size-4" /></div>
      <p className="mt-4 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      {interactive ? <p className="mt-2 text-xs font-semibold text-primary">{active ? 'Showing below' : 'View details'}</p> : null}
    </CardContent>
  )
  return (
    <Card className={`transition ${interactive ? 'hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-soft' : ''} ${active ? 'ring-2 ring-primary' : ''}`}>
      {interactive ? <button type="button" onClick={onClick} className="w-full text-left">{content}</button> : content}
    </Card>
  )
}
