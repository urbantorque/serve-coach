/**
 * Small hooks for the playback screens: dev fixture seeding, the remembered zoom choice, and controls
 * that hide after 3 s of playback.
 */
import { useEffect, useState } from 'react'

/**
 * DEV ONLY: opening a `dev-` session seeds the playback fixtures (real engine output on synthetic
 * clips, see dev/loadDevFixtures.ts). Returns true while seeding. In production this is a no-op.
 */
export function useDevFixtures(sessionId: string | undefined): boolean {
  const wanted = import.meta.env.DEV && Boolean(sessionId?.startsWith('dev-'))
  const [doneFor, setDoneFor] = useState<string | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV || !sessionId?.startsWith('dev-')) return
    let live = true
    void import('./dev/loadDevFixtures.ts')
      .then((m) => (m.isDevSessionId(sessionId) ? m.ensureDevFixtures() : undefined))
      .catch((error: unknown) => console.warn('[dev fixtures]', error))
      .finally(() => {
        if (live) setDoneFor(sessionId)
      })
    return () => {
      live = false
    }
  }, [sessionId])
  return wanted && doneFor !== sessionId
}

const ZOOM_KEY = 'serve-coach:playback-zoom'
export type ZoomMode = 'fit' | 'player'

/** "Zoom to you" is remembered on the phone, not per serve (DESIGN §8.11). Storage may be unavailable. */
export function usePlayerZoom(): [ZoomMode, (z: ZoomMode) => void] {
  const [zoom, setZoom] = useState<ZoomMode>(() => {
    try {
      return globalThis.localStorage?.getItem(ZOOM_KEY) === 'player' ? 'player' : 'fit'
    } catch {
      return 'fit'
    }
  })
  const set = (z: ZoomMode) => {
    setZoom(z)
    try {
      globalThis.localStorage?.setItem(ZOOM_KEY, z)
    } catch {
      // A convenience only; the default applies next time.
    }
  }
  return [zoom, set]
}

/**
 * Controls show while paused; during playback they hide 3 s after the last interaction
 * (DESIGN §8.11). Returns [visible, toggle, poke].
 */
export function useAutoHide(playing: boolean): [boolean, () => void, () => void] {
  const [hidden, setHidden] = useState(false)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!playing || hidden) return
    const t = window.setTimeout(() => setHidden(true), 3000)
    return () => window.clearTimeout(t)
  }, [playing, hidden, nonce])
  const visible = !playing || !hidden
  const toggle = () => setHidden(visible)
  const poke = () => {
    setHidden(false)
    setNonce((n) => n + 1)
  }
  return [visible, toggle, poke]
}
