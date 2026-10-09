/**
 * How long a picked clip is, before anything else is done with it (L2.4).
 *
 * The length decides the path: a basket goes through the report as it always
 * has, and a clip past `SESSION_SECONDS` is a session. Only the metadata is
 * read, which on a phone's MP4 or MOV is the `moov` box, so this costs the same
 * on a ten-second clip as on a two-gigabyte one.
 *
 * Nothing comes back for a file the browser cannot read, and the caller then
 * takes the ordinary path, whose refusals already explain an unreadable video.
 */
export function probeDuration(file: Blob, timeoutMs = 8000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (value: number | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined)
    }
    const timer = setTimeout(() => finish(undefined), timeoutMs)
    video.preload = 'metadata'
    video.muted = true
    video.addEventListener('loadedmetadata', () => finish(video.duration), { once: true })
    video.addEventListener('error', () => finish(undefined), { once: true })
    video.src = url
  })
}
