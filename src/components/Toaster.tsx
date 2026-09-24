import { useEffect } from 'react'

import { useToastStore, type Toast } from '@/lib/toast'

function ToastItem({ item }: { item: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 2500)
    return () => clearTimeout(timer)
  }, [dismiss, item.id])

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
