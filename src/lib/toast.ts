import { create } from 'zustand'

export type Toast = { id: number; message: string }

type ToastStore = {
  toasts: Toast[]
  push: (message: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message) => set((state) => ({ toasts: [...state.toasts, { id: nextId++, message }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function toast(message: string) {
  useToastStore.getState().push(message)
}
