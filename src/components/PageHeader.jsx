export default function PageHeader({ title, description, actions }) {
  return (
    <header className="-mt-4 mb-3 flex items-start justify-between gap-4 md:mb-4 lg:-mt-5">
      <div className="min-w-0 flex-1 pr-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-start">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
