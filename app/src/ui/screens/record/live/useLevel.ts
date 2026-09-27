/**
 * Live tilt for the level guide and the Ready gate (CAPTURE §9.3). DeviceMotion gravity first (one
 * code path for both orientations); DeviceOrientation beta/gamma as the portrait fallback. iOS needs
 * `requestPermission()` from a tap, so the state starts as 'prompt' there. Desktops usually expose
 * the constructors but never fire events: after a short wait the state becomes 'unsupported' and
 * the screen says "Level by eye". Pitch and roll are logged at 10 Hz while recording.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MotionAccess } from './framing.ts'
import { gravitySignFor, lowPass, tiltFromGravity, tiltFromOrientation, type Tilt, type Vec3 } from './level.ts'

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>
type WithPermission = { requestPermission?: PermissionFn }

const NO_EVENTS_MS = 1500
const UI_HZ = 8

export interface LevelHandle {
  tilt: Tilt | null
  motion: MotionAccess
  /** Call from a tap ("Show level", "Allow motion access"). */
  request: () => Promise<void>
  /** Starts a fresh 10 Hz log (recording start) and returns a reader for it. */
  startLog: (startMs: number) => void
  stopLog: () => { tMs: number; pitchDeg: number; rollDeg: number }[]
}

function screenAngle(): number {
  const a = typeof screen !== 'undefined' ? screen.orientation?.angle : undefined
  if (typeof a === 'number') return a
  const legacy = (globalThis as { orientation?: number }).orientation
  return typeof legacy === 'number' ? (legacy + 360) % 360 : 0
}

/** Dev only: `?dev-tilt=pitch,roll` fixes the reading so the gate can be exercised on a desktop. */
function devTilt(): Tilt | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('dev-tilt')
  if (!raw) return null
  const [p, r] = raw.split(',').map(Number)
  return Number.isFinite(p) && Number.isFinite(r) ? { pitchDeg: p, rollDeg: r } : null
}

export function useLevel(enabled: boolean): LevelHandle {
  const fixed = devTilt()
  const hasMotion = typeof window !== 'undefined' && 'DeviceMotionEvent' in window
  const needsPrompt = hasMotion && typeof (window.DeviceMotionEvent as unknown as WithPermission).requestPermission === 'function'
  const [motion, setMotion] = useState<MotionAccess>(fixed ? 'granted' : !hasMotion ? 'unsupported' : needsPrompt ? 'prompt' : 'granted')
  const [tilt, setTilt] = useState<Tilt | null>(fixed)
  const [listening, setListening] = useState(!fixed && hasMotion && !needsPrompt)
  const latest = useRef<Tilt | null>(fixed)
  const log = useRef<{ startMs: number; samples: { tMs: number; pitchDeg: number; rollDeg: number }[] } | null>(null)

  const request = useCallback(async () => {
    if (fixed) return
    try {
      const dm = window.DeviceMotionEvent as unknown as WithPermission
      const dor = (window as unknown as { DeviceOrientationEvent?: WithPermission }).DeviceOrientationEvent
      const answer = dm.requestPermission ? await dm.requestPermission() : 'granted'
      if (dor?.requestPermission) await dor.requestPermission().catch(() => 'denied')
      if (answer === 'granted') {
        setMotion('granted')
        setListening(true)
      } else setMotion('denied')
    } catch {
      setMotion('denied')
    }
  }, [fixed])

  useEffect(() => {
    if (!enabled || !listening || fixed) return
    const sign = gravitySignFor(navigator.userAgent, navigator.maxTouchPoints)
    let filtered: Vec3 | null = null
    let lastT = 0
    let lastUi = 0
    let gotMotion = false
    let gotAny = false

    const publish = (t: Tilt, now: number) => {
      latest.current = t
      gotAny = true
      if (now - lastUi >= 1000 / UI_HZ) {
        lastUi = now
        setTilt(t)
      }
    }
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity
      if (!g || g.x === null || g.y === null || g.z === null) return
      gotMotion = true
      const now = performance.now()
      filtered = lowPass(filtered, { x: g.x, y: g.y, z: g.z }, lastT ? (now - lastT) / 1000 : 0)
      lastT = now
      const t = tiltFromGravity(filtered, screenAngle(), sign)
      if (t) publish(t, now)
    }
    const onOrientation = (e: DeviceOrientationEvent) => {
      // Fallback only: portrait, and only while no gravity reading has arrived.
      if (gotMotion || e.beta === null || e.gamma === null || screenAngle() % 180 !== 0) return
      publish(tiltFromOrientation(e.beta, e.gamma), performance.now())
    }
    window.addEventListener('devicemotion', onMotion)
    window.addEventListener('deviceorientation', onOrientation)
    const timer = window.setTimeout(() => {
      if (!gotAny) setMotion((m) => (m === 'granted' ? 'unsupported' : m))
    }, NO_EVENTS_MS)
    const sampler = window.setInterval(() => {
      const l = log.current
      const t = latest.current
      if (l && t) l.samples.push({ tMs: Math.round(performance.now() - l.startMs), pitchDeg: t.pitchDeg, rollDeg: t.rollDeg })
    }, 100)
    return () => {
      window.removeEventListener('devicemotion', onMotion)
      window.removeEventListener('deviceorientation', onOrientation)
      window.clearTimeout(timer)
      window.clearInterval(sampler)
    }
  }, [enabled, listening, fixed])

  const startLog = useCallback((startMs: number) => {
    log.current = { startMs, samples: [] }
  }, [])
  const stopLog = useCallback(() => {
    const samples = log.current?.samples ?? []
    log.current = null
    return samples
  }, [])

  return { tilt, motion, request, startLog, stopLog }
}
