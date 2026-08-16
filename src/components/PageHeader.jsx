import { cn } from '@/lib/utils'

export default function PageHeader({ title, description, actions, className = '' }) {
  return (
    <header className={cn('-mt-4 mb-5 flex items-start justify-between gap-4 md:mb-6 lg:-mt-5', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3 pt-1">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
