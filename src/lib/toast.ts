import type { ReactNode } from 'react'

import { create } from 'zustand'

export type Toast = {
  id: number
  message: string
  /** Reward toasts celebrate a gain or a spend, so they get art, an accent and an entrance. */
  tone: 'default' | 'reward'
  icon?: ReactNode
  detail?: string
}

type ToastInput = Omit<Toast, 'id'>

type ToastStore = {
  toasts: Toast[]
  push: (toast: ToastInput) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => set((state) => ({ toasts: [...state.toasts, { ...toast, id: nextId++ }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function toast(message: string) {
  useToastStore.getState().push({ message, tone: 'default' })
}

/** A celebratory toast for a purchase or reward: title, a supporting line and the thing earned. */
export function rewardToast(input: { title: string; detail?: string; icon?: ReactNode }) {
  useToastStore.getState().push({
    message: input.title,
    detail: input.detail,
    icon: input.icon,
    tone: 'reward',
  })
}
