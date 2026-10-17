/**
 * A history delete that can be taken back for a few seconds. Out of
 * `App.tsx` (L6.11), bodies unchanged.
 */
import { useCallback, useRef, useState } from 'react'
import { deleteSession, safely } from '../lib/storage/db'

export function usePendingDelete(deps: { refreshSessions: () => void }) {
  const { refreshSessions } = deps
  /**
   * A delete that can be taken back for a few seconds.
   *
   * The trash icon sat beside every row with no confirmation, so one mis-tap
   * lost a serve for good. The row disappears at once and the delete itself
   * waits: a second delete, the sheet closing, or the timer running out
   * commits it, and "Undo" in between simply forgets it was asked for. Held
   * rather than re-saved on undo, because `saveSession` takes a full analysis
   * and a stored report no longer is one.
   */
  const [pendingDelete, setPendingDelete] = useState<string>()
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>()
  const commitDelete = useCallback(
    (id: string | undefined) => {
      clearTimeout(pendingTimer.current)
      setPendingDelete(undefined)
      if (!id) return
      void safely(() => deleteSession(id), undefined).then(refreshSessions)
    },
    [refreshSessions],
  )
  const remove = (id: string) => {
    commitDelete(pendingDelete)
    setPendingDelete(id)
    pendingTimer.current = setTimeout(() => commitDelete(id), 5000)
  }
  const undoDelete = () => {
    clearTimeout(pendingTimer.current)
    setPendingDelete(undefined)
  }
  return { pendingDelete, commitDelete, remove, undoDelete }
}
