/**
 * Toast queue (DESIGN §8.19): transient confirmations only ("Serve deleted. Undo", "Practice
 * logged"). Never errors that need action, never marketing. One toast shows at a time.
 */
import { create } from 'zustand'

export interface ToastAction {
  label: string
  onPress: () => void
}

export interface ToastItem {
  id: number
  message: string
  action?: ToastAction
  /** 4 s by default, 8 s when the toast carries an action such as Undo. */
  durationMs: number
}

export interface ToastState {
  queue: ToastItem[]
  show: (t: { message: string; action?: ToastAction; durationMs?: number }) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>()((set) => ({
  queue: [],
  show: ({ message, action, durationMs }) => {
    const id = nextId++
    const item: ToastItem = { id, message, action, durationMs: durationMs ?? (action ? 8000 : 4000) }
    set((s) => ({ queue: [...s.queue, item] }))
    return id
  },
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
}))

/** Convenience for non-React callers. */
export function showToast(message: string, action?: ToastAction): number {
  return useToastStore.getState().show({ message, action })
}
