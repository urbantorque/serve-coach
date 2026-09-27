/**
 * Binds a <video> element to a playhead store (DESIGN §8.11): frame-accurate seeks (to the middle of
 * the frame), frame steps, play within the serve window at 1×, ½× or ¼×, and a display-rate playhead
 * from requestVideoFrameCallback (rAF on browsers without it). Nothing autoplays from here.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { clampFrame, frameToMediaTime, mediaTimeToFrame, type Playhead, type PlaybackRate } from './playhead.ts'

export interface VideoController {
  /** Ref callback for the <video>. */
  attach: (el: HTMLVideoElement | null) => void
  seek: (frame: number) => void
  step: (delta: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  setRate: (rate: PlaybackRate) => void
  /** True once the element can show frames. */
  hasVideo: () => boolean
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

export interface VideoControllerOptions {
  store: Playhead
  nominalFps: number
  window: { startFrame: number; endFrame: number }
  /** Stop playback at this frame instead of the window end (Tagging: 1.5 s after contact). */
  stopAt?: number
  /** Called when playback reaches its stop frame. */
  onEnded?: () => void
}

export function useVideoController(opts: VideoControllerOptions): VideoController {
  const el = useRef<VideoWithRvfc | null>(null)
  const loop = useRef<{ kind: 'rvfc' | 'raf'; handle: number } | null>(null)
  const seeking = useRef(false)
  const pendingSeek = useRef<number | null>(null)
  const o = useRef(opts)
  useEffect(() => {
    o.current = opts
  })

  const stopLoop = useCallback(() => {
    const v = el.current
    const l = loop.current
    if (!l) return
    if (l.kind === 'rvfc') v?.cancelVideoFrameCallback?.(l.handle)
    else cancelAnimationFrame(l.handle)
    loop.current = null
  }, [])

  const issueSeek = useCallback((frame: number) => {
    const v = el.current
    if (!v || v.readyState < 1) return
    if (seeking.current) {
      pendingSeek.current = frame
      return
    }
    seeking.current = true
    v.currentTime = frameToMediaTime(frame, o.current.nominalFps)
  }, [])

  const seek = useCallback(
    (frame: number) => {
      const f = clampFrame(frame, o.current.window)
      const v = el.current
      if (v && !v.paused) v.pause()
      stopLoop()
      o.current.store.setState({ frame: f, playing: false })
      issueSeek(f)
    },
    [issueSeek, stopLoop],
  )

  const pause = useCallback(() => {
    const v = el.current
    stopLoop()
    if (v && !v.paused) v.pause()
    const s = o.current.store.getState()
    if (s.playing) o.current.store.setState({ playing: false })
  }, [stopLoop])

  const tick = useCallback(
    (mediaTime: number) => {
      const { nominalFps, window, stopAt, store } = o.current
      const f = Math.round(mediaTime * nominalFps)
      const end = Math.min(window.endFrame, stopAt ?? Infinity)
      if (f >= end) {
        pause()
        store.setState({ frame: end })
        issueSeek(end)
        o.current.onEnded?.()
        return false
      }
      store.setState({ frame: Math.max(window.startFrame, f) })
      return true
    },
    [issueSeek, pause],
  )

  const startLoop = useCallback(() => {
    const v = el.current
    if (!v) return
    stopLoop()
    if (typeof v.requestVideoFrameCallback === 'function') {
      const cb = (_now: number, meta: { mediaTime: number }) => {
        if (!tick(meta.mediaTime)) return
        loop.current = { kind: 'rvfc', handle: v.requestVideoFrameCallback!(cb) }
      }
      loop.current = { kind: 'rvfc', handle: v.requestVideoFrameCallback(cb) }
    } else {
      const cb = () => {
        if (!tick(mediaTimeToFrame(v.currentTime, o.current.nominalFps) / o.current.nominalFps)) return
        loop.current = { kind: 'raf', handle: requestAnimationFrame(cb) }
      }
      loop.current = { kind: 'raf', handle: requestAnimationFrame(cb) }
    }
  }, [stopLoop, tick])

  const play = useCallback(() => {
    const v = el.current
    if (!v) return
    const { store, window, stopAt } = o.current
    const s = store.getState()
    const end = Math.min(window.endFrame, stopAt ?? Infinity)
    if (s.frame >= end) {
      store.setState({ frame: window.startFrame })
      v.currentTime = frameToMediaTime(window.startFrame, o.current.nominalFps)
    }
    v.playbackRate = s.rate
    store.setState({ playing: true })
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        store.setState({ playing: false })
        stopLoop()
      })
    }
    startLoop()
  }, [startLoop, stopLoop])

  const toggle = useCallback(() => {
    if (o.current.store.getState().playing) pause()
    else play()
  }, [pause, play])

  const step = useCallback((delta: number) => seek(o.current.store.getState().frame + delta), [seek])

  const setRate = useCallback((rate: PlaybackRate) => {
    o.current.store.setState({ rate })
    if (el.current) el.current.playbackRate = rate
  }, [])

  const onSeeked = useCallback(() => {
    seeking.current = false
    const next = pendingSeek.current
    if (next !== null) {
      pendingSeek.current = null
      issueSeek(next)
    }
  }, [issueSeek])

  const onLoaded = useCallback(() => {
    const v = el.current
    if (!v) return
    v.playbackRate = o.current.store.getState().rate
    seeking.current = false
    issueSeek(o.current.store.getState().frame)
  }, [issueSeek])

  const onEndedEvent = useCallback(() => pause(), [pause])

  const attach = useCallback(
    (node: HTMLVideoElement | null) => {
      const prev = el.current
      if (prev === node) return
      if (prev) {
        stopLoop()
        prev.removeEventListener('seeked', onSeeked)
        prev.removeEventListener('loadedmetadata', onLoaded)
        prev.removeEventListener('ended', onEndedEvent)
      }
      el.current = node as VideoWithRvfc | null
      if (node) {
        node.muted = true
        node.playsInline = true
        node.addEventListener('seeked', onSeeked)
        node.addEventListener('loadedmetadata', onLoaded)
        node.addEventListener('ended', onEndedEvent)
        if (node.readyState >= 1) onLoaded()
      }
    },
    [onEndedEvent, onLoaded, onSeeked, stopLoop],
  )

  useEffect(() => () => stopLoop(), [stopLoop])

  return useMemo(
    () => ({ attach, seek, step, play, pause, toggle, setRate, hasVideo: () => Boolean(el.current && el.current.readyState >= 1) }),
    [attach, pause, play, seek, setRate, step, toggle],
  )
}

