/**
 * Steady and Light for the live checklist (CAPTURE §9.6, simplified): a 48 × 48 luma grid of the
 * preview at 5 Hz. Steady after 2 s without whole-picture movement; light from the player's band
 * against the rest of the picture. State only changes when a result changes.
 */
import { useEffect, useRef, useState } from 'react'
import type { PoseSnapshot } from './framing.ts'
import { classifyLight, GRID, lumaOf, meanLuma, SteadyTracker } from './sceneStats.ts'

export interface SceneStats {
  steady: boolean | null
  light: 'good' | 'dark' | 'backlit' | null
}

const EMPTY: SceneStats = { steady: null, light: null }

export function useSceneStats(video: HTMLVideoElement | null, enabled: boolean, pose: PoseSnapshot | null): SceneStats {
  const [stats, setStats] = useState<SceneStats>({ steady: null, light: null })
  // Read inside the sampler so pose updates never restart the steady timer.
  const poseRef = useRef(pose)
  useEffect(() => {
    poseRef.current = pose
  }, [pose])

  useEffect(() => {
    if (!enabled || !video) return
    let canvas: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    try {
      canvas = document.createElement('canvas')
      canvas.width = GRID.width
      canvas.height = GRID.height
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    } catch {
      ctx = null
    }
    if (!ctx) return
    const c2d = ctx
    const tracker = new SteadyTracker()
    const timer = window.setInterval(() => {
      if (video.readyState < 2 || !video.videoWidth) return
      // The stand-here band (30 to 70% of the width) between head and feet when known.
      const p = poseRef.current
      const subject = p ? { x: 0.3, y: p.headTopY, w: 0.4, h: Math.max(0.05, p.floorY - p.headTopY) } : null
      try {
        c2d.drawImage(video, 0, 0, GRID.width, GRID.height)
        const grid = lumaOf(c2d.getImageData(0, 0, GRID.width, GRID.height).data)
        const steady = tracker.push(grid, performance.now() / 1000)
        const frame = meanLuma(grid, GRID.width, GRID.height, null)
        const subjectMean = subject ? meanLuma(grid, GRID.width, GRID.height, subject) : null
        const background = subject ? meanLuma(grid, GRID.width, GRID.height, { x: 0, y: 0, w: 1, h: Math.max(0.05, subject.y) }) : null
        const light = classifyLight(subjectMean, frame, background)
        setStats((prev) => (prev.steady === steady && prev.light === light ? prev : { steady, light }))
      } catch {
        // A tainted or not-yet-decodable frame; try again on the next tick.
      }
    }, 200)
    return () => {
      window.clearInterval(timer)
      // The next run starts from nothing: steady needs its own 2 s.
      setStats(EMPTY)
    }
  }, [video, enabled])

  return enabled && video ? stats : EMPTY
}
