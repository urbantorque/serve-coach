/**
 * The in-progress onboarding answers. Kept in memory and mirrored to sessionStorage (a per-tab
 * convenience, so a reload mid-way keeps the answers); written to the profile only at the end or when
 * the player leaves set-up. sessionStorage can be missing or throw, so every access is guarded.
 */
import { create } from 'zustand'
import { EMPTY_DRAFT, type OnboardingDraft } from './model.ts'

const KEY = 'serve-coach:onboarding-draft'

function read(): OnboardingDraft {
  try {
    const raw = globalThis.sessionStorage?.getItem(KEY)
    if (raw) return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<OnboardingDraft>) }
  } catch {
    // Private mode or blocked storage: start empty.
  }
  return EMPTY_DRAFT
}

function write(d: OnboardingDraft | null): void {
  try {
    if (d) globalThis.sessionStorage?.setItem(KEY, JSON.stringify(d))
    else globalThis.sessionStorage?.removeItem(KEY)
  } catch {
    // A convenience only.
  }
}

export interface DraftState {
  draft: OnboardingDraft
  update: (patch: Partial<OnboardingDraft>) => void
  reset: () => void
  /** Forgets the stored (sessionStorage) copy only; the answers in memory stay for this visit. */
  clearStored: () => void
}

export const useOnboardingDraft = create<DraftState>()((set, get) => ({
  draft: read(),
  update: (patch) => {
    const draft = { ...get().draft, ...patch }
    write(draft)
    set({ draft })
  },
  reset: () => {
    write(null)
    set({ draft: EMPTY_DRAFT })
  },
  clearStored: () => write(null),
}))
