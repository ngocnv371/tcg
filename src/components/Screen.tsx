import { cn } from '@/lib/utils'

export function Screen({
  title,
  week,
  hint,
  children,
  className,
}: {
  title: string
  week?: string
  hint?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-md px-4 py-4', className)}>
      <header className="mb-4">
        <h1 className="font-display text-xl text-ink-50">{title}</h1>
        {week ? <p className="mt-0.5 text-xs text-gold-500">{week}</p> : null}
        {hint ? <p className="mt-1 text-sm text-ink-400">{hint}</p> : null}
      </header>
      {children}
    </div>
  )
}

export function Panel({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-card border border-ink-800 bg-ink-900/70 p-4', className)}>
      {title ? <h2 className="mb-2 text-sm font-medium text-ink-200">{title}</h2> : null}
      {children}
    </section>
  )
}

/** Shows what a not-yet-built screen will hold, so the plan stays visible in-app. */
export function Planned({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-ink-400">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="text-ink-600">
            ▢
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
