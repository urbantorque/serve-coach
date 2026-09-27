/**
 * Transient UI state shared across screens (not persisted): list filters, the running analysis
 * job's progress for the Record tab status row, and which one-time coach marks were shown.
 */
import { create } from 'zustand'
import type { ServeNumber, ServeSide } from '../../analysis/types.ts'
import type { AnalysisProgress } from '../domain.ts'

/** Progress and Sessions scope by the D1 view; statistics are never mixed across views. */
export interface ViewFilter {
  view: 'side' | 'rear'
  side: ServeSide | 'all'
  serveNumber: ServeNumber | 'all'
}

export interface UiState {
  sessionsFilter: ViewFilter | null
  progressFilter: ViewFilter
  activeJob: (AnalysisProgress & { sessionId: string }) | null
  coachMarksSeen: string[]
  setSessionsFilter: (f: ViewFilter | null) => void
  setProgressFilter: (patch: Partial<ViewFilter>) => void
  setActiveJob: (job: UiState['activeJob']) => void
  markCoachMarkSeen: (id: string) => void
}

export const useUiStore = create<UiState>()((set) => ({
  sessionsFilter: null,
  progressFilter: { view: 'side', side: 'deuce', serveNumber: 1 },
  activeJob: null,
  coachMarksSeen: [],
  setSessionsFilter: (sessionsFilter) => set({ sessionsFilter }),
  setProgressFilter: (patch) => set((s) => ({ progressFilter: { ...s.progressFilter, ...patch } })),
  setActiveJob: (activeJob) => set({ activeJob }),
  markCoachMarkSeen: (id) => set((s) => (s.coachMarksSeen.includes(id) ? s : { coachMarksSeen: [...s.coachMarksSeen, id] })),
}))
