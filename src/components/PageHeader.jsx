export default function PageHeader({ title, description, actions }) {
  return (
    <header className="-mt-4 mb-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:mb-4 lg:-mt-5">
      <div className="min-w-0 flex-1 sm:pr-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 self-start sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
