import { useEffect } from 'react'

import { useToastStore, type Toast } from '@/lib/toast'

function ToastItem({ item }: { item: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.tone === 'reward' ? 4500 : 2500)
    return () => clearTimeout(timer)
  }, [dismiss, item.id])

  if (item.tone === 'reward') {
    return (
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        className="toast-pop pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-card border border-faction-tide/50 bg-gradient-to-br from-ink-800 to-ink-900 px-4 py-3 text-left shadow-[0_16px_44px_-16px] shadow-faction-tide/70"
      >
        <span
          aria-hidden
          className="toast-shine absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-ink-50/25 to-transparent"
        />
        <span className="relative shrink-0">{item.icon}</span>
        <span className="relative min-w-0">
          <span className="block font-display text-base text-faction-tide">{item.message}</span>
          {item.detail ? (
            <span className="mt-0.5 block text-xs text-ink-200">{item.detail}</span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <div className="pointer-events-auto rounded-card border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 shadow-lg">
      {item.message}
    </div>
  )
}

/** Bottom-centred transient messages, floating above the tab bar. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </div>
  )
}
