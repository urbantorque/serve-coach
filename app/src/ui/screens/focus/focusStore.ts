/**
 * Focus-area UI state. Health answers (today's body check and an active referral) live in memory
 * only; the referral switch persists through the profile's painFlag only when the player agreed to
 * save body-check answers on this phone (COACHING §10.1; D8). Per-device conveniences (cue swap,
 * "I'm playing tonight", the planned re-test day) are kept in localStorage.
 */
import { create } from 'zustand'
import type { BodyCheck, CueRegister, ReferralLevel } from '../../../coaching/index.ts'

const KEY = 'serve-coach:focus'

interface Persisted {
  playingTonight?: string
  cueOverride: Record<string, CueRegister>
  plannedRetest: Record<string, string>
  consentDeclined?: boolean
}

function read(): Persisted {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) return { cueOverride: {}, plannedRetest: {}, ...(JSON.parse(raw) as Partial<Persisted>) }
  } catch {
    // Storage can be blocked (private mode); the defaults apply.
  }
  return { cueOverride: {}, plannedRetest: {} }
}

function write(p: Persisted) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p))
  } catch {
    // A convenience only.
  }
}

export const todayYmd = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface FocusState extends Persisted {
  /** Today's body-check answer (session only). */
  bodyCheck?: { date: string; check: BodyCheck }
  /** A referral raised in this session (its level; the profile flag keeps it across reloads with consent). */
  referral?: ReferralLevel
  /** "Remind me in 3 days" (session memory only, like the referral itself). */
  remindFrom?: string
  setRemindFrom: (date: string | undefined) => void
  setBodyCheck: (check: BodyCheck) => void
  setReferral: (level: ReferralLevel | undefined) => void
  setPlayingTonight: (on: boolean) => void
  setCueOverride: (itemId: string, register: CueRegister) => void
  planRetest: (experimentId: string, date: string) => void
  declineConsent: () => void
}

export const useFocusStore = create<FocusState>()((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    const s = { ...get(), ...patch }
    write({ playingTonight: s.playingTonight, cueOverride: s.cueOverride, plannedRetest: s.plannedRetest, consentDeclined: s.consentDeclined })
    set(patch)
  }
  return {
    ...read(),
    setBodyCheck: (check) => set({ bodyCheck: { date: todayYmd(), check } }),
    setReferral: (level) => set(level ? { referral: level } : { referral: undefined, remindFrom: undefined }),
    setRemindFrom: (date) => set({ remindFrom: date }),
    setPlayingTonight: (on) => persist({ playingTonight: on ? todayYmd() : undefined }),
    setCueOverride: (itemId, register) => persist({ cueOverride: { ...get().cueOverride, [itemId]: register } }),
    planRetest: (experimentId, date) => persist({ plannedRetest: { ...get().plannedRetest, [experimentId]: date } }),
    declineConsent: () => persist({ consentDeclined: true }),
  }
})

/** Today's body check, if answered today. */
export function useTodayBodyCheck(): BodyCheck | undefined {
  const b = useFocusStore((s) => s.bodyCheck)
  return b && b.date === todayYmd() ? b.check : undefined
}

/** The planned re-test day for an experiment (read by Today's experiment strip). */
export function plannedRetestFor(experimentId: string): string | undefined {
  return useFocusStore.getState().plannedRetest[experimentId]
}

/**
 * Back to a fresh install's state, after "Delete everything": the in-memory body check and referral,
 * and the per-device conveniences (whose storage was just cleared, so a later change cannot write the
 * old values back).
 */
export function resetFocusStore(): void {
  useFocusStore.setState({
    bodyCheck: undefined,
    referral: undefined,
    remindFrom: undefined,
    playingTonight: undefined,
    cueOverride: {},
    plannedRetest: {},
    consentDeclined: undefined,
  })
}
