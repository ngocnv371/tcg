import { cn } from '@/lib/utils'

/**
 * Segmented control shared by the screens that split into views (Vault, Quests). Kept dumb and
 * controlled: the screen owns which tab is active, often deriving it from the URL, so a tab is
 * never stored twice.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mb-3 grid gap-1 rounded-card border border-ink-800 bg-ink-900/70 p-1"
      // Column count follows the tab list, so the control stays generic (Tailwind can't build
      // a `grid-cols-<n>` class from a runtime value).
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-card py-2 text-sm font-medium transition-colors',
            value === id ? 'bg-ink-700 text-gold-300' : 'text-ink-400 hover:text-ink-100',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
