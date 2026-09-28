/**
 * Per-phone conveniences for Today (localStorage, like the focus store's): the comp night whose
 * morning-after card was dismissed. Storage can be blocked (private mode); the card then just shows.
 */
import { create } from 'zustand'

const KEY = 'serve-coach:today'

function read(): { morningAfterDismissed?: string } {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) return JSON.parse(raw) as { morningAfterDismissed?: string }
  } catch {
    // The default applies.
  }
  return {}
}

interface TodayState {
  morningAfterDismissed?: string
  dismissMorningAfter: (date: string) => void
}

export const useTodayStore = create<TodayState>()((set) => ({
  ...read(),
  dismissMorningAfter: (date) => {
    set({ morningAfterDismissed: date })
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ morningAfterDismissed: date }))
    } catch {
      // A convenience only.
    }
  },
}))