/**
 * Keeps a second <video> on the frame that matches the leader (phase-synced compare). Seeks are
 * latest-wins, so a slow decoder never queues up a backlog.
 */
export function useFollowerVideo(map: (leaderFrame: number) => number, store: Playhead, nominalFps: number) {
  const el = useRef<HTMLVideoElement | null>(null)
  const busy = useRef(false)
  const pending = useRef<number | null>(null)
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  })

  const go = useCallback(
    (frame: number) => {
      const v = el.current
      if (!v || v.readyState < 1) return
      if (busy.current) {
        pending.current = frame
        return
      }
      busy.current = true
      v.currentTime = frameToMediaTime(frame, nominalFps)
    },
    [nominalFps],
  )

  useEffect(() => {
    const sync = () => go(mapRef.current(store.getState().frame))
    const unsub = store.subscribe((s, prev) => {
      if (s.frame !== prev.frame) sync()
    })
    return unsub
  }, [go, store])

  const attach = useCallback(
    (node: HTMLVideoElement | null) => {
      const onSeeked = () => {
        busy.current = false
        if (pending.current !== null) {
          const f = pending.current
          pending.current = null
          go(f)
        }
      }
      const onLoaded = () => {
        busy.current = false
        go(mapRef.current(store.getState().frame))
      }
      el.current = node
      if (node) {
        node.muted = true
        node.playsInline = true
        node.addEventListener('seeked', onSeeked)
        node.addEventListener('loadedmetadata', onLoaded)
        if (node.readyState >= 1) onLoaded()
      }
    },
    [go, store],
  )
  return attach
}
