/**
 * Reference-counted object URLs for stored blobs (videos, key frames). A URL is created once per Blob
 * and revoked a moment after its last user unmounts, so React's effect re-runs (StrictMode, fast
 * refresh) never revoke a URL a <video> or <img> is still loading.
 */
import { useEffect, useMemo } from 'react'

interface Entry {
  url: string
  refs: number
  timer?: ReturnType<typeof setTimeout>
}

const cache = new Map<Blob, Entry>()
const canCreate = () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'

export function urlFor(blob: Blob): string | null {
  // Records read back from storage can lose their Blob type (older engines, test stores): no image then.
  if (!canCreate() || typeof Blob === 'undefined' || !(blob instanceof Blob)) return null
  let e = cache.get(blob)
  if (!e) {
    try {
      e = { url: URL.createObjectURL(blob), refs: 0 }
    } catch {
      return null
    }
    cache.set(blob, e)
  }
  return e.url
}

function retain(blob: Blob): void {
  const e = cache.get(blob)
  if (!e) return
  e.refs++
  if (e.timer) {
    clearTimeout(e.timer)
    e.timer = undefined
  }
}

function release(blob: Blob): void {
  const e = cache.get(blob)
  if (!e) return
  e.refs--
  if (e.refs > 0) return
  e.timer = setTimeout(() => {
    if (e.refs > 0) return
    URL.revokeObjectURL(e.url)
    cache.delete(blob)
  }, 1500)
}

/** An object URL for one blob; undefined while the blob loads, null when there is none. */
export function useObjectUrl(blob: Blob | null | undefined): string | null | undefined {
  const url = useMemo(() => (blob ? urlFor(blob) : blob), [blob])
  useEffect(() => {
    if (!blob) return
    retain(blob)
    return () => release(blob)
  }, [blob])
  return url
}

/** Object URLs for several blobs, in the same order. */
export function useObjectUrls(blobs: readonly (Blob | null | undefined)[]): (string | null)[] {
  const urls = useMemo(() => blobs.map((b) => (b ? urlFor(b) : null)), [blobs])
  useEffect(() => {
    const held = blobs.filter((b): b is Blob => Boolean(b))
    held.forEach(retain)
    return () => held.forEach(release)
  }, [blobs])
  return urls
}
