/**
 * Reading a practice session, a serve at a time, keeping its place (L2.5).
 *
 * The video work is handed in — `locate` for the scan, `read` for one serve —
 * so everything decided here can be driven in Node without a decoder: what is
 * saved and when, what an unreadable serve costs, what survives a stop. The
 * same split `sweepServes` makes for a basket, and for the same reason.
 *
 * The session is saved after the scan and after every serve, so a stop — the
 * player's, or the page being hidden, or killed — loses at most the serve in
 * flight. Running it again with the stored row reads only what is left
 * (`toRead`).
 */
import { lineOf } from './line'
import { toRead, type PracticeSession } from './session'
import type { Analysis } from '../analysis/types'

export interface SessionIO {
  /** Where every serve in the file is, seconds. */
  locate: () => Promise<number[]>
  /** One serve read, by its index in `found`. A throw is a serve too unclear to read. */
  read: (index: number, t: number) => Promise<Analysis>
  /** Which serves to read, of this many found, as indexes. */
  choose: (count: number) => number[]
  /** Write the session where it will survive the page. */
  save: (session: PracticeSession) => Promise<void>
  signal?: AbortSignal
  /** Every time the session moves on, for the screen. */
  onChange?: (session: PracticeSession) => void
  /** The clock, handed in for the tests. */
  now?: () => number
}

/** Whether an error is the player stopping, rather than a serve failing. */
const stopped = (err: unknown, signal?: AbortSignal): boolean =>
  !!signal?.aborted || (err instanceof Error && (err.name === 'Cancelled' || err.name === 'AbortError'))

export async function runSession(start: PracticeSession, io: SessionIO): Promise<PracticeSession> {
  const now = io.now ?? Date.now
  let session: PracticeSession = { ...start, lines: [...start.lines] }
  const commit = async (patch: Partial<PracticeSession>) => {
    session = { ...session, ...patch, updatedAt: now() }
    io.onChange?.(session)
    await io.save(session)
  }

  try {
    if (!session.found) {
      await commit({ phase: 'locating' })
      const found = await io.locate()
      if (io.signal?.aborted) throw new Error('stopped')
      await commit({ found, chosen: io.choose(found.length), phase: 'reading' })
    } else if (session.phase !== 'done') {
      await commit({ phase: 'reading' })
    }

    for (const index of toRead(session)) {
      if (io.signal?.aborted) throw new Error('stopped')
      const t = session.found![index]
      let line
      try {
        line = lineOf(await io.read(index, t), index + 1, t)
      } catch (err) {
        if (stopped(err, io.signal)) throw err
        // One serve the engine could not read costs that serve, not the session.
        line = { number: index + 1, t, status: 'unclear' as const }
      }
      await commit({ lines: [...session.lines, line].sort((a, b) => a.number - b.number) })
    }

    await commit({ phase: 'done' })
    return session
  } catch (err) {
    if (!stopped(err, io.signal) && !(err instanceof Error && err.message === 'stopped')) throw err
    // Stopped: what was read is kept, and so is the place.
    await commit({ phase: 'stopped' })
    return session
  }
}
